import {
  GroundtruthApi,
  PublicMetricPoint,
  PublicMetricSeries,
  PublicStatusComponent,
  PublicStatusMetric,
  PublicStatusResponse,
  ServiceUnavailable,
} from "@groundtruth/api-contract";
import { HostedSubject, ProjectSlug } from "@groundtruth/domain";
import { AccountRepository, ProjectRepository } from "@groundtruth/persistence";
import {
  AttributeKey,
  MetricName,
  type MetricNotFound,
  MetricQuery,
  type QueryTooBroad,
  RelativeTimeRange,
  type MetricQueryResult,
  type SignalHealth,
  type TelemetryUnavailable,
} from "@groundtruth/telemetry";
import { DateTime, Effect, Option } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { BackendConfig } from "../config/BackendConfig.js";
import { TelemetryStore } from "../telemetry/TelemetryStore.js";

const bootstrapSubject = HostedSubject.make("bootstrap@local.groundtruth");
const publicSeriesNames = new Map([
  ["clear-api", "Clear API"],
  ["checkout-api", "Checkout API"],
  ["payments-stub", "Payments"],
  ["load-generator", "Load generator"],
]);

const unavailable = () =>
  new ServiceUnavailable({
    service: "public-status",
    message: "Public status is temporarily unavailable",
  });

const runtimeVersion = () => (process.env.RENDER_GIT_COMMIT ?? "development").slice(0, 12);

const metricQuery = (metric: string, aggregation: "rate" | "p95") =>
  new MetricQuery({
    metric: MetricName.make(metric),
    aggregation,
    range: new RelativeTimeRange({ window: "15m" }),
    step: "10s",
    groupBy: [AttributeKey.make("service.name")],
    maxSeries: 4,
    maxPoints: 64,
  });

const requestRateQuery = metricQuery("http.server.requests", "rate");
const latencyQuery = metricQuery("http.server.duration", "p95");

type ProbeResult<Value> =
  | { readonly _tag: "available"; readonly value: Value }
  | { readonly _tag: "unavailable" };

type MetricProbeResult = ProbeResult<MetricQueryResult> | { readonly _tag: "not-observed" };

const probe = <Value, Error, Requirements>(effect: Effect.Effect<Value, Error, Requirements>) =>
  effect.pipe(
    Effect.map((value): ProbeResult<Value> => ({ _tag: "available", value })),
    Effect.catch(() =>
      Effect.succeed<ProbeResult<Value>>({
        _tag: "unavailable",
      }),
    ),
  );

const probeMetric = (
  effect: Effect.Effect<MetricQueryResult, MetricNotFound | QueryTooBroad | TelemetryUnavailable>,
): Effect.Effect<MetricProbeResult> =>
  effect.pipe(
    Effect.map((value): MetricProbeResult => ({
      _tag: "available",
      value,
    })),
    Effect.catchTag("MetricNotFound", () =>
      Effect.succeed<MetricProbeResult>({ _tag: "not-observed" }),
    ),
    Effect.catch(() => Effect.succeed<MetricProbeResult>({ _tag: "unavailable" })),
  );

const publicMetricSeries = (result: MetricQueryResult) =>
  result.series.flatMap((series) => {
    const rawServiceName = series.attributes["service.name"];
    const label = typeof rawServiceName === "string" ? publicSeriesNames.get(rawServiceName) : null;
    if (label === null || label === undefined) return [];
    const points = series.points
      .filter((point) => Number.isFinite(point.value) && point.value >= 0)
      .slice(-64)
      .map(
        (point) =>
          new PublicMetricPoint({
            at: point.at,
            value: point.value,
          }),
      );
    return points.length === 0 ? [] : [new PublicMetricSeries({ label, points })];
  });

const publicMetric = (
  key: "request-rate" | "p95-latency",
  title: string,
  description: string,
  unit: "requests/s" | "ms",
  result: MetricProbeResult,
) => {
  const series = result._tag === "available" ? publicMetricSeries(result.value) : [];
  return new PublicStatusMetric({
    key,
    title,
    description,
    unit,
    status: series.length === 0 ? "not-observed" : "ready",
    series,
  });
};

const latestObservedAt = (signals: ReadonlyArray<SignalHealth>) =>
  signals.reduce<DateTime.Utc | null>((latest, signal) => {
    if (signal.lastSeenAt === null) return latest;
    if (
      latest === null ||
      DateTime.toEpochMillis(signal.lastSeenAt) > DateTime.toEpochMillis(latest)
    ) {
      return signal.lastSeenAt;
    }
    return latest;
  }, null);

const telemetryComponent = (result: ProbeResult<ReadonlyArray<SignalHealth>>) => {
  if (result._tag === "unavailable") {
    return new PublicStatusComponent({
      key: "telemetry",
      name: "Telemetry intake",
      status: "unavailable",
      summary: "Recent telemetry could not be checked.",
      observedAt: null,
    });
  }
  const healthy = result.value.filter(({ status }) => status === "healthy").length;
  const delayed = result.value.some(({ status }) => status === "delayed");
  const status = healthy === 0 ? "degraded" : delayed ? "degraded" : "operational";
  return new PublicStatusComponent({
    key: "telemetry",
    name: "Telemetry intake",
    status,
    summary:
      status === "operational"
        ? "OpenTelemetry signals are arriving normally."
        : "Recent OpenTelemetry signals are incomplete or delayed.",
    observedAt: latestObservedAt(result.value),
  });
};

const storageComponent = (
  checkedAt: DateTime.Utc,
  probes: ReadonlyArray<{ readonly _tag: "available" | "not-observed" | "unavailable" }>,
) => {
  const available = probes.filter(({ _tag }) => _tag !== "unavailable").length;
  const status =
    available === probes.length ? "operational" : available === 0 ? "unavailable" : "degraded";
  return new PublicStatusComponent({
    key: "storage",
    name: "Storage",
    status,
    summary:
      status === "operational"
        ? "Operational data stores responded normally."
        : "One or more operational data stores did not respond normally.",
    observedAt: available === 0 ? null : checkedAt,
  });
};

export const PublicStatusHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "publicStatus",
  Effect.fn(function* (handlers) {
    const accounts = yield* AccountRepository;
    const config = yield* BackendConfig;
    const projects = yield* ProjectRepository;
    const telemetry = yield* TelemetryStore;

    const load = Effect.gen(function* () {
      if (!config.publicStatusEnabled) return yield* unavailable();
      const account = yield* accounts.findByHostedSubject(bootstrapSubject);
      if (Option.isNone(account)) return yield* unavailable();
      const project = yield* projects.findBySlug(
        account.value.id,
        ProjectSlug.make(config.bootstrapProjectSlug),
      );
      if (Option.isNone(project) || project.value.lifecycle !== "active") {
        return yield* unavailable();
      }

      const checkedAt = yield* DateTime.now;
      const result = yield* Effect.all(
        {
          health: probe(telemetry.signalHealth(project.value.id)),
          requestRate: probeMetric(telemetry.queryMetrics(project.value.id, requestRateQuery)),
          latency: probeMetric(telemetry.queryMetrics(project.value.id, latencyQuery)),
        },
        { concurrency: "unbounded" },
      );
      const api = new PublicStatusComponent({
        key: "api",
        name: "API",
        status: "operational",
        summary: "The Clear API is responding normally.",
        observedAt: checkedAt,
      });
      const intake = telemetryComponent(result.health);
      const storage = storageComponent(checkedAt, [
        result.health,
        result.requestRate,
        result.latency,
      ]);
      const status =
        intake.status === "operational" && storage.status === "operational"
          ? "operational"
          : "degraded";
      return new PublicStatusResponse({
        schemaVersion: 1,
        status,
        summary:
          status === "operational"
            ? "Clear is operating normally."
            : "Clear is operating with a delayed or unavailable dependency.",
        version: runtimeVersion(),
        checkedAt,
        components: [api, intake, storage],
        metrics: [
          publicMetric(
            "request-rate",
            "Request rate",
            "Recent request volume across Clear services.",
            "requests/s",
            result.requestRate,
          ),
          publicMetric(
            "p95-latency",
            "P95 latency",
            "Recent request latency across Clear services.",
            "ms",
            result.latency,
          ),
        ],
      });
    }).pipe(
      Effect.timeout("3 seconds"),
      Effect.tapError(() => Effect.logWarning("Public status refresh failed")),
      Effect.mapError(unavailable),
    );
    const cached = yield* Effect.cachedWithTTL(load, "5 seconds");

    return handlers.handle("getStatus", () => cached);
  }),
);
