import {
  CreatedIngestKey,
  CurrentSession,
  GroundtruthApi,
  IngestKeyList,
  IngestKeySecret,
  ServiceUnavailable,
} from "@groundtruth/api-contract";
import { Effect, Redacted } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { IdentityService } from "../identity/IdentityService.js";
import { IngestKeyService } from "../ingest/IngestKeyService.js";

const unavailable = () =>
  new ServiceUnavailable({
    service: "ingest-keys",
    message: "Ingest key service is unavailable",
  });

export const IngestKeyHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "ingestKeys",
  Effect.fn(function* (handlers) {
    const identity = yield* IdentityService;
    const keys = yield* IngestKeyService;

    const authorize = Effect.fn("IngestKeyHandlers.authorize")(function* (projectId) {
      const session = yield* CurrentSession;
      yield* identity.authorizeProject(session, projectId);
    });

    return handlers
      .handle(
        "listIngestKeys",
        Effect.fn(function* ({ params }) {
          yield* authorize(params.projectId);
          return new IngestKeyList({ items: yield* keys.list(params.projectId) });
        }),
      )
      .handle(
        "createIngestKey",
        Effect.fn(function* ({ params, payload }) {
          yield* authorize(params.projectId);
          const issued = yield* keys
            .create(params.projectId, payload.name)
            .pipe(Effect.catchTag("IngestKeyUnavailable", unavailable));
          return new CreatedIngestKey({
            metadata: issued.metadata,
            key: IngestKeySecret.make(Redacted.value(issued.key)),
          });
        }),
      )
      .handle(
        "revokeIngestKey",
        Effect.fn(function* ({ params }) {
          yield* authorize(params.projectId);
          return yield* keys.revoke(params.projectId, params.ingestKeyId);
        }),
      );
  }),
);
