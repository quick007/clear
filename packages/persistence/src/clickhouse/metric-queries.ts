import type { ClickHouseClient } from "@clickhouse/client";
import type { ProjectId } from "@groundtruth/domain";
import {
  MetricAttribute,
  MetricCatalogEntry,
  type MetricQuery,
  metricQueryUsesRollups,
} from "@groundtruth/telemetry";
import { Effect, Schema } from "effect";
import { persistenceError } from "../errors.ts";
import {
  approximateExplicitHistogramPercentile,
  type PercentileAggregation,
} from "./histogram-percentile.ts";
import { buildMetricQueryResult, type MetricQueryRow } from "./metric-query-result.ts";
import { metricStepPlan, queryMetricRollups } from "./metric-rollup-queries.ts";
import { clickhouseAttempt } from "./operation.ts";
import {
  aggregationExpression,
  attributeFiltersPlan,
  projectParameters,
  timeRangePlan,
} from "./sql.ts";

const parseJson = <A>(value: string) => JSON.parse(value) as A;
const metricType = (value: string) =>
  value === "exponential_histogram" ? "exponential-histogram" : value;
const dateTimeSql = (column: string) =>
  `formatDateTime(fromUnixTimestamp64Nano(toInt64(${column})), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC')`;

interface MetricCatalogRow {
  readonly metric_name: string;
  readonly description: string;
  readonly unit: string;
  readonly metric_type_name: string;
  readonly temporalities: string;
  readonly monotonic: string | null;
  readonly services: string;
  readonly attribute_payload: string;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
}

interface MetricAttributeRow {
  readonly metric_name: string;
  readonly attribute_key: string;
  readonly examples: string;
}

export const listMetrics = (client: ClickHouseClient, projectId: ProjectId) =>
  clickhouseAttempt("list metrics", async (signal) => {
    const parameters = projectParameters(projectId);
    const [catalogResult, attributeResult] = await Promise.all([
      client.query({
        query: `SELECT
          metric_name,
          any(metric_description) AS description,
          any(metric_unit) AS unit,
          any(toString(metric_type)) AS metric_type_name,
          toJSONString(groupUniqArray(toString(aggregation_temporality))) AS temporalities,
          if(countIf(metric_type = 'sum') > 0, toNullable(anyIf(is_monotonic, metric_type = 'sum')), NULL) AS monotonic,
          toJSONString(groupUniqArray(service_name)) AS services,
          any(attributes_json) AS attribute_payload,
          ${dateTimeSql("min(time_unix_nano)")} AS first_seen_at,
          ${dateTimeSql("max(time_unix_nano)")} AS last_seen_at
        FROM groundtruth.metric_points
        WHERE project_id = {projectId:UUID}
        GROUP BY metric_name
        ORDER BY metric_name
        LIMIT 500`,
        format: "JSONStringsEachRow",
        query_params: parameters,
        abort_signal: signal,
      }),
      client.query({
        query: `SELECT metric_name, attribute_key, toJSONString(groupUniqArray(8)(attribute_value)) AS examples
        FROM
        (
          SELECT
            metric_name,
            arrayJoin(mapKeys(attributes)) AS attribute_key,
            attributes[attribute_key] AS attribute_value
          FROM groundtruth.metric_points
          WHERE project_id = {projectId:UUID}
        )
        GROUP BY metric_name, attribute_key
        ORDER BY metric_name, attribute_key
        LIMIT 5000`,
        format: "JSONStringsEachRow",
        query_params: parameters,
        abort_signal: signal,
      }),
    ]);
    const [catalog, attributes] = await Promise.all([
      catalogResult.json<MetricCatalogRow>(),
      attributeResult.json<MetricAttributeRow>(),
    ]);
    const attributesByMetric = new Map<string, Array<MetricAttribute>>();
    for (const row of attributes) {
      const entry = Schema.decodeUnknownSync(MetricAttribute)({
        key: row.attribute_key,
        examples: parseJson<ReadonlyArray<string>>(row.examples),
      });
      const entries = attributesByMetric.get(row.metric_name) ?? [];
      entries.push(entry);
      attributesByMetric.set(row.metric_name, entries);
    }
    return catalog.map((row) => {
      const payload = parseJson<{ readonly metadata?: unknown }>(row.attribute_payload);
      return Schema.decodeUnknownSync(MetricCatalogEntry)({
        name: row.metric_name,
        description: row.description,
        unit: row.unit,
        metadata: payload.metadata ?? {},
        type: metricType(row.metric_type_name),
        temporalities: parseJson<ReadonlyArray<string>>(row.temporalities),
        monotonic: row.monotonic === null ? null : row.monotonic === "1",
        services: parseJson<ReadonlyArray<string>>(row.services),
        attributes: attributesByMetric.get(row.metric_name) ?? [],
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
      });
    });
  });

interface MetricTypesRow {
  readonly metric_types: string;
}

interface IncompatibleBoundsRow {
  readonly incompatible: string;
}

interface HistogramQueryRow {
  readonly at: string;
  readonly group_0: string;
  readonly group_1: string;
  readonly bounds_json: string;
  readonly counts_json: string;
  readonly minimum_count: string;
  readonly minimum: string;
  readonly maximum_count: string;
  readonly maximum: string;
}

const isPercentileAggregation = (
  aggregation: MetricQuery["aggregation"],
): aggregation is PercentileAggregation =>
  aggregation === "p50" || aggregation === "p95" || aggregation === "p99";

const percentileQueryError = (operation: string, message: string) =>
  persistenceError("clickhouse", operation, new Error(message), false);

const numericMetricValue = `multiIf(
  value_type = 'int', toFloat64(int_value),
  value_type = 'double', double_value,
  count > 0 AND has_sum, sum / count,
  0
)`;

const rateContribution = `multiIf(
  metric_type = 'sum' AND aggregation_temporality = 'cumulative' AND stream_position = 1, 0,
  metric_type = 'sum' AND aggregation_temporality = 'cumulative'
    AND (start_time_unix_nano != previous_start_time_unix_nano
      OR (is_monotonic AND metric_value < previous_metric_value)), metric_value,
  metric_type = 'sum' AND aggregation_temporality = 'cumulative',
    metric_value - previous_metric_value,
  value_type = 'none' AND has_sum, sum,
  metric_value
)`;

const rateWindow = `row_number() OVER metric_stream AS stream_position,
  lag(metric_value, 1, 0) OVER metric_stream AS previous_metric_value,
  lag(start_time_unix_nano, 1, 0) OVER metric_stream AS previous_start_time_unix_nano`;

export const queryMetrics = (client: ClickHouseClient, projectId: ProjectId, query: MetricQuery) =>
  Effect.gen(function* () {
    if (metricQueryUsesRollups(query)) {
      return yield* queryMetricRollups(client, projectId, query);
    }
    const groupBy = query.groupBy ?? [];
    const maxPoints = query.maxPoints ?? 1_000;
    const maxSeries = query.maxSeries ?? 20;
    const range = timeRangePlan(query.range, "time_unix_nano", "metric");
    const filters = attributeFiltersPlan(query.filters ?? [], "attributes", "metricFilter");
    const step = metricStepPlan(query);
    const group0 = groupBy[0] === undefined ? "''" : "attributes[{group0Key:String}]";
    const group1 = groupBy[1] === undefined ? "''" : "attributes[{group1Key:String}]";
    const queryParameters = {
      ...projectParameters(projectId),
      metricName: query.metric,
      ...range.parameters,
      ...filters.parameters,
      group0Key: groupBy[0] ?? "",
      group1Key: groupBy[1] ?? "",
      distinctKey: query.distinctKey ?? "",
      pointLimit: maxPoints + 1,
    };
    const aggregate =
      query.aggregation === "rate"
        ? `sum(${rateContribution}) / ${step.seconds}`
        : aggregationExpression(
            query.aggregation,
            step.seconds,
            "attributes[{distinctKey:String}]",
          );
    const rateWindowColumns = query.aggregation === "rate" ? `, ${rateWindow}` : "";
    const rateWindowDefinition =
      query.aggregation === "rate"
        ? `WINDOW metric_stream AS (
          PARTITION BY service_name, resource_attributes_json, scope_name, scope_version,
            scope_attributes_json, attributes_json
          ORDER BY time_unix_nano
        )`
        : "";
    const rateHaving =
      query.aggregation === "rate"
        ? `HAVING countIf(NOT (
          metric_type = 'sum' AND aggregation_temporality = 'cumulative' AND stream_position = 1
        )) > 0`
        : "";
    let rows: ReadonlyArray<MetricQueryRow>;

    if (isPercentileAggregation(query.aggregation)) {
      const types = yield* clickhouseAttempt("inspect metric percentile shape", async (signal) => {
        const result = await client.query({
          query: `SELECT toJSONString(groupUniqArray(toString(metric_type))) AS metric_types
          FROM groundtruth.metric_points
          WHERE project_id = {projectId:UUID}
            AND metric_name = {metricName:String}
            AND ${range.where}
            AND ${filters.where}`,
          format: "JSONStringsEachRow",
          query_params: queryParameters,
          abort_signal: signal,
        });
        const [row] = await result.json<MetricTypesRow>();
        return parseJson<ReadonlyArray<string>>(row?.metric_types ?? "[]").map(metricType);
      });
      if (types.includes("exponential-histogram") || types.includes("summary")) {
        return yield* Effect.fail(
          percentileQueryError(
            "query-metrics-percentile-unsupported",
            "Percentiles for exponential histograms and summaries are not supported safely yet.",
          ),
        );
      }
      if (types.includes("histogram") && types.some((type) => type !== "histogram")) {
        return yield* Effect.fail(
          percentileQueryError(
            "query-metrics-percentile-mixed-shapes",
            "A percentile query cannot combine explicit histograms with numeric metric points.",
          ),
        );
      }

      if (types.includes("histogram")) {
        const incompatible = yield* clickhouseAttempt(
          "inspect metric histogram bounds",
          async (signal) => {
            const result = await client.query({
              query: `SELECT toString(count()) AS incompatible
              FROM
              (
                SELECT 1
                FROM groundtruth.metric_points
                WHERE project_id = {projectId:UUID}
                  AND metric_name = {metricName:String}
                  AND metric_type = 'histogram'
                  AND ${range.where}
                  AND ${filters.where}
                GROUP BY
                  toStartOfInterval(
                    fromUnixTimestamp64Nano(toInt64(time_unix_nano)), INTERVAL ${step.sql}
                  ),
                  ${group0},
                  ${group1}
                HAVING uniqExact(toJSONString(explicit_bounds)) > 1
                LIMIT 1
              )`,
              format: "JSONStringsEachRow",
              query_params: queryParameters,
              abort_signal: signal,
            });
            const [row] = await result.json<IncompatibleBoundsRow>();
            return Number(row?.incompatible ?? "0") > 0;
          },
        );
        if (incompatible) {
          return yield* Effect.fail(
            percentileQueryError(
              "query-metrics-percentile-incompatible-bounds",
              "Histogram points in the same result bucket use incompatible explicit bounds.",
            ),
          );
        }

        const histogramRows = yield* clickhouseAttempt(
          "query explicit histogram percentiles",
          async (signal) => {
            const result = await client.query({
              query: `SELECT
                formatDateTime(bucket, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS at,
                ${group0} AS group_0,
                ${group1} AS group_1,
                toJSONString(explicit_bounds) AS bounds_json,
                toJSONString(arrayMap(value -> toString(value), sumForEach(bucket_counts))) AS counts_json,
                toString(countIf(has_min)) AS minimum_count,
                toString(minIf(min, has_min)) AS minimum,
                toString(countIf(has_max)) AS maximum_count,
                toString(maxIf(max, has_max)) AS maximum
              FROM
              (
                SELECT *, toStartOfInterval(
                  fromUnixTimestamp64Nano(toInt64(time_unix_nano)), INTERVAL ${step.sql}
                ) AS bucket
                FROM groundtruth.metric_points
                WHERE project_id = {projectId:UUID}
                  AND metric_name = {metricName:String}
                  AND metric_type = 'histogram'
              )
              WHERE ${range.where}
                AND ${filters.where}
              GROUP BY bucket, group_0, group_1, explicit_bounds
              HAVING arraySum(sumForEach(bucket_counts)) > 0
              ORDER BY bucket, group_0, group_1, explicit_bounds
              LIMIT {pointLimit:UInt32}`,
              format: "JSONStringsEachRow",
              query_params: queryParameters,
              abort_signal: signal,
            });
            return result.json<HistogramQueryRow>();
          },
        );
        const percentileRows: Array<MetricQueryRow> = [];
        for (const row of histogramRows) {
          const distribution = yield* Effect.try({
            try: () => ({
              bounds: parseJson<ReadonlyArray<number>>(row.bounds_json),
              counts: parseJson<ReadonlyArray<string>>(row.counts_json).map(BigInt),
              minimum: Number(row.minimum_count) === 0 ? null : Number(row.minimum),
              maximum: Number(row.maximum_count) === 0 ? null : Number(row.maximum),
            }),
            catch: () =>
              percentileQueryError(
                "query-metrics-percentile-invalid-histogram",
                "Stored explicit histogram data is malformed.",
              ),
          });
          const percentile = approximateExplicitHistogramPercentile(
            distribution,
            query.aggregation,
          );
          if (percentile._tag === "invalid") {
            return yield* Effect.fail(
              percentileQueryError(
                "query-metrics-percentile-invalid-histogram",
                `Stored explicit histogram data is invalid: ${percentile.reason}.`,
              ),
            );
          }
          percentileRows.push({ ...row, value: String(percentile.value) });
        }
        rows = percentileRows;
      } else {
        rows = yield* clickhouseAttempt("query numeric metric percentiles", async (signal) => {
          const result = await client.query({
            query: `SELECT
              formatDateTime(bucket, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS at,
              ${group0} AS group_0,
              ${group1} AS group_1,
              ${aggregate} AS value
            FROM
            (
              SELECT *, ${numericMetricValue} AS metric_value, toStartOfInterval(
                fromUnixTimestamp64Nano(toInt64(time_unix_nano)), INTERVAL ${step.sql}
              ) AS bucket
              FROM groundtruth.metric_points
              WHERE project_id = {projectId:UUID}
                AND metric_name = {metricName:String}
            )
            WHERE ${range.where}
              AND ${filters.where}
            GROUP BY bucket, group_0, group_1
            ORDER BY bucket, group_0, group_1
            LIMIT {pointLimit:UInt32}`,
            format: "JSONStringsEachRow",
            query_params: queryParameters,
            abort_signal: signal,
          });
          return result.json<MetricQueryRow>();
        });
      }
    } else {
      rows = yield* clickhouseAttempt("query metrics", async (signal) => {
        const result = await client.query({
          query: `SELECT
            formatDateTime(bucket, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS at,
            ${group0} AS group_0,
            ${group1} AS group_1,
            ${aggregate} AS value
          FROM
          (
            SELECT *, ${numericMetricValue} AS metric_value${rateWindowColumns}, toStartOfInterval(
              fromUnixTimestamp64Nano(toInt64(time_unix_nano)), INTERVAL ${step.sql}
            ) AS bucket
            FROM groundtruth.metric_points
            WHERE project_id = {projectId:UUID}
              AND metric_name = {metricName:String}
            ${rateWindowDefinition}
          )
          WHERE ${range.where}
            AND ${filters.where}
          GROUP BY bucket, group_0, group_1
          ${rateHaving}
          ORDER BY bucket, group_0, group_1
          LIMIT {pointLimit:UInt32}`,
          format: "JSONStringsEachRow",
          query_params: queryParameters,
          abort_signal: signal,
        });
        return result.json<MetricQueryRow>();
      });
    }
    return buildMetricQueryResult(query, rows, maxPoints, maxSeries);
  });
