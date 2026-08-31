import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AnnotatePanelRequest,
  CreatePanelRequest,
  UpdatePanelRequest,
} from "@groundtruth/api-contract";
import { ResourceConflict } from "@groundtruth/domain";
import { RequestsVsUsersPanel, RetryAmplificationPanel } from "@groundtruth/panel-dsl";
import { Cause, DateTime, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect";
import { BoardService } from "../src/board/BoardService.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { sandboxDashboardId, sandboxProjectId } from "../src/memory/SeedIds.js";

const LiveEventsTest = LiveEventBus.layer;
const BoardTest = Layer.merge(
  LiveEventsTest,
  BoardService.layerMemory.pipe(Layer.provide([LiveEventsTest, NodeCrypto.layer])),
);

describe("BoardService", () => {
  it.effect("starts with the default checkout board", () =>
    Effect.gen(function* () {
      const boards = yield* BoardService;
      const board = yield* boards.getDefaultBoard(sandboxProjectId);

      assert.strictEqual(board.dashboard.id, sandboxDashboardId);
      assert.strictEqual(board.panels.length, 2);
      assert.deepStrictEqual(
        board.panels.map((panel) => panel.spec.title),
        ["Payment request rate", "Checkout latency"],
      );
      assert.deepStrictEqual(
        board.panels.map((panel) => panel.metadata.position),
        [0, 1],
      );
      assert.strictEqual(board.revision, 1);
    }).pipe(Effect.provide(BoardTest)),
  );

  it.effect("applies panel mutations with revisions and contiguous positions", () =>
    Effect.gen(function* () {
      const boards = yield* BoardService;
      const created = yield* boards.createPanel(
        sandboxProjectId,
        new CreatePanelRequest({
          dashboardId: sandboxDashboardId,
          spec: RequestsVsUsersPanel,
          position: 1,
        }),
      );

      assert.strictEqual(created.metadata.position, 1);
      assert.strictEqual(created.metadata.revision, 1);
      const afterCreate = yield* boards.getBoard(sandboxProjectId, sandboxDashboardId);
      assert.strictEqual(afterCreate.revision, 2);
      assert.deepStrictEqual(
        afterCreate.panels.map((panel) => panel.metadata.position),
        [0, 1, 2],
      );

      const updated = yield* boards.updatePanel(
        sandboxProjectId,
        created.metadata.id,
        new UpdatePanelRequest({
          spec: RetryAmplificationPanel,
          position: 0,
          expectedRevision: 1,
        }),
      );
      assert.strictEqual(updated.metadata.position, 0);
      assert.strictEqual(updated.metadata.revision, 2);

      const staleUpdate = yield* Effect.exit(
        boards.updatePanel(
          sandboxProjectId,
          created.metadata.id,
          new UpdatePanelRequest({
            spec: RequestsVsUsersPanel,
            expectedRevision: 1,
          }),
        ),
      );
      assert(Exit.isFailure(staleUpdate));
      assert(
        staleUpdate.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error instanceof ResourceConflict,
        ),
      );

      const at = yield* DateTime.now;
      const annotated = yield* boards.annotatePanel(
        sandboxProjectId,
        created.metadata.id,
        new AnnotatePanelRequest({ at, label: "Retry fix deployed" }),
      );
      assert.strictEqual(annotated.metadata.revision, 3);
      assert.strictEqual(annotated.annotations.length, 1);
      assert.strictEqual(annotated.annotations[0]?._tag, "note");

      yield* boards.removePanel(sandboxProjectId, created.metadata.id);
      const afterRemove = yield* boards.getBoard(sandboxProjectId, sandboxDashboardId);
      assert.strictEqual(afterRemove.revision, 5);
      assert.strictEqual(afterRemove.panels.length, 2);
      assert.deepStrictEqual(
        afterRemove.panels.map((panel) => panel.metadata.position),
        [0, 1],
      );
    }).pipe(Effect.provide(BoardTest)),
  );

  it.effect("publishes panel and board events after a successful mutation", () =>
    Effect.gen(function* () {
      const boards = yield* BoardService;
      const events = yield* LiveEventBus;
      const stream = yield* events.stream(sandboxProjectId, undefined);

      const subscribed = yield* Deferred.make<void>();
      const observedFiber = yield* stream.pipe(
        Stream.tap((event) =>
          event._tag === "ResyncRequired" ? Deferred.succeed(subscribed, undefined) : Effect.void,
        ),
        Stream.filter((event) => event._tag === "PanelChanged" || event._tag === "BoardChanged"),
        Stream.take(2),
        Stream.runCollect,
        Effect.forkScoped,
      );
      yield* Deferred.await(subscribed);

      const created = yield* boards.createPanel(
        sandboxProjectId,
        new CreatePanelRequest({
          dashboardId: sandboxDashboardId,
          spec: RequestsVsUsersPanel,
        }),
      );
      const observed = yield* Fiber.join(observedFiber);

      const panelEvent = observed[0];
      const boardEvent = observed[1];
      assert(panelEvent?._tag === "PanelChanged");
      assert.strictEqual(panelEvent.panelId, created.metadata.id);
      assert.strictEqual(panelEvent.change, "created");
      assert.strictEqual(panelEvent.revision, created.metadata.revision);
      assert(boardEvent?._tag === "BoardChanged");
      assert.strictEqual(boardEvent.dashboardId, sandboxDashboardId);
      assert.strictEqual(boardEvent.revision, 2);
    }).pipe(Effect.provide(BoardTest)),
  );
});
