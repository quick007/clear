import { ManualAlert } from "@groundtruth/domain";
import { DateTime, Effect, Layer, Option, Ref } from "effect";
import { persistenceError } from "../errors.ts";
import type { IdGeneratorShape } from "../ids.ts";
import { ManualAlertRepository } from "../repositories/services.ts";
import { appendMemoryOutbox, type RepositoriesMemoryState, updateMap } from "./in-memory-state.ts";

const failure = (operation: string, message: string) =>
  persistenceError("postgres", operation, message, false);

export const makeManualAlertRepositoryMemory = (
  state: Ref.Ref<RepositoriesMemoryState>,
  ids: IdGeneratorShape,
) =>
  Layer.succeed(
    ManualAlertRepository,
    ManualAlertRepository.of({
      create: (projectId, input) =>
        Effect.gen(function* () {
          const id = yield* ids.alert;
          const createdAt = yield* DateTime.now;
          return yield* Ref.modify(state, (current) => {
            const project = current.projects.get(projectId);
            if (project?.lifecycle !== "active") return [Option.none(), current];
            const alert = new ManualAlert({ id, projectId, ...input, createdAt });
            const withAlert = {
              ...current,
              manualAlerts: updateMap(current.manualAlerts, id, alert),
            };
            const withEvent = appendMemoryOutbox(
              withAlert,
              projectId,
              "alert.created",
              { alertId: id, manual: true },
              createdAt,
            ).state;
            return [Option.some(alert), withEvent];
          }).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(failure("create-manual-alert", "active project does not exist")),
                onSome: Effect.succeed,
              }),
            ),
          );
        }),
      list: (projectId) =>
        Ref.get(state).pipe(
          Effect.map(({ manualAlerts }) =>
            [...manualAlerts.values()]
              .filter((alert) => alert.projectId === projectId)
              .sort(
                (left, right) =>
                  DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt),
              )
              .slice(0, 100),
          ),
        ),
      findById: (projectId, id) =>
        Ref.get(state).pipe(
          Effect.map(({ manualAlerts }) => {
            const alert = manualAlerts.get(id);
            return Option.fromNullishOr(alert?.projectId === projectId ? alert : undefined);
          }),
        ),
    }),
  );
