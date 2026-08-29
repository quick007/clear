import type {
  Account,
  Alert,
  AlertId,
  DashboardId,
  DeployEvent,
  Hypothesis,
  HypothesisId,
  HostedSession,
  HostedSubject,
  Incident,
  IncidentId,
  IngestKeyId,
  IngestKeyMetadata,
  ManualAlert,
  PanelId,
  Project,
  ProjectId,
  SessionId,
  TimelineEntry,
  UserId,
  DisplayName,
  EmailAddress,
} from "@groundtruth/domain";
import { Context, type DateTime, Effect, Ref } from "effect";
import type { DashboardRecord, OutboxEvent, PanelRecord } from "../repositories/contracts.ts";
import type { OutboxEventKind } from "../schema/enums.ts";
import type { OutboxPayload } from "../schema/outbox.ts";
import type { ProjectQuotas } from "../schema/projects.ts";

export interface MemoryIngestKey {
  readonly metadata: IngestKeyMetadata;
  readonly secretHash: string;
}

export interface MemoryAuthHandoff {
  readonly codeHash: string;
  readonly hostedSubject: HostedSubject;
  readonly email: EmailAddress;
  readonly displayName: DisplayName | null;
  readonly returnPath: string;
  readonly createdAt: DateTime.Utc;
  readonly expiresAt: DateTime.Utc;
  readonly redeemedAt: DateTime.Utc | null;
}

export interface MemoryHostedSession {
  readonly session: HostedSession;
  readonly tokenHash: string;
  readonly revokedAt: DateTime.Utc | null;
}

export interface RepositoriesMemoryState {
  readonly accounts: ReadonlyMap<UserId, Account>;
  readonly authHandoffs: ReadonlyMap<string, MemoryAuthHandoff>;
  readonly hostedSessions: ReadonlyMap<SessionId, MemoryHostedSession>;
  readonly projects: ReadonlyMap<ProjectId, Project>;
  readonly projectQuotas: ReadonlyMap<ProjectId, ProjectQuotas>;
  readonly ingestKeys: ReadonlyMap<IngestKeyId, MemoryIngestKey>;
  readonly dashboards: ReadonlyMap<DashboardId, DashboardRecord>;
  readonly alerts: ReadonlyMap<AlertId, Alert>;
  readonly manualAlerts: ReadonlyMap<AlertId, ManualAlert>;
  readonly incidents: ReadonlyMap<IncidentId, Incident>;
  readonly hypotheses: ReadonlyMap<HypothesisId, Hypothesis>;
  readonly timelines: ReadonlyMap<IncidentId, ReadonlyArray<TimelineEntry>>;
  readonly deployEvents: ReadonlyArray<DeployEvent>;
  readonly outbox: ReadonlyArray<OutboxEvent>;
  readonly nextOutboxSequence: bigint;
}

export interface RepositoriesMemorySnapshot {
  readonly accounts: ReadonlyArray<Account>;
  readonly hostedSessions: ReadonlyArray<HostedSession>;
  readonly authHandoffCount: number;
  readonly projects: ReadonlyArray<Project>;
  readonly ingestKeys: ReadonlyArray<IngestKeyMetadata>;
  readonly dashboards: ReadonlyArray<DashboardRecord>;
  readonly alerts: ReadonlyArray<Alert>;
  readonly manualAlerts: ReadonlyArray<ManualAlert>;
  readonly incidents: ReadonlyArray<Incident>;
  readonly hypotheses: ReadonlyArray<Hypothesis>;
  readonly timelines: ReadonlyArray<TimelineEntry>;
  readonly deployEvents: ReadonlyArray<DeployEvent>;
  readonly outbox: ReadonlyArray<OutboxEvent>;
}

export interface RepositoriesMemoryControlShape {
  readonly snapshot: Effect.Effect<RepositoriesMemorySnapshot>;
  readonly reset: Effect.Effect<void>;
}

export class RepositoriesMemoryControl extends Context.Service<
  RepositoriesMemoryControl,
  RepositoriesMemoryControlShape
>()("Groundtruth/Testing/RepositoriesMemoryControl") {}

export const emptyRepositoriesMemoryState = (): RepositoriesMemoryState => ({
  accounts: new Map(),
  authHandoffs: new Map(),
  hostedSessions: new Map(),
  projects: new Map(),
  projectQuotas: new Map(),
  ingestKeys: new Map(),
  dashboards: new Map(),
  alerts: new Map(),
  manualAlerts: new Map(),
  incidents: new Map(),
  hypotheses: new Map(),
  timelines: new Map(),
  deployEvents: [],
  outbox: [],
  nextOutboxSequence: 1n,
});

export const appendMemoryOutbox = (
  state: RepositoriesMemoryState,
  projectId: ProjectId,
  kind: OutboxEventKind,
  payload: OutboxPayload,
  createdAt: OutboxEvent["createdAt"],
) => {
  const event: OutboxEvent = {
    sequence: state.nextOutboxSequence,
    projectId,
    kind,
    schemaVersion: 1,
    payload,
    createdAt,
  };
  return {
    event,
    state: {
      ...state,
      outbox: [...state.outbox, event],
      nextOutboxSequence: state.nextOutboxSequence + 1n,
    },
  } satisfies { readonly event: OutboxEvent; readonly state: RepositoriesMemoryState };
};

export const updateMap = <Key, Value>(source: ReadonlyMap<Key, Value>, key: Key, value: Value) => {
  const next = new Map(source);
  next.set(key, value);
  return next;
};

export const removeMap = <Key, Value>(source: ReadonlyMap<Key, Value>, key: Key) => {
  const next = new Map(source);
  next.delete(key);
  return next;
};

export const replacePanel = (
  dashboard: DashboardRecord,
  panelId: PanelId,
  replacement: PanelRecord | null,
) => ({
  ...dashboard,
  panels: (replacement === null
    ? dashboard.panels.filter(({ metadata }) => metadata.id !== panelId)
    : dashboard.panels.map((panel) => (panel.metadata.id === panelId ? replacement : panel))
  ).sort((left, right) => left.metadata.position - right.metadata.position),
});

const snapshot = (state: RepositoriesMemoryState): RepositoriesMemorySnapshot => ({
  accounts: [...state.accounts.values()],
  hostedSessions: [...state.hostedSessions.values()].map(({ session }) => session),
  authHandoffCount: state.authHandoffs.size,
  projects: [...state.projects.values()],
  ingestKeys: [...state.ingestKeys.values()].map(({ metadata }) => metadata),
  dashboards: [...state.dashboards.values()],
  alerts: [...state.alerts.values()],
  manualAlerts: [...state.manualAlerts.values()],
  incidents: [...state.incidents.values()],
  hypotheses: [...state.hypotheses.values()],
  timelines: [...state.timelines.values()].flat(),
  deployEvents: state.deployEvents,
  outbox: state.outbox,
});

export const makeRepositoriesMemoryControl = (
  state: Ref.Ref<RepositoriesMemoryState>,
): RepositoriesMemoryControlShape => ({
  snapshot: Ref.get(state).pipe(Effect.map(snapshot)),
  reset: Ref.set(state, emptyRepositoriesMemoryState()),
});
