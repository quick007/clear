import {
  DisplayName,
  EmailAddress,
  HostedSubject,
  IncidentTitle,
  NonEmptyText,
  ProjectName,
  ProjectSlug,
  ServiceName,
  Sha,
} from "@groundtruth/domain";
import { DateTime, Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { IncidentHistoryLimits } from "../src/repositories/incident-policy.ts";
import {
  AccountRepository,
  DeployEventRepository,
  IncidentRepository,
  ProjectRepository,
} from "../src/repositories/services.ts";
import { RepositoriesMemory } from "../src/testing/in-memory.ts";
import { RepositoriesMemoryControl } from "../src/testing/in-memory-state.ts";

const text = (value: string) => Schema.decodeUnknownSync(NonEmptyText)(value);

const createProject = Effect.gen(function* () {
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("memory-owner@example.com"),
    email: EmailAddress.make("memory-owner@example.com"),
    displayName: DisplayName.make("Memory owner"),
  });
  return yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make("memory-incidents"),
    name: ProjectName.make("Memory incidents"),
    mode: "hosted",
    retentionDays: 7,
    quotas: {
      maxIngestBytesPerMinute: 50_000_000,
      maxActiveSeries: 100_000,
      maxPanels: 100,
    },
  });
});

describe("in-memory incident history policy", () => {
  it("enforces Unicode text limits without mutating incident history", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* createProject;
        const incidents = yield* IncidentRepository;
        const incident = yield* incidents.open(project.id, {
          title: IncidentTitle.make("Unicode policy"),
        });
        const maximum = text("😀".repeat(IncidentHistoryLimits.textCodePoints));
        const oversized = text("😀".repeat(IncidentHistoryLimits.textCodePoints + 1));

        yield* incidents.addNote(project.id, incident.id, maximum);

        for (const failure of [
          yield* Effect.flip(incidents.addNote(project.id, incident.id, oversized)),
          yield* Effect.flip(
            incidents.upsertHypothesis(project.id, incident.id, {
              id: null,
              text: oversized,
              status: "proposed",
            }),
          ),
          yield* Effect.flip(incidents.close(project.id, incident.id, oversized)),
        ]) {
          expect(failure).toMatchObject({
            _tag: "RepositoryQuotaExceeded",
            resource: "incident-text",
            limit: IncidentHistoryLimits.textCodePoints,
            observed: IncidentHistoryLimits.textCodePoints + 1,
          });
        }

        expect(yield* incidents.listTimeline(project.id, incident.id)).toHaveLength(2);
        expect(Option.getOrThrow(yield* incidents.findOpen(project.id)).id).toBe(incident.id);
      }).pipe(Effect.provide(RepositoriesMemory)),
    );
  });

  it("reserves the final timeline slot for close and skips saturated deploy projections", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* createProject;
        const incidents = yield* IncidentRepository;
        const deploys = yield* DeployEventRepository;
        const control = yield* RepositoriesMemoryControl;
        const incident = yield* incidents.open(project.id, {
          title: IncidentTitle.make("Timeline policy"),
        });

        yield* Effect.forEach(
          Array.from({ length: IncidentHistoryLimits.timelineEntriesBeforeClose - 1 }),
          (_, index) => incidents.addNote(project.id, incident.id, text(`Note ${index + 1}`)),
          { discard: true },
        );

        const quota = yield* Effect.flip(
          incidents.addNote(project.id, incident.id, text("One note too many")),
        );
        expect(quota).toMatchObject({
          _tag: "RepositoryQuotaExceeded",
          resource: "incident-timeline",
          limit: IncidentHistoryLimits.timelineEntriesBeforeClose,
          observed: IncidentHistoryLimits.timelineEntriesBeforeClose + 1,
        });

        const deployedAt = yield* DateTime.now;
        yield* deploys.record(project.id, {
          serviceName: ServiceName.make("checkout-api"),
          sha: Sha.make("abcdef0"),
          description: text("Retry policy fixed"),
          url: null,
          deployedAt,
        });
        const beforeClose = yield* incidents.listTimeline(project.id, incident.id);
        expect(beforeClose).toHaveLength(IncidentHistoryLimits.timelineEntriesBeforeClose);
        expect(beforeClose.some((entry) => entry._tag === "deploy")).toBe(false);
        expect((yield* control.snapshot).deployEvents).toHaveLength(1);

        const closed = Option.getOrThrow(
          yield* incidents.close(project.id, incident.id, text("Recovered")),
        );
        expect(closed.status).toBe("closed");
        const timeline = yield* incidents.listTimeline(project.id, incident.id);
        expect(timeline).toHaveLength(IncidentHistoryLimits.timelineEntries);
        expect(timeline.filter((entry) => entry._tag === "incident-status")).toHaveLength(2);
        const detail = Option.getOrThrow(yield* incidents.getDetail(project.id, incident.id));
        expect(detail.timeline).toEqual(timeline);
        expect(timeline.filter((entry) => entry._tag === "incident-status").at(-1)).toMatchObject({
          _tag: "incident-status",
          status: "closed",
          summary: "Recovered",
        });

        for (const conflict of [
          yield* Effect.flip(incidents.addNote(project.id, incident.id, text("After close"))),
          yield* Effect.flip(
            incidents.upsertHypothesis(project.id, incident.id, {
              id: null,
              text: text("After close"),
              status: "proposed",
            }),
          ),
        ]) {
          expect(conflict).toMatchObject({
            _tag: "RepositoryConflict",
            resource: "incident",
            reason: "incident-not-open",
          });
        }
        expect(
          Option.isNone(yield* incidents.close(project.id, incident.id, text("Already closed"))),
        ).toBe(true);
      }).pipe(Effect.provide(RepositoriesMemory)),
    );
  });

  it("caps new hypotheses while permitting updates below the timeline limit", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* createProject;
        const incidents = yield* IncidentRepository;
        const incident = yield* incidents.open(project.id, {
          title: IncidentTitle.make("Hypothesis policy"),
        });

        const hypotheses = yield* Effect.forEach(
          Array.from({ length: IncidentHistoryLimits.hypotheses }),
          (_, index) =>
            incidents
              .upsertHypothesis(project.id, incident.id, {
                id: null,
                text: text(`Hypothesis ${index + 1}`),
                status: "proposed",
              })
              .pipe(Effect.map(Option.getOrThrow)),
        );
        const quota = yield* Effect.flip(
          incidents.upsertHypothesis(project.id, incident.id, {
            id: null,
            text: text("Hypothesis 51"),
            status: "proposed",
          }),
        );
        expect(quota).toMatchObject({
          _tag: "RepositoryQuotaExceeded",
          resource: "incident-hypotheses",
          limit: IncidentHistoryLimits.hypotheses,
          observed: IncidentHistoryLimits.hypotheses + 1,
        });

        const updated = Option.getOrThrow(
          yield* incidents.upsertHypothesis(project.id, incident.id, {
            id: hypotheses[0]!.id,
            text: text("Updated first hypothesis"),
            status: "confirmed",
          }),
        );
        expect(updated.status).toBe("confirmed");
        const detail = Option.getOrThrow(yield* incidents.getDetail(project.id, incident.id));
        expect(detail.hypotheses).toHaveLength(IncidentHistoryLimits.hypotheses);
        expect(detail.hypotheses.find(({ id }) => id === updated.id)?.text).toBe(updated.text);
      }).pipe(Effect.provide(RepositoriesMemory)),
    );
  });
});
