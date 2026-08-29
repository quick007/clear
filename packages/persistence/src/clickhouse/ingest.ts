import type { ClickHouseClient } from "@clickhouse/client";
import type { ProjectId } from "@groundtruth/domain";
import type { CanonicalTelemetryBatch, LogSeverity } from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";
import { persistenceError } from "../errors.ts";
import {
  exemplarInsertRows,
  logInsertRows,
  metricInsertRows,
  metricSeriesHashInputs,
  spanEventInsertRows,
  spanInsertRows,
  spanLinkInsertRows,
} from "./ingest-rows.ts";
import { clickhouseAttempt } from "./operation.ts";

const severityFromNumber = (value: number): LogSeverity => {
  if (value === 0) return "unspecified";
  if (value <= 4) return "trace";
  if (value <= 8) return "debug";
  if (value <= 12) return "info";
  if (value <= 16) return "warn";
  if (value <= 20) return "error";
  return "fatal";
};

const maximumPastAgeNanos = 30n * 24n * 60n * 60n * 1_000_000_000n; // 30 days
const maximumFutureSkewNanos = 10n * 60n * 1_000_000_000n; // 10 minutes

const validateSignalTime = (label: string, value: bigint, minimum: bigint, maximum: bigint) => {
  if (value < minimum || value > maximum) {
    throw new RangeError(`${label} is outside the accepted telemetry time window`);
  }
};

const validateBatch = (batch: CanonicalTelemetryBatch, acceptedAt: DateTime.Utc) => {
  const receivedNano = BigInt(DateTime.toEpochMillis(acceptedAt)) * 1_000_000n;
  const minimum = receivedNano - maximumPastAgeNanos;
  const maximum = receivedNano + maximumFutureSkewNanos;
  for (const metric of batch.metrics) {
    validateSignalTime("metric timestamp", metric.timeUnixNano, minimum, maximum);
    for (const exemplar of metric.exemplars) {
      validateSignalTime("metric exemplar timestamp", exemplar.timeUnixNano, minimum, maximum);
    }
  }
  for (const log of batch.logs) {
    if (log.severity !== severityFromNumber(log.severityNumber)) {
      throw new RangeError("log severity does not match severityNumber");
    }
    validateSignalTime("log timestamp", log.timeUnixNano, minimum, maximum);
    if (log.observedTimeUnixNano !== 0n) {
      validateSignalTime("log observed timestamp", log.observedTimeUnixNano, minimum, maximum);
    }
  }
  for (const span of batch.spans) {
    if (
      span.endTimeUnixNano < span.startTimeUnixNano ||
      span.endTimeUnixNano - span.startTimeUnixNano !== span.durationNanos
    ) {
      throw new RangeError("span duration does not match its start and end timestamps");
    }
    validateSignalTime("span start timestamp", span.startTimeUnixNano, minimum, maximum);
    validateSignalTime("span end timestamp", span.endTimeUnixNano, minimum, maximum);
    for (const event of span.events) {
      validateSignalTime("span event timestamp", event.timeUnixNano, minimum, maximum);
    }
  }
};

interface ExcludedInsertColumns {
  readonly except: [string, ...Array<string>];
}

const insertRows = <Row extends Record<string, unknown>>(
  client: ClickHouseClient,
  batchId: string,
  operation: string,
  table: string,
  rows: ReadonlyArray<Row>,
  columns?: ExcludedInsertColumns,
) => {
  if (rows.length === 0) return Effect.void;
  return clickhouseAttempt(operation, (signal) =>
    client.insert<Row>({
      table,
      values: [...rows],
      format: "JSONEachRow",
      columns,
      abort_signal: signal,
      clickhouse_settings: {
        insert_deduplicate: 1,
        insert_deduplication_token: `${batchId}:${table}`,
        deduplicate_blocks_in_dependent_materialized_views: 1,
      },
    }),
  ).pipe(Effect.asVoid);
};

const metricHashes = (client: ClickHouseClient, batch: CanonicalTelemetryBatch) => {
  const inputs = metricSeriesHashInputs(batch);
  if (!batch.metrics.some(({ exemplars }) => exemplars.length > 0)) {
    return Effect.succeed(new Map<number, string>());
  }
  return clickhouseAttempt("compute metric series hashes", async (signal) => {
    const result = await client.query({
      query: `SELECT
        tupleElement(entry, 1) AS ordinal,
        toString(cityHash64(tupleElement(entry, 2), tupleElement(entry, 3), tupleElement(entry, 4), tupleElement(entry, 5))) AS series_hash
      FROM
      (
        SELECT arrayJoin(arrayZip(
          {ordinals:Array(UInt32)}, {metricNames:Array(String)}, {resourceJson:Array(String)},
          {scopeNames:Array(String)}, {attributesJson:Array(String)}
        )) AS entry
      )`,
      format: "JSONStringsEachRow",
      query_params: {
        ordinals: inputs.map(({ ordinal }) => ordinal),
        metricNames: inputs.map(({ metricName }) => metricName),
        resourceJson: inputs.map(({ resourceAttributesJson }) => resourceAttributesJson),
        scopeNames: inputs.map(({ scopeName }) => scopeName),
        attributesJson: inputs.map(({ attributesJson }) => attributesJson),
      },
      abort_signal: signal,
    });
    const rows = await result.json<{ ordinal: string; series_hash: string }>();
    return new Map(rows.map((row) => [Number(row.ordinal), row.series_hash]));
  });
};

export const ingestTelemetry = (
  client: ClickHouseClient,
  projectId: ProjectId,
  retentionDays: number,
  batch: CanonicalTelemetryBatch,
) =>
  Effect.gen(function* () {
    const acceptedAt = yield* DateTime.now;
    yield* Effect.try({
      try: () => {
        if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
          throw new RangeError("retentionDays must be an integer between 1 and 365");
        }
        validateBatch(batch, acceptedAt);
      },
      catch: (cause) => persistenceError("clickhouse", "validate telemetry batch", cause, false),
    });
    const hashes = yield* metricHashes(client, batch);
    yield* Effect.all(
      [
        insertRows(
          client,
          `${projectId}:${batch.id}`,
          "insert metric points",
          "groundtruth.metric_points",
          metricInsertRows(projectId, retentionDays, batch, acceptedAt),
          { except: ["series_hash"] },
        ),
        insertRows(
          client,
          `${projectId}:${batch.id}`,
          "insert metric exemplars",
          "groundtruth.metric_exemplars",
          exemplarInsertRows(projectId, retentionDays, batch, hashes, acceptedAt),
        ),
        insertRows(
          client,
          `${projectId}:${batch.id}`,
          "insert logs",
          "groundtruth.logs",
          logInsertRows(projectId, retentionDays, batch, acceptedAt),
        ),
        insertRows(
          client,
          `${projectId}:${batch.id}`,
          "insert spans",
          "groundtruth.spans",
          spanInsertRows(projectId, retentionDays, batch, acceptedAt),
          { except: ["duration_nano"] },
        ),
        insertRows(
          client,
          `${projectId}:${batch.id}`,
          "insert span events",
          "groundtruth.span_events",
          spanEventInsertRows(projectId, retentionDays, batch, acceptedAt),
        ),
        insertRows(
          client,
          `${projectId}:${batch.id}`,
          "insert span links",
          "groundtruth.span_links",
          spanLinkInsertRows(projectId, retentionDays, batch, acceptedAt),
        ),
      ],
      { concurrency: 1, discard: true },
    );
  });
