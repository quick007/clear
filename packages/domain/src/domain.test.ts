import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";
import {
  DomainError,
  EntityNotFound,
  ProjectId,
  ProjectSlug,
  Session,
  TimelineEntry,
} from "./index.ts";

const projectId = "018f2a9c-7b3d-7d4a-8f12-0123456789ab";

describe("domain schemas", () => {
  it.effect("keeps durable identifiers nominal and restricted to UUIDv7", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ProjectId)(projectId);
      assert.strictEqual(decoded, projectId);

      const invalid = yield* Schema.decodeUnknownEffect(ProjectId)(
        "550e8400-e29b-41d4-a716-446655440000",
      ).pipe(Effect.exit);
      assert(Exit.isFailure(invalid));
    }),
  );

  it.effect("rejects invalid project slugs", () =>
    Effect.gen(function* () {
      const invalid = yield* Schema.decodeUnknownEffect(ProjectSlug)("Not Valid").pipe(Effect.exit);
      assert(Exit.isFailure(invalid));
    }),
  );

  it.effect("decodes tagged timeline and session variants", () =>
    Effect.gen(function* () {
      const timeline = yield* Schema.decodeUnknownEffect(TimelineEntry)({
        _tag: "note",
        id: "018f2a9c-7b3d-7d4a-8f12-1123456789ab",
        projectId,
        incidentId: "018f2a9c-7b3d-7d4a-8f12-2123456789ab",
        occurredAt: "2026-08-27T08:00:00.000Z",
        text: "Retries are increasing",
      });
      assert.strictEqual(timeline._tag, "note");

      const session = yield* Schema.decodeUnknownEffect(Session)({
        _tag: "sandbox",
        id: "018f2a9c-7b3d-7d4a-8f12-3123456789ab",
        seed: 42,
        createdAt: "2026-08-27T08:00:00.000Z",
        expiresAt: "2026-08-27T10:00:00.000Z",
      });
      assert.strictEqual(session._tag, "sandbox");
    }),
  );

  it.effect("preserves tagged errors through schema encoding", () =>
    Effect.gen(function* () {
      const error = new EntityNotFound({
        entity: "project",
        id: projectId,
        message: "Project not found",
      });
      const encoded = yield* Schema.encodeEffect(DomainError)(error);
      assert(encoded._tag === "EntityNotFound");
      assert.strictEqual(encoded.entity, "project");
    }),
  );
});
