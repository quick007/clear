import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { PublicStatusApi, PublicStatusResponse } from "@groundtruth/api-contract";
import { EmailAddress, HostedSubject, ProjectName, ProjectSlug } from "@groundtruth/domain";
import {
  AccountRepository,
  hostedProjectQuotas,
  hostedRawRetentionDays,
  PersistenceError,
  ProjectRepository,
} from "@groundtruth/persistence";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import {
  MetricNotFound,
  MetricQueryResult,
  MetricQueryStats,
  MetricSeries,
  MetricSeriesPoint,
  ServiceName,
  SignalHealth,
  TelemetryUnavailable,
} from "@groundtruth/telemetry";
import { Context, DateTime, Effect, Layer, Redacted, Ref, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi";
import { BackendConfig } from "../src/config/BackendConfig.js";
import { PublicStatusHandlers } from "../src/http/PublicStatusHandlers.js";
import { TelemetryStore } from "../src/telemetry/TelemetryStore.js";

class PublicStatusTestApi extends HttpApi.make("groundtruth").add(PublicStatusApi) {}

interface HarnessOptions {
  readonly enabled?: boolean;
  readonly accountFailure?: PersistenceError;
  readonly metricNotFound?: boolean;
  readonly metricUnavailable?: boolean;
}

const fixedNow = DateTime.fromDateUnsafe(new Date("2026-08-30T12:00:00.000Z"));

const configLayer = (enabled: boolean) =>
  Layer.succeed(
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
      cookieSecure: false,
      bootstrapProjectSlug: "status-project",
      bootstrapProjectName: "Status project",
      bootstrapIngestKey: undefined,
      publicStatusEnabled: enabled,
      sandboxSessionLimit: 100,
      sandboxCreationsPerMinute: 10,
      authenticatedRequestsPerMinute: 300,
      publicRequestsPerMinute: 10_000,
    }),
  );

const metricResult = (query: Parameters<TelemetryStore["Service"]["queryMetrics"]>[1]) =>
  new MetricQueryResult({
    query,
    series: [
      new MetricSeries({
        label: "clear-api-internal-label",
        attributes: {
          "service.name": "clear-api",
          "deployment.secret": "must-not-leak",
        },
        points: Array.from(
          { length: 70 },
          (_, index) =>
            new MetricSeriesPoint({
              at: DateTime.addDuration(fixedNow, `${index} seconds`),
              value: index,
            }),
        ),
      }),
      new MetricSeries({
        label: "private-service",
        attributes: { "service.name": "private-worker" },
        points: [new MetricSeriesPoint({ at: fixedNow, value: 9_999 })],
      }),
    ],
    stats: new MetricQueryStats({
      minimum: 0,
      maximum: 69,
      average: 34.5,
      sum: 2_415,
      count: 70,
      last: 69,
    }),
    pointCount: 71,
    partial: false,
    hint: "internal query hint",
  });

const makeHarness = (options: HarnessOptions = {}) =>
  Effect.gen(function* () {
    const persistence = yield* Layer.build(PersistenceMemory);
    const storedAccounts = Context.get(persistence, AccountRepository);
    const storedProjects = Context.get(persistence, ProjectRepository);
    const account = yield* storedAccounts.upsertHosted({
      hostedSubject: HostedSubject.make("bootstrap@local.groundtruth"),
      email: EmailAddress.make("private-owner@example.com"),
      displayName: null,
    });
    const createdProject = yield* storedProjects.create({
      ownerId: account.id,
      slug: ProjectSlug.make("status-project"),
      name: ProjectName.make("Status project"),
      mode: "hosted",
      retentionDays: hostedRawRetentionDays,
      quotas: hostedProjectQuotas,
    });
    const subjects = yield* Ref.make<ReadonlyArray<string>>([]);
    const projectLookups = yield* Ref.make<ReadonlyArray<readonly [string, string]>>([]);
    const telemetryProjects = yield* Ref.make<ReadonlyArray<string>>([]);
    const queries = yield* Ref.make<
      ReadonlyArray<Parameters<TelemetryStore["Service"]["queryMetrics"]>[1]>
    >([]);
    const healthCalls = yield* Ref.make(0);
    const memoryTelemetry = Context.get(
      yield* Layer.build(TelemetryStore.layerMemory),
      TelemetryStore,
    );

    const accounts = AccountRepository.of({
      ...storedAccounts,
      findByHostedSubject: (subject) =>
        Ref.update(subjects, (seen) => [...seen, String(subject)]).pipe(
          Effect.andThen(
            options.accountFailure === undefined
              ? storedAccounts.findByHostedSubject(subject)
              : Effect.fail(options.accountFailure),
          ),
        ),
    });
    const projects = ProjectRepository.of({
      ...storedProjects,
      findBySlug: (ownerId, slug) =>
        Ref.update(projectLookups, (seen) => [
          ...seen,
          [String(ownerId), String(slug)] as const,
        ]).pipe(Effect.andThen(storedProjects.findBySlug(ownerId, slug))),
    });
    const telemetry = TelemetryStore.of({
      ...memoryTelemetry,
      signalHealth: (projectId) =>
        Ref.update(healthCalls, (count) => count + 1).pipe(
          Effect.andThen(Ref.update(telemetryProjects, (seen) => [...seen, String(projectId)])),
          Effect.andThen(
            Effect.succeed([
              new SignalHealth({
                signal: "metrics",
                status: "healthy",
                firstSeenAt: fixedNow,
                lastSeenAt: fixedNow,
                services: [ServiceName.make("clear-api")],
              }),
              new SignalHealth({
                signal: "logs",
                status: "healthy",
                firstSeenAt: fixedNow,
                lastSeenAt: fixedNow,
                services: [ServiceName.make("clear-api")],
              }),
              new SignalHealth({
                signal: "traces",
                status: "healthy",
                firstSeenAt: fixedNow,
                lastSeenAt: fixedNow,
                services: [ServiceName.make("clear-api")],
              }),
            ]),
          ),
        ),
      queryMetrics: (projectId, query) =>
        Effect.gen(function* () {
          yield* Ref.update(telemetryProjects, (seen) => [...seen, String(projectId)]);
          yield* Ref.update(queries, (seen) => [...seen, query]);
          if (options.metricNotFound === true) {
            return yield* new MetricNotFound({
              metric: String(query.metric),
              message: "Private metric lookup failed",
            });
          }
          if (options.metricUnavailable === true) {
            return yield* new TelemetryUnavailable({
              operation: "private ClickHouse query",
              retryable: true,
              message: "Private ClickHouse host and query failed",
            });
          }
          return metricResult(query);
        }),
    });
    const dependencies = Layer.mergeAll(
      configLayer(options.enabled ?? true),
      Layer.succeed(AccountRepository, accounts),
      Layer.succeed(ProjectRepository, projects),
      Layer.succeed(TelemetryStore, telemetry),
    );
    const handlers = PublicStatusHandlers.pipe(Layer.provide(dependencies));
    const app = HttpApiBuilder.layer(PublicStatusTestApi).pipe(
      Layer.provide(handlers),
      Layer.provide(dependencies),
      Layer.provide(NodeHttpServer.layerHttpServices),
    );

    return {
      ...HttpRouter.toWebHandler(app, { disableLogger: true }),
      subjects,
      projectLookups,
      telemetryProjects,
      queries,
      healthCalls,
      account,
      project: createdProject,
    };
  });

const getStatus = (handler: (request: Request) => Promise<Response>) =>
  Effect.promise(() => handler(new Request("http://localhost:3000/v1/public/status")));

describe("public status handler", () => {
  it.effect(
    "fails closed without resolving the bootstrap project when publishing is disabled",
    () =>
      Effect.acquireUseRelease(
        makeHarness({ enabled: false }),
        ({ handler, subjects }) =>
          Effect.gen(function* () {
            const response = yield* getStatus(handler);
            assert.strictEqual(response.status, 503);
            assert.deepStrictEqual(yield* Ref.get(subjects), []);
            const body = JSON.stringify(yield* Effect.promise(() => response.json()));
            assert.match(body, /Public status is temporarily unavailable/);
            assert.strictEqual(/private-owner|status-project|bootstrap@local/.test(body), false);
          }),
        ({ dispose }) => Effect.promise(dispose),
      ),
  );

  it.effect("publishes only the fixed, redacted projection with bounded queries", () =>
    Effect.acquireUseRelease(
      makeHarness(),
      ({ handler, subjects, projectLookups, telemetryProjects, queries, account, project }) =>
        Effect.gen(function* () {
          const response = yield* getStatus(handler);
          assert.strictEqual(response.status, 200);
          const unknown = yield* Effect.promise(() => response.json());
          const status = yield* Schema.decodeUnknownEffect(PublicStatusResponse)(unknown);

          assert.deepStrictEqual(yield* Ref.get(subjects), ["bootstrap@local.groundtruth"]);
          assert.deepStrictEqual(yield* Ref.get(projectLookups), [
            [String(account.id), "status-project"],
          ]);
          assert.deepStrictEqual(yield* Ref.get(telemetryProjects), [
            String(project.id),
            String(project.id),
            String(project.id),
          ]);

          const captured = yield* Ref.get(queries);
          assert.strictEqual(captured.length, 2);
          const byMetric = new Map(captured.map((query) => [String(query.metric), query]));
          const requestRate = byMetric.get("http.server.requests");
          const latency = byMetric.get("http.server.duration");
          assert(requestRate !== undefined);
          assert(latency !== undefined);
          assert.strictEqual(requestRate.aggregation, "rate");
          assert.strictEqual(latency.aggregation, "p95");
          for (const query of captured) {
            assert.strictEqual(query.range._tag, "relative");
            if (query.range._tag === "relative") assert.strictEqual(query.range.window, "15m");
            assert.strictEqual(query.step, "10s");
            assert.deepStrictEqual((query.groupBy ?? []).map(String), ["service.name"]);
            assert.strictEqual(query.maxSeries, 4);
            assert.strictEqual(query.maxPoints, 64);
          }

          assert.strictEqual(status.schemaVersion, 1);
          assert.deepStrictEqual(
            status.components.map(({ key }) => key),
            ["api", "telemetry", "storage"],
          );
          assert.deepStrictEqual(
            status.metrics.map(({ key }) => key),
            ["request-rate", "p95-latency"],
          );
          for (const metric of status.metrics) {
            assert.deepStrictEqual(
              metric.series.map(({ label }) => label),
              ["Clear API"],
            );
            assert.strictEqual(metric.series[0]?.points.length, 64);
          }

          const encoded = JSON.stringify(unknown);
          assert.strictEqual(/private-owner|must-not-leak|private-worker/.test(encoded), false);
          assert.strictEqual(
            /status-project|bootstrap@local|deployment\.secret/.test(encoded),
            false,
          );
          assert.strictEqual(/internal query hint|clear-api-internal-label/.test(encoded), false);
          assert.strictEqual(new RegExp(String(project.id)).test(encoded), false);
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("turns missing metrics into bounded not-observed cards", () =>
    Effect.acquireUseRelease(
      makeHarness({ metricNotFound: true }),
      ({ handler }) =>
        Effect.gen(function* () {
          const response = yield* getStatus(handler);
          assert.strictEqual(response.status, 200);
          const status = yield* Schema.decodeUnknownEffect(PublicStatusResponse)(
            yield* Effect.promise(() => response.json()),
          );
          assert.deepStrictEqual(
            status.metrics.map(({ status: metricStatus, series }) => [metricStatus, series.length]),
            [
              ["not-observed", 0],
              ["not-observed", 0],
            ],
          );
          assert.strictEqual(
            status.components.find(({ key }) => key === "storage")?.status,
            "operational",
          );
          assert.strictEqual(status.status, "operational");
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("degrades storage without exposing telemetry query failures", () =>
    Effect.acquireUseRelease(
      makeHarness({ metricUnavailable: true }),
      ({ handler }) =>
        Effect.gen(function* () {
          const response = yield* getStatus(handler);
          assert.strictEqual(response.status, 200);
          const unknown = yield* Effect.promise(() => response.json());
          const status = yield* Schema.decodeUnknownEffect(PublicStatusResponse)(unknown);
          assert.strictEqual(status.status, "degraded");
          assert.strictEqual(
            status.components.find(({ key }) => key === "storage")?.status,
            "degraded",
          );
          assert.deepStrictEqual(
            status.metrics.map(({ status: metricStatus }) => metricStatus),
            ["not-observed", "not-observed"],
          );
          const encoded = JSON.stringify(unknown);
          assert.strictEqual(/private ClickHouse|host and query failed/.test(encoded), false);
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("maps repository failures to one generic unavailable response", () =>
    Effect.acquireUseRelease(
      makeHarness({
        accountFailure: new PersistenceError({
          store: "postgres",
          operation: "find bootstrap account with private SQL",
          correlationId: "private-correlation-id",
          message: "password=private-database-password",
          retryable: true,
        }),
      }),
      ({ handler }) =>
        Effect.gen(function* () {
          const response = yield* getStatus(handler);
          assert.strictEqual(response.status, 503);
          const body = JSON.stringify(yield* Effect.promise(() => response.json()));
          assert.match(body, /Public status is temporarily unavailable/);
          assert.strictEqual(
            /private SQL|private-correlation-id|private-database-password/.test(body),
            false,
          );
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("coalesces repeated requests within the five-second cache window", () =>
    Effect.acquireUseRelease(
      makeHarness(),
      ({ handler, healthCalls, queries }) =>
        Effect.gen(function* () {
          const [first, second, third] = yield* Effect.all(
            [getStatus(handler), getStatus(handler), getStatus(handler)],
            { concurrency: "unbounded" },
          );
          assert.deepStrictEqual([first.status, second.status, third.status], [200, 200, 200]);
          const bodies = yield* Effect.all(
            [first, second, third].map((response) => Effect.promise(() => response.text())),
          );
          assert.strictEqual(new Set(bodies).size, 1);
          assert.strictEqual(yield* Ref.get(healthCalls), 1);
          assert.strictEqual((yield* Ref.get(queries)).length, 2);
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );
});
