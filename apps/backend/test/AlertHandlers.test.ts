import { NodeCrypto, NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AlertsApi,
  CurrentSession,
  GroundtruthAccess,
  IncidentDetail,
  ManualAlertList,
} from "@groundtruth/api-contract";
import {
  Alert,
  EmailAddress,
  HostedSession,
  HostedSubject,
  ManualAlert,
  ProjectName,
  ProjectSlug,
  SessionId,
} from "@groundtruth/domain";
import {
  AccountRepository,
  AlertRepository,
  ManualAlertRepository,
  ProjectRepository,
} from "@groundtruth/persistence";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import { Context, Crypto, DateTime, Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi";
import { TestClock } from "effect/testing";
import { AlertService } from "../src/alerts/AlertService.js";
import { ManualAlertService } from "../src/alerts/ManualAlertService.js";
import { AlertHandlers } from "../src/http/AlertHandlers.js";
import { IdentityService } from "../src/identity/IdentityService.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { IncidentService } from "../src/incidents/IncidentService.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";

class AlertTestApi extends HttpApi.make("groundtruth").add(AlertsApi) {}

const jsonRule = {
  name: "Checkout latency",
  serviceName: "checkout-api",
  metricName: "http.server.duration",
  aggregation: "p95",
  comparison: "above",
  threshold: 500,
  windowSeconds: 300,
  severity: "critical",
  enabled: true,
} as const;

const makeRoutes = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
  const foundation = yield* Layer.build(
    Layer.mergeAll(PersistenceMemory, IncidentState.layer, NodeCrypto.layer),
  );
  const accounts = Context.get(foundation, AccountRepository);
  const projects = Context.get(foundation, ProjectRepository);
  const alertRepository = Context.get(foundation, AlertRepository);
  const manualAlertRepository = Context.get(foundation, ManualAlertRepository);
  const crypto = Context.get(foundation, Crypto.Crypto);
  const incidentState = Context.get(foundation, IncidentState);
  const liveEventsContext = yield* Layer.build(LiveEventBus.layer);
  const liveEvents = Context.get(liveEventsContext, LiveEventBus);

  const owner = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("owner@example.com"),
    email: EmailAddress.make("owner@example.com"),
    displayName: null,
  });
  const stranger = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("stranger@example.com"),
    email: EmailAddress.make("stranger@example.com"),
    displayName: null,
  });
  const projectInput = {
    slug: ProjectSlug.make("alerts"),
    name: ProjectName.make("Alerts"),
    mode: "hosted" as const,
    retentionDays: 14,
    quotas: {
      maxIngestBytesPerMinute: 10_000_000,
      maxActiveSeries: 10_000,
      maxPanels: 12,
    },
  };
  const ownedProject = yield* projects.create({ ownerId: owner.id, ...projectInput });
  const foreignProject = yield* projects.create({
    ownerId: stranger.id,
    ...projectInput,
    slug: ProjectSlug.make("foreign-alerts"),
  });
  const now = DateTime.fromDateUnsafe(new Date("2026-08-28T08:00:00.000Z"));
  const session = new HostedSession({
    id: SessionId.make("01993f71-0001-7000-8000-000000000092"),
    userId: owner.id,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: DateTime.fromDateUnsafe(new Date("2026-08-29T08:00:00.000Z")),
  });

  const repositoryLayers = Layer.mergeAll(
    Layer.succeed(AccountRepository, accounts),
    Layer.succeed(ProjectRepository, projects),
  );
  const identityContext = yield* Layer.build(
    Layer.fresh(IdentityService.layerPersistence).pipe(Layer.provide(repositoryLayers)),
  );
  const identity = Context.get(identityContext, IdentityService);
  const alertContext = yield* Layer.build(
    Layer.fresh(AlertService.layer).pipe(
      Layer.provide([
        Layer.succeed(AlertRepository, alertRepository),
        Layer.succeed(Crypto.Crypto, crypto),
        Layer.succeed(IncidentState, incidentState),
        Layer.succeed(LiveEventBus, liveEvents),
      ]),
    ),
  );
  const alerts = Context.get(alertContext, AlertService);
  const manualAlertContext = yield* Layer.build(
    Layer.fresh(ManualAlertService.layer).pipe(
      Layer.provide([
        Layer.succeed(ManualAlertRepository, manualAlertRepository),
        Layer.succeed(Crypto.Crypto, crypto),
        Layer.succeed(IncidentState, incidentState),
      ]),
    ),
  );
  const manualAlerts = Context.get(manualAlertContext, ManualAlertService);
  const incidentContext = yield* Layer.build(
    Layer.fresh(IncidentService.layer).pipe(
      Layer.provide([
        Layer.succeed(Crypto.Crypto, crypto),
        Layer.succeed(IncidentState, incidentState),
        Layer.succeed(LiveEventBus, liveEvents),
      ]),
    ),
  );
  const incidents = Context.get(incidentContext, IncidentService);
  const access = Layer.succeed(
    GroundtruthAccess,
    GroundtruthAccess.of({
      groundtruthSession: (httpEffect) =>
        httpEffect.pipe(Effect.provideService(CurrentSession, session)),
      groundtruthSandbox: () => Effect.die("Unexpected sandbox authentication"),
    }),
  );
  const services = Layer.mergeAll(
    Layer.succeed(AlertService, alerts),
    Layer.succeed(ManualAlertService, manualAlerts),
    Layer.succeed(IdentityService, identity),
    Layer.succeed(IncidentService, incidents),
    access,
  );
  const handlers = AlertHandlers.pipe(Layer.provide(services));
  const routes = HttpApiBuilder.layer(AlertTestApi).pipe(
    Layer.provide(handlers),
    Layer.provide(services),
    Layer.provide(NodeHttpServer.layerHttpServices),
  );
  return {
    ...HttpRouter.toWebHandler(routes, { disableLogger: true }),
    ownedProject,
    foreignProject,
  };
});

const createRequest = (projectId: string, body: object = jsonRule) =>
  new Request(`http://localhost:3000/v1/projects/${projectId}/alerts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "groundtruth_session=test-session",
    },
    body: JSON.stringify(body),
  });

describe("AlertHandlers", () => {
  it.effect("authorizes the project before creating an alert rule", () =>
    Effect.acquireUseRelease(
      makeRoutes,
      ({ handler, ownedProject, foreignProject }) =>
        Effect.gen(function* () {
          const denied = yield* Effect.promise(() => handler(createRequest(foreignProject.id)));
          assert.strictEqual(denied.status, 403, yield* Effect.promise(() => denied.text()));

          const created = yield* Effect.promise(() => handler(createRequest(ownedProject.id)));
          const createdBody = yield* Effect.promise(() => created.text());
          assert.strictEqual(created.status, 201, createdBody);
          const alert = yield* Schema.decodeUnknownEffect(Alert)(JSON.parse(createdBody)).pipe(
            Effect.orDie,
          );

          const deleted = yield* Effect.promise(() =>
            handler(
              new Request(
                `http://localhost:3000/v1/projects/${ownedProject.id}/alerts/${alert.id}`,
                {
                  method: "DELETE",
                  headers: { cookie: "groundtruth_session=test-session" },
                },
              ),
            ),
          );
          assert.strictEqual(deleted.status, 204, yield* Effect.promise(() => deleted.text()));
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("returns the typed unsupported aggregation response", () =>
    Effect.acquireUseRelease(
      makeRoutes,
      ({ handler, ownedProject }) =>
        Effect.gen(function* () {
          const response = yield* Effect.promise(() =>
            handler(createRequest(ownedProject.id, { ...jsonRule, aggregation: "count-distinct" })),
          );
          const payload: unknown = JSON.parse(yield* Effect.promise(() => response.text()));

          assert.strictEqual(response.status, 422);
          assert.deepStrictEqual(payload, {
            _tag: "UnsupportedAlertAggregation",
            aggregation: "count-distinct",
            missingField: "distinctKey",
            message: "count-distinct alert rules require distinctKey, which is not supported yet",
          });
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("returns the project rule cap as a typed 429", () =>
    Effect.acquireUseRelease(
      makeRoutes,
      ({ handler, ownedProject }) =>
        Effect.gen(function* () {
          yield* Effect.forEach(
            Array.from({ length: 25 }, (_, index) => index),
            (index) =>
              Effect.promise(() =>
                handler(
                  createRequest(ownedProject.id, {
                    ...jsonRule,
                    name: `Checkout latency ${index}`,
                  }),
                ),
              ).pipe(
                Effect.flatMap((response) =>
                  response.status === 201
                    ? Effect.void
                    : Effect.die(`Unexpected create status ${response.status}`),
                ),
              ),
            { discard: true },
          );

          const response = yield* Effect.promise(() =>
            handler(createRequest(ownedProject.id, { ...jsonRule, name: "One alert too many" })),
          );
          const payload: unknown = JSON.parse(yield* Effect.promise(() => response.text()));

          assert.strictEqual(response.status, 429);
          assert.deepStrictEqual(payload, {
            _tag: "QuotaExceeded",
            quota: "alert-rules-per-project",
            limit: 25,
            observed: 26,
            message: "A project can have at most 25 alert rules",
          });
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("creates a manual alert and starts an investigation from it", () =>
    Effect.acquireUseRelease(
      makeRoutes,
      ({ handler, ownedProject }) =>
        Effect.gen(function* () {
          const created = yield* Effect.promise(() =>
            handler(
              new Request(`http://localhost:3000/v1/projects/${ownedProject.id}/alerts/manual`, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  cookie: "groundtruth_session=test-session",
                },
                body: JSON.stringify({
                  title: "Checkout is failing for customers",
                  severity: "critical",
                  serviceName: "checkout-api",
                  context: "Support reported failures after the latest deploy.",
                }),
              }),
            ),
          );
          const alert = yield* Schema.decodeUnknownEffect(ManualAlert)(
            JSON.parse(yield* Effect.promise(() => created.text())),
          ).pipe(Effect.orDie);
          assert.strictEqual(created.status, 201);
          assert.strictEqual(alert.title, "Checkout is failing for customers");

          const listed = yield* Effect.promise(() =>
            handler(
              new Request(`http://localhost:3000/v1/projects/${ownedProject.id}/alerts/manual`, {
                headers: { cookie: "groundtruth_session=test-session" },
              }),
            ),
          );
          const list = yield* Schema.decodeUnknownEffect(ManualAlertList)(
            JSON.parse(yield* Effect.promise(() => listed.text())),
          ).pipe(Effect.orDie);
          assert.deepStrictEqual(
            list.items.map(({ id }) => id),
            [alert.id],
          );

          const started = yield* Effect.promise(() =>
            handler(
              new Request(
                `http://localhost:3000/v1/projects/${ownedProject.id}/alerts/${alert.id}/investigation`,
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    cookie: "groundtruth_session=test-session",
                  },
                  body: JSON.stringify({}),
                },
              ),
            ),
          );
          const investigation = yield* Schema.decodeUnknownEffect(IncidentDetail)(
            JSON.parse(yield* Effect.promise(() => started.text())),
          ).pipe(Effect.orDie);
          assert.strictEqual(started.status, 201);
          assert.strictEqual(String(investigation.incident.title), String(alert.title));
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );
});
