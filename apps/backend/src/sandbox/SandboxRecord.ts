import { SandboxPhase, SandboxState } from "@groundtruth/api-contract";
import { type SessionId, SandboxSession } from "@groundtruth/domain";
import { DateTime, Schema } from "effect";
import type { SandboxRuntime } from "./SandboxRuntime.js";

export class SandboxRecord extends Schema.Class<SandboxRecord>("Groundtruth/Backend/SandboxRecord")(
  {
    session: SandboxSession,
    phase: SandboxPhase,
  },
) {}

export interface StoredSandbox {
  readonly record: SandboxRecord;
  readonly runtime: SandboxRuntime;
  readonly materializedAt: number;
  readonly lastActiveAt: number;
}

export type SandboxStore = ReadonlyMap<SessionId, StoredSandbox>;

export const sandboxStateView = (
  record: SandboxRecord,
  changed: boolean,
  occurredAt: DateTime.Utc,
) =>
  new SandboxState({
    session: record.session,
    phase: record.phase,
    changed,
    occurredAt,
  });
