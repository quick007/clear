import { Context } from "effect";
import type {
  AccountRepositoryShape,
  AlertRepositoryShape,
  AuthHandoffRepositoryShape,
  DashboardRepositoryShape,
  DeployEventRepositoryShape,
  IncidentRepositoryShape,
  IngestKeyRepositoryShape,
  ManualAlertRepositoryShape,
  HostedSessionRepositoryShape,
  OutboxRepositoryShape,
  ProjectRepositoryShape,
} from "./contracts.ts";

export class AccountRepository extends Context.Service<AccountRepository, AccountRepositoryShape>()(
  "Groundtruth/AccountRepository",
) {}

export class AuthHandoffRepository extends Context.Service<
  AuthHandoffRepository,
  AuthHandoffRepositoryShape
>()("Groundtruth/AuthHandoffRepository") {}

export class HostedSessionRepository extends Context.Service<
  HostedSessionRepository,
  HostedSessionRepositoryShape
>()("Groundtruth/HostedSessionRepository") {}

export class ProjectRepository extends Context.Service<ProjectRepository, ProjectRepositoryShape>()(
  "Groundtruth/ProjectRepository",
) {}

export class IngestKeyRepository extends Context.Service<
  IngestKeyRepository,
  IngestKeyRepositoryShape
>()("Groundtruth/IngestKeyRepository") {}

export class DashboardRepository extends Context.Service<
  DashboardRepository,
  DashboardRepositoryShape
>()("Groundtruth/DashboardRepository") {}

export class AlertRepository extends Context.Service<AlertRepository, AlertRepositoryShape>()(
  "Groundtruth/AlertRepository",
) {}

export class ManualAlertRepository extends Context.Service<
  ManualAlertRepository,
  ManualAlertRepositoryShape
>()("Groundtruth/ManualAlertRepository") {}

export class IncidentRepository extends Context.Service<
  IncidentRepository,
  IncidentRepositoryShape
>()("Groundtruth/IncidentRepository") {}

export class DeployEventRepository extends Context.Service<
  DeployEventRepository,
  DeployEventRepositoryShape
>()("Groundtruth/DeployEventRepository") {}

export class OutboxRepository extends Context.Service<OutboxRepository, OutboxRepositoryShape>()(
  "Groundtruth/OutboxRepository",
) {}
