import { ServiceUnavailable } from "@groundtruth/api-contract";
import {
  AlertId,
  type AlertName,
  EntityNotFound,
  ManualAlert,
  type NonEmptyText,
  type ProjectId,
  QuotaExceeded,
  type ServiceName,
} from "@groundtruth/domain";
import { ManualAlertRepository, type PersistenceError } from "@groundtruth/persistence";
import { Context, Crypto, DateTime, Effect, Layer, Option, Ref, Semaphore } from "effect";
import { emptyProjectIncidentState, IncidentState } from "../incidents/IncidentState.js";
import { isSandboxProjectId } from "../memory/SeedIds.js";

export const ManualAlertLimits = {
  perProject: 100,
} as const;

export interface CreateManualAlertInput {
  readonly title: AlertName;
  readonly severity: ManualAlert["severity"];
  readonly serviceName: ServiceName | null;
  readonly context: NonEmptyText | null;
}

const unavailable = (error: PersistenceError) =>
  new ServiceUnavailable({
    service: error.store,
    message: `Storage operation failed (reference ${error.correlationId})`,
  });

const missingAlert = (alertId: AlertId) =>
  new EntityNotFound({ entity: "alert", id: alertId, message: "Alert not found" });

const quotaExceeded = (observed: number) =>
  new QuotaExceeded({
    quota: "manual-alerts-per-project",
    limit: ManualAlertLimits.perProject,
    observed,
    message: `A project can retain at most ${ManualAlertLimits.perProject} manual alerts`,
  });

export class ManualAlertService extends Context.Service<
  ManualAlertService,
  {
    readonly create: (
      projectId: ProjectId,
      input: CreateManualAlertInput,
    ) => Effect.Effect<ManualAlert, QuotaExceeded | ServiceUnavailable>;
    readonly list: (
      projectId: ProjectId,
    ) => Effect.Effect<ReadonlyArray<ManualAlert>, ServiceUnavailable>;
    readonly find: (
      projectId: ProjectId,
      alertId: AlertId,
    ) => Effect.Effect<ManualAlert, EntityNotFound | ServiceUnavailable>;
  }
>()("groundtruth/backend/alerts/ManualAlertService") {
  static readonly layer = Layer.effect(
    ManualAlertService,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const repository = yield* ManualAlertRepository;
      const incidents = yield* IncidentState;
      const mutationGate = yield* Semaphore.make(1);

      const fromRepository = <Value>(effect: Effect.Effect<Value, PersistenceError>) =>
        effect.pipe(
          Effect.tapError((error) =>
            Effect.logError("Manual alert storage operation failed", { error }),
          ),
          Effect.mapError(unavailable),
        );

      const createSandbox = Effect.fn("ManualAlertService.createSandbox")(function* (
        projectId: ProjectId,
        input: CreateManualAlertInput,
      ) {
        const id = AlertId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const createdAt = yield* DateTime.now;
        return yield* Ref.modify(incidents.state, (all) => {
          const project = all.get(projectId) ?? emptyProjectIncidentState;
          if (project.manualAlerts.length >= ManualAlertLimits.perProject) {
            return [Option.none<ManualAlert>(), all];
          }
          const alert = new ManualAlert({ id, projectId, ...input, createdAt });
          const next = new Map(all);
          next.set(projectId, {
            ...project,
            manualAlerts: [alert, ...project.manualAlerts],
          });
          return [Option.some(alert), next];
        }).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(quotaExceeded(ManualAlertLimits.perProject + 1)),
              onSome: Effect.succeed,
            }),
          ),
        );
      });

      const createHosted = Effect.fn("ManualAlertService.createHosted")(function* (
        projectId: ProjectId,
        input: CreateManualAlertInput,
      ) {
        const current = yield* fromRepository(repository.list(projectId));
        if (current.length >= ManualAlertLimits.perProject) {
          return yield* quotaExceeded(current.length + 1);
        }
        return yield* fromRepository(repository.create(projectId, input));
      });

      const create = Effect.fn("ManualAlertService.create")(
        (projectId: ProjectId, input: CreateManualAlertInput) =>
          mutationGate.withPermits(1)(
            isSandboxProjectId(projectId)
              ? createSandbox(projectId, input)
              : createHosted(projectId, input),
          ),
      );

      const list = Effect.fn("ManualAlertService.list")((projectId: ProjectId) =>
        isSandboxProjectId(projectId)
          ? Ref.get(incidents.state).pipe(
              Effect.map((all) => all.get(projectId)?.manualAlerts ?? []),
            )
          : fromRepository(repository.list(projectId)),
      );

      const find = Effect.fn("ManualAlertService.find")(function* (
        projectId: ProjectId,
        alertId: AlertId,
      ) {
        const found = isSandboxProjectId(projectId)
          ? Option.fromNullishOr(
              (yield* Ref.get(incidents.state))
                .get(projectId)
                ?.manualAlerts.find((alert) => alert.id === alertId),
            )
          : yield* fromRepository(repository.findById(projectId, alertId));
        return yield* Option.match(found, {
          onNone: () => Effect.fail(missingAlert(alertId)),
          onSome: Effect.succeed,
        });
      });

      return ManualAlertService.of({ create, list, find });
    }),
  );
}
