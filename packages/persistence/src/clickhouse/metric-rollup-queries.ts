import type { ClickHouseClient } from "@clickhouse/client";
import type { ProjectId } from "@groundtruth/domain";
import { type MetricQuery, metricQuerySupportsRollups } from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";
import { persistenceError } from "../errors.ts";
import { buildMetricQueryResult, type MetricQueryRow } from "./metric-query-result.ts";
import { clickhouseAttempt } from "./operation.ts";
import { formatDateTime64, projectParameters } from "./sql.ts";

export const metricStepPlan = (query: MetricQuery) => {
  if (query.step !== undefined) {
    return {
      "5s": { sql: "5 SECOND", seconds: 5 },
      "10s": { sql: "10 SECOND", seconds: 10 },
      "30s": { sql: "30 SECOND", seconds: 30 },
      "1m": { sql: "1 MINUTE", seconds: 60 },
      "5m": { sql: "5 MINUTE", seconds: 300 },
    }[query.step];
  }
  const seconds =
    query.range._tag === "absolute"
      ? (DateTime.toEpochMillis(query.range.end) - DateTime.toEpochMillis(query.range.start)) / 1000
      : {
          "5m": 300,
          "15m": 900,
          "1h": 3_600,
          "3h": 10_800,
          "6h": 21_600,
          "12h": 43_200,
          "24h": 86_400,
          "7d": 604_800,
        }[query.range.window];
  if (seconds <= 900) return { sql: "10 SECOND", seconds: 10 };
  if (seconds <= 3_600) return { sql: "30 SECOND", seconds: 30 };
  if (seconds <= 21_600) return { sql: "1 MINUTE", seconds: 60 };
  if (seconds > 86_400) return { sql: "15 MINUTE", seconds: 900 };
  return { sql: "5 MINUTE", seconds: 300 };
};

const rollupRangePlan = (query: MetricQuery) => {
  if (query.range._tag === "relative") {
    return {
      where: `bucket >= now('UTC') - INTERVAL ${query.range.window === "7d" ? "7 DAY" : "24 HOUR"}`,
      parameters: {},
    };
  }
  return {
    where:
      "bucket >= {rollupStart:DateTime64(9, 'UTC')} AND bucket <= {rollupEnd:DateTime64(9, 'UTC')}",
    parameters: {
      rollupStart: formatDateTime64(query.range.start),
      rollupEnd: formatDateTime64(query.range.end),
    },
  };
};

const rollupServiceFiltersPlan = (query: MetricQuery) => {
  const parameters: Record<string, string> = {};
  const clauses = (query.filters ?? []).map((filter, index) => {
    const parameter = `rollupService${index}`;
    parameters[parameter] = filter.value === null ? "" : String(filter.value);
    switch (filter.operator) {
      case "equals":
        return `service_name = {${parameter}:String}`;
      case "not-equals":
        return `service_name != {${parameter}:String}`;
      case "contains":
        return `positionCaseInsensitiveUTF8(service_name, {${parameter}:String}) > 0`;
      case "exists":
        return "notEmpty(service_name)";
    }
  });
  return { where: clauses.length === 0 ? "1" : clauses.join(" AND "), parameters };
};

const rollupAggregation = (query: MetricQuery) => {
  switch (query.aggregation) {
    case "sum":
      return "sumMerge(value_sum)";
    case "avg":
      return "avgMerge(value_avg)";
    case "min":
      return "minMerge(value_min)";
    case "max":
      return "maxMerge(value_max)";
    case "count":
      return "toFloat64(sum(point_count))";
    case "p50":
      return "quantilesTDigestMerge(0.5, 0.95, 0.99)(value_quantiles)[1]";
    case "p95":
      return "quantilesTDigestMerge(0.5, 0.95, 0.99)(value_quantiles)[2]";
    case "p99":
      return "quantilesTDigestMerge(0.5, 0.95, 0.99)(value_quantiles)[3]";
    case "rate":
    case "count-distinct":
      return null;
  }
};

const rollupQueryError = () =>
  persistenceError(
    "clickhouse",
    "query-metrics-rollup-unsupported",
    new Error(
      "Metric queries longer than 24 hours support numeric aggregates, optional service.name grouping, and service.name filters.",
    ),
    false,
  );

export const queryMetricRollups = (
  client: ClickHouseClient,
  projectId: ProjectId,
  query: MetricQuery,
) =>
  Effect.gen(function* () {
    const aggregate = rollupAggregation(query);
    if (aggregate === null || !metricQuerySupportsRollups(query)) {
      return yield* Effect.fail(rollupQueryError());
    }
    const step = metricStepPlan(query);
    const range = rollupRangePlan(query);
    const filters = rollupServiceFiltersPlan(query);
    const groupedByService = query.groupBy?.[0] === "service.name";
    const group0 = groupedByService ? "service_name" : "''";
    const maxPoints = query.maxPoints ?? 1_000;
    const maxSeries = query.maxSeries ?? 20;
    const rows = yield* clickhouseAttempt("query metric rollups", async (signal) => {
      const result = await client.query({
        query: `SELECT
          formatDateTime(
            toStartOfInterval(bucket, INTERVAL ${step.sql}),
            '%Y-%m-%dT%H:%i:%SZ',
            'UTC'
          ) AS at,
          ${group0} AS group_0,
          '' AS group_1,
          ${aggregate} AS value
        FROM groundtruth.metric_numeric_rollups_10s
        WHERE project_id = {projectId:UUID}
          AND metric_name = {metricName:String}
          AND ${range.where}
          AND ${filters.where}
        GROUP BY toStartOfInterval(bucket, INTERVAL ${step.sql}), group_0
        ORDER BY toStartOfInterval(bucket, INTERVAL ${step.sql}), group_0
        LIMIT {pointLimit:UInt32}`,
        format: "JSONStringsEachRow",
        query_params: {
          ...projectParameters(projectId),
          metricName: query.metric,
          pointLimit: maxPoints + 1,
          ...range.parameters,
          ...filters.parameters,
        },
        abort_signal: signal,
      });
      return result.json<MetricQueryRow>();
    });
    return buildMetricQueryResult(query, rows, maxPoints, maxSeries);
  });
