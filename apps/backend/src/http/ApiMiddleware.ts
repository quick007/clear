import {
  AuthorizedIngestProject,
  CollectorServiceAccess,
  CurrentSession,
  GroundtruthAccess,
  IngestKeyAccess,
  ServiceUnavailable,
  SitesServiceAccess,
  Unauthorized,
} from "@groundtruth/api-contract";
import { type ProjectId, QuotaExceeded, SessionId } from "@groundtruth/domain";
import { Effect, Layer, Redacted, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { AuthService } from "../auth/AuthService.js";
import { IdentityService } from "../identity/IdentityService.js";
import { IngestKeyService } from "../ingest/IngestKeyService.js";
import { SandboxService } from "../sandbox/SandboxService.js";
import { makeAuthenticatedRequestLimiter } from "./AuthenticatedRequestLimiter.js";

const unauthorized = (message: string) => new Unauthorized({ message });
const unavailable = (service: string, message: string) =>
  new ServiceUnavailable({ service, message });

export const resumeSandboxSession = Effect.fn("ApiMiddleware.resumeSandboxSession")(function* (
  sandboxes: SandboxService["Service"],
  credential: Redacted.Redacted,
) {
  const rawSessionId = Redacted.value(credential);
  const sessionId = yield* Schema.decodeUnknownEffect(SessionId)(rawSessionId).pipe(
    Effect.mapError(() => unauthorized("Sandbox session is missing or malformed")),
  );
  const state = yield* sandboxes.resume(sessionId).pipe(
    Effect.catchTags({
      EntityNotFound: () => unauthorized("Sandbox session is invalid or expired"),
      TelemetryUnavailable: (error) => unavailable("telemetry", error.message),
    }),
  );
  return state.session;
});

export const GroundtruthAccessLayer = Layer.effect(
  GroundtruthAccess,
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const identity = yield* IdentityService;
    const sandboxes = yield* SandboxService;
    const requests = yield* makeAuthenticatedRequestLimiter();
    const rateLimitFailures = new WeakMap<
      HttpServerRequest.HttpServerRequest,
      QuotaExceeded | ServiceUnavailable
    >();

    return GroundtruthAccess.of({
      groundtruthSession: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const token = Redacted.value(credential);
          if (token.length === 0) {
            return yield* unauthorized("Session cookie is missing");
          }
          const record = yield* auth
            .authenticate(token)
            .pipe(
              Effect.catchTag("SessionNotFound", () =>
                unauthorized("Session is invalid or expired"),
              ),
            );
          const request = yield* HttpServerRequest.HttpServerRequest;
          yield* requests.consume(record.session.id).pipe(
            Effect.tapError((error) =>
              Effect.sync(() => {
                rateLimitFailures.set(request, error);
              }),
            ),
          );
          const view = yield* identity.sessionView(record);
          return yield* httpEffect.pipe(Effect.provideService(CurrentSession, view.session));
        }),
      groundtruthSandbox: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const priorRateLimitFailure = rateLimitFailures.get(request);
          if (priorRateLimitFailure !== undefined) {
            return yield* priorRateLimitFailure;
          }
          const session = yield* resumeSandboxSession(sandboxes, credential);
          yield* requests.consume(String(session.id));
          return yield* httpEffect.pipe(Effect.provideService(CurrentSession, session));
        }),
    });
  }),
);

export const SitesServiceAccessLayer = Layer.effect(
  SitesServiceAccess,
  Effect.map(AuthService, (auth) =>
    SitesServiceAccess.of({
      groundtruthSitesService: (httpEffect, { credential }) =>
        auth.validateSitesCredential(Redacted.value(credential)).pipe(
          Effect.mapError(() => unauthorized("Sites service credential is invalid")),
          Effect.andThen(httpEffect),
        ),
    }),
  ),
);

export const CollectorServiceAccessLayer = Layer.effect(
  CollectorServiceAccess,
  Effect.map(AuthService, (auth) =>
    CollectorServiceAccess.of({
      groundtruthCollectorService: (httpEffect, { credential }) =>
        auth.validateCollectorCredential(Redacted.value(credential)).pipe(
          Effect.mapError(() => unauthorized("Collector service credential is invalid")),
          Effect.andThen(httpEffect),
        ),
    }),
  ),
);

export const IngestKeyAccessLayer = Layer.effect(
  IngestKeyAccess,
  Effect.map(IngestKeyService, (keys) =>
    IngestKeyAccess.of({
      clearIngestKey: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const projectId = yield* keys
            .verify(Redacted.value(credential))
            .pipe(
              Effect.catchTag("IngestKeyUnavailable", (error) =>
                unavailable("ingest-keys", error.message),
              ),
            );
          return yield* httpEffect.pipe(Effect.provideService(AuthorizedIngestProject, projectId));
        }),
    }),
  ),
);

export const authorizeCurrentProject = Effect.fn("ApiMiddleware.authorizeCurrentProject")(
  function* (identity: IdentityService["Service"], projectId: ProjectId) {
    const session = yield* CurrentSession;
    return yield* identity.authorizeProject(session, projectId);
  },
);
