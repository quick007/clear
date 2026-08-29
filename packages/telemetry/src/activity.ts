import { Schema } from "effect";
import { ServiceName, SignalKind } from "./primitives.ts";

export class SignalActivity extends Schema.Class<SignalActivity>(
  "Groundtruth/Telemetry/SignalActivity",
)({
  signal: SignalKind,
  services: Schema.Array(ServiceName).check(Schema.isUnique()),
  itemCount: Schema.Natural,
  observedAt: Schema.DateTimeUtcFromString,
}) {}

export const SignalHealthStatus = Schema.Literals(["inactive", "healthy", "delayed"]);
export type SignalHealthStatus = typeof SignalHealthStatus.Type;

export class SignalHealth extends Schema.Class<SignalHealth>("Groundtruth/Telemetry/SignalHealth")({
  signal: SignalKind,
  status: SignalHealthStatus,
  firstSeenAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastSeenAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  services: Schema.Array(ServiceName).check(Schema.isUnique()),
}) {}
