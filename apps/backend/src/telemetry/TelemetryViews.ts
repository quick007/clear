import { type ProjectId, ServiceMetadata, ServiceName, SignalPresence } from "@groundtruth/domain";
import {
  type LogRecord,
  type MetricPoint,
  SignalActivity,
  SignalHealth,
  type SignalKind,
  type SpanRecord,
} from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";

interface TelemetrySignals {
  readonly metrics: ReadonlyArray<MetricPoint>;
  readonly logs: ReadonlyArray<LogRecord>;
  readonly spans: ReadonlyArray<SpanRecord>;
}

interface ServiceSeen {
  readonly first: bigint;
  readonly last: bigint;
  readonly metrics: boolean;
  readonly logs: boolean;
  readonly traces: boolean;
}

export const listServicesFromTelemetry = (projectId: ProjectId, telemetry: TelemetrySignals) => {
  const services = new Map<string, ServiceSeen>();
  const observe = (name: string, at: bigint, signal: SignalKind) => {
    const current = services.get(name);
    services.set(name, {
      first: current === undefined || at < current.first ? at : current.first,
      last: current === undefined || at > current.last ? at : current.last,
      metrics: current?.metrics === true || signal === "metrics",
      logs: current?.logs === true || signal === "logs",
      traces: current?.traces === true || signal === "traces",
    });
  };
  for (const point of telemetry.metrics)
    observe(String(point.serviceName), point.timeUnixNano, "metrics");
  for (const record of telemetry.logs)
    observe(String(record.serviceName), record.timeUnixNano, "logs");
  for (const span of telemetry.spans)
    observe(String(span.serviceName), span.startTimeUnixNano, "traces");
  return Array.from(services.entries())
    .map(
      ([name, seen]) =>
        new ServiceMetadata({
          projectId,
          name: ServiceName.make(name),
          signals: new SignalPresence({
            metrics: seen.metrics,
            logs: seen.logs,
            traces: seen.traces,
          }),
          firstSeenAt: DateTime.fromDateUnsafe(new Date(Number(seen.first / 1_000_000n))),
          lastSeenAt: DateTime.fromDateUnsafe(new Date(Number(seen.last / 1_000_000n))),
        }),
    )
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
};

export const signalHealthFromActivities = (activities: ReadonlyArray<SignalActivity>) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const delayedAfter = 5 * 60 * 1_000; // 5 minutes
    return (["metrics", "logs", "traces"] as const).map((signal) => {
      const matching = activities.filter((activity) => activity.signal === signal);
      const first = matching.reduce<SignalActivity | undefined>(
        (earliest, activity) =>
          earliest === undefined ||
          DateTime.toEpochMillis(activity.observedAt) < DateTime.toEpochMillis(earliest.observedAt)
            ? activity
            : earliest,
        undefined,
      );
      const last = matching.reduce<SignalActivity | undefined>(
        (latest, activity) =>
          latest === undefined ||
          DateTime.toEpochMillis(activity.observedAt) > DateTime.toEpochMillis(latest.observedAt)
            ? activity
            : latest,
        undefined,
      );
      return new SignalHealth({
        signal,
        status:
          last === undefined
            ? "inactive"
            : DateTime.toEpochMillis(now) - DateTime.toEpochMillis(last.observedAt) > delayedAfter
              ? "delayed"
              : "healthy",
        firstSeenAt: first?.observedAt ?? null,
        lastSeenAt: last?.observedAt ?? null,
        services: Array.from(new Set(matching.flatMap((activity) => activity.services))),
      });
    });
  });
