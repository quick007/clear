import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { RecordDeployEventRequest } from "@groundtruth/api-contract";
import { IncidentTitle, NonEmptyText, ServiceName, Sha } from "@groundtruth/domain";
import { IncidentHistoryLimits } from "@groundtruth/persistence";
import { Effect, Layer, Stream } from "effect";
import { TestClock } from "effect/testing";
import { BoardService } from "../src/board/BoardService.js";
import { DeployService } from "../src/deploys/DeployService.js";
import { IncidentService } from "../src/incidents/IncidentService.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { sandboxProjectId } from "../src/memory/SeedIds.js";

const FoundationTest = Layer.mergeAll(IncidentState.layer, LiveEventBus.layer, NodeCrypto.layer);
const IncidentTest = IncidentService.layer.pipe(Layer.provide(FoundationTest));
const BoardTest = BoardService.layerMemory.pipe(Layer.provide(FoundationTest));
const DeployDependencies = Layer.mergeAll(FoundationTest, BoardTest);
const DeployTest = DeployService.layer.pipe(Layer.provide(DeployDependencies));
const TestLayer = Layer.mergeAll(DeployDependencies, IncidentTest, DeployTest);

describe("DeployService", () => {
  it.effect("records, pages, annotates, and publishes a deployment", () =>
    Effect.gen(function* () {
      const deploys = yield* DeployService;
      const boards = yield* BoardService;
      const incidents = yield* IncidentService;
      const events = yield* LiveEventBus;
      const incident = yield* incidents.openIncident(
        sandboxProjectId,
        IncidentTitle.make("Checkout retry amplification"),
      );
      const stream = yield* events.stream(sandboxProjectId, undefined);

      const deploy = yield* deploys.record(
        sandboxProjectId,
        new RecordDeployEventRequest({
          service: ServiceName.make("checkout-api"),
          sha: Sha.make("abc1234def567"),
          description: "Bound retries with backoff and jitter",
        }),
      );

      const page = yield* deploys.list(sandboxProjectId, {
        service: ServiceName.make("checkout-api"),
        limit: 1,
      });
      assert.strictEqual(page.events.length, 1);
      assert.strictEqual(page.events[0]?.id, deploy.id);

      const detail = yield* incidents.getDetail(sandboxProjectId, incident.incident.id);
      const annotation = detail.timeline.at(-1);
      assert(annotation?._tag === "deploy");
      assert.strictEqual(annotation.deployEventId, deploy.id);

      const board = yield* boards.getDefaultBoard(sandboxProjectId);
      assert(
        board.panels.every((panel) =>
          panel.annotations.some(
            (item) => item._tag === "deploy" && item.deployEventId === deploy.id,
          ),
        ),
      );

      const published = yield* stream.pipe(
        Stream.filter(
          (event) => event._tag === "DeployRecorded" || event._tag === "TimelineEntryAdded",
        ),
        Stream.take(2),
        Stream.runCollect,
      );
      assert.deepStrictEqual(
        Array.from(published, (event) => event._tag),
        ["DeployRecorded", "TimelineEntryAdded"],
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("uses stable keyset cursors for deploy pages", () =>
    Effect.gen(function* () {
      const deploys = yield* DeployService;
      const first = yield* deploys.record(
        sandboxProjectId,
        new RecordDeployEventRequest({
          service: ServiceName.make("checkout-api"),
          sha: Sha.make("1111111aaaaa"),
        }),
      );
      yield* TestClock.adjust("1 second");
      const second = yield* deploys.record(
        sandboxProjectId,
        new RecordDeployEventRequest({
          service: ServiceName.make("checkout-api"),
          sha: Sha.make("2222222bbbbb"),
        }),
      );

      const firstPage = yield* deploys.list(sandboxProjectId, { limit: 1 });
      assert.deepStrictEqual(
        firstPage.events.map(({ id }) => id),
        [second.id],
      );
      assert(firstPage.nextCursor !== null);

      const secondPage = yield* deploys.list(sandboxProjectId, {
        limit: 1,
        cursor: firstPage.nextCursor,
      });
      assert.deepStrictEqual(
        secondPage.events.map(({ id }) => id),
        [first.id],
      );
      assert.strictEqual(secondPage.hasMore, false);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("keeps the final timeline slot available when recording a deploy", () =>
    Effect.gen(function* () {
      const deploys = yield* DeployService;
      const incidents = yield* IncidentService;
      const incident = yield* incidents.openIncident(
        sandboxProjectId,
        IncidentTitle.make("Deploy timeline boundary"),
      );
      yield* Effect.forEach(
        Array.from(
          { length: IncidentHistoryLimits.timelineEntriesBeforeClose },
          (_, index) => index,
        ),
        (index) =>
          incidents.addNote(
            sandboxProjectId,
            incident.incident.id,
            NonEmptyText.make(`Deploy boundary note ${index + 1}`),
          ),
        { discard: true },
      );

      const deploy = yield* deploys.record(
        sandboxProjectId,
        new RecordDeployEventRequest({
          service: ServiceName.make("checkout-api"),
          sha: Sha.make("3333333ccccc"),
        }),
      );
      const page = yield* deploys.list(sandboxProjectId, { limit: 1 });
      assert.strictEqual(page.events[0]?.id, deploy.id);
      const beforeClose = yield* incidents.getDetail(sandboxProjectId, incident.incident.id);
      assert.strictEqual(
        beforeClose.timeline.length,
        IncidentHistoryLimits.timelineEntriesBeforeClose,
      );

      const closed = yield* incidents.close(
        sandboxProjectId,
        incident.incident.id,
        NonEmptyText.make("Closed after the deploy projection was skipped"),
      );
      assert.strictEqual(closed.timeline.length, IncidentHistoryLimits.timelineEntries);
    }).pipe(Effect.provide(TestLayer)),
  );
});
