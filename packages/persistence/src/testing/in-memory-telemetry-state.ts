import type { ProjectId } from "@groundtruth/domain";
import type { CanonicalTelemetryBatch } from "@groundtruth/telemetry";
import { Context, Effect, Ref } from "effect";

export interface CapturedTelemetryBatch {
  readonly retentionDays: number;
  readonly batch: CanonicalTelemetryBatch;
}

export interface TelemetryMemoryState {
  readonly projects: ReadonlyMap<ProjectId, ReadonlyArray<CapturedTelemetryBatch>>;
  readonly sealedProjects: ReadonlySet<ProjectId>;
}

export type TelemetryMemorySnapshot = TelemetryMemoryState;

export interface TelemetryMemoryControlShape {
  readonly snapshot: Effect.Effect<TelemetryMemorySnapshot>;
  readonly batches: (projectId: ProjectId) => Effect.Effect<ReadonlyArray<CanonicalTelemetryBatch>>;
  readonly reset: Effect.Effect<void>;
}

export class TelemetryMemoryControl extends Context.Service<
  TelemetryMemoryControl,
  TelemetryMemoryControlShape
>()("Groundtruth/Testing/TelemetryMemoryControl") {}

export const emptyTelemetryMemoryState = (): TelemetryMemoryState => ({
  projects: new Map(),
  sealedProjects: new Set(),
});

const copyProjects = (projects: TelemetryMemoryState["projects"]) =>
  new Map([...projects].map(([projectId, captures]) => [projectId, [...captures]] as const));

export const makeTelemetryMemoryControl = (
  state: Ref.Ref<TelemetryMemoryState>,
): TelemetryMemoryControlShape => ({
  snapshot: Ref.get(state).pipe(
    Effect.map(({ projects, sealedProjects }) => ({
      projects: copyProjects(projects),
      sealedProjects: new Set(sealedProjects),
    })),
  ),
  batches: (projectId) =>
    Ref.get(state).pipe(
      Effect.map(({ projects }) => (projects.get(projectId) ?? []).map(({ batch }) => batch)),
    ),
  reset: Ref.set(state, emptyTelemetryMemoryState()),
});
