import { LiveEvent } from "@groundtruth/api-contract";
import { ProjectId } from "@groundtruth/domain";
import { describe, expect, it } from "vite-plus/test";
import { Schema } from "effect";
import {
  changesIncidentScope,
  createLiveCursorState,
  type LiveCursorStorage,
  reconnectDelay,
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
});
