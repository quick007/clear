import { SandboxSession } from "@groundtruth/domain";
import { Schema } from "effect";

export const SandboxPhase = Schema.Literals([
  "baseline",
  "upstream-blip",
  "amplification",
  "backfire",
  "recovery",
]);
export type SandboxPhase = typeof SandboxPhase.Type;

export class SandboxState extends Schema.Class<SandboxState>("Groundtruth/Api/SandboxState")({
  session: SandboxSession,
  phase: SandboxPhase,
  changed: Schema.Boolean,
  occurredAt: Schema.DateTimeUtcFromString,
}) {}
