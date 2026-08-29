import { DashboardMetadata, PanelMetadata, type ProjectId } from "@groundtruth/domain";
import { DateTime, Effect, Option, Ref } from "effect";
import { persistenceError } from "../errors.ts";
import type { IdGeneratorShape } from "../ids.ts";
import type {
  DashboardRecord,
  DashboardRepositoryShape,
  SeedDashboardInput,
} from "../repositories/contracts.ts";
import { appendMemoryOutbox, type RepositoriesMemoryState } from "./in-memory-state.ts";

const missingProject = () =>
  persistenceError("postgres", "seed-dashboard", "active project does not exist", false);

type SeedResult =
  | { readonly _tag: "missing" }
  | { readonly _tag: "existing" }
  | { readonly _tag: "created"; readonly dashboard: DashboardRecord };

export const makeSeedDashboardIfEmpty = (
  state: Ref.Ref<RepositoriesMemoryState>,
  ids: IdGeneratorShape,
): DashboardRepositoryShape["seedIfEmpty"] =>
  Effect.fn("DashboardRepository.seedIfEmpty")(function* (
    projectId: ProjectId,
    input: SeedDashboardInput,
  ) {
    const dashboardId = yield* ids.dashboard;
    const panelIds = yield* Effect.forEach(input.panels, () => ids.panel);
    const now = yield* DateTime.now;
    const result = yield* Ref.modify(
      state,
      (current): readonly [SeedResult, RepositoriesMemoryState] => {
        if (current.projects.get(projectId)?.lifecycle !== "active") {
          return [{ _tag: "missing" }, current];
        }
        if (
          [...current.dashboards.values()].some(({ metadata }) => metadata.projectId === projectId)
        ) {
          return [{ _tag: "existing" }, current];
        }

        const panels = input.panels.map((panel, index) => ({
          metadata: new PanelMetadata({
            id: panelIds[index]!,
            projectId,
            dashboardId,
            title: panel.title,
            position: panel.position,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
          spec: panel.spec,
          annotations: [],
        }));
        const dashboard = {
          metadata: new DashboardMetadata({
            id: dashboardId,
            projectId,
            name: input.name,
            description: input.description,
            createdAt: now,
            updatedAt: now,
          }),
          isDefault: input.isDefault,
          panels,
        };
        let next = appendMemoryOutbox(
          { ...current, dashboards: new Map(current.dashboards).set(dashboardId, dashboard) },
          projectId,
          "dashboard.created",
          { dashboardId },
          now,
        ).state;
        for (const panel of panels) {
          next = appendMemoryOutbox(
            next,
            projectId,
            "panel.created",
            { dashboardId, panelId: panel.metadata.id },
            now,
          ).state;
        }
        return [{ _tag: "created", dashboard }, next];
      },
    );

    if (result._tag === "missing") return yield* missingProject();
    return result._tag === "existing" ? Option.none() : Option.some(result.dashboard);
  });
