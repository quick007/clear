import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  EmailAddress,
  HostedSubject,
  ProjectName,
  ProjectSlug,
  QuotaExceeded,
} from "@groundtruth/domain";
import { AccountRepository, ProjectRepository, type ProjectQuotas } from "@groundtruth/persistence";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import { CanonicalTelemetryBatch } from "@groundtruth/telemetry";
import { Effect, Exit, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import { CollectorQuotaService } from "../src/telemetry/CollectorQuotaService.js";

const QuotaFoundation = Layer.merge(PersistenceMemory, NodeCrypto.layer);
const QuotaTest = Layer.merge(
  QuotaFoundation,
  CollectorQuotaService.layer.pipe(Layer.provide(QuotaFoundation)),
);

const defaultQuotas: ProjectQuotas = {
  maxIngestBytesPerMinute: 1_000,
  maxActiveSeries: 10,
  maxPanels: 12,
};

const createProject = Effect.fn("CollectorQuotaServiceTest.createProject")(function* (
  suffix: string,
  quotas: ProjectQuotas = defaultQuotas,
) {
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make(`quota-${suffix}@example.com`),
    email: EmailAddress.make(`quota-${suffix}@example.com`),
    displayName: null,
  });
  return yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make(`quota-${suffix}`),
    name: ProjectName.make(`Quota ${suffix}`),
    mode: "hosted",
    retentionDays: 14,
    quotas,
  });
});

const decodeBatch = Schema.decodeUnknownSync(CanonicalTelemetryBatch);
const batch = (...attributes: ReadonlyArray<Readonly<Record<string, string | number>>>) =>
  decodeBatch({
    id: "550e8400-e29b-41d4-a716-446655440000",
    receivedAt: "2026-08-28T08:00:00.000Z",
    metrics: attributes.map((pointAttributes) => ({
      _tag: "gauge",
      name: "http.server.requests",
      description: "Completed requests",
      unit: "{request}",
      metadata: {},
      resource: {
        attributes: { "service.name": "checkout-api" },
        droppedAttributesCount: "0",
        entityRefs: [],
        schemaUrl: null,
      },
      scope: {
        name: "groundtruth.test",
        version: "1.0.0",
        attributes: {},
        droppedAttributesCount: "0",
        schemaUrl: null,
      },
      serviceName: "checkout-api",
      startTimeUnixNano: null,
      timeUnixNano: "1787884800000000000",
      attributes: pointAttributes,
      exemplars: [],
      flags: 0,
      value: { _tag: "int", value: "1" },
    })),
    logs: [],
    spans: [],
  });

const emptyBatch = batch();

const quotaFailure = <A, E>(exit: Exit.Exit<A, E>) => {
  assert(Exit.isFailure(exit));
  const failures = Array.from(exit.cause.reasons).filter(
    (reason) => reason._tag === "Fail" && reason.error instanceof QuotaExceeded,
  );
  assert.strictEqual(failures.length, 1);
  const failure = failures[0];
  assert(failure?._tag === "Fail");
  assert(failure.error instanceof QuotaExceeded);
  return failure.error;
};

describe("CollectorQuotaService", () => {
  it.effect("atomically isolates concurrent project byte windows", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
      const quota = yield* CollectorQuotaService;
      const first = yield* createProject("concurrent-a", {
        ...defaultQuotas,
        maxIngestBytesPerMinute: 100,
      });
      const second = yield* createProject("concurrent-b", {
        ...defaultQuotas,
        maxIngestBytesPerMinute: 100,
      });

      const attempt = (projectId: typeof first.id) =>
        Effect.forEach(
          Array.from({ length: 10 }),
          () => Effect.exit(quota.admitRequest(projectId, 20)),
          { concurrency: "unbounded" },
        );
      const [firstResults, secondResults] = yield* Effect.all(
        [attempt(first.id), attempt(second.id)],
        { concurrency: "unbounded" },
      );

      assert.strictEqual(firstResults.filter(Exit.isSuccess).length, 5);
      assert.strictEqual(secondResults.filter(Exit.isSuccess).length, 5);
      for (const exit of [...firstResults, ...secondResults].filter(Exit.isFailure)) {
        assert.strictEqual(quotaFailure(exit).quota, "ingest-bytes-per-minute");
      }
    }).pipe(Effect.provide(QuotaTest)),
  );

  it.effect("resets request and byte admission at the fixed minute boundary", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
      const quota = yield* CollectorQuotaService;
      const project = yield* createProject("reset", {
        ...defaultQuotas,
        maxIngestBytesPerMinute: 100,
      });

      yield* quota.admitRequest(project.id, 100);
      const rejected = yield* Effect.exit(quota.admitRequest(project.id, 1));
      assert.strictEqual(quotaFailure(rejected).quota, "ingest-bytes-per-minute");

      yield* TestClock.adjust("1 minute");
      yield* quota.admitRequest(project.id, 100);
    }).pipe(Effect.provide(QuotaTest)),
  );

  it.effect("enforces the per-project request ceiling", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
      const quota = yield* CollectorQuotaService;
      const project = yield* createProject("requests");

      yield* Effect.forEach(Array.from({ length: 300 }), () => quota.admitRequest(project.id, 0), {
        discard: true,
      });
      const rejected = yield* Effect.exit(quota.admitRequest(project.id, 0));
      const error = quotaFailure(rejected);
      assert.strictEqual(error.quota, "ingest-requests-per-minute");
      assert.strictEqual(error.limit, 300);
    }).pipe(Effect.provide(QuotaTest)),
  );

  it.effect("enforces a global byte ceiling across otherwise valid projects", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
      const quota = yield* CollectorQuotaService;
      const projects = yield* Effect.forEach(
        ["global-a", "global-b", "global-c", "global-d"],
        (suffix) =>
          createProject(suffix, {
            ...defaultQuotas,
            maxIngestBytesPerMinute: 10_000_000,
          }),
      );

      for (const project of projects) {
        yield* quota.admitRequest(project.id, 5_000_000);
      }
      const rejected = yield* Effect.exit(quota.admitRequest(projects[0]!.id, 1));
      const error = quotaFailure(rejected);
      assert.strictEqual(error.quota, "global-ingest-bytes-per-minute");
      assert.strictEqual(error.limit, 20_000_000);

      yield* TestClock.adjust("1 minute");
      yield* quota.admitRequest(projects[0]!.id, 1);
    }).pipe(Effect.provide(QuotaTest)),
  );

  it.effect("bounds active series, rolls back rejected candidates, and expires old series", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
      const quota = yield* CollectorQuotaService;
      const project = yield* createProject("series", {
        ...defaultQuotas,
        maxActiveSeries: 2,
      });

      const reserve = () => quota.admitRequest(project.id, 1);
      yield* quota.admitSeries(yield* reserve(), batch({ route: "/a", status: 200 }));
      const rejected = yield* Effect.exit(
        quota.admitSeries(yield* reserve(), batch({ route: "/b" }, { route: "/c" })),
      );
      assert.strictEqual(quotaFailure(rejected).quota, "active-series");

      yield* quota.admitSeries(yield* reserve(), batch({ route: "/d" }));
      const full = yield* Effect.exit(quota.admitSeries(yield* reserve(), batch({ route: "/c" })));
      assert.strictEqual(quotaFailure(full).observed, 3);

      yield* TestClock.adjust("5 minutes");
      yield* quota.admitSeries(yield* reserve(), batch({ route: "/c" }));
      yield* quota.admitSeries(yield* reserve(), emptyBatch);
    }).pipe(Effect.provide(QuotaTest)),
  );

  it.effect("globally prunes idle projects and expired fixed-width series identities", () =>
    Effect.gen(function* () {
      const startedAt = Date.parse("2026-08-28T08:00:00.000Z");
      yield* TestClock.setTime(startedAt);
      const quota = yield* CollectorQuotaService;
      const project = yield* createProject("prune");
      const reservation = yield* quota.admitRequest(project.id, 10);
      yield* quota.admitSeries(reservation, batch({ route: "/checkout" }));

      yield* TestClock.setTime(startedAt + 6 * 60 * 1_000);
      const pruned = yield* quota.pruneStale();
      assert.deepStrictEqual(pruned, { projectsRemoved: 1, seriesRemoved: 1 });
      assert.deepStrictEqual(yield* quota.pruneStale(), {
        projectsRemoved: 0,
        seriesRemoved: 0,
      });
    }).pipe(Effect.provide(QuotaTest)),
  );
});
