import { NodeCrypto, NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AuthApi,
  GroundtruthAccess,
  HandoffCreated,
  SessionView,
  SitesServiceAccess,
} from "@groundtruth/api-contract";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import { Effect, Layer, Redacted, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi";
import { AuthService } from "../src/auth/AuthService.js";
import { BackendConfig } from "../src/config/BackendConfig.js";
import { AuthHandlers } from "../src/http/AuthHandlers.js";
import { GroundtruthAccessLayer, SitesServiceAccessLayer } from "../src/http/ApiMiddleware.js";
import { IdentityService } from "../src/identity/IdentityService.js";
import { SandboxService } from "../src/sandbox/SandboxService.js";

class AuthTestApi extends HttpApi.make("groundtruth").add(AuthApi) {}

const SitesAccessTest = Layer.succeed(
  SitesServiceAccess,
  SitesServiceAccess.of({
    groundtruthSitesService: (httpEffect) => httpEffect,
  }),
);

const accessTest = Layer.mergeAll(
  SitesAccessTest,
  Layer.succeed(
    GroundtruthAccess,
    GroundtruthAccess.of({
      groundtruthSession: () => Effect.die("Unexpected session endpoint call"),
      groundtruthSandbox: () => Effect.die("Unexpected sandbox endpoint call"),
    }),
  ),
);

const notUsed = () => Effect.die("Unexpected sandbox operation");
const SandboxTest = Layer.succeed(
  SandboxService,
  SandboxService.of({
    open: notUsed,
    ensure: notUsed,
    resume: notUsed,
    resumeOrOpen: notUsed,
    trigger: notUsed,
    reset: notUsed,
    pruneExpired: notUsed,
  }),
);

const authRoutes = (
  cookieSecure = false,
  authenticatedRequestsPerMinute = 300,
  realAccess = false,
) => {
  const config = Layer.succeed(
    BackendConfig,
    BackendConfig.of({
      environment: "test",
      port: 3000,
      publicUrl: "http://localhost:3000",
      consoleOrigin: "http://localhost:5173",
      developmentConsoleOrigin: undefined,
      collectorSecret: Redacted.make("collector-secret"),
      siteHandoffSecret: Redacted.make("sites-secret"),
      sessionSecret: Redacted.make("session-secret"),
      cookieSecure,
      bootstrapProjectSlug: "local",
      bootstrapProjectName: "Local project",
      bootstrapIngestKey: undefined,
      sandboxSessionLimit: 100,
      sandboxCreationsPerMinute: 10,
      authenticatedRequestsPerMinute,
      publicRequestsPerMinute: 10_000,
    }),
  );
  const foundation = Layer.mergeAll(config, NodeCrypto.layer, PersistenceMemory);
  const services = Layer.mergeAll(
    AuthService.layerPersistence,
    IdentityService.layerPersistence,
  ).pipe(Layer.provideMerge(foundation));
  const groundtruthAccess = GroundtruthAccessLayer.pipe(
    Layer.provideMerge(Layer.mergeAll(services, SandboxTest)),
  );
  const sitesAccess = SitesServiceAccessLayer.pipe(Layer.provide(services));
  const dependencies = Layer.mergeAll(
    services,
    realAccess ? Layer.mergeAll(sitesAccess, groundtruthAccess) : accessTest,
  );
  const handlers = AuthHandlers.pipe(Layer.provide(dependencies));

  return HttpApiBuilder.layer(AuthTestApi).pipe(
    Layer.provide(handlers),
    Layer.provide(dependencies),
    Layer.provide(NodeHttpServer.layerHttpServices),
  );
};

const handoffRequest = (browserNonce: string, authorized = true) =>
  new Request("http://localhost:3000/v1/auth/handoffs", {
    method: "POST",
    headers: {
      ...(authorized ? { authorization: "Bearer sites-secret" } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      subject: "chatgpt-user-1",
      email: "Operator@Example.com",
      displayName: "Operator",
      returnPath: "/projects",
      browserNonce,
    }),
  });

const callbackRequest = (code: string, browserNonce?: string) =>
  new Request(
    `http://localhost:3000/v1/auth/chatgpt/callback?code=${encodeURIComponent(code)}`,
    browserNonce === undefined
      ? undefined
      : { headers: { cookie: `groundtruth_handoff_nonce=${browserNonce}` } },
  );

const setCookieHeaders = (headers: Headers) => {
  const withSetCookie = headers as Headers & { getSetCookie?: () => Array<string> };
  return withSetCookie.getSetCookie?.() ?? [headers.get("set-cookie") ?? ""];
};

const cookiePair = (headers: Headers, name: string) => {
  const header = setCookieHeaders(headers).find((value) => value.startsWith(`${name}=`));
  return header?.split(";", 1)[0];
};

describe("hosted authentication handoff", () => {
  it.effect("binds callback redemption to the initiating browser nonce", () =>
    Effect.acquireUseRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(authRoutes(true, 300, true), {
          disableLogger: true,
        }),
      ),
      ({ handler }) =>
        Effect.gen(function* () {
          const unauthorizedHandoff = yield* Effect.promise(() =>
            handler(handoffRequest("a".repeat(43), false)),
          );
          assert.strictEqual(unauthorizedHandoff.status, 401);

          const nonceA = "a".repeat(43);
          const nonceB = "b".repeat(43);
          const handoffAResponse = yield* Effect.promise(() => handler(handoffRequest(nonceA)));
          const handoffBResponse = yield* Effect.promise(() => handler(handoffRequest(nonceB)));
          assert.strictEqual(handoffAResponse.status, 201);
          assert.strictEqual(handoffBResponse.status, 201);
          assert.strictEqual(handoffAResponse.headers.get("set-cookie"), null);

          const handoffA = yield* Schema.decodeUnknownEffect(HandoffCreated)(
            yield* Effect.promise(() => handoffAResponse.json()),
          ).pipe(Effect.orDie);
          const handoffB = yield* Schema.decodeUnknownEffect(HandoffCreated)(
            yield* Effect.promise(() => handoffBResponse.json()),
          ).pipe(Effect.orDie);

          const missingNonce = yield* Effect.promise(() => handler(callbackRequest(handoffA.code)));
          assert.strictEqual(missingNonce.status, 400);

          const swappedNonce = yield* Effect.promise(() =>
            handler(callbackRequest(handoffA.code, nonceB)),
          );
          assert.strictEqual(swappedNonce.status, 400);
          assert.strictEqual(swappedNonce.headers.get("set-cookie"), null);

          const completedA = yield* Effect.promise(() =>
            handler(callbackRequest(handoffA.code, nonceA)),
          );
          assert.strictEqual(completedA.status, 303);
          assert.strictEqual(completedA.headers.get("location"), "http://localhost:5173/projects");
          const sessionCookie = cookiePair(completedA.headers, "groundtruth_session");
          assert(sessionCookie !== undefined);
          const sessionSetCookie = setCookieHeaders(completedA.headers).find((value) =>
            value.startsWith("groundtruth_session="),
          );
          assert.match(sessionSetCookie ?? "", /HttpOnly/i);
          assert.match(sessionSetCookie ?? "", /SameSite=Lax/i);
          assert.match(sessionSetCookie ?? "", /Secure/i);
          const clearedNonce = setCookieHeaders(completedA.headers).find((value) =>
            value.startsWith("groundtruth_handoff_nonce="),
          );
          assert.match(clearedNonce ?? "", /Max-Age=0/i);
          assert.match(clearedNonce ?? "", /Path=\/v1\/auth\/chatgpt\/callback/i);

          const sessionResponse = yield* Effect.promise(() =>
            handler(
              new Request("http://localhost:3000/v1/auth/session", {
                headers: { cookie: sessionCookie },
              }),
            ),
          );
          assert.strictEqual(sessionResponse.status, 200);
          const session = yield* Schema.decodeUnknownEffect(SessionView)(
            yield* Effect.promise(() => sessionResponse.json()),
          ).pipe(Effect.orDie);
          assert.strictEqual(session.account?.hostedSubject, "chatgpt-user-1");

          const replay = yield* Effect.promise(() =>
            handler(callbackRequest(handoffA.code, nonceA)),
          );
          assert.strictEqual(replay.status, 400);

          const completedB = yield* Effect.promise(() =>
            handler(callbackRequest(handoffB.code, nonceB)),
          );
          assert.strictEqual(completedB.status, 303);
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("keeps authenticated request quotas isolated by validated hosted session", () =>
    Effect.acquireUseRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(authRoutes(false, 2, true), {
          disableLogger: true,
        }),
      ),
      ({ handler }) =>
        Effect.gen(function* () {
          const createSessionCookie = Effect.fn("AuthHandlersTest.createSessionCookie")(function* (
            browserNonce: string,
          ) {
            const handoffResponse = yield* Effect.promise(() =>
              handler(handoffRequest(browserNonce)),
            );
            const handoff = yield* Schema.decodeUnknownEffect(HandoffCreated)(
              yield* Effect.promise(() => handoffResponse.json()),
            ).pipe(Effect.orDie);
            const callback = yield* Effect.promise(() =>
              handler(callbackRequest(handoff.code, browserNonce)),
            );
            const cookie = cookiePair(callback.headers, "groundtruth_session");
            return cookie === undefined
              ? yield* Effect.die("Expected hosted session cookie")
              : cookie;
          });
          const cookieA = yield* createSessionCookie("a".repeat(43));
          const cookieB = yield* createSessionCookie("b".repeat(43));
          assert.notStrictEqual(cookieA, cookieB);

          const getSession = (cookie: string) =>
            Effect.promise(() =>
              handler(
                new Request("http://localhost:3000/v1/auth/session", {
                  headers: { cookie },
                }),
              ),
            );

          assert.strictEqual((yield* getSession(cookieA)).status, 200);
          assert.strictEqual((yield* getSession(cookieA)).status, 200);
          assert.strictEqual((yield* getSession(cookieB)).status, 200);

          const limited = yield* getSession(cookieA);
          assert.strictEqual(limited.status, 429);
          assert.deepStrictEqual(yield* Effect.promise(() => limited.json()), {
            _tag: "QuotaExceeded",
            quota: "authenticated requests per minute",
            limit: 2,
            observed: 3,
            message: "Authenticated request rate limit exceeded. Try again in one minute.",
          });
          assert.strictEqual((yield* getSession(cookieB)).status, 200);
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );
});
