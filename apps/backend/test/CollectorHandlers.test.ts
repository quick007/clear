import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  CollectorApi,
  CollectorServiceAccess,
  type OtlpMetricsRequest,
} from "@groundtruth/api-contract";
import { ProjectId, QuotaExceeded } from "@groundtruth/domain";
import type { SignalActivity } from "@groundtruth/telemetry";
import { Effect, Layer, Ref } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi";
import { CollectorHandlers } from "../src/http/CollectorHandlers.js";
import { IngestKeyService } from "../src/ingest/IngestKeyService.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { CollectorIngestService } from "../src/telemetry/CollectorIngestService.js";

class CollectorTestApi extends HttpApi.make("groundtruth").add(CollectorApi) {}

const projectId = ProjectId.make("0198ec10-1a76-7000-8000-000000000099");
const ingestKey = "ingest-key-000000";
const notUsed = () => Effect.die("Unexpected collector test operation");

const CollectorAccessTest = Layer.succeed(
  CollectorServiceAccess,
  CollectorServiceAccess.of({
    groundtruthCollectorService: (httpEffect) => httpEffect,
  }),
);

const IngestKeysTest = Layer.succeed(
  IngestKeyService,
  IngestKeyService.of({
    create: notUsed,
    list: notUsed,
    isAuthorizedProject: notUsed,
    revoke: notUsed,
    verify: (key) =>
      key === ingestKey ? Effect.succeed(projectId) : Effect.die("Unexpected collector ingest key"),
  }),
);

const collectorRoutes = (observedWireBytes: Ref.Ref<number | null>) => {
  const failAfterObservingBytes = (wireBytes: number) =>
    Ref.set(observedWireBytes, wireBytes).pipe(
      Effect.andThen(
        new QuotaExceeded({
          quota: "ingest-bytes-per-minute",
          limit: 10,
          observed: wireBytes,
          message: "Project ingest byte quota exceeded",
        }),
      ),
    );
  const failWithQuota = (_projectId: ProjectId, _request: OtlpMetricsRequest, wireBytes: number) =>
    failAfterObservingBytes(wireBytes);
  const failActivityWithQuota = (
    _projectId: ProjectId,
    _activities: ReadonlyArray<SignalActivity>,
    wireBytes: number,
  ) => failAfterObservingBytes(wireBytes);
  const CollectorTest = Layer.succeed(
    CollectorIngestService,
    CollectorIngestService.of({
      enqueueMetrics: failWithQuota,
      enqueueLogs: notUsed,
      enqueueTraces: notUsed,
      recordActivity: failActivityWithQuota,
    }),
  );
  const Services = Layer.mergeAll(
    CollectorTest,
    IngestKeysTest,
    LiveEventBus.layer,
    CollectorAccessTest,
  );
  const Handlers = CollectorHandlers.pipe(Layer.provide(Services));
  return HttpApiBuilder.layer(CollectorTestApi).pipe(
    Layer.provide(Handlers),
    Layer.provide(Services),
    Layer.provide(NodeHttpServer.layerHttpServices),
  );
};

describe("CollectorHandlers", () => {
  it.effect("counts the decoded request bytes and returns quota failures as typed 429s", () =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const observedWireBytes = yield* Ref.make<number | null>(null);
        const routes = collectorRoutes(observedWireBytes);
        const web = HttpRouter.toWebHandler(routes, { disableLogger: true });
        return { ...web, observedWireBytes };
      }),
      ({ handler, observedWireBytes }) =>
        Effect.gen(function* () {
          const body = '{\n  "resourceMetrics": []\n}';
          const response = yield* Effect.promise(() =>
            handler(
              new Request("https://api.clear.seufert.sh/internal/v1/telemetry/metrics", {
                method: "POST",
                headers: {
                  authorization: "Bearer collector-secret",
                  "content-type": "application/json",
                  "x-groundtruth-ingest-key": ingestKey,
                  "x-groundtruth-project-id": projectId,
                },
                body,
              }),
            ),
          );
          const responseBody = yield* Effect.promise(() => response.text());

          assert.strictEqual(response.status, 429, responseBody);
          const payload: unknown = JSON.parse(responseBody);
          assert.deepStrictEqual(payload, {
            _tag: "QuotaExceeded",
            quota: "ingest-bytes-per-minute",
            limit: 10,
            observed: new TextEncoder().encode(body).byteLength,
            message: "Project ingest byte quota exceeded",
          });
          assert.strictEqual(
            yield* Ref.get(observedWireBytes),
            new TextEncoder().encode(body).byteLength,
          );
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );

  it.effect("applies the same byte quota to activity hints", () =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const observedWireBytes = yield* Ref.make<number | null>(null);
        const routes = collectorRoutes(observedWireBytes);
        const web = HttpRouter.toWebHandler(routes, { disableLogger: true });
        return { ...web, observedWireBytes };
      }),
      ({ handler, observedWireBytes }) =>
        Effect.gen(function* () {
          const body = JSON.stringify({
            activities: [
              {
                signal: "metrics",
                services: ["checkout-api"],
                itemCount: 1,
                observedAt: "2026-08-28T08:00:00.000Z",
              },
            ],
            droppedNotifications: 0,
          });
          const response = yield* Effect.promise(() =>
            handler(
              new Request("https://api.clear.seufert.sh/internal/v1/telemetry/activity", {
                method: "POST",
                headers: {
                  authorization: "Bearer collector-secret",
                  "content-type": "application/json",
                  "x-groundtruth-ingest-key": ingestKey,
                  "x-groundtruth-project-id": projectId,
                },
                body,
              }),
            ),
          );
          const responseBody = yield* Effect.promise(() => response.text());
          const wireBytes = new TextEncoder().encode(body).byteLength;

          assert.strictEqual(response.status, 429, responseBody);
          assert.deepStrictEqual(JSON.parse(responseBody), {
            _tag: "QuotaExceeded",
            quota: "ingest-bytes-per-minute",
            limit: 10,
            observed: wireBytes,
            message: "Project ingest byte quota exceeded",
          });
          assert.strictEqual(yield* Ref.get(observedWireBytes), wireBytes);
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  );
});
