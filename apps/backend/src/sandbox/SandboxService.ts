import type { SandboxState, ServiceUnavailable } from "@groundtruth/api-contract";
import {
  AlertId,
  EntityNotFound,
  IncidentTitle,
  InvalidStateTransition,
  type ProjectId,
  QuotaExceeded,
  SandboxSession,
  SessionId,
} from "@groundtruth/domain";
import type { TelemetryUnavailable } from "@groundtruth/telemetry";
import { Context, Crypto, DateTime, Effect, Layer, Ref, Semaphore } from "effect";
import { BoardService } from "../board/BoardService.js";
import { BackendConfig } from "../config/BackendConfig.js";
import { DeployService } from "../deploys/DeployService.js";
import { IncidentService } from "../incidents/IncidentService.js";
import { IncidentState } from "../incidents/IncidentState.js";
import { LiveEventBus } from "../live/LiveEventBus.js";
import { sandboxProjectIdForSession } from "../memory/SeedIds.js";
import { TelemetryStore } from "../telemetry/TelemetryStore.js";
import {
  advanceSandboxRuntime,
  makeSandboxRuntime,
  sandboxBucketMilliseconds,
  sandboxRuntimePhase,
  type SandboxRuntime,
  triggerSandboxRuntime,
} from "./SandboxRuntime.js";
import {
  SandboxRecord,
  type SandboxStore,
  sandboxStateView,
  type StoredSandbox,
} from "./SandboxRecord.js";
import { seedSandboxIncidentProject } from "./SandboxAlertState.js";
import { leastRecentlyUsedIdleSession } from "./SandboxCapacityPolicy.js";
import { publishSandboxProgress } from "./SandboxProgress.js";
import { beginSandboxRecovery, resolveSandboxIncident } from "./SandboxRecovery.js";
import { canonicalSandboxBatch } from "./SandboxTelemetry.js";

const sandboxTtlMilliseconds = 2 * 60 * 60 * 1_000; // 2 hours
const sandboxActiveWindowMilliseconds = 2 * 60 * 1_000; // 2 minutes

const incidentTitle = IncidentTitle.make("Checkout reliability investigation");

const seedFromSessionId = (sessionId: SessionId) =>
  Number.parseInt(String(sessionId).replaceAll("-", "").slice(-8), 16);

const materializationAnchor = (now: DateTime.Utc) =>
  Math.floor(DateTime.toEpochMillis(now) / sandboxBucketMilliseconds) * sandboxBucketMilliseconds;

type SandboxUnavailable = ServiceUnavailable | TelemetryUnavailable;
type SessionLookupError = EntityNotFound | SandboxUnavailable;
type SandboxAdmissionError = SessionLookupError | QuotaExceeded;
type SandboxResolutionError = SandboxAdmissionError | InvalidStateTransition;

export class SandboxService extends Context.Service<
  SandboxService,
  {
    open(seed?: number): Effect.Effect<SandboxState, SandboxUnavailable | QuotaExceeded>;
    ensure(session: SandboxSession): Effect.Effect<SandboxState, SandboxAdmissionError>;
    resume(sessionId: SessionId): Effect.Effect<SandboxState, SessionLookupError>;
    resumeOrOpen(
      session: SandboxSession | undefined,
      seed?: number,
    ): Effect.Effect<SandboxState, SandboxAdmissionError>;
    trigger(sessionId: SessionId): Effect.Effect<SandboxState, SessionLookupError>;
    recover(sessionId: SessionId): Effect.Effect<SandboxState, SessionLookupError>;
    resolve(sessionId: SessionId): Effect.Effect<SandboxState, SandboxResolutionError>;
    reset(sessionId: SessionId): Effect.Effect<SandboxState, SessionLookupError>;
    advanceActive(): Effect.Effect<number, SandboxUnavailable>;
    pruneExpired(): Effect.Effect<number, SandboxUnavailable>;
  }
>()("groundtruth/backend/sandbox/SandboxService") {
  static readonly layer = Layer.effect(
    SandboxService,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const config = yield* BackendConfig;
      const boards = yield* BoardService;
      const deploys = yield* DeployService;
      const incidentService = yield* IncidentService;
      const incidentState = yield* IncidentState;
      const events = yield* LiveEventBus;
      const telemetry = yield* TelemetryStore;
      const transitions = yield* Semaphore.make(1);
      const store = yield* Ref.make<SandboxStore>(new Map());

      const setStored = Effect.fn("SandboxService.setStored")(
        (sessionId: SessionId, stored: StoredSandbox) =>
          Ref.update(store, (all) => {
            const next = new Map(all);
            next.set(sessionId, stored);
            return next;
          }),
      );

      const removeStored = Effect.fn("SandboxService.removeStored")((sessionId: SessionId) =>
        Ref.update(store, (all) => {
          const next = new Map(all);
          next.delete(sessionId);
          return next;
        }),
      );

      const clearIncidentProject = Effect.fn("SandboxService.clearIncidentProject")(
        (projectId: ProjectId) =>
          Ref.update(incidentState.state, (all) => {
            const next = new Map(all);
            next.delete(projectId);
            return next;
          }),
      );

      const seedIncidentProject = Effect.fn("SandboxService.seedIncidentProject")(function* (
        projectId: ProjectId,
        now: DateTime.Utc,
      ) {
        const id = AlertId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        yield* seedSandboxIncidentProject(incidentState, projectId, id, now);
      });

      const replaceRuntime = Effect.fn("SandboxService.replaceRuntime")(function* (
        projectId: ProjectId,
        runtime: SandboxRuntime,
      ) {
        const batches = yield* Effect.forEach(runtime.batches, (batch) =>
          crypto.randomUUIDv7.pipe(
            Effect.orDie,
            Effect.map((id) => canonicalSandboxBatch(batch, id, 0)),
          ),
        );
        yield* telemetry.replace(projectId, batches);
      });

      const appendRuntime = Effect.fn("SandboxService.appendRuntime")(function* (
        projectId: ProjectId,
        batches: SandboxRuntime["batches"],
        timestampOffsetMilliseconds: number,
      ) {
        yield* Effect.forEach(
          batches,
          (batch) =>
            crypto.randomUUIDv7.pipe(
              Effect.orDie,
              Effect.map((id) => canonicalSandboxBatch(batch, id, timestampOffsetMilliseconds)),
              Effect.flatMap((canonical) => telemetry.ingest(projectId, canonical)),
            ),
          { discard: true },
        );
      });

      const advanceStored = Effect.fn("SandboxService.advanceStored")(function* (
        projectId: ProjectId,
        stored: StoredSandbox,
        now: DateTime.Utc,
      ) {
        const anchor = materializationAnchor(now);
        let runtime = stored.runtime;
        let record = stored.record;
        if (anchor > stored.materializedAt) {
          const advanced = yield* advanceSandboxRuntime(runtime, 1).pipe(Effect.orDie);
          runtime = advanced.runtime;
          const phase = yield* sandboxRuntimePhase(runtime);
          record = new SandboxRecord({ session: stored.record.session, phase });
          const latest = advanced.advancedBatches.at(-1);
          const timestampOffsetMilliseconds = latest === undefined ? 0 : anchor - latest.bucketEnd;
          yield* appendRuntime(projectId, advanced.advancedBatches, timestampOffsetMilliseconds);
          yield* publishSandboxProgress(
            crypto,
            incidentState,
            incidentService,
            events,
            projectId,
            advanced.advancedBatches,
            timestampOffsetMilliseconds,
          );
        }
        const refreshed = {
          ...stored,
          record,
          runtime,
          materializedAt: anchor > stored.materializedAt ? anchor : stored.materializedAt,
        };
        yield* setStored(stored.record.session.id, refreshed);
        return refreshed;
      });

      const clearSessionData = Effect.fn("SandboxService.clearSessionData")(function* (
        sessionId: SessionId,
      ) {
        const projectId = sandboxProjectIdForSession(sessionId);
        yield* deploys.clearProject(projectId);
        yield* clearIncidentProject(projectId);
        yield* boards.clearProject(projectId);
        yield* telemetry.clear(projectId);
      });

      const pruneExpiredUnlocked = Effect.fn("SandboxService.pruneExpiredUnlocked")(function* (
        now: DateTime.Utc,
      ) {
        const expired = yield* Ref.modify<SandboxStore, ReadonlyArray<SessionId>>(store, (all) => {
          const next = new Map(all);
          const removed: Array<SessionId> = [];
          for (const [sessionId, stored] of all) {
            if (
              DateTime.toEpochMillis(stored.record.session.expiresAt) <= DateTime.toEpochMillis(now)
            ) {
              next.delete(sessionId);
              removed.push(sessionId);
            }
          }
          return [removed, next];
        });
        yield* Effect.forEach(expired, clearSessionData, { discard: true });
        return expired.length;
      });

      const requireActive = Effect.fn("SandboxService.requireActive")(function* (
        sessionId: SessionId,
      ) {
        const now = yield* DateTime.now;
        const lookup = yield* Ref.modify<
          SandboxStore,
          { readonly stored: StoredSandbox | null; readonly expired: boolean }
        >(store, (all) => {
          const candidate = all.get(sessionId);
          if (candidate === undefined) {
            return [{ stored: null, expired: false }, all];
          }
          if (
            DateTime.toEpochMillis(candidate.record.session.expiresAt) <=
            DateTime.toEpochMillis(now)
          ) {
            const next = new Map(all);
            next.delete(sessionId);
            return [{ stored: null, expired: true }, next];
          }
          return [{ stored: candidate, expired: false }, all];
        });
        if (lookup.stored === null) {
          if (lookup.expired) {
            yield* clearSessionData(sessionId);
          }
          return yield* new EntityNotFound({
            entity: "session",
            id: sessionId,
            message: "Sandbox session not found or expired",
          });
        }
        return { now, stored: lookup.stored };
      });

      const ensureUnlocked = Effect.fn("SandboxService.ensureUnlocked")(function* (
        session: SandboxSession,
      ) {
        const now = yield* DateTime.now;
        if (DateTime.toEpochMillis(session.expiresAt) <= DateTime.toEpochMillis(now)) {
          return yield* new EntityNotFound({
            entity: "session",
            id: session.id,
            message: "Sandbox session not found or expired",
          });
        }
        yield* pruneExpiredUnlocked(now);
        const active = yield* Ref.get(store);
        const existing = active.get(session.id);
        if (existing !== undefined) {
          const touched = { ...existing, lastActiveAt: DateTime.toEpochMillis(now) };
          yield* setStored(session.id, touched);
          return sandboxStateView(touched.record, false, now);
        }
        if (active.size >= config.sandboxSessionLimit) {
          const eviction = leastRecentlyUsedIdleSession(active, now);
          if (eviction === undefined) {
            return yield* new QuotaExceeded({
              quota: "concurrent sandbox sessions",
              limit: config.sandboxSessionLimit,
              observed: active.size + 1,
              message:
                "Sandbox capacity is temporarily full. Try again after an active session becomes idle.",
            });
          }
          yield* clearSessionData(eviction);
          yield* removeStored(eviction);
        }
        const runtime = yield* makeSandboxRuntime(session, now).pipe(Effect.orDie);
        const record = new SandboxRecord({ session, phase: "baseline" });
        const projectId = sandboxProjectIdForSession(session.id);
        const anchor = materializationAnchor(now);
        yield* boards.ensureSandboxBoard(projectId);
        yield* seedIncidentProject(projectId, now);
        yield* replaceRuntime(projectId, runtime);
        yield* setStored(session.id, {
          record,
          runtime,
          materializedAt: anchor,
          lastActiveAt: DateTime.toEpochMillis(now),
        });
        return sandboxStateView(record, true, now);
      });

      const ensure = Effect.fn("SandboxService.ensure")((session: SandboxSession) =>
        transitions.withPermit(ensureUnlocked(session)),
      );

      const open = Effect.fn("SandboxService.open")(function* (seed?: number) {
        return yield* transitions.withPermit(
          Effect.gen(function* () {
            const now = yield* DateTime.now;
            const id = SessionId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
            const session = new SandboxSession({
              id,
              seed: seed ?? seedFromSessionId(id),
              createdAt: now,
              expiresAt: DateTime.addDuration(now, sandboxTtlMilliseconds),
            });
            return yield* ensureUnlocked(session).pipe(
              Effect.catchTag("EntityNotFound", (error) => Effect.die(error)),
            );
          }),
        );
      });

      const resume = Effect.fn("SandboxService.resume")((sessionId: SessionId) =>
        transitions.withPermit(
          Effect.gen(function* () {
            const { now, stored } = yield* requireActive(sessionId);
            const touched = { ...stored, lastActiveAt: DateTime.toEpochMillis(now) };
            yield* setStored(sessionId, touched);
            return sandboxStateView(touched.record, false, now);
          }),
        ),
      );

      const resumeOrOpen = Effect.fn("SandboxService.resumeOrOpen")(
        (session: SandboxSession | undefined, seed?: number) =>
          session === undefined ? open(seed) : ensure(session),
      );

      const trigger = Effect.fn("SandboxService.trigger")((sessionId: SessionId) =>
        transitions.withPermit(
          Effect.gen(function* () {
            const { now, stored } = yield* requireActive(sessionId);
            const projectId = sandboxProjectIdForSession(sessionId);
            const current = { ...stored, lastActiveAt: DateTime.toEpochMillis(now) };
            yield* setStored(sessionId, current);
            if (current.record.phase !== "baseline") {
              if (current.record.phase !== "recovery") {
                yield* seedIncidentProject(projectId, now);
                yield* incidentService.ensureIncident(projectId, incidentTitle);
              }
              return sandboxStateView(current.record, false, now);
            }
            const runtime = yield* triggerSandboxRuntime(current.runtime).pipe(Effect.orDie);
            const record = new SandboxRecord({
              session: current.record.session,
              phase: "upstream-blip",
            });
            yield* seedIncidentProject(projectId, now);
            yield* incidentService.ensureIncident(projectId, incidentTitle);
            yield* setStored(sessionId, {
              record,
              runtime,
              materializedAt: current.materializedAt,
              lastActiveAt: DateTime.toEpochMillis(now),
            });
            return sandboxStateView(record, true, now);
          }),
        ),
      );

      const recover = Effect.fn("SandboxService.recover")((sessionId: SessionId) =>
        transitions.withPermit(
          Effect.gen(function* () {
            const { now, stored } = yield* requireActive(sessionId);
            const projectId = sandboxProjectIdForSession(sessionId);
            const recovery = yield* beginSandboxRecovery(
              { crypto, deploys, incidents: incidentService, incidentState, events, telemetry },
              projectId,
              sessionId,
              stored,
              now,
            );
            yield* setStored(sessionId, recovery.stored);
            return sandboxStateView(recovery.stored.record, recovery.changed, now);
          }),
        ),
      );

      const resolve = Effect.fn("SandboxService.resolve")((sessionId: SessionId) =>
        transitions.withPermit(
          Effect.gen(function* () {
            const { now, stored } = yield* requireActive(sessionId);
            const projectId = sandboxProjectIdForSession(sessionId);
            const anchor = materializationAnchor(now);
            const resolved = yield* resolveSandboxIncident(
              { crypto, deploys, incidents: incidentService, incidentState, events, telemetry },
              projectId,
              sessionId,
              stored,
              now,
              anchor,
            );
            yield* setStored(sessionId, resolved);
            return sandboxStateView(resolved.record, true, now);
          }),
        ),
      );

      const reset = Effect.fn("SandboxService.reset")((sessionId: SessionId) =>
        transitions.withPermit(
          Effect.gen(function* () {
            const { now, stored: current } = yield* requireActive(sessionId);
            const runtime = yield* makeSandboxRuntime(current.record.session, now).pipe(
              Effect.orDie,
            );
            const record = new SandboxRecord({
              session: current.record.session,
              phase: "baseline",
            });
            yield* clearSessionData(sessionId);
            const projectId = sandboxProjectIdForSession(sessionId);
            yield* boards.ensureSandboxBoard(projectId, true);
            yield* seedIncidentProject(projectId, now);
            const anchor = materializationAnchor(now);
            yield* replaceRuntime(projectId, runtime);
            yield* setStored(sessionId, {
              record,
              runtime,
              materializedAt: anchor,
              lastActiveAt: DateTime.toEpochMillis(now),
            });
            return sandboxStateView(record, current.record.phase !== "baseline", now);
          }),
        ),
      );

      const advanceActive = Effect.fn("SandboxService.advanceActive")(() =>
        transitions.withPermit(
          Effect.gen(function* () {
            const now = yield* DateTime.now;
            const nowMilliseconds = DateTime.toEpochMillis(now);
            const anchor = materializationAnchor(now);
            const current = yield* Ref.get(store);
            let advanced = 0;
            for (const [sessionId, stored] of current) {
              const expired =
                DateTime.toEpochMillis(stored.record.session.expiresAt) <= nowMilliseconds;
              const inactive =
                nowMilliseconds - stored.lastActiveAt > sandboxActiveWindowMilliseconds;
              if (expired || inactive || anchor <= stored.materializedAt) continue;
              yield* advanceStored(sandboxProjectIdForSession(sessionId), stored, now);
              advanced += 1;
            }
            return advanced;
          }),
        ),
      );

      const pruneExpired = Effect.fn("SandboxService.pruneExpired")(() =>
        transitions.withPermit(
          Effect.gen(function* () {
            const now = yield* DateTime.now;
            return yield* pruneExpiredUnlocked(now);
          }),
        ),
      );

      return SandboxService.of({
        open,
        ensure,
        resume,
        resumeOrOpen,
        trigger,
        recover,
        resolve,
        reset,
        advanceActive,
        pruneExpired,
      });
    }),
  );
}
