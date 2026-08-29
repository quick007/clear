import { QuotaExceeded, type ProjectId } from "@groundtruth/domain";
import { ProjectRepository, type ProjectQuotas } from "@groundtruth/persistence";
import {
  type CanonicalTelemetryBatch,
  type MetricPoint,
  TelemetryUnavailable,
} from "@groundtruth/telemetry";
import { Clock, Context, Crypto, Effect, Encoding, Layer, Option, Ref } from "effect";

const minuteMillis = 60 * 1_000; // 1 minute
const activeSeriesWindowMillis = 5 * 60 * 1_000; // 5 minutes
const maxIngestRequestsPerMinute = 300;
const maxGlobalIngestRequestsPerMinute = 1_200;
const maxGlobalIngestBytesPerMinute = 20_000_000;
const textEncoder = new TextEncoder();

interface IngestWindow {
  readonly startedAt: number;
  readonly requests: number;
  readonly bytes: number;
}

interface ProjectQuotaState {
  readonly windowStartedAt: number;
  readonly ingestRequests: number;
  readonly ingestBytes: number;
  readonly activeSeries: ReadonlyMap<string, number>;
}

interface QuotaState {
  readonly projects: ReadonlyMap<ProjectId, ProjectQuotaState>;
  readonly global: IngestWindow;
}

type AdmissionDecision =
  | { readonly _tag: "accepted" }
  | { readonly _tag: "rejected"; readonly error: QuotaExceeded };

export interface CollectorQuotaReservation {
  readonly projectId: ProjectId;
  readonly maxActiveSeries: number;
}

export interface CollectorQuotaPruneResult {
  readonly projectsRemoved: number;
  readonly seriesRemoved: number;
}

const emptyProjectState = (now: number): ProjectQuotaState => ({
  windowStartedAt: Math.floor(now / minuteMillis) * minuteMillis,
  ingestRequests: 0,
  ingestBytes: 0,
  activeSeries: new Map(),
});

const emptyIngestWindow = (now: number): IngestWindow => ({
  startedAt: Math.floor(now / minuteMillis) * minuteMillis,
  requests: 0,
  bytes: 0,
});

const stableValue = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`)
      .join(",")}}`;
  }
  return `${typeof value}:${JSON.stringify(value)}`;
};

const metricSeriesKey = (point: MetricPoint) =>
  stableValue({
    attributes: point.attributes,
    metric: {
      name: point.name,
      serviceName: point.serviceName,
      type: point._tag,
      unit: point.unit,
    },
    resource: {
      attributes: point.resource.attributes,
      schemaUrl: point.resource.schemaUrl,
    },
    scope: {
      attributes: point.scope.attributes,
      name: point.scope.name,
      schemaUrl: point.scope.schemaUrl,
      version: point.scope.version,
    },
  });

const quotaUnavailable = (message: string, retryable = true) =>
  new TelemetryUnavailable({
    operation: "collector quota admission",
    retryable,
    message,
  });

const validLimit = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;

const validateQuotas = (quotas: ProjectQuotas) =>
  validLimit(quotas.maxIngestBytesPerMinute) && validLimit(quotas.maxActiveSeries)
    ? Effect.succeed(quotas)
    : Effect.fail(quotaUnavailable("Project ingest quotas are invalid", false));

const quotaError = (quota: string, limit: number, observed: number, message: string) =>
  new QuotaExceeded({ quota, limit, observed, message });

export class CollectorQuotaService extends Context.Service<
  CollectorQuotaService,
  {
    admitRequest(
      projectId: ProjectId,
      wireBytes: number,
    ): Effect.Effect<CollectorQuotaReservation, QuotaExceeded | TelemetryUnavailable>;
    admitSeries(
      reservation: CollectorQuotaReservation,
      batch: CanonicalTelemetryBatch,
    ): Effect.Effect<void, QuotaExceeded | TelemetryUnavailable>;
    pruneStale(): Effect.Effect<CollectorQuotaPruneResult>;
  }
>()("groundtruth/backend/telemetry/CollectorQuotaService") {
  static readonly layer = Layer.effect(
    CollectorQuotaService,
    Effect.gen(function* () {
      const projects = yield* ProjectRepository;
      const crypto = yield* Crypto.Crypto;
      const state = yield* Ref.make<QuotaState>({
        projects: new Map(),
        global: emptyIngestWindow(0),
      });

      const getQuotas = Effect.fn("CollectorQuotaService.getQuotas")(function* (
        projectId: ProjectId,
      ) {
        const found = yield* projects
          .getQuotas(projectId)
          .pipe(
            Effect.mapError((error) =>
              quotaUnavailable(`Project quota lookup failed for ${error.store}`, error.retryable),
            ),
          );
        if (Option.isNone(found)) {
          return yield* quotaUnavailable("Project ingest quotas are unavailable", false);
        }
        return yield* validateQuotas(found.value);
      });

      const admitRequest = Effect.fn("CollectorQuotaService.admitRequest")(function* (
        projectId: ProjectId,
        wireBytes: number,
      ) {
        const quotas = yield* getQuotas(projectId);
        if (!Number.isSafeInteger(wireBytes) || wireBytes < 0) {
          return yield* quotaUnavailable("Collector wire byte count is invalid", false);
        }
        const now = yield* Clock.currentTimeMillis;
        const decision = yield* Ref.modify<QuotaState, AdmissionDecision>(state, (current) => {
          const previous = current.projects.get(projectId) ?? emptyProjectState(now);
          const windowStartedAt = Math.floor(now / minuteMillis) * minuteMillis;
          const ingestRequests =
            previous.windowStartedAt === windowStartedAt ? previous.ingestRequests : 0;
          const ingestBytes =
            previous.windowStartedAt === windowStartedAt ? previous.ingestBytes : 0;
          const nextIngestRequests = ingestRequests + 1;
          const nextIngestBytes = ingestBytes + wireBytes;
          const global =
            current.global.startedAt === windowStartedAt ? current.global : emptyIngestWindow(now);
          const nextGlobalRequests = global.requests + 1;
          const nextGlobalBytes = global.bytes + wireBytes;
          const activeSeries = previous.activeSeries;
          const attemptedState = {
            windowStartedAt,
            ingestRequests: Math.min(nextIngestRequests, maxIngestRequestsPerMinute + 1),
            ingestBytes: Math.min(nextIngestBytes, quotas.maxIngestBytesPerMinute + 1),
            activeSeries,
          } satisfies ProjectQuotaState;
          const attemptedGlobal = {
            startedAt: windowStartedAt,
            requests: Math.min(nextGlobalRequests, maxGlobalIngestRequestsPerMinute + 1),
            bytes: Math.min(nextGlobalBytes, maxGlobalIngestBytesPerMinute + 1),
          } satisfies IngestWindow;
          const nextState = {
            projects: new Map(current.projects).set(projectId, attemptedState),
            global: attemptedGlobal,
          } satisfies QuotaState;
          const projectRejectedState = {
            ...nextState,
            global,
          } satisfies QuotaState;

          if (nextIngestRequests > maxIngestRequestsPerMinute) {
            return [
              {
                _tag: "rejected",
                error: quotaError(
                  "ingest-requests-per-minute",
                  maxIngestRequestsPerMinute,
                  nextIngestRequests,
                  `Ingest exceeds the ${maxIngestRequestsPerMinute} request per minute project quota`,
                ),
              },
              projectRejectedState,
            ];
          }

          if (nextIngestBytes > quotas.maxIngestBytesPerMinute) {
            return [
              {
                _tag: "rejected",
                error: quotaError(
                  "ingest-bytes-per-minute",
                  quotas.maxIngestBytesPerMinute,
                  nextIngestBytes,
                  `Ingest exceeds the ${quotas.maxIngestBytesPerMinute} byte per minute project quota`,
                ),
              },
              projectRejectedState,
            ];
          }

          if (nextGlobalRequests > maxGlobalIngestRequestsPerMinute) {
            return [
              {
                _tag: "rejected",
                error: quotaError(
                  "global-ingest-requests-per-minute",
                  maxGlobalIngestRequestsPerMinute,
                  nextGlobalRequests,
                  "Hosted ingest is temporarily above its global request ceiling",
                ),
              },
              nextState,
            ];
          }

          if (nextGlobalBytes > maxGlobalIngestBytesPerMinute) {
            return [
              {
                _tag: "rejected",
                error: quotaError(
                  "global-ingest-bytes-per-minute",
                  maxGlobalIngestBytesPerMinute,
                  nextGlobalBytes,
                  "Hosted ingest is temporarily above its global byte ceiling",
                ),
              },
              nextState,
            ];
          }

          return [{ _tag: "accepted" }, nextState];
        });
        if (decision._tag === "rejected") return yield* decision.error;
        return { projectId, maxActiveSeries: quotas.maxActiveSeries };
      });

      const admitSeries = Effect.fn("CollectorQuotaService.admitSeries")(function* (
        reservation: CollectorQuotaReservation,
        batch: CanonicalTelemetryBatch,
      ) {
        const seriesKeys = yield* Effect.forEach(batch.metrics, (point) =>
          crypto.digest("SHA-256", textEncoder.encode(metricSeriesKey(point))).pipe(
            Effect.map(Encoding.encodeHex),
            Effect.mapError(() => quotaUnavailable("Unable to hash telemetry series identity")),
          ),
        );
        const now = yield* Clock.currentTimeMillis;
        const decision = yield* Ref.modify<QuotaState, AdmissionDecision>(state, (current) => {
          const previous = current.projects.get(reservation.projectId) ?? emptyProjectState(now);
          const activeSeries = new Map(
            [...previous.activeSeries].filter(
              ([, lastSeenAt]) => lastSeenAt > now - activeSeriesWindowMillis,
            ),
          );
          const candidateSeries = new Map(activeSeries);
          for (const key of seriesKeys) {
            if (!candidateSeries.has(key) && candidateSeries.size >= reservation.maxActiveSeries) {
              return [
                {
                  _tag: "rejected",
                  error: quotaError(
                    "active-series",
                    reservation.maxActiveSeries,
                    candidateSeries.size + 1,
                    `Ingest exceeds the ${reservation.maxActiveSeries} active series project quota`,
                  ),
                },
                {
                  ...current,
                  projects: new Map(current.projects).set(reservation.projectId, {
                    ...previous,
                    activeSeries,
                  }),
                },
              ];
            }
            candidateSeries.set(key, now);
          }
          return [
            { _tag: "accepted" },
            {
              ...current,
              projects: new Map(current.projects).set(reservation.projectId, {
                ...previous,
                activeSeries: candidateSeries,
              }),
            },
          ];
        });
        if (decision._tag === "rejected") return yield* decision.error;
      });

      const pruneStale = Effect.fn("CollectorQuotaService.pruneStale")(function* () {
        const now = yield* Clock.currentTimeMillis;
        return yield* Ref.modify<QuotaState, CollectorQuotaPruneResult>(state, (current) => {
          const next = new Map<ProjectId, ProjectQuotaState>();
          let projectsRemoved = 0;
          let seriesRemoved = 0;
          for (const [projectId, project] of current.projects) {
            const activeSeries = new Map(
              [...project.activeSeries].filter(([, lastSeenAt]) => {
                const active = lastSeenAt > now - activeSeriesWindowMillis;
                if (!active) seriesRemoved += 1;
                return active;
              }),
            );
            const ingestWindowActive = now < project.windowStartedAt + minuteMillis;
            if (!ingestWindowActive && activeSeries.size === 0) {
              projectsRemoved += 1;
              continue;
            }
            next.set(projectId, {
              windowStartedAt: ingestWindowActive
                ? project.windowStartedAt
                : Math.floor(now / minuteMillis) * minuteMillis,
              ingestRequests: ingestWindowActive ? project.ingestRequests : 0,
              ingestBytes: ingestWindowActive ? project.ingestBytes : 0,
              activeSeries,
            });
          }
          return [
            { projectsRemoved, seriesRemoved },
            {
              projects: next,
              global:
                now < current.global.startedAt + minuteMillis
                  ? current.global
                  : emptyIngestWindow(now),
            },
          ];
        });
      });

      return CollectorQuotaService.of({ admitRequest, admitSeries, pruneStale });
    }),
  );
}
