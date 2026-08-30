import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AnnotatePanelRequest,
  CreatePanelRequest,
  UpdatePanelRequest,
} from "@groundtruth/api-contract";
import {
  DeployEvent,
  DeployEventId,
  EmailAddress,
  HostedSubject,
  ProjectName,
  ProjectSlug,
  ServiceName,
  SessionId,
  Sha,
} from "@groundtruth/domain";
import {
  AccountRepository,
  DashboardRepository,
  ProjectRepository,
} from "@groundtruth/persistence";
import { PersistenceMemory, RepositoriesMemoryControl } from "@groundtruth/persistence/testing";
import { RequestsVsUsersPanel, RetryAmplificationPanel } from "@groundtruth/panel-dsl";
import { Context, Crypto, DateTime, Deferred, Effect, Fiber, Layer, Stream } from "effect";
import { TestClock } from "effect/testing";
import { BoardService } from "../src/board/BoardService.js";
import { BoardServiceLive } from "../src/board/BoardServiceLive.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { sandboxProjectIdForSession } from "../src/memory/SeedIds.js";

const FoundationTest = Layer.mergeAll(PersistenceMemory, LiveEventBus.layer, NodeCrypto.layer);
const BoardTest = Layer.merge(FoundationTest, BoardServiceLive.pipe(Layer.provide(FoundationTest)));

const createHostedProject = Effect.gen(function* () {
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("board-operator@example.com"),
    email: EmailAddress.make("board-operator@example.com"),
    displayName: null,
  });
  return yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make("board-checkout"),
    name: ProjectName.make("Board checkout"),
    mode: "hosted",
    retentionDays: 14,
    quotas: {
      maxIngestBytesPerMinute: 10_000_000,
      maxActiveSeries: 10_000,
      maxPanels: 12,
    },
  });
});

const rebuildBoardService = Effect.gen(function* () {
  const repository = yield* DashboardRepository;
  const events = yield* LiveEventBus;
  const crypto = yield* Crypto.Crypto;
  const context = yield* Layer.build(
    Layer.fresh(BoardServiceLive).pipe(
      Layer.provide([
        Layer.succeed(DashboardRepository, repository),
        Layer.succeed(LiveEventBus, events),
        Layer.succeed(Crypto.Crypto, crypto),
      ]),
    ),
  );
  return Context.get(context, BoardService);
});

describe("BoardServiceLive", () => {
  it.effect("persists hosted board mutations and reconstructs them after a layer rebuild", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
        const boards = yield* BoardService;
        const project = yield* createHostedProject;
        const defaultBoard = yield* boards.getDefaultBoard(project.id);

        const created = yield* boards.createPanel(
          project.id,
          new CreatePanelRequest({
            dashboardId: defaultBoard.dashboard.id,
            spec: RequestsVsUsersPanel,
          }),
        );
        const updated = yield* boards.updatePanel(
          project.id,
          created.metadata.id,
          new UpdatePanelRequest({
            spec: RetryAmplificationPanel,
            expectedRevision: created.metadata.revision,
          }),
        );
        const annotatedAt = yield* DateTime.now;
        yield* boards.annotatePanel(
          project.id,
          created.metadata.id,
          new AnnotatePanelRequest({ at: annotatedAt, label: "Retry pressure confirmed" }),
        );
        yield* boards.annotateDeploy(
          project.id,
          new DeployEvent({
            id: DeployEventId.make("01993f71-0001-7000-8000-000000000071"),
            projectId: project.id,
            serviceName: ServiceName.make("checkout-api"),
            sha: Sha.make("1234567"),
            description: null,
            url: null,
            deployedAt: annotatedAt,
            receivedAt: annotatedAt,
          }),
        );
        const removed = yield* boards.createPanel(
          project.id,
          new CreatePanelRequest({
            dashboardId: defaultBoard.dashboard.id,
            spec: RequestsVsUsersPanel,
          }),
        );
        yield* boards.removePanel(project.id, removed.metadata.id);

        const restarted = yield* rebuildBoardService;
        assert.notStrictEqual(restarted, boards);
        const restored = yield* restarted.getBoard(project.id, defaultBoard.dashboard.id);
        const panel = restored.panels.find(({ metadata }) => metadata.id === created.metadata.id);

        assert(panel !== undefined);
        assert.strictEqual(panel.spec.title, RetryAmplificationPanel.title);
        assert.strictEqual(panel.metadata.revision, updated.metadata.revision + 2);
        assert.deepStrictEqual(
          panel.annotations.map(({ _tag }) => _tag),
          ["note", "deploy"],
        );
        assert.strictEqual(panel.annotations[1]?._tag, "deploy");
        assert.strictEqual(
          restored.panels.some(({ metadata }) => metadata.id === removed.metadata.id),
          false,
        );
      }).pipe(Effect.provide(BoardTest)),
    ),
  );

  it.effect("keeps sandbox boards out of persistence", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const boards = yield* BoardService;
        const persisted = yield* RepositoriesMemoryControl;
        const sandboxProjectId = sandboxProjectIdForSession(
          SessionId.make("01993f71-0001-7000-8000-000000000072"),
        );
        const sandboxBoard = yield* boards.ensureSandboxBoard(sandboxProjectId);
        yield* boards.createPanel(
          sandboxProjectId,
          new CreatePanelRequest({
            dashboardId: sandboxBoard.dashboard.id,
            spec: RequestsVsUsersPanel,
          }),
        );

        assert.strictEqual(
          (yield* persisted.snapshot).dashboards.some(
            ({ metadata }) => metadata.projectId === sandboxProjectId,
          ),
          false,
        );
      }).pipe(Effect.provide(BoardTest)),
    ),
  );

  it.effect("publishes panel and aggregate board revisions for hosted boards", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const boards = yield* BoardService;
        const events = yield* LiveEventBus;
        const project = yield* createHostedProject;
        const board = yield* boards.getDefaultBoard(project.id);
        const first = yield* boards.createPanel(
          project.id,
          new CreatePanelRequest({
            dashboardId: board.dashboard.id,
            spec: RequestsVsUsersPanel,
          }),
        );
        const second = yield* boards.createPanel(
          project.id,
          new CreatePanelRequest({
            dashboardId: board.dashboard.id,
            spec: RetryAmplificationPanel,
          }),
        );
        const at = yield* DateTime.now;
        yield* boards.annotatePanel(
          project.id,
          second.metadata.id,
          new AnnotatePanelRequest({ at, label: "Second panel changed" }),
        );

        const stream = yield* events.stream(project.id, undefined);
        const subscribed = yield* Deferred.make<void>();
        const observedFiber = yield* stream.pipe(
          Stream.tap((event) =>
            event._tag === "ResyncRequired" ? Deferred.succeed(subscribed, undefined) : Effect.void,
          ),
          Stream.dropWhile(
            (event) =>
              !(
                event._tag === "PanelChanged" &&
                event.panelId === first.metadata.id &&
                event.change === "annotated"
              ),
          ),
          Stream.filter((event) => event._tag === "PanelChanged" || event._tag === "BoardChanged"),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Deferred.await(subscribed);

        const annotated = yield* boards.annotatePanel(
          project.id,
          first.metadata.id,
          new AnnotatePanelRequest({ at, label: "First panel changed" }),
        );
        const current = yield* boards.getBoard(project.id, board.dashboard.id);
        const observed = yield* Fiber.join(observedFiber);
        const panelEvent = observed[0];
        const boardEvent = observed[1];

        assert(panelEvent?._tag === "PanelChanged");
        assert.strictEqual(panelEvent.panelId, annotated.metadata.id);
        assert.strictEqual(panelEvent.revision, annotated.metadata.revision);
        assert(boardEvent?._tag === "BoardChanged");
        assert.strictEqual(boardEvent.dashboardId, board.dashboard.id);
        assert.strictEqual(boardEvent.revision, current.revision);
        assert.notStrictEqual(panelEvent.revision, boardEvent.revision);
      }).pipe(Effect.provide(BoardTest)),
    ),
  );
});
