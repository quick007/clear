import type {
  Account,
  Alert,
  AlertAggregation,
  AlertComparison,
  AlertId,
  AlertName,
  AlertSeverity,
  AlertStatus,
  DashboardId,
  DashboardMetadata,
  DashboardName,
  DeployEvent,
  DeployEventId,
  DisplayName,
  EmailAddress,
  HostedSubject,
  Hypothesis,
  HypothesisId,
  HypothesisStatus,
  HostedSession,
  Incident,
  IncidentId,
  IncidentTitle,
  IngestKeyId,
  IngestKeyMetadata,
  IngestKeyName,
  ManualAlert,
  NonEmptyText,
  PanelId,
  PanelMetadata,
  PanelTitle,
  Project,
  ProjectId,
  ProjectMode,
  ProjectName,
  ProjectSlug,
  ServiceName,
  SessionId,
  Sha,
  TimelineEntry,
  Url,
  UserId,
} from "@groundtruth/domain";
import type { PanelSpec } from "@groundtruth/panel-dsl";
import type { DateTime, Effect, Option } from "effect";
import type { PersistenceError, RepositoryConflict, RepositoryQuotaExceeded } from "../errors.ts";
import type { PanelAnnotationRecord } from "../records.ts";
import type { OutboxEventKind } from "../schema/enums.ts";
import type { OutboxPayload, ProjectQuotas } from "../schema/index.ts";

export interface UpsertAccountInput {
  readonly hostedSubject: HostedSubject;
  readonly email: EmailAddress;
  readonly displayName: DisplayName | null;
}

export interface CreateProjectInput {
  readonly ownerId: UserId;
  readonly slug: ProjectSlug;
  readonly name: ProjectName;
  readonly mode: ProjectMode;
  readonly retentionDays: number;
  readonly quotas: ProjectQuotas;
}

export interface CreateIngestKeyInput {
  readonly projectId: ProjectId;
  readonly name: IngestKeyName;
  readonly prefix: string;
  readonly secretHash: string;
}

export interface VerifiedIngestKey {
  readonly key: IngestKeyMetadata;
  readonly project: Project;
}

export interface CreateDashboardInput {
  readonly name: DashboardName;
  readonly description: NonEmptyText | null;
  readonly isDefault: boolean;
}

export interface PanelRecord {
  readonly metadata: PanelMetadata;
  readonly spec: PanelSpec;
  readonly annotations: ReadonlyArray<PanelAnnotationRecord>;
}

export interface DashboardRecord {
  readonly metadata: DashboardMetadata;
  readonly isDefault: boolean;
  readonly panels: ReadonlyArray<PanelRecord>;
}

export interface IncidentRecord {
  readonly incident: Incident;
  readonly hypotheses: ReadonlyArray<Hypothesis>;
  readonly timeline: ReadonlyArray<TimelineEntry>;
}

export interface CreatePanelInput {
  readonly dashboardId: DashboardId;
  readonly title: PanelTitle;
  readonly spec: PanelSpec;
  readonly position: number;
}

export interface SeedDashboardInput extends CreateDashboardInput {
  readonly panels: ReadonlyArray<Omit<CreatePanelInput, "dashboardId">>;
}

export interface UpdatePanelInput {
  readonly title: PanelTitle;
  readonly spec: PanelSpec;
  readonly position: number;
  readonly expectedRevision: number;
}

export interface CreateAlertInput {
  readonly name: AlertName;
  readonly serviceName: ServiceName | null;
  readonly metricName: string;
  readonly aggregation: AlertAggregation;
  readonly comparison: AlertComparison;
  readonly threshold: number;
  readonly windowSeconds: number;
  readonly severity: AlertSeverity;
  readonly summary: NonEmptyText | null;
  readonly enabled: boolean;
}

export interface CreateManualAlertInput {
  readonly title: AlertName;
  readonly severity: AlertSeverity;
  readonly serviceName: ServiceName | null;
  readonly context: NonEmptyText | null;
}

export interface UpdateAlertStateInput {
  readonly status: AlertStatus;
  readonly summary: NonEmptyText | null;
  readonly firingSince: DateTime.Utc | null;
  readonly resolvedAt: DateTime.Utc | null;
  readonly updatedAt: DateTime.Utc;
}

export interface OpenIncidentInput {
  readonly title: IncidentTitle;
}

export interface UpsertHypothesisInput {
  readonly id: HypothesisId | null;
  readonly text: NonEmptyText;
  readonly status: HypothesisStatus;
}

export interface RecordDeployEventInput {
  readonly serviceName: ServiceName;
  readonly sha: Sha;
  readonly description: NonEmptyText | null;
  readonly url: Url | null;
  readonly deployedAt: DateTime.Utc;
}

export interface DeployEventCursor {
  readonly deployedAt: DateTime.Utc;
  readonly id: DeployEventId;
}

export interface DeployEventQuery {
  readonly since: DateTime.Utc;
  readonly serviceName?: ServiceName;
  readonly before?: DeployEventCursor;
  readonly limit?: number;
}

export interface DeployEventPage {
  readonly events: ReadonlyArray<DeployEvent>;
  readonly nextCursor: DeployEventCursor | null;
  readonly hasMore: boolean;
}

export interface OutboxEvent {
  readonly sequence: bigint;
  readonly projectId: ProjectId;
  readonly kind: OutboxEventKind;
  readonly schemaVersion: number;
  readonly payload: OutboxPayload;
  readonly createdAt: DateTime.Utc;
}

export interface AppendOutboxInput {
  readonly projectId: ProjectId;
  readonly kind: OutboxEventKind;
  readonly payload: OutboxPayload;
}

export interface IssueAuthHandoffInput {
  readonly codeHash: string;
  readonly hostedSubject: HostedSubject;
  readonly email: EmailAddress;
  readonly displayName: DisplayName | null;
  readonly returnPath: string;
  readonly createdAt: DateTime.Utc;
  readonly expiresAt: DateTime.Utc;
}

export interface RedeemAuthHandoffInput {
  readonly codeHash: string;
  readonly redeemedAt: DateTime.Utc;
  readonly sessionId: SessionId;
  readonly tokenHash: string;
  readonly sessionExpiresAt: DateTime.Utc;
}

export interface AuthSessionRecord {
  readonly account: Account;
  readonly session: HostedSession;
}

export interface RedeemedAuthHandoff extends AuthSessionRecord {
  readonly returnPath: string;
}

export interface AuthPurgeResult {
  readonly handoffs: number;
  readonly sessions: number;
}

export interface AuthHandoffRepositoryShape {
  readonly issue: (input: IssueAuthHandoffInput) => Effect.Effect<void, PersistenceError>;
  readonly redeem: (
    input: RedeemAuthHandoffInput,
  ) => Effect.Effect<Option.Option<RedeemedAuthHandoff>, PersistenceError>;
}

export interface HostedSessionRepositoryShape {
  readonly findActiveByTokenHash: (
    tokenHash: string,
    now: DateTime.Utc,
  ) => Effect.Effect<Option.Option<AuthSessionRecord>, PersistenceError>;
  readonly revokeByTokenHash: (
    tokenHash: string,
    now: DateTime.Utc,
  ) => Effect.Effect<boolean, PersistenceError>;
  readonly purgeExpired: (now: DateTime.Utc) => Effect.Effect<AuthPurgeResult, PersistenceError>;
}

export interface AccountRepositoryShape {
  readonly upsertHosted: (input: UpsertAccountInput) => Effect.Effect<Account, PersistenceError>;
  readonly findById: (id: UserId) => Effect.Effect<Option.Option<Account>, PersistenceError>;
  readonly findByHostedSubject: (
    subject: HostedSubject,
  ) => Effect.Effect<Option.Option<Account>, PersistenceError>;
}

export interface ProjectRepositoryShape {
  readonly create: (input: CreateProjectInput) => Effect.Effect<Project, PersistenceError>;
  readonly findById: (id: ProjectId) => Effect.Effect<Option.Option<Project>, PersistenceError>;
  readonly findForOwner: (
    ownerId: UserId,
    id: ProjectId,
  ) => Effect.Effect<Option.Option<Project>, PersistenceError>;
  readonly findBySlug: (
    ownerId: UserId,
    slug: ProjectSlug,
  ) => Effect.Effect<Option.Option<Project>, PersistenceError>;
  readonly listForOwner: (
    ownerId: UserId,
  ) => Effect.Effect<ReadonlyArray<Project>, PersistenceError>;
  readonly getQuotas: (
    id: ProjectId,
  ) => Effect.Effect<Option.Option<ProjectQuotas>, PersistenceError>;
  readonly requestDeletion: (
    ownerId: UserId,
    id: ProjectId,
  ) => Effect.Effect<Option.Option<Project>, PersistenceError>;
}

export interface IngestKeyRepositoryShape {
  readonly create: (
    input: CreateIngestKeyInput,
  ) => Effect.Effect<IngestKeyMetadata, PersistenceError>;
  readonly verifyHash: (
    prefix: string,
    secretHash: string,
  ) => Effect.Effect<Option.Option<VerifiedIngestKey>, PersistenceError>;
  readonly list: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<IngestKeyMetadata>, PersistenceError>;
  readonly revoke: (
    projectId: ProjectId,
    id: IngestKeyId,
  ) => Effect.Effect<Option.Option<IngestKeyMetadata>, PersistenceError>;
}

export interface DashboardRepositoryShape {
  readonly create: (
    projectId: ProjectId,
    input: CreateDashboardInput,
  ) => Effect.Effect<DashboardRecord, PersistenceError>;
  readonly findById: (
    projectId: ProjectId,
    id: DashboardId,
  ) => Effect.Effect<Option.Option<DashboardRecord>, PersistenceError>;
  readonly list: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<DashboardRecord>, PersistenceError>;
  readonly seedIfEmpty: (
    projectId: ProjectId,
    input: SeedDashboardInput,
  ) => Effect.Effect<Option.Option<DashboardRecord>, PersistenceError>;
  readonly addPanel: (
    projectId: ProjectId,
    input: CreatePanelInput,
  ) => Effect.Effect<PanelRecord, PersistenceError>;
  readonly updatePanel: (
    projectId: ProjectId,
    panelId: PanelId,
    input: UpdatePanelInput,
  ) => Effect.Effect<Option.Option<PanelRecord>, PersistenceError>;
  readonly annotatePanel: (
    projectId: ProjectId,
    panelId: PanelId,
    annotation: PanelAnnotationRecord,
  ) => Effect.Effect<Option.Option<PanelRecord>, PersistenceError>;
  readonly removePanel: (
    projectId: ProjectId,
    panelId: PanelId,
  ) => Effect.Effect<boolean, PersistenceError>;
}

export interface AlertRepositoryShape {
  readonly count: (projectId: ProjectId) => Effect.Effect<number, PersistenceError>;
  readonly create: (
    projectId: ProjectId,
    input: CreateAlertInput,
  ) => Effect.Effect<Alert, PersistenceError>;
  readonly list: (projectId: ProjectId) => Effect.Effect<ReadonlyArray<Alert>, PersistenceError>;
  readonly findById: (
    projectId: ProjectId,
    id: AlertId,
  ) => Effect.Effect<Option.Option<Alert>, PersistenceError>;
  readonly updateState: (
    projectId: ProjectId,
    id: AlertId,
    input: UpdateAlertStateInput,
  ) => Effect.Effect<Option.Option<Alert>, PersistenceError>;
  readonly delete: (projectId: ProjectId, id: AlertId) => Effect.Effect<boolean, PersistenceError>;
}

export interface ManualAlertRepositoryShape {
  readonly create: (
    projectId: ProjectId,
    input: CreateManualAlertInput,
  ) => Effect.Effect<ManualAlert, PersistenceError>;
  readonly list: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<ManualAlert>, PersistenceError>;
  readonly findById: (
    projectId: ProjectId,
    id: AlertId,
  ) => Effect.Effect<Option.Option<ManualAlert>, PersistenceError>;
}

export interface IncidentRepositoryShape {
  readonly open: (
    projectId: ProjectId,
    input: OpenIncidentInput,
  ) => Effect.Effect<Incident, PersistenceError>;
  readonly findOpen: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<Incident>, PersistenceError>;
  readonly getDetail: (
    projectId: ProjectId,
    incidentId: IncidentId,
  ) => Effect.Effect<Option.Option<IncidentRecord>, PersistenceError>;
  readonly list: (projectId: ProjectId) => Effect.Effect<ReadonlyArray<Incident>, PersistenceError>;
  readonly listTimeline: (
    projectId: ProjectId,
    incidentId: IncidentId,
  ) => Effect.Effect<ReadonlyArray<TimelineEntry>, PersistenceError>;
  readonly addNote: (
    projectId: ProjectId,
    incidentId: IncidentId,
    text: NonEmptyText,
  ) => Effect.Effect<
    TimelineEntry,
    PersistenceError | RepositoryQuotaExceeded | RepositoryConflict
  >;
  readonly upsertHypothesis: (
    projectId: ProjectId,
    incidentId: IncidentId,
    input: UpsertHypothesisInput,
  ) => Effect.Effect<
    Option.Option<Hypothesis>,
    PersistenceError | RepositoryQuotaExceeded | RepositoryConflict
  >;
  readonly close: (
    projectId: ProjectId,
    incidentId: IncidentId,
    summary: NonEmptyText,
  ) => Effect.Effect<
    Option.Option<Incident>,
    PersistenceError | RepositoryQuotaExceeded | RepositoryConflict
  >;
}

export interface DeployEventRepositoryShape {
  readonly record: (
    projectId: ProjectId,
    input: RecordDeployEventInput,
  ) => Effect.Effect<DeployEvent, PersistenceError>;
  readonly list: (
    projectId: ProjectId,
    query: DeployEventQuery,
  ) => Effect.Effect<DeployEventPage, PersistenceError>;
}

export interface OutboxRepositoryShape {
  readonly append: (input: AppendOutboxInput) => Effect.Effect<OutboxEvent, PersistenceError>;
  readonly find: (
    projectId: ProjectId,
    sequence: bigint,
  ) => Effect.Effect<Option.Option<OutboxEvent>, PersistenceError>;
  readonly latest: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<OutboxEvent>, PersistenceError>;
  readonly listAfter: (
    projectId: ProjectId,
    sequence: bigint,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<OutboxEvent>, PersistenceError>;
}
