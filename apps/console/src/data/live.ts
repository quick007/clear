import { EventCursor, type LiveEvent } from "@groundtruth/api-contract";
import type { ProjectId } from "@groundtruth/domain";
import { useQueryClient } from "@tanstack/react-query";
import { Effect, Option, Schema, Stream } from "effect";
import { useEffect } from "react";

import { getConsoleRuntime } from "../api/runtime";
import { queryKeys } from "./query-keys";

const initialReconnectDelay = 500; // 500 milliseconds
const maximumReconnectDelay = 15 * 1_000; // 15 seconds
const cursorStoragePrefix = "groundtruth.liveCursor.";

export interface LiveCursorStorage {
  readonly getItem: (key: string) => string | null;
  readonly removeItem: (key: string) => void;
  readonly setItem: (key: string, value: string) => void;
}

const browserSessionStorage = (): LiveCursorStorage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const storageKey = (projectId: ProjectId) => `${cursorStoragePrefix}${projectId}`;

const readCursor = (projectId: ProjectId, storage: LiveCursorStorage | null) => {
  if (storage === null) return null;
  try {
    return Option.getOrNull(
      Schema.decodeUnknownOption(EventCursor)(storage.getItem(storageKey(projectId))),
    );
  } catch {
    return null;
  }
};

const writeCursor = (
  projectId: ProjectId,
  storage: LiveCursorStorage | null,
  cursor: EventCursor | null,
) => {
  if (storage === null) return;
  try {
    if (cursor === null) storage.removeItem(storageKey(projectId));
    else storage.setItem(storageKey(projectId), cursor);
  } catch {
    // A private browsing policy can disable session storage while the tab is open.
  }
};

const observedCursor = (event: LiveEvent) => {
  switch (event._tag) {
    case "ProductStateChanged":
      return Option.some(event.cursor);
    case "Heartbeat":
      return Option.some(event.cursor);
    case "ResyncRequired":
      return Option.some(event.latestCursor);
    default:
      return Option.none<EventCursor | null>();
  }
};

export const createLiveCursorState = (
  projectId: ProjectId,
  storage: LiveCursorStorage | null = browserSessionStorage(),
) => {
  let cursor = readCursor(projectId, storage);
  return {
    query: () => (cursor === null ? {} : { cursor }),
    observe: (event: LiveEvent) => {
      const observed = observedCursor(event);
      if (Option.isNone(observed)) return;
      cursor = observed.value;
      writeCursor(projectId, storage, cursor);
    },
  };
};

export const reconnectDelay = (attempt: number) =>
  Math.min(initialReconnectDelay * 2 ** Math.min(Math.max(attempt, 0), 20), maximumReconnectDelay);

export const changesIncidentScope = (event: LiveEvent) =>
  event._tag === "IncidentChanged" ||
  event._tag === "ResyncRequired" ||
  (event._tag === "ProductStateChanged" && event.kind.startsWith("incident."));

export function useLiveProjectUpdates(projectId: ProjectId | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (projectId === null) return;

    const controller = new AbortController();
    const cursor = createLiveCursorState(projectId);
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      try {
        const runtime = await getConsoleRuntime();
        await runtime.api.run(
          runtime.api.client.live
            .stream({
              params: { projectId },
              query: cursor.query(),
            })
            .pipe(
              Effect.flatMap((events) =>
                events.pipe(
                  Stream.runForEach((event) =>
                    Effect.promise(async () => {
                      attempt = 0;
                      if (event._tag === "Heartbeat") {
                        cursor.observe(event);
                        return;
                      }
                      if (changesIncidentScope(event)) {
                        await runtime.sessions.refresh(controller.signal);
                        queryClient.setQueryData(queryKeys.runtime, runtime.sessions.getSnapshot());
                      }
                      await queryClient.invalidateQueries({
                        queryKey: ["groundtruth", String(projectId)],
                      });
                      cursor.observe(event);
                    }),
                  ),
                ),
              ),
            ),
          controller.signal,
        );
      } catch {
        // The reconnect path below handles both transport and stream failures.
      }

      if (controller.signal.aborted) return;
      const delay = reconnectDelay(attempt);
      attempt += 1;
      retry = setTimeout(() => void connect(), delay);
    };

    void connect();
    return () => {
      controller.abort();
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [projectId, queryClient]);
}
