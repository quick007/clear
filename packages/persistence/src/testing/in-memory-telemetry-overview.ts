import {
  type ProjectId,
  ServiceMetadata,
  ServiceName as DomainServiceName,
  SignalPresence,
} from "@groundtruth/domain";
import {
  type CanonicalTelemetryBatch,
  SignalActivity,
  type SignalKind,
} from "@groundtruth/telemetry";
import { DateTime } from "effect";

const signalOrder: ReadonlyArray<SignalKind> = ["metrics", "logs", "traces"];

export const listSignalActivityFromBatches = (batches: ReadonlyArray<CanonicalTelemetryBatch>) =>
  signalOrder.flatMap((signal) => {
    const services = new Set<SignalActivity["services"][number]>();
    let itemCount = 0;
    let observedAt: SignalActivity["observedAt"] | undefined;
    for (const batch of batches) {
      const items =
        signal === "metrics" ? batch.metrics : signal === "logs" ? batch.logs : batch.spans;
      if (items.length === 0) continue;
      itemCount += items.length;
      for (const { serviceName } of items) services.add(serviceName);
      if (
        observedAt === undefined ||
        DateTime.toEpochMillis(batch.receivedAt) > DateTime.toEpochMillis(observedAt)
      )
        observedAt = batch.receivedAt;
    }
    if (observedAt === undefined) return [];
    return [
      new SignalActivity({
        signal,
        services: [...services].sort((left, right) => String(left).localeCompare(String(right))),
        itemCount,
        observedAt,
      }),
    ];
  });

interface ServiceSeen {
  readonly first: bigint;
  readonly last: bigint;
  readonly metrics: boolean;
  readonly logs: boolean;
  readonly traces: boolean;
}

export const listServicesFromBatches = (
  projectId: ProjectId,
  batches: ReadonlyArray<CanonicalTelemetryBatch>,
) => {
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
  for (const batch of batches) {
    for (const point of batch.metrics)
      observe(String(point.serviceName), point.timeUnixNano, "metrics");
    for (const record of batch.logs)
      observe(String(record.serviceName), record.timeUnixNano, "logs");
    for (const span of batch.spans)
      observe(String(span.serviceName), span.startTimeUnixNano, "traces");
  }
  return [...services.entries()]
    .map(
      ([name, seen]) =>
        new ServiceMetadata({
          projectId,
          name: DomainServiceName.make(name),
          signals: new SignalPresence({
            metrics: seen.metrics,
            logs: seen.logs,
            traces: seen.traces,
          }),
          firstSeenAt: DateTime.makeUnsafe(Number(seen.first / 1_000_000n)),
          lastSeenAt: DateTime.makeUnsafe(Number(seen.last / 1_000_000n)),
        }),
    )
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
};
