import {
  AlertId,
  DashboardId,
  DeployEventId,
  HypothesisId,
  IncidentId,
  IngestKeyId,
  PanelId,
  ProjectId,
  SessionId,
  TimelineEntryId,
  UserId,
} from "@groundtruth/domain";
import { Context, Crypto, Effect, Layer, Schema } from "effect";
import { persistenceError, type PersistenceError } from "./errors.ts";

const generate = <A, I>(crypto: Crypto.Crypto, schema: Schema.Codec<A, I>) =>
  crypto.randomUUIDv7.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((error) => persistenceError("postgres", "generate-id", error, false)),
  );

export interface IdGeneratorShape {
  readonly user: Effect.Effect<UserId, PersistenceError>;
  readonly project: Effect.Effect<ProjectId, PersistenceError>;
  readonly dashboard: Effect.Effect<DashboardId, PersistenceError>;
  readonly panel: Effect.Effect<PanelId, PersistenceError>;
  readonly incident: Effect.Effect<IncidentId, PersistenceError>;
  readonly alert: Effect.Effect<AlertId, PersistenceError>;
  readonly hypothesis: Effect.Effect<HypothesisId, PersistenceError>;
  readonly timelineEntry: Effect.Effect<TimelineEntryId, PersistenceError>;
  readonly deployEvent: Effect.Effect<DeployEventId, PersistenceError>;
  readonly session: Effect.Effect<SessionId, PersistenceError>;
  readonly ingestKey: Effect.Effect<IngestKeyId, PersistenceError>;
}

export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()(
  "Groundtruth/IdGenerator",
) {}

export const IdGeneratorLive = Layer.effect(
  IdGenerator,
  Effect.map(Effect.service(Crypto.Crypto), (crypto) => ({
    user: generate(crypto, UserId),
    project: generate(crypto, ProjectId),
    dashboard: generate(crypto, DashboardId),
    panel: generate(crypto, PanelId),
    incident: generate(crypto, IncidentId),
    alert: generate(crypto, AlertId),
    hypothesis: generate(crypto, HypothesisId),
    timelineEntry: generate(crypto, TimelineEntryId),
    deployEvent: generate(crypto, DeployEventId),
    session: generate(crypto, SessionId),
    ingestKey: generate(crypto, IngestKeyId),
  })),
);
