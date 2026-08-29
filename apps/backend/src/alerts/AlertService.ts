import { AlertChanged, LiveEventId, ServiceUnavailable } from "@groundtruth/api-contract";
import {
  Alert,
  AlertId,
  type AlertRuleDefinition,
  EntityNotFound,
  type ProjectId,
  QuotaExceeded,
  UnsupportedAlertAggregation,
} from "@groundtruth/domain";
import { AlertRepository, type PersistenceError } from "@groundtruth/persistence";
import { Context, Crypto, DateTime, Effect, Layer, Option, Ref, Semaphore } from "effect";
import { emptyProjectIncidentState, IncidentState } from "../incidents/IncidentState.js";
import { LiveEventBus } from "../live/LiveEventBus.js";
import { isSandboxProjectId } from "../memory/SeedIds.js";

export const AlertRuleLimits = {
  perProject: 25,
} as const;

const unavailable = (error: PersistenceError) =>
  new ServiceUnavailable({
    service: error.store,
    message: `Storage operation failed (reference ${error.correlationId})`,
  });

const missingAlert = (alertId: AlertId) =>
  new EntityNotFound({ entity: "alert", id: alertId, message: "Alert rule not found" });

const unsupportedCountDistinct = () =>
  new UnsupportedAlertAggregation({
    aggregation: "count-distinct",
    missingField: "distinctKey",
    message: "count-distinct alert rules require distinctKey, which is not supported yet",
  });

const quotaExceeded = (observed: number) =>
  new QuotaExceeded({
    quota: "alert-rules-per-project",
    limit: AlertRuleLimits.perProject,
    observed,
    message: `A project can have at most ${AlertRuleLimits.perProject} alert rules`,
  });

export class AlertService extends Context.Service<
  AlertService,
  {
    readonly create: (
      projectId: ProjectId,
      definition: AlertRuleDefinition,
    ) => Effect.Effect<Alert, QuotaExceeded | UnsupportedAlertAggregation | ServiceUnavailable>;
    readonly delete: (
      projectId: ProjectId,
      alertId: AlertId,
    ) => Effect.Effect<void, EntityNotFound | ServiceUnavailable>;
  }
>()("groundtruth/backend/alerts/AlertService") {
  static readonly layer = Layer.effect(
    AlertService,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const incidents = yield* IncidentState;
      const events = yield* LiveEventBus;
      const repository = yield* AlertRepository;
      const mutationGate = yield* Semaphore.make(1);

      const fromRepository = <Value>(effect: Effect.Effect<Value, PersistenceError>) =>
        effect.pipe(
          Effect.tapError((error) => Effect.logError("Alert storage operation failed", { error })),
          Effect.mapError(unavailable),
        );

      const ensureSupported = (definition: AlertRuleDefinition) =>
        definition.aggregation === "count-distinct"
          ? Effect.fail(unsupportedCountDistinct())
          : Effect.void;

      const publishSandboxChange = Effect.fn("AlertService.publishSandboxChange")(function* (
        projectId: ProjectId,
        alert: Alert,
        change: AlertChanged["change"],
      ) {
        yield* events.publish(
          new AlertChanged({
            eventId: LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie)),
            projectId,
            occurredAt: yield* DateTime.now,
            alert,
            change,
          }),
        );
      });

      const createSandbox = Effect.fn("AlertService.createSandbox")(function* (
        projectId: ProjectId,
        definition: AlertRuleDefinition,
      ) {
        const id = AlertId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const now = yield* DateTime.now;
        return yield* Ref.modify(incidents.state, (all) => {
          const project = all.get(projectId) ?? emptyProjectIncidentState;
          if (project.alerts.length >= AlertRuleLimits.perProject) {
            return [Option.none<Alert>(), all];
          }
          const alert = new Alert({
            id,
            projectId,
            name: definition.name,
            serviceName: definition.serviceName,
            metricName: definition.metricName,
            aggregation: definition.aggregation,
            comparison: definition.comparison,
            threshold: definition.threshold,
            windowSeconds: definition.windowSeconds,
            severity: definition.severity,
            enabled: definition.enabled,
            status: "healthy",
            summary: null,
            firingSince: null,
            resolvedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const next = new Map(all);
          next.set(projectId, { ...project, alerts: [...project.alerts, alert] });
          return [Option.some(alert), next];
        }).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(quotaExceeded(AlertRuleLimits.perProject + 1)),
              onSome: Effect.succeed,
            }),
          ),
        );
      });

      const createHosted = Effect.fn("AlertService.createHosted")(function* (
        projectId: ProjectId,
        definition: AlertRuleDefinition,
      ) {
        const count = yield* fromRepository(repository.count(projectId));
        if (count >= AlertRuleLimits.perProject) return yield* quotaExceeded(count + 1);
        return yield* fromRepository(
          repository.create(projectId, {
            name: definition.name,
            serviceName: definition.serviceName,
            metricName: definition.metricName,
            aggregation: definition.aggregation,
            comparison: definition.comparison,
            threshold: definition.threshold,
            windowSeconds: definition.windowSeconds,
            severity: definition.severity,
            enabled: definition.enabled,
            summary: null,
          }),
        );
      });

      const create = Effect.fn("AlertService.create")(function* (
        projectId: ProjectId,
        definition: AlertRuleDefinition,
      ) {
        yield* ensureSupported(definition);
        const sandbox = isSandboxProjectId(projectId);
        const alert = yield* mutationGate.withPermits(1)(
          sandbox ? createSandbox(projectId, definition) : createHosted(projectId, definition),
        );
        if (sandbox) yield* publishSandboxChange(projectId, alert, "created");
        return alert;
      });

      const deleteSandbox = Effect.fn("AlertService.deleteSandbox")(function* (
        projectId: ProjectId,
        alertId: AlertId,
      ) {
        const deleted = yield* Ref.modify(incidents.state, (all) => {
          const project = all.get(projectId) ?? emptyProjectIncidentState;
          const removed = project.alerts.find((alert) => alert.id === alertId);
          const alerts = project.alerts.filter((alert) => alert.id !== alertId);
          if (removed === undefined) return [Option.none<Alert>(), all];
          const next = new Map(all);
          next.set(projectId, { ...project, alerts });
          return [Option.some(removed), next];
        });
        return yield* Option.match(deleted, {
          onNone: () => Effect.fail(missingAlert(alertId)),
          onSome: Effect.succeed,
        });
      });

      const deleteHosted = Effect.fn("AlertService.deleteHosted")(function* (
        projectId: ProjectId,
        alertId: AlertId,
      ) {
        if (!(yield* fromRepository(repository.delete(projectId, alertId)))) {
          return yield* missingAlert(alertId);
        }
      });

      const deleteRule = Effect.fn("AlertService.delete")(function* (
        projectId: ProjectId,
        alertId: AlertId,
      ) {
        if (isSandboxProjectId(projectId)) {
          const removed = yield* mutationGate.withPermits(1)(deleteSandbox(projectId, alertId));
          yield* publishSandboxChange(projectId, removed, "deleted");
          return;
        }
        yield* mutationGate.withPermits(1)(deleteHosted(projectId, alertId));
      });

      return AlertService.of({ create, delete: deleteRule });
    }),
  );
}
