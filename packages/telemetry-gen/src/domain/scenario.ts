import { Schema } from "effect";

import { IncidentId, ScenarioPhase, Sequence, Timestamp } from "./primitives.ts";
import { DeployAnnotation, TelemetryBatch } from "./telemetry.ts";

export class ScenarioConfig extends Schema.Class<ScenarioConfig>("ScenarioConfig")({
  seed: Schema.String.check(Schema.isNonEmpty()),
  startedAt: Timestamp,
  bucketDurationMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1_000)),
  upstreamBlipBuckets: Schema.Int.check(Schema.isGreaterThan(0)),
  baselineRequestsPerSecond: Schema.Int.check(Schema.isGreaterThan(0)),
  uniqueUsersPerFiveMinutes: Schema.Int.check(Schema.isGreaterThan(0)),
  tracesPerBucket: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export class RecoveryOrigin extends Schema.Class<RecoveryOrigin>("RecoveryOrigin")({
  phase: Schema.Literals(["P1", "P2"]),
  phaseBucket: Schema.Natural,
}) {}

export class ScenarioState extends Schema.Class<ScenarioState>("ScenarioState")({
  config: ScenarioConfig,
  phase: ScenarioPhase,
  sequence: Sequence,
  phaseBucket: Schema.Natural,
  incidentId: Schema.NullOr(IncidentId),
  pendingAnnotations: Schema.Array(DeployAnnotation),
  recoveryOrigin: Schema.NullOr(RecoveryOrigin),
}) {}

export class ScenarioAdvance extends Schema.Class<ScenarioAdvance>("ScenarioAdvance")({
  state: ScenarioState,
  batches: Schema.Array(TelemetryBatch),
}) {}

export class InvalidScenarioTransition extends Schema.TaggedError<InvalidScenarioTransition>()(
  "InvalidScenarioTransition",
  {
    action: Schema.Literal("triggerIncident"),
    phase: ScenarioPhase,
    message: Schema.String,
  },
) {}

export class InvalidAdvanceCount extends Schema.TaggedError<InvalidAdvanceCount>()(
  "InvalidAdvanceCount",
  {
    count: Schema.Number,
    message: Schema.String,
  },
) {}
