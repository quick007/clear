import type { ClickHouseClient } from "@clickhouse/client";
import { type ProjectId, ServiceMetadata, ServiceName, SignalPresence } from "@groundtruth/domain";
import { SignalActivity } from "@groundtruth/telemetry";
import { DateTime, Schema } from "effect";
import { clickhouseAttempt } from "./operation.ts";
import { projectParameters } from "./sql.ts";

interface ServiceRow {
  readonly service_name: string;
  readonly first_seen_nano: string;
  readonly last_seen_nano: string;
  readonly has_metrics: string;
  readonly has_logs: string;
  readonly has_traces: string;
}

interface ActivityRow {
  readonly signal: string;
  readonly services: string;
  readonly item_count: string;
  readonly observed_at: string;
}

const dateTimeFromNano = (value: string) =>
  DateTime.fromDateUnsafe(new Date(Number(BigInt(value) / 1_000_000n)));

const signalRows = `
  SELECT 'metrics' AS signal, service_name, count() AS item_count,
    min(time_unix_nano) AS first_seen_nano, max(time_unix_nano) AS last_seen_nano,
    max(ingested_at) AS last_received_at,
    toUInt8(1) AS has_metrics, toUInt8(0) AS has_logs, toUInt8(0) AS has_traces
  FROM groundtruth.metric_points WHERE project_id = {projectId:UUID} GROUP BY service_name
  UNION ALL
  SELECT 'logs' AS signal, service_name, count() AS item_count,
    min(time_unix_nano) AS first_seen_nano, max(time_unix_nano) AS last_seen_nano,
    max(ingested_at) AS last_received_at,
    toUInt8(0) AS has_metrics, toUInt8(1) AS has_logs, toUInt8(0) AS has_traces
  FROM groundtruth.logs WHERE project_id = {projectId:UUID} GROUP BY service_name
  UNION ALL
  SELECT 'traces' AS signal, service_name, count() AS item_count,
    min(start_time_unix_nano) AS first_seen_nano, max(start_time_unix_nano) AS last_seen_nano,
    max(ingested_at) AS last_received_at,
    toUInt8(0) AS has_metrics, toUInt8(0) AS has_logs, toUInt8(1) AS has_traces
  FROM groundtruth.spans WHERE project_id = {projectId:UUID} GROUP BY service_name`;

export const listServices = (client: ClickHouseClient, projectId: ProjectId) =>
  clickhouseAttempt("list telemetry services", async (signal) => {
    const result = await client.query({
      query: `SELECT service_name, min(first_seen_nano) AS first_seen_nano,
        max(last_seen_nano) AS last_seen_nano, max(has_metrics) AS has_metrics,
        max(has_logs) AS has_logs, max(has_traces) AS has_traces
      FROM (${signalRows})
      GROUP BY service_name
      ORDER BY service_name`,
      format: "JSONStringsEachRow",
      query_params: projectParameters(projectId),
      abort_signal: signal,
    });
    const rows = await result.json<ServiceRow>();
    return rows.map(
      (row) =>
        new ServiceMetadata({
          projectId,
          name: ServiceName.make(row.service_name),
          signals: new SignalPresence({
            metrics: row.has_metrics === "1",
            logs: row.has_logs === "1",
            traces: row.has_traces === "1",
          }),
          firstSeenAt: dateTimeFromNano(row.first_seen_nano),
          lastSeenAt: dateTimeFromNano(row.last_seen_nano),
        }),
    );
  });

export const listSignalActivity = (client: ClickHouseClient, projectId: ProjectId) =>
  clickhouseAttempt("list signal activity", async (signal) => {
    const result = await client.query({
      query: `SELECT signal, toJSONString(groupUniqArray(service_name)) AS services,
        sum(item_count) AS item_count,
        formatDateTime(max(last_received_at), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS observed_at
      FROM (${signalRows})
      GROUP BY signal
      ORDER BY indexOf(['metrics', 'logs', 'traces'], signal)`,
      format: "JSONStringsEachRow",
      query_params: projectParameters(projectId),
      abort_signal: signal,
    });
    const rows = await result.json<ActivityRow>();
    return rows.map((row) =>
      Schema.decodeUnknownSync(SignalActivity)({
        signal: row.signal,
        services: (JSON.parse(row.services) as Array<string>).sort((left, right) =>
          left.localeCompare(right),
        ),
        itemCount: Number(row.item_count),
        observedAt: row.observed_at,
      }),
    );
  });
