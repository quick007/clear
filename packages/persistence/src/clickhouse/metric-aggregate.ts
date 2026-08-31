import type { ClickHouseClient } from "@clickhouse/client";
import type { ProjectId } from "@groundtruth/domain";
import {
  type MetricAggregateQuery,
  MetricAggregateResult,
  metricRangeDurationSeconds,
} from "@groundtruth/telemetry";
import { Effect } from "effect";
import { persistenceError } from "../errors.ts";
import {
  approximateExplicitHistogramPercentile,
  type PercentileAggregation,
} from "./histogram-percentile.ts";
import {
  isInitialCumulativePoint,
  metricCount,
  metricTotal,
  numericMetricValue,
  rateContribution,
  rateWindow,
  rateWindowDefinition,
} from "./metric-sql.ts";
import { clickhouseAttempt } from "./operation.ts";
import { attributeFiltersPlan, projectParameters, timeRangePlan } from "./sql.ts";

interface AggregateRow {
  readonly value: string | null;
  readonly matched_points: string;
}

interface MetricTypesRow {
  readonly metric_types: ReadonlyArray<string>;
}

interface HistogramShapeRow {
  readonly incompatible: string;
}

interface HistogramAggregateRow {
  readonly bounds: ReadonlyArray<number>;
  readonly counts: ReadonlyArray<string>;
  readonly minimum_count: string;
  readonly minimum: string;
  readonly maximum_count: string;
  readonly maximum: string;
  readonly matched_points: string;
}

const isPercentile = (
  aggregation: MetricAggregateQuery["aggregation"],
): aggregation is PercentileAggregation =>
  aggregation === "p50" || aggregation === "p95" || aggregation === "p99";

const unsupportedPercentile = (operation: string, message: string) =>
  persistenceError("clickhouse", operation, new Error(message), false);

const aggregateExpression = (query: MetricAggregateQuery) => {
  switch (query.aggregation) {
    case "sum":
      return `sum(${metricTotal})`;
    case "avg":
      return `sum(${metricTotal}) / nullIf(sum(${metricCount}), 0)`;
    case "min":
      return `min(if(value_type = 'none' AND has_min, min, ${numericMetricValue}))`;
    case "max":
      return `max(if(value_type = 'none' AND has_max, max, ${numericMetricValue}))`;
    case "count":
      return `toFloat64(sum(${metricCount}))`;
    case "count-distinct":
      return "toFloat64(uniqExactIf(attributes[{distinctKey:String}], mapContains(attributes, {distinctKey:String})))";
    case "rate":
    case "p50":
    case "p95":
    case "p99":
      return null;
  }
};

const metricTypes = (
  client: ClickHouseClient,
  where: string,
  parameters: Readonly<Record<string, unknown>>,
) =>
  clickhouseAttempt("inspect aggregate metric shapes", async (signal) => {
    const result = await client.query({
      query: `SELECT groupUniqArray(toString(metric_type)) AS metric_types
        FROM groundtruth.metric_points
        WHERE project_id = {projectId:UUID}
          AND metric_name = {metricName:String}
          AND ${where}`,
      format: "JSONEachRow",
      query_params: parameters,
      abort_signal: signal,
    });
    const [row] = await result.json<MetricTypesRow>();
    return row?.metric_types ?? [];
  });

const aggregateExplicitHistogram = (
  client: ClickHouseClient,
  aggregation: PercentileAggregation,
  where: string,
  parameters: Readonly<Record<string, unknown>>,
) =>
  Effect.gen(function* () {
    const incompatible = yield* clickhouseAttempt(
      "inspect aggregate histogram bounds",
      async (signal) => {
        const result = await client.query({
          query: `SELECT toString(uniqExact(toJSONString(explicit_bounds))) AS incompatible
            FROM groundtruth.metric_points
            WHERE project_id = {projectId:UUID}
              AND metric_name = {metricName:String}
              AND metric_type = 'histogram'
              AND ${where}`,
          format: "JSONStringsEachRow",
          query_params: parameters,
          abort_signal: signal,
        });
        const [row] = await result.json<HistogramShapeRow>();
        return Number(row?.incompatible ?? "0") > 1;
      },
    );
    if (incompatible) {
      return yield* Effect.fail(
        unsupportedPercentile(
          "aggregate-metric-percentile-incompatible-bounds",
          "Histogram points in the aggregate window use incompatible explicit bounds.",
        ),
      );
    }

    const row = yield* clickhouseAttempt(
      "aggregate explicit histogram percentile",
      async (signal) => {
        const result = await client.query({
          query: `SELECT
              any(explicit_bounds) AS bounds,
              arrayMap(value -> toString(value), sumForEach(bucket_counts)) AS counts,
              toString(countIf(has_min)) AS minimum_count,
              toString(minIf(min, has_min)) AS minimum,
              toString(countIf(has_max)) AS maximum_count,
              toString(maxIf(max, has_max)) AS maximum,
              toString(count()) AS matched_points
            FROM groundtruth.metric_points
            WHERE project_id = {projectId:UUID}
              AND metric_name = {metricName:String}
              AND metric_type = 'histogram'
              AND ${where}`,
          format: "JSONEachRow",
          query_params: parameters,
          abort_signal: signal,
        });
        const [aggregate] = await result.json<HistogramAggregateRow>();
        return aggregate;
      },
    );
    const matchedPoints = Number(row?.matched_points ?? "0");
    if (row === undefined || matchedPoints === 0) {
      return new MetricAggregateResult({ value: null, matchedPoints: 0 });
    }
    const percentile = approximateExplicitHistogramPercentile(
      {
        bounds: row.bounds,
        counts: row.counts.map(BigInt),
        minimum: Number(row.minimum_count) === 0 ? null : Number(row.minimum),
        maximum: Number(row.maximum_count) === 0 ? null : Number(row.maximum),
      },
      aggregation,
    );
    if (percentile._tag === "invalid") {
      return yield* Effect.fail(
        unsupportedPercentile(
          "aggregate-metric-percentile-invalid-histogram",
          `Stored explicit histogram data is invalid: ${percentile.reason}.`,
        ),
      );
    }
    return new MetricAggregateResult({ value: percentile.value, matchedPoints });
  });

export const aggregateMetric = (
  client: ClickHouseClient,
  projectId: ProjectId,
  query: MetricAggregateQuery,
) =>
  Effect.gen(function* () {
    const range = timeRangePlan(query.range, "time_unix_nano", "metricAggregate");
    const filters = attributeFiltersPlan(
      query.filters ?? [],
      "attributes",
      "metricAggregateFilter",
    );
    const parameters = {
      ...projectParameters(projectId),
      metricName: query.metric,
      distinctKey: query.distinctKey ?? "",
      ...range.parameters,
      ...filters.parameters,
    };
    const where = `${range.where} AND ${filters.where}`;

    if (isPercentile(query.aggregation)) {
      const types = yield* metricTypes(client, where, parameters);
      if (types.includes("exponential_histogram") || types.includes("summary")) {
        return yield* Effect.fail(
          unsupportedPercentile(
            "aggregate-metric-percentile-unsupported",
            "Percentiles for exponential histograms and summaries are not supported safely yet.",
          ),
        );
      }
      if (types.includes("histogram") && types.some((type) => type !== "histogram")) {
        return yield* Effect.fail(
          unsupportedPercentile(
            "aggregate-metric-percentile-mixed-shapes",
            "A percentile aggregate cannot combine histograms with numeric metric points.",
          ),
        );
      }
      if (types.includes("histogram")) {
        return yield* aggregateExplicitHistogram(client, query.aggregation, where, parameters);
      }
    }

    return yield* clickhouseAttempt("aggregate metric", async (signal) => {
      const rate = query.aggregation === "rate";
      const expression = rate
        ? `sum(${rateContribution}) / {durationSeconds:Float64}`
        : (aggregateExpression(query) ??
          `quantileExact({percentile:Float64})(${numericMetricValue})`);
      const usablePoints = rate ? `countIf(NOT ${isInitialCumulativePoint})` : "count()";
      const result = await client.query({
        query: `SELECT
            if(${usablePoints} = 0, NULL, ${expression}) AS value,
            toString(count()) AS matched_points
          FROM
          (
            SELECT *, ${numericMetricValue} AS metric_value${rate ? `, ${rateWindow}` : ""}
            FROM groundtruth.metric_points
            WHERE project_id = {projectId:UUID}
              AND metric_name = {metricName:String}
            ${rate ? rateWindowDefinition : ""}
          )
          WHERE ${where}`,
        format: "JSONStringsEachRow",
        query_params: {
          ...parameters,
          durationSeconds: metricRangeDurationSeconds(query.range),
          percentile: query.aggregation === "p50" ? 0.5 : query.aggregation === "p95" ? 0.95 : 0.99,
        },
        abort_signal: signal,
      });
      const [row] = await result.json<AggregateRow>();
      return new MetricAggregateResult({
        value: row?.value === null || row?.value === undefined ? null : Number(row.value),
        matchedPoints: Number(row?.matched_points ?? "0"),
      });
    });
  });
