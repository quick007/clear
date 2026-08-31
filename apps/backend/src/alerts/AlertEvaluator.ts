import { ServiceUnavailable } from "@groundtruth/api-contract";
import { type Alert, NonEmptyText, type ProjectId } from "@groundtruth/domain";
import {
  AlertRepository,
  type PersistenceError,
  type UpdateAlertStateInput,
} from "@groundtruth/persistence";
import {
  AbsoluteTimeRange,
  AttributeFilter,
  AttributeKey,
  MetricAggregateQuery,
  MetricName,
} from "@groundtruth/telemetry";
import { Context, DateTime, Effect, Layer, Option, Ref } from "effect";
import { IncidentService } from "../incidents/IncidentService.js";
import { isSandboxProjectId } from "../memory/SeedIds.js";
import { TelemetryStore } from "../telemetry/TelemetryStore.js";

const evaluationInterval = "30 seconds"; // 30 seconds

type AlertEvaluationOutcome = "failed" | "no-data" | "skipped" | "stable" | "transitioned";

export interface AlertEvaluationReport {
  readonly projectId: ProjectId;
  readonly scanned: number;
  readonly failed: number;
  readonly noData: number;
  readonly skipped: number;
  readonly stable: number;
  readonly transitioned: number;
}

const storageUnavailable = (error: PersistenceError) =>
  new ServiceUnavailable({
    service: error.store,
    message: `Storage operation failed (reference ${error.correlationId})`,
  });

const serviceFilter = (alert: Alert) =>
  alert.serviceName === null
    ? undefined
    : [
        new AttributeFilter({
          key: AttributeKey.make("service.name"),
          operator: "equals",
          value: alert.serviceName,
        }),
      ];

const queryFor = (alert: Alert, now: DateTime.Utc) =>
  new MetricAggregateQuery({
    metric: MetricName.make(alert.metricName),
    aggregation: alert.aggregation,
    range: new AbsoluteTimeRange({
      start: DateTime.fromDateUnsafe(
        new Date(DateTime.toEpochMillis(now) - alert.windowSeconds * 1_000),
      ),
      end: now,
    }),
    filters: serviceFilter(alert),
  });

const breaches = (alert: Alert, value: number) => {
  switch (alert.comparison) {
    case "above":
      return value > alert.threshold;
    case "at-or-above":
      return value >= alert.threshold;
    case "below":
      return value < alert.threshold;
    case "at-or-below":
      return value <= alert.threshold;
  }
};

const comparisonText = (alert: Alert) =>
  ({
    above: "above",
    "at-or-above": "at or above",
    below: "below",
    "at-or-below": "at or below",
  })[alert.comparison];

const firingSummary = (alert: Alert, value: number) =>
  NonEmptyText.make(
    `${alert.metricName} ${alert.aggregation} is ${value}, ${comparisonText(alert)} the ${alert.threshold} threshold over ${alert.windowSeconds} seconds`,
  );

const resolvedSummary = (alert: Alert, value: number) =>
  NonEmptyText.make(
    `${alert.metricName} ${alert.aggregation} is ${value}, back within the ${alert.threshold} threshold over ${alert.windowSeconds} seconds`,
  );

const report = (projectId: ProjectId, outcomes: ReadonlyArray<AlertEvaluationOutcome>) => ({
  projectId,
  scanned: outcomes.length,
  failed: outcomes.filter((outcome) => outcome === "failed").length,
  noData: outcomes.filter((outcome) => outcome === "no-data").length,
  skipped: outcomes.filter((outcome) => outcome === "skipped").length,
  stable: outcomes.filter((outcome) => outcome === "stable").length,
  transitioned: outcomes.filter((outcome) => outcome === "transitioned").length,
});

export class AlertEvaluator extends Context.Service<
  AlertEvaluator,
  {
    trackProject(projectId: ProjectId): Effect.Effect<void>;
    evaluateProject(projectId: ProjectId): Effect.Effect<AlertEvaluationReport, ServiceUnavailable>;
    evaluateTracked(): Effect.Effect<ReadonlyArray<AlertEvaluationReport>>;
  }
>()("groundtruth/backend/alerts/AlertEvaluator") {
  static readonly layer = Layer.effect(
    AlertEvaluator,
    Effect.gen(function* () {
      const alerts = yield* AlertRepository;
      const telemetry = yield* TelemetryStore;
      const incidents = yield* IncidentService;
      const trackedProjects = yield* Ref.make<ReadonlySet<ProjectId>>(new Set());

      const fromRepository = <Value>(effect: Effect.Effect<Value, PersistenceError>) =>
        effect.pipe(
          Effect.tapError((error) => Effect.logError("Alert storage operation failed", { error })),
          Effect.mapError(storageUnavailable),
        );

      const persist = Effect.fn("AlertEvaluator.persist")(function* (
        alert: Alert,
        input: UpdateAlertStateInput,
      ) {
        const updated = yield* fromRepository(alerts.updateState(alert.projectId, alert.id, input));
        if (Option.isNone(updated)) {
          yield* Effect.logWarning("Alert disappeared during evaluation", {
            alertId: alert.id,
            projectId: alert.projectId,
          });
          return null;
        }
        return updated.value;
      });

      const noteOpenIncident = Effect.fn("AlertEvaluator.noteOpenIncident")(
        (alert: Alert, summary: NonEmptyText) =>
          Effect.gen(function* () {
            const current = yield* incidents.getOpenIncident(alert.projectId);
            if (current !== null) yield* incidents.addNote(alert.projectId, current.id, summary);
          }).pipe(
            Effect.catch((error) =>
              Effect.logWarning("Alert transitioned but its incident note could not be added", {
                alertId: alert.id,
                error,
                projectId: alert.projectId,
              }),
            ),
          ),
      );

      const evaluateAlert = Effect.fn("AlertEvaluator.evaluateAlert")(function* (alert: Alert) {
        if (!alert.enabled) return "skipped" satisfies AlertEvaluationOutcome;
        if (alert.aggregation === "count-distinct") {
          yield* Effect.logWarning("Alert cannot be evaluated without a distinct attribute", {
            alertId: alert.id,
            projectId: alert.projectId,
          });
          return "failed" satisfies AlertEvaluationOutcome;
        }
        const now = yield* DateTime.now;
        const result = yield* telemetry.aggregateMetric(alert.projectId, queryFor(alert, now));
        const value = result.value;
        if (value === null) return "no-data" satisfies AlertEvaluationOutcome;

        if (breaches(alert, value)) {
          const summary = firingSummary(alert, value);
          if (alert.status === "firing") return "stable" satisfies AlertEvaluationOutcome;
          const updated = yield* persist(alert, {
            status: "firing",
            summary,
            firingSince: now,
            resolvedAt: null,
            updatedAt: now,
          });
          if (updated === null) return "failed" satisfies AlertEvaluationOutcome;
          yield* noteOpenIncident(updated, summary);
          return "transitioned" satisfies AlertEvaluationOutcome;
        }

        if (alert.status !== "firing") return "stable" satisfies AlertEvaluationOutcome;
        const summary = resolvedSummary(alert, value);
        const updated = yield* persist(alert, {
          status: "resolved",
          summary,
          firingSince: alert.firingSince,
          resolvedAt: now,
          updatedAt: now,
        });
        if (updated === null) return "failed" satisfies AlertEvaluationOutcome;
        yield* noteOpenIncident(updated, summary);
        return "transitioned" satisfies AlertEvaluationOutcome;
      });

      const evaluateProject = Effect.fn("AlertEvaluator.evaluateProject")(function* (
        projectId: ProjectId,
      ) {
        if (isSandboxProjectId(projectId)) return report(projectId, []);
        const projectAlerts = yield* fromRepository(alerts.list(projectId));
        const outcomes = yield* Effect.forEach(projectAlerts, (alert) =>
          evaluateAlert(alert).pipe(
            Effect.catch((error) =>
              Effect.logError("Alert evaluation failed", {
                alertId: alert.id,
                error,
                projectId,
              }).pipe(Effect.as("failed" as const)),
            ),
          ),
        );
        return report(projectId, outcomes);
      });

      const trackProject = Effect.fn("AlertEvaluator.trackProject")((projectId: ProjectId) =>
        isSandboxProjectId(projectId)
          ? Effect.void
          : Ref.update(trackedProjects, (projects) => new Set(projects).add(projectId)),
      );

      const evaluateTracked = Effect.fn("AlertEvaluator.evaluateTracked")(function* () {
        const projectIds = [...(yield* Ref.get(trackedProjects))];
        return yield* Effect.forEach(projectIds, (projectId) =>
          evaluateProject(projectId).pipe(
            Effect.catch((error) =>
              Effect.logError("Project alert evaluation failed", { error, projectId }).pipe(
                Effect.as(report(projectId, ["failed"])),
              ),
            ),
          ),
        );
      });

      return AlertEvaluator.of({ trackProject, evaluateProject, evaluateTracked });
    }),
  );
}

export const AlertEvaluatorMaintenance = Layer.effectDiscard(
  Effect.gen(function* () {
    const evaluator = yield* AlertEvaluator;
    yield* Effect.sleep(evaluationInterval).pipe(
      Effect.andThen(evaluator.evaluateTracked()),
      Effect.forever,
      Effect.forkScoped,
    );
  }),
);

export const AlertEvaluatorRuntime = Layer.merge(
  AlertEvaluator.layer,
  AlertEvaluatorMaintenance.pipe(Layer.provide(AlertEvaluator.layer)),
);
