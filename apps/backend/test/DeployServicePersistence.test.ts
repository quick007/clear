import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  EventCursor,
  RecordDeployEventRequest,
  ServiceUnavailable,
} from "@groundtruth/api-contract";
import {
  EmailAddress,
  HostedSubject,
  IncidentTitle,
  ProjectId,
  ProjectName,
  ProjectSlug,
  ServiceName,
  SessionId,
  Sha,
} from "@groundtruth/domain";
import {
  AccountRepository,
  IncidentRepository,
  OutboxRepository,
  ProjectRepository,
} from "@groundtruth/persistence";
import { PersistenceMemory, RepositoriesMemoryControl } from "@groundtruth/persistence/testing";
import { Effect, Layer, Option, Stream } from "effect";
import { TestClock } from "effect/testing";
import { BoardService } from "../src/board/BoardService.js";
import { DeployService } from "../src/deploys/DeployService.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { sandboxProjectIdForSession } from "../src/memory/SeedIds.js";

const LiveEventsTest = LiveEventBus.layerDurable.pipe(Layer.provideMerge(PersistenceMemory));
const FoundationTest = Layer.mergeAll(IncidentState.layer, LiveEventsTest, NodeCrypto.layer);
const BoardTest = BoardService.layerMemory.pipe(Layer.provide(FoundationTest));
const Dependencies = Layer.mergeAll(FoundationTest, BoardTest);
const DeployTest = DeployService.layerPersistence.pipe(Layer.provide(Dependencies));
const TestLayer = Layer.mergeAll(Dependencies, DeployTest);

describe("DeployService persistence adapter", () => {
  it.effect("routes hosted deployments to persistence and sandbox deployments to memory", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("1 second");
      const accounts = yield* AccountRepository;
      const boards = yield* BoardService;
      const deploys = yield* DeployService;
      const incidents = yield* IncidentRepository;
      const liveEvents = yield* LiveEventBus;
      const outbox = yield* OutboxRepository;
      const projects = yield* ProjectRepository;
      const persisted = yield* RepositoriesMemoryControl;

      const account = yield* accounts.upsertHosted({
        hostedSubject: HostedSubject.make("operator@example.com"),
        email: EmailAddress.make("operator@example.com"),
        displayName: null,
      });
      const project = yield* projects.create({
        ownerId: account.id,
        slug: ProjectSlug.make("hosted-checkout"),
        name: ProjectName.make("Hosted checkout"),
        mode: "hosted",
        retentionDays: 14,
        quotas: {
          maxIngestBytesPerMinute: 10_000_000,
          maxActiveSeries: 10_000,
          maxPanels: 12,
        },
      });
      const incident = yield* incidents.open(project.id, {
        title: IncidentTitle.make("Checkout retry amplification"),
      });
      yield* boards.ensureSandboxBoard(project.id);
      const latest = Option.getOrThrow(yield* outbox.latest(project.id));
      const stream = yield* liveEvents.stream(
        project.id,
        EventCursor.make(latest.sequence.toString()),
      );

      const hosted = yield* deploys.record(
        project.id,
        new RecordDeployEventRequest({
          service: ServiceName.make("checkout-api"),
          sha: Sha.make("feed1234beef"),
          description: "Bound retries with backoff and jitter",
        }),
      );
      const hostedPage = yield* deploys.list(project.id, { limit: 10 });
      assert.deepStrictEqual(
        hostedPage.events.map(({ id }) => id),
        [hosted.id],
      );

      const detail = yield* incidents.getDetail(project.id, incident.id);
      assert(Option.isSome(detail));
      assert(
        detail.value.timeline.some(
          (entry) => entry._tag === "deploy" && entry.deployEventId === hosted.id,
        ),
      );
      const board = yield* boards.getDefaultBoard(project.id);
      assert(
        board.panels.every((panel) =>
          panel.annotations.some(
            (annotation) => annotation._tag === "deploy" && annotation.deployEventId === hosted.id,
          ),
        ),
      );
      const published = yield* stream.pipe(
        Stream.filter(
          (event) => event._tag === "ProductStateChanged" && event.kind === "deploy.recorded",
        ),
        Stream.take(1),
        Stream.runCollect,
      );
      assert.strictEqual(published[0]?._tag, "ProductStateChanged");

      const sandboxProjectId = sandboxProjectIdForSession(
        SessionId.make("01993f71-0001-7000-8000-000000000082"),
      );
      yield* boards.ensureSandboxBoard(sandboxProjectId);
      const sandbox = yield* deploys.record(
        sandboxProjectId,
        new RecordDeployEventRequest({
          service: ServiceName.make("checkout-api"),
          sha: Sha.make("cafe1234babe"),
        }),
      );
      assert.deepStrictEqual(
        (yield* deploys.list(sandboxProjectId, {})).events.map(({ id }) => id),
        [sandbox.id],
      );
      assert.deepStrictEqual(
        (yield* persisted.snapshot).deployEvents.map(({ id }) => id),
        [hosted.id],
      );

      const unavailable = yield* Effect.flip(
        deploys.record(
          ProjectId.make("01993f71-0001-7000-8000-000000000099"),
          new RecordDeployEventRequest({
            service: ServiceName.make("checkout-api"),
            sha: Sha.make("dead1234beef"),
          }),
        ),
      );
      assert(unavailable instanceof ServiceUnavailable);
      assert.strictEqual(unavailable.service, "deploy-events");
    }).pipe(Effect.provide(TestLayer)),
  );
});
