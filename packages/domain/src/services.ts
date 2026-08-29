import { Schema } from "effect";
import { ProjectId } from "./ids.ts";
import { ServiceName } from "./primitives.ts";

export class SignalPresence extends Schema.Class<SignalPresence>("Groundtruth/SignalPresence")({
  metrics: Schema.Boolean,
  logs: Schema.Boolean,
  traces: Schema.Boolean,
}) {}

export class ServiceMetadata extends Schema.Class<ServiceMetadata>("Groundtruth/ServiceMetadata")({
  projectId: ProjectId,
  name: ServiceName,
  signals: SignalPresence,
  firstSeenAt: Schema.DateTimeUtcFromString,
  lastSeenAt: Schema.DateTimeUtcFromString,
}) {}
