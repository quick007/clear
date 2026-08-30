import { LiveEvent, StreamFailure } from "@groundtruth/api-contract";
import { ProjectId } from "@groundtruth/domain";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vite-plus/test";
import { Effect, Exit, Schema } from "effect";
import {
  changesIncidentScope,
  commitLiveEvent,
  createLiveCursorState,
  invalidateLiveQueries,
  isRetryableLiveFailure,
  type LiveCursorStorage,
  reconnectDelay,
  shouldShowLiveUpdateNotice,
} from "./live";

const projectId = Schema.decodeUnknownSync(ProjectId)("01890f6e-7c00-7000-8000-000000000001");
const decodeEvent = Schema.decodeUnknownSync(LiveEvent);

const makeStorage = (): LiveCursorStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

const productEvent = (kind = "panel.updated", cursor = "42") =>
  decodeEvent({
    _tag: "ProductStateChanged",
    cursor,
    projectId,
    occurredAt: "2026-08-28T08:00:00.000Z",
    kind,
    schemaVersion: 1,
    payload: { panelId: "01890f6e-7c00-7000-8000-000000000002" },
  });

describe("live project cursor", () => {
  it("retains durable cursors and sends them on the next connection", () => {
    const storage = makeStorage();
    const first = createLiveCursorState(projectId, storage);
    expect(first.query()).toEqual({});

    first.observe(productEvent());
    expect(first.query()).toEqual({ cursor: "42" });
    expect(createLiveCursorState(projectId, storage).query()).toEqual({ cursor: "42" });

    first.observe(
      decodeEvent({
        _tag: "Heartbeat",
        occurredAt: "2026-08-28T08:00:01.000Z",
        cursor: "43",
      }),
    );
    expect(first.query()).toEqual({ cursor: "43" });

    first.observe(
      decodeEvent({
        _tag: "ResyncRequired",
        occurredAt: "2026-08-28T08:00:02.000Z",
        reason: "cursor-expired",
        earliestCursor: null,
        latestCursor: null,
      }),
    );
    expect(first.query()).toEqual({});
    expect(createLiveCursorState(projectId, storage).query()).toEqual({});
  });

  it("recognizes hosted incident outbox changes as tool-scope changes", () => {
    expect(changesIncidentScope(productEvent("incident.opened"))).toBe(true);
    expect(changesIncidentScope(productEvent("incident.closed"))).toBe(true);
    expect(changesIncidentScope(productEvent("timeline.entry_added"))).toBe(false);
  });

  it("uses bounded exponential reconnect delays", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(reconnectDelay)).toEqual([
      500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000,
    ]);
    expect(reconnectDelay(100)).toBe(15_000);
  });

  it("keeps transient reconnects out of the product UI", () => {
    expect(shouldShowLiveUpdateNotice(1)).toBe(false);
    expect(shouldShowLiveUpdateNotice(2)).toBe(false);
    expect(shouldShowLiveUpdateNotice(3)).toBe(true);
  });

  it("honors the stream failure retryability contract", () => {
    expect(
      isRetryableLiveFailure(new StreamFailure({ message: "temporary", retryable: true })),
    ).toBe(true);
    expect(
      isRetryableLiveFailure(new StreamFailure({ message: "terminal", retryable: false })),
    ).toBe(false);
  });

  it("does not commit an event cursor when an active query refetch fails", async () => {
    const storage = makeStorage();
    const cursor = createLiveCursorState(projectId, storage);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    let refetchFails = false;
    const queryOptions = {
      queryKey: ["groundtruth", String(projectId), "overview"] as const,
      queryFn: async () => {
        if (refetchFails) throw new StreamFailure({ message: "refetch failed", retryable: true });
        return { status: "ready" };
      },
    };
    await queryClient.fetchQuery(queryOptions);
    const observer = new QueryObserver(queryClient, queryOptions);
    const unsubscribe = observer.subscribe(() => undefined);
    refetchFails = true;

    const exit = await Effect.runPromiseExit(
      commitLiveEvent(productEvent(), {
        invalidateQueries: () => invalidateLiveQueries(queryClient, projectId),
        observe: cursor.observe,
        refreshSession: async () => undefined,
        updateRuntimeSnapshot: () => undefined,
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(cursor.query()).toEqual({});
    unsubscribe();
    queryClient.clear();
  });

  it("commits heartbeat cursors without refreshing queries", async () => {
    const cursor = createLiveCursorState(projectId, makeStorage());
    let invalidations = 0;
    const heartbeat = decodeEvent({
      _tag: "Heartbeat",
      occurredAt: "2026-08-28T08:00:01.000Z",
      cursor: "43",
    });

    await Effect.runPromise(
      commitLiveEvent(heartbeat, {
        invalidateQueries: async () => {
          invalidations += 1;
        },
        observe: cursor.observe,
        refreshSession: async () => undefined,
        updateRuntimeSnapshot: () => undefined,
      }),
    );

    expect(cursor.query()).toEqual({ cursor: "43" });
    expect(invalidations).toBe(0);
  });
});
