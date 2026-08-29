import { ServiceUnavailable } from "@groundtruth/api-contract";
import { DisplayName, EmailAddress, HostedSubject, SessionId } from "@groundtruth/domain";
import {
  AuthHandoffRepository,
  HostedSessionRepository,
  type AuthSessionRecord,
} from "@groundtruth/persistence";
import {
  Clock,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  Redacted,
  Ref,
  Schema,
} from "effect";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { BackendConfig } from "../config/BackendConfig.js";

const handoffTtlMillis = 30_000; // 30 seconds
const sessionTtlMillis = 7 * 24 * 60 * 60 * 1_000; // 7 days

export class AuthPrincipal extends Schema.Class<AuthPrincipal>(
  "groundtruth/backend/auth/AuthPrincipal",
)({
  hostedSubject: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  displayName: Schema.NullOr(Schema.String),
}) {}

export class SessionRecord extends Schema.Class<SessionRecord>(
  "groundtruth/backend/auth/SessionRecord",
)({
  id: Schema.NonEmptyString,
  principal: AuthPrincipal,
  createdAt: Schema.Int,
  expiresAt: Schema.Int,
}) {}

export class InvalidServiceCredential extends Schema.TaggedError<InvalidServiceCredential>()(
  "InvalidServiceCredential",
  { service: Schema.Literals(["collector", "sites"]) },
  { httpApiStatus: 401 },
) {}

export class AdminLoginDisabled extends Schema.TaggedError<AdminLoginDisabled>()(
  "AdminLoginDisabled",
  {},
  { httpApiStatus: 401 },
) {}

export class InvalidAdminCredential extends Schema.TaggedError<InvalidAdminCredential>()(
  "InvalidAdminCredential",
  {},
  { httpApiStatus: 401 },
) {}

export class InvalidHandoffCode extends Schema.TaggedError<InvalidHandoffCode>()(
  "InvalidHandoffCode",
  {},
  { httpApiStatus: 401 },
) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()(
  "SessionNotFound",
  {},
  { httpApiStatus: 401 },
) {}

export class InvalidReturnPath extends Schema.TaggedError<InvalidReturnPath>()(
  "InvalidReturnPath",
  {},
  { httpApiStatus: 400 },
) {}

interface HandoffRecord {
  readonly principal: AuthPrincipal;
  readonly returnPath: string;
  readonly expiresAt: number;
}

interface AuthState {
  readonly handoffs: ReadonlyMap<string, HandoffRecord>;
  readonly sessions: ReadonlyMap<string, SessionRecord>;
}

export interface IssuedHandoff {
  readonly code: string;
  readonly browserNonce: Redacted.Redacted<string>;
  readonly expiresAt: number;
}

export interface RedeemedHandoff {
  readonly returnPath: string;
  readonly sessionToken: string;
  readonly session: SessionRecord;
}

const randomToken = Effect.sync(() => randomBytes(32).toString("base64url"));

const digest = (value: string) => createHash("sha256").update(value).digest();

const digestHex = (value: string) => digest(value).toString("hex");

const handoffDigest = (code: string, browserNonce: string) => digestHex(`${code}\0${browserNonce}`);

const secretMatches = (expected: Redacted.Redacted<string>, presented: string) =>
  Effect.sync(() => timingSafeEqual(digest(Redacted.value(expected)), digest(presented)));

const authUnavailable = () =>
  new ServiceUnavailable({
    service: "authentication",
    message: "Authentication service is unavailable",
  });

const validReturnPath = (returnPath: string) =>
  returnPath.startsWith("/") && !returnPath.startsWith("//") && !returnPath.includes("\\");

const toSessionRecord = ({ account, session }: AuthSessionRecord) =>
  new SessionRecord({
    id: String(session.id),
    principal: new AuthPrincipal({
      hostedSubject: String(account.hostedSubject),
      email: String(account.email),
      displayName: account.displayName,
    }),
    createdAt: DateTime.toEpochMillis(session.createdAt),
    expiresAt: DateTime.toEpochMillis(session.expiresAt),
  });

const withoutExpired = (state: AuthState, now: number): AuthState => ({
  handoffs: new Map(Array.from(state.handoffs).filter(([, handoff]) => handoff.expiresAt > now)),
  sessions: new Map(Array.from(state.sessions).filter(([, session]) => session.expiresAt > now)),
});

export class AuthService extends Context.Service<
  AuthService,
  {
    validateCollectorCredential(credential: string): Effect.Effect<void, InvalidServiceCredential>;
    validateSitesCredential(credential: string): Effect.Effect<void, InvalidServiceCredential>;
    validateAdminCredential(
      credential: Redacted.Redacted<string>,
    ): Effect.Effect<void, AdminLoginDisabled | InvalidAdminCredential>;
    issueHandoff(
      principal: AuthPrincipal,
      returnPath: string,
      browserNonce?: Redacted.Redacted<string>,
    ): Effect.Effect<IssuedHandoff, InvalidReturnPath | ServiceUnavailable>;
    redeemHandoff(
      code: string,
      browserNonce: Redacted.Redacted<string>,
    ): Effect.Effect<RedeemedHandoff, InvalidHandoffCode | ServiceUnavailable>;
    authenticate(
      sessionToken: string,
    ): Effect.Effect<SessionRecord, SessionNotFound | ServiceUnavailable>;
    logout(sessionToken: string): Effect.Effect<void, ServiceUnavailable>;
  }
>()("groundtruth/backend/auth/AuthService") {
  static readonly layerMemory = Layer.effect(
    AuthService,
    Effect.gen(function* () {
      const config = yield* BackendConfig;
      const crypto = yield* Crypto.Crypto;
      const state = yield* Ref.make<AuthState>({
        handoffs: new Map(),
        sessions: new Map(),
      });

      const validateCredential = Effect.fn("AuthService.validateCredential")(function* (
        service: "collector" | "sites",
        expected: Redacted.Redacted<string>,
        presented: string,
      ) {
        if (!(yield* secretMatches(expected, presented))) {
          return yield* new InvalidServiceCredential({ service });
        }
      });

      const validateCollectorCredential = Effect.fn("AuthService.validateCollectorCredential")(
        (credential: string) => validateCredential("collector", config.collectorSecret, credential),
      );

      const validateSitesCredential = Effect.fn("AuthService.validateSitesCredential")(
        (credential: string) => validateCredential("sites", config.siteHandoffSecret, credential),
      );

      const validateAdminCredential = Effect.fn("AuthService.validateAdminCredential")(function* (
        credential: Redacted.Redacted<string>,
      ) {
        if (config.adminToken === undefined) {
          return yield* new AdminLoginDisabled();
        }
        if (!(yield* secretMatches(config.adminToken, Redacted.value(credential)))) {
          return yield* new InvalidAdminCredential();
        }
      });

      const issueHandoff = Effect.fn("AuthService.issueHandoff")(function* (
        principal: AuthPrincipal,
        returnPath: string,
        suppliedBrowserNonce?: Redacted.Redacted<string>,
      ) {
        if (!validReturnPath(returnPath)) {
          return yield* new InvalidReturnPath();
        }
        const [code, generatedBrowserNonce] = yield* Effect.all([randomToken, randomToken]);
        const browserNonce =
          suppliedBrowserNonce === undefined
            ? generatedBrowserNonce
            : Redacted.value(suppliedBrowserNonce);
        const now = yield* Clock.currentTimeMillis;
        const expiresAt = now + handoffTtlMillis;
        yield* Ref.update(state, (current) => {
          const active = withoutExpired(current, now);
          const handoffs = new Map(active.handoffs);
          handoffs.set(handoffDigest(code, browserNonce), {
            principal,
            returnPath,
            expiresAt,
          });
          return { ...active, handoffs };
        });
        return { code, browserNonce: Redacted.make(browserNonce), expiresAt };
      });

      const redeemHandoff = Effect.fn("AuthService.redeemHandoff")(function* (
        code: string,
        browserNonce: Redacted.Redacted<string>,
      ) {
        const now = yield* Clock.currentTimeMillis;
        const handoff = yield* Ref.modify(state, (current) => {
          const active = withoutExpired(current, now);
          const handoffs = new Map(active.handoffs);
          const codeHash = handoffDigest(code, Redacted.value(browserNonce));
          const found = handoffs.get(codeHash);
          if (found === undefined) {
            return [undefined, active];
          }
          handoffs.delete(codeHash);
          return [found, { ...active, handoffs }];
        });
        if (handoff === undefined) {
          return yield* new InvalidHandoffCode();
        }

        const sessionToken = yield* randomToken;
        const session = new SessionRecord({
          id: yield* crypto.randomUUIDv7.pipe(Effect.orDie),
          principal: handoff.principal,
          createdAt: now,
          expiresAt: now + sessionTtlMillis,
        });
        yield* Ref.update(state, (current) => {
          const sessions = new Map(current.sessions);
          sessions.set(digestHex(sessionToken), session);
          return { ...current, sessions };
        });
        return { returnPath: handoff.returnPath, sessionToken, session };
      });

      const authenticate = Effect.fn("AuthService.authenticate")(function* (sessionToken: string) {
        const now = yield* Clock.currentTimeMillis;
        const session = yield* Ref.modify(state, (current) => {
          const active = withoutExpired(current, now);
          return [active.sessions.get(digestHex(sessionToken)), active];
        });
        if (session === undefined) {
          return yield* new SessionNotFound();
        }
        return session;
      });

      const logout = Effect.fn("AuthService.logout")((sessionToken: string) =>
        Ref.update(state, (current) => {
          const sessions = new Map(current.sessions);
          sessions.delete(digestHex(sessionToken));
          return { ...current, sessions };
        }),
      );

      return AuthService.of({
        validateCollectorCredential,
        validateSitesCredential,
        validateAdminCredential,
        issueHandoff,
        redeemHandoff,
        authenticate,
        logout,
      });
    }),
  );

  static readonly layerPersistence = Layer.effect(
    AuthService,
    Effect.gen(function* () {
      const config = yield* BackendConfig;
      const crypto = yield* Crypto.Crypto;
      const handoffs = yield* AuthHandoffRepository;
      const sessions = yield* HostedSessionRepository;

      const validateCredential = Effect.fn("AuthService.validateCredential")(function* (
        service: "collector" | "sites",
        expected: Redacted.Redacted<string>,
        presented: string,
      ) {
        if (!(yield* secretMatches(expected, presented))) {
          return yield* new InvalidServiceCredential({ service });
        }
      });

      const validateAdminCredential = Effect.fn("AuthService.validateAdminCredential")(function* (
        credential: Redacted.Redacted<string>,
      ) {
        if (config.adminToken === undefined) {
          return yield* new AdminLoginDisabled();
        }
        if (!(yield* secretMatches(config.adminToken, Redacted.value(credential)))) {
          return yield* new InvalidAdminCredential();
        }
      });

      const issueHandoff = Effect.fn("AuthService.issueHandoff")(function* (
        principal: AuthPrincipal,
        returnPath: string,
        suppliedBrowserNonce?: Redacted.Redacted<string>,
      ) {
        if (!validReturnPath(returnPath)) {
          return yield* new InvalidReturnPath();
        }
        const [code, generatedBrowserNonce] = yield* Effect.all([randomToken, randomToken]);
        const browserNonce =
          suppliedBrowserNonce === undefined
            ? generatedBrowserNonce
            : Redacted.value(suppliedBrowserNonce);
        const createdAt = yield* DateTime.now;
        const expiresAt = DateTime.fromDateUnsafe(
          new Date(DateTime.toEpochMillis(createdAt) + handoffTtlMillis),
        );
        yield* handoffs
          .issue({
            codeHash: handoffDigest(code, browserNonce),
            hostedSubject: HostedSubject.make(principal.hostedSubject),
            email: EmailAddress.make(principal.email),
            displayName:
              principal.displayName === null ? null : DisplayName.make(principal.displayName),
            returnPath,
            createdAt,
            expiresAt,
          })
          .pipe(Effect.mapError(authUnavailable));
        return {
          code,
          browserNonce: Redacted.make(browserNonce),
          expiresAt: DateTime.toEpochMillis(expiresAt),
        };
      });

      const redeemHandoff = Effect.fn("AuthService.redeemHandoff")(function* (
        code: string,
        browserNonce: Redacted.Redacted<string>,
      ) {
        const redeemedAt = yield* DateTime.now;
        const sessionToken = yield* randomToken;
        const sessionId = SessionId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const sessionExpiresAt = DateTime.fromDateUnsafe(
          new Date(DateTime.toEpochMillis(redeemedAt) + sessionTtlMillis),
        );
        const result = yield* handoffs
          .redeem({
            codeHash: handoffDigest(code, Redacted.value(browserNonce)),
            redeemedAt,
            sessionId,
            tokenHash: digestHex(sessionToken),
            sessionExpiresAt,
          })
          .pipe(Effect.mapError(authUnavailable));
        if (Option.isNone(result)) {
          return yield* new InvalidHandoffCode();
        }
        return {
          returnPath: result.value.returnPath,
          sessionToken,
          session: toSessionRecord(result.value),
        };
      });

      const authenticate = Effect.fn("AuthService.authenticate")(function* (sessionToken: string) {
        const result = yield* sessions
          .findActiveByTokenHash(digestHex(sessionToken), yield* DateTime.now)
          .pipe(Effect.mapError(authUnavailable));
        if (Option.isNone(result)) {
          return yield* new SessionNotFound();
        }
        return toSessionRecord(result.value);
      });

      const logout = Effect.fn("AuthService.logout")((sessionToken: string) =>
        Effect.gen(function* () {
          yield* sessions
            .revokeByTokenHash(digestHex(sessionToken), yield* DateTime.now)
            .pipe(Effect.mapError(authUnavailable));
        }),
      );

      return AuthService.of({
        validateCollectorCredential: (credential) =>
          validateCredential("collector", config.collectorSecret, credential),
        validateSitesCredential: (credential) =>
          validateCredential("sites", config.siteHandoffSecret, credential),
        validateAdminCredential,
        issueHandoff,
        redeemHandoff,
        authenticate,
        logout,
      });
    }),
  );

  static readonly layer = this.layerPersistence;

  static readonly layerMemoryConfigured = this.layerMemory.pipe(Layer.provide(BackendConfig.layer));
}
