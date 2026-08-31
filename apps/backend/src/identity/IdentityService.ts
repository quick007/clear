import { ServiceUnavailable, SessionView } from "@groundtruth/api-contract";
import {
  AccessDenied,
  Account,
  DisplayName,
  EmailAddress,
  EntityNotFound,
  HostedSubject,
  Project,
  ProjectId,
  ProjectName,
  ProjectSlug,
  type SandboxSession,
  type Session,
  UserId,
} from "@groundtruth/domain";
import {
  AccountRepository,
  hostedProjectQuotas,
  hostedRawRetentionDays,
  ProjectRepository,
  type AuthSessionRecord,
} from "@groundtruth/persistence";
import { Context, Crypto, DateTime, Effect, Layer, Option, Ref } from "effect";
import { sandboxProjectId, sandboxProjectIdForSession, sandboxUserId } from "../memory/SeedIds.js";

interface IdentityState {
  readonly accountsBySubject: ReadonlyMap<string, Account>;
  readonly projectsById: ReadonlyMap<ProjectId, Project>;
}

export interface ResolvedIdentity {
  readonly account: Account;
  readonly projects: ReadonlyArray<Project>;
}

const sandboxProject = (now: DateTime.Utc) =>
  new Project({
    id: sandboxProjectId,
    ownerId: sandboxUserId,
    slug: ProjectSlug.make("checkout-reliability"),
    name: ProjectName.make("Checkout reliability"),
    mode: "hosted",
    lifecycle: "active",
    retentionDays: hostedRawRetentionDays,
    deletionRequestedAt: null,
    deletionFailure: null,
    createdAt: now,
    updatedAt: now,
  });

const sandboxSessionProject = (session: SandboxSession) =>
  new Project({
    id: sandboxProjectIdForSession(session.id),
    ownerId: sandboxUserId,
    slug: ProjectSlug.make("checkout-reliability"),
    name: ProjectName.make("Checkout reliability"),
    mode: "hosted",
    lifecycle: "active",
    retentionDays: hostedRawRetentionDays,
    deletionRequestedAt: null,
    deletionFailure: null,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
  });

const normalizeEmail = (email: EmailAddress) => String(email).trim().toLowerCase();
const normalizeSubject = (subject: HostedSubject) => String(subject).trim();

const identityUnavailable = () =>
  new ServiceUnavailable({
    service: "identity",
    message: "Identity service is unavailable",
  });

const defaultProjectInput = (ownerId: UserId) => ({
  ownerId,
  slug: ProjectSlug.make("my-project"),
  name: ProjectName.make("My project"),
  mode: "hosted" as const,
  retentionDays: hostedRawRetentionDays,
  quotas: hostedProjectQuotas,
});

export class IdentityService extends Context.Service<
  IdentityService,
  {
    resolveHostedIdentity(
      subject: HostedSubject,
      email: EmailAddress,
      displayName: DisplayName | undefined,
    ): Effect.Effect<ResolvedIdentity, ServiceUnavailable>;
    sessionView(record: AuthSessionRecord): Effect.Effect<SessionView, ServiceUnavailable>;
    projectForSandboxSession(session: SandboxSession): Effect.Effect<Project>;
    authorizeProject(
      session: Session,
      projectId: ProjectId,
    ): Effect.Effect<Project, EntityNotFound | AccessDenied | ServiceUnavailable>;
  }
>()("groundtruth/backend/identity/IdentityService") {
  static readonly layerMemory = Layer.effect(
    IdentityService,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const startedAt = yield* DateTime.now;
      const state = yield* Ref.make<IdentityState>({
        accountsBySubject: new Map(),
        projectsById: new Map([[sandboxProjectId, sandboxProject(startedAt)]]),
      });

      const resolveHostedIdentity = Effect.fn("IdentityService.resolveHostedIdentity")(function* (
        subject: HostedSubject,
        email: EmailAddress,
        displayName: DisplayName | undefined,
      ) {
        const hostedSubject = normalizeSubject(subject);
        const normalizedEmail = normalizeEmail(email);
        const now = yield* DateTime.now;
        const userId = UserId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const projectId = ProjectId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));

        return yield* Ref.modify(state, (current) => {
          const existing = current.accountsBySubject.get(hostedSubject);
          if (existing !== undefined) {
            const account = new Account({
              id: existing.id,
              hostedSubject: existing.hostedSubject,
              email: EmailAddress.make(normalizedEmail),
              displayName: displayName ?? existing.displayName,
              createdAt: existing.createdAt,
              lastSeenAt: now,
            });
            const accountsBySubject = new Map(current.accountsBySubject);
            accountsBySubject.set(hostedSubject, account);
            const projects = Array.from(current.projectsById.values()).filter(
              (project) => project.ownerId === account.id,
            );
            return [
              { account, projects },
              { ...current, accountsBySubject },
            ];
          }

          const account = new Account({
            id: userId,
            hostedSubject: HostedSubject.make(hostedSubject),
            email: EmailAddress.make(normalizedEmail),
            displayName: displayName ?? null,
            createdAt: now,
            lastSeenAt: now,
          });
          const project = new Project({
            id: projectId,
            ownerId: userId,
            slug: ProjectSlug.make("my-project"),
            name: ProjectName.make("My project"),
            mode: "hosted",
            lifecycle: "active",
            retentionDays: hostedRawRetentionDays,
            deletionRequestedAt: null,
            deletionFailure: null,
            createdAt: now,
            updatedAt: now,
          });
          const accountsBySubject = new Map(current.accountsBySubject);
          const projectsById = new Map(current.projectsById);
          accountsBySubject.set(hostedSubject, account);
          projectsById.set(project.id, project);
          return [
            { account, projects: [project] },
            { accountsBySubject, projectsById },
          ];
        });
      });

      const sessionView = Effect.fn("IdentityService.sessionView")(function* (
        record: AuthSessionRecord,
      ) {
        const projects = Array.from((yield* Ref.get(state)).projectsById.values()).filter(
          (project) => project.ownerId === record.account.id,
        );
        return new SessionView({
          session: record.session,
          account: record.account,
          projects,
          activeProjectId: projects[0]?.id ?? null,
        });
      });

      const authorizeProject = Effect.fn("IdentityService.authorizeProject")(function* (
        session: Session,
        projectId: ProjectId,
      ) {
        if (session._tag === "sandbox") {
          const project = sandboxSessionProject(session);
          if (project.id === projectId) {
            return project;
          }
          return yield* new AccessDenied({
            projectId,
            action: "read project",
            message: "The sandbox session cannot access another session's project",
          });
        }
        const project = (yield* Ref.get(state)).projectsById.get(projectId);
        if (project === undefined || project.ownerId !== session.userId) {
          return yield* new AccessDenied({
            projectId,
            action: "read project",
            message: "The current session cannot access this project",
          });
        }
        return project;
      });

      return IdentityService.of({
        resolveHostedIdentity,
        sessionView,
        projectForSandboxSession: (session) => Effect.succeed(sandboxSessionProject(session)),
        authorizeProject,
      });
    }),
  );

  static readonly layerPersistence = Layer.effect(
    IdentityService,
    Effect.gen(function* () {
      const accounts = yield* AccountRepository;
      const projects = yield* ProjectRepository;

      const projectsFor = Effect.fn("IdentityService.projectsFor")(function* (account: Account) {
        const existing = yield* projects.listForOwner(account.id);
        if (existing.length > 0) {
          return existing.slice(0, 1);
        }

        return yield* projects.create(defaultProjectInput(account.id)).pipe(
          Effect.map((project) => [project]),
          Effect.catchTag("PersistenceError", (createError) =>
            projects
              .listForOwner(account.id)
              .pipe(
                Effect.flatMap((concurrent) =>
                  concurrent.length > 0
                    ? Effect.succeed(concurrent.slice(0, 1))
                    : Effect.fail(createError),
                ),
              ),
          ),
        );
      });

      const resolveHostedIdentity = Effect.fn("IdentityService.resolveHostedIdentity")(function* (
        subject: HostedSubject,
        email: EmailAddress,
        displayName: DisplayName | undefined,
      ) {
        const hostedSubject = HostedSubject.make(normalizeSubject(subject));
        const normalizedEmail = normalizeEmail(email);
        return yield* Effect.gen(function* () {
          const existing =
            displayName === undefined
              ? yield* accounts.findByHostedSubject(hostedSubject)
              : Option.none<Account>();
          const account = yield* accounts.upsertHosted({
            hostedSubject,
            email: EmailAddress.make(normalizedEmail),
            displayName:
              displayName ??
              Option.match(existing, { onNone: () => null, onSome: (value) => value.displayName }),
          });
          return { account, projects: yield* projectsFor(account) };
        }).pipe(Effect.mapError(identityUnavailable));
      });

      const sessionView = Effect.fn("IdentityService.sessionView")(function* (
        record: AuthSessionRecord,
      ) {
        const ownedProjects = yield* projectsFor(record.account).pipe(
          Effect.mapError(identityUnavailable),
        );
        return new SessionView({
          session: record.session,
          account: record.account,
          projects: ownedProjects,
          activeProjectId: ownedProjects[0]?.id ?? null,
        });
      });

      const authorizeProject = Effect.fn("IdentityService.authorizeProject")(function* (
        session: Session,
        projectId: ProjectId,
      ) {
        if (session._tag === "sandbox") {
          const project = sandboxSessionProject(session);
          if (project.id === projectId) {
            return project;
          }
          return yield* new AccessDenied({
            projectId,
            action: "read project",
            message: "The sandbox session cannot access another session's project",
          });
        }
        const project = yield* projects
          .findForOwner(session.userId, projectId)
          .pipe(Effect.mapError(identityUnavailable));
        if (Option.isNone(project)) {
          return yield* new AccessDenied({
            projectId,
            action: "read project",
            message: "The current session cannot access this project",
          });
        }
        return project.value;
      });

      return IdentityService.of({
        resolveHostedIdentity,
        sessionView,
        projectForSandboxSession: (session) => Effect.succeed(sandboxSessionProject(session)),
        authorizeProject,
      });
    }),
  );

  static readonly layer = this.layerPersistence;
}
