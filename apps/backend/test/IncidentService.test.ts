import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { HypothesisId, IncidentTitle, NonEmptyText } from "@groundtruth/domain";
import { IncidentHistoryLimits } from "@groundtruth/persistence";
import { Cause, Effect, Exit, Layer } from "effect";
import { IncidentService } from "../src/incidents/IncidentService.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { sandboxProjectId } from "../src/memory/SeedIds.js";

const IncidentTest = IncidentService.layer.pipe(
  Layer.provide([IncidentState.layer, LiveEventBus.layer, NodeCrypto.layer]),
);

describe("IncidentService", () => {
  it.effect("runs the incident, hypothesis, timeline, and close lifecycle", () =>
    Effect.gen(function* () {
      const incidents = yield* IncidentService;
      const title = IncidentTitle.make("Retry amplification");

      const opened = yield* incidents.openIncident(sandboxProjectId, title);
      assert.strictEqual(opened.incident.status, "open");

      const ensured = yield* incidents.ensureIncident(sandboxProjectId, title);
      assert.strictEqual(ensured.changed, false);
      assert.strictEqual(ensured.detail.incident.id, opened.incident.id);

      const proposed = yield* incidents.setHypothesis(sandboxProjectId, opened.incident.id, {
        text: NonEmptyText.make("Traffic volume increased"),
        status: "proposed",
      });
      const rejected = yield* incidents.setHypothesis(sandboxProjectId, opened.incident.id, {
        hypothesisId: HypothesisId.make(proposed.id),
        text: proposed.text,
        status: "rejected",
      });
      assert.strictEqual(rejected.status, "rejected");

      yield* incidents.addNote(
        sandboxProjectId,
        opened.incident.id,
        NonEmptyText.make("Unique users remained flat"),
      );
      const closed = yield* incidents.close(
        sandboxProjectId,
        opened.incident.id,
        NonEmptyText.make("Retry budget restored normal request volume"),
      );
      assert.strictEqual(closed.incident.status, "closed");
      assert.strictEqual(closed.timeline.length, 4);

      const repeat = yield* Effect.exit(
        incidents.close(sandboxProjectId, opened.incident.id, NonEmptyText.make("Already closed")),
      );
      assert(Exit.isFailure(repeat));
      assert(
        repeat.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error._tag === "InvalidStateTransition",
        ),
      );

      const reopened = yield* incidents.openIncident(
        sandboxProjectId,
        IncidentTitle.make("A later checkout incident"),
      );
      assert.notStrictEqual(reopened.incident.id, opened.incident.id);
      assert.deepStrictEqual(
        (yield* incidents.listIncidents(sandboxProjectId)).map(({ id }) => id),
        [reopened.incident.id, opened.incident.id],
      );
      assert.strictEqual(
        (yield* incidents.getDetail(sandboxProjectId, opened.incident.id)).incident.status,
        "closed",
      );
    }).pipe(Effect.provide(IncidentTest)),
  );

  it.effect("enforces Unicode text limits without mutating incident history", () =>
    Effect.gen(function* () {
      const incidents = yield* IncidentService;
      const opened = yield* incidents.openIncident(
        sandboxProjectId,
        IncidentTitle.make("Unicode incident limits"),
      );
      const maximum = NonEmptyText.make("😀".repeat(IncidentHistoryLimits.textCodePoints));
      const oversized = NonEmptyText.make("😀".repeat(IncidentHistoryLimits.textCodePoints + 1));

      yield* incidents.addNote(sandboxProjectId, opened.incident.id, maximum);
      const rejected = yield* Effect.exit(
        incidents.addNote(sandboxProjectId, opened.incident.id, oversized),
      );
      assert(Exit.isFailure(rejected));
      assert(
        rejected.cause.reasons.some(
          (reason) =>
            Cause.isFailReason(reason) &&
            reason.error._tag === "QuotaExceeded" &&
            reason.error.quota === "incident-text" &&
            reason.error.observed === IncidentHistoryLimits.textCodePoints + 1,
        ),
      );
      const detail = yield* incidents.getDetail(sandboxProjectId, opened.incident.id);
      assert.strictEqual(detail.timeline.length, 1);
    }).pipe(Effect.provide(IncidentTest)),
  );

  it.effect("caps new hypotheses without appending a rejected timeline entry", () =>
    Effect.gen(function* () {
      const incidents = yield* IncidentService;
      const opened = yield* incidents.openIncident(
        sandboxProjectId,
        IncidentTitle.make("Hypothesis incident limits"),
      );
      yield* Effect.forEach(
        Array.from({ length: IncidentHistoryLimits.hypotheses }, (_, index) => index),
        (index) =>
          incidents.setHypothesis(sandboxProjectId, opened.incident.id, {
            text: NonEmptyText.make(`Hypothesis ${index + 1}`),
            status: "proposed",
          }),
        { discard: true },
      );

      const rejected = yield* Effect.exit(
        incidents.setHypothesis(sandboxProjectId, opened.incident.id, {
          text: NonEmptyText.make("One hypothesis too many"),
          status: "proposed",
        }),
      );
      assert(Exit.isFailure(rejected));
      assert(
        rejected.cause.reasons.some(
          (reason) =>
            Cause.isFailReason(reason) &&
            reason.error._tag === "QuotaExceeded" &&
            reason.error.quota === "incident-hypotheses",
        ),
      );
      const detail = yield* incidents.getDetail(sandboxProjectId, opened.incident.id);
      assert.strictEqual(detail.hypotheses.length, IncidentHistoryLimits.hypotheses);
      assert.strictEqual(detail.timeline.length, IncidentHistoryLimits.hypotheses);
    }).pipe(Effect.provide(IncidentTest)),
  );

  it.effect("reserves the final timeline entry for closing the incident", () =>
    Effect.gen(function* () {
      const incidents = yield* IncidentService;
      const opened = yield* incidents.openIncident(
        sandboxProjectId,
        IncidentTitle.make("Timeline incident limits"),
      );
      yield* Effect.forEach(
        Array.from(
          { length: IncidentHistoryLimits.timelineEntriesBeforeClose },
          (_, index) => index,
        ),
        (index) =>
          incidents.addNote(
            sandboxProjectId,
            opened.incident.id,
            NonEmptyText.make(`Timeline note ${index + 1}`),
          ),
        { discard: true },
      );

      const rejected = yield* Effect.exit(
        incidents.addNote(
          sandboxProjectId,
          opened.incident.id,
          NonEmptyText.make("No room before close"),
        ),
      );
      assert(Exit.isFailure(rejected));
      const beforeClose = yield* incidents.getDetail(sandboxProjectId, opened.incident.id);
      assert.strictEqual(
        beforeClose.timeline.length,
        IncidentHistoryLimits.timelineEntriesBeforeClose,
      );

      const closed = yield* incidents.close(
        sandboxProjectId,
        opened.incident.id,
        NonEmptyText.make("Closed at the incident history boundary"),
      );
      assert.strictEqual(closed.timeline.length, IncidentHistoryLimits.timelineEntries);
    }).pipe(Effect.provide(IncidentTest)),
  );
});
