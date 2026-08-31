import { Alert, AlertName, type ManualAlert, ServiceName } from "@groundtruth/domain";
import type { IncidentDetail } from "@groundtruth/api-contract";
import type { ProjectId } from "@groundtruth/domain";
import { Context, DateTime, Effect, Layer, Ref } from "effect";
import { retryAlertId, sandboxProjectId } from "../memory/SeedIds.js";

export interface ProjectIncidentState {
  readonly detail: IncidentDetail | null;
  readonly alerts: ReadonlyArray<Alert>;
  readonly manualAlerts: ReadonlyArray<ManualAlert>;
}

export type IncidentStateMap = ReadonlyMap<ProjectId, ProjectIncidentState>;

export const withProjectIncidentState = (
  all: IncidentStateMap,
  projectId: ProjectId,
  project: ProjectIncidentState,
) => new Map(all).set(projectId, project);

const retryAlert = (now: DateTime.Utc) =>
  new Alert({
    id: retryAlertId,
    projectId: sandboxProjectId,
    name: AlertName.make("Checkout upstream request rate"),
    serviceName: ServiceName.make("checkout-api"),
    metricName: "upstream.client.requests",
    aggregation: "rate",
    comparison: "at-or-above",
    threshold: 90,
    windowSeconds: 5,
    severity: "critical",
    status: "healthy",
    summary: null,
    enabled: true,
    firingSince: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  });

export class IncidentState extends Context.Service<
  IncidentState,
  {
    readonly state: Ref.Ref<IncidentStateMap>;
  }
>()("groundtruth/backend/incidents/IncidentState") {
  static readonly layer = Layer.effect(
    IncidentState,
    Effect.gen(function* () {
      const now = yield* DateTime.now;
      const state = yield* Ref.make<IncidentStateMap>(
        new Map([
          [sandboxProjectId, { detail: null, alerts: [retryAlert(now)], manualAlerts: [] }],
        ]),
      );
      return IncidentState.of({ state });
    }),
  );
}

export const emptyProjectIncidentState: ProjectIncidentState = {
  detail: null,
  alerts: [],
  manualAlerts: [],
};
