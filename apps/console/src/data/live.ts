import { EventCursor, type LiveEvent } from "@groundtruth/api-contract";
import type { ProjectId } from "@groundtruth/domain";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { Duration, Effect, Option, Schedule, Schema, Stream } from "effect";
import { useEffect, useState } from "react";

import { getConsoleRuntime } from "../api/runtime";
import { ConsoleUnavailable, normalizeConsoleFailure } from "../errors";
import { queryKeys } from "./query-keys";

const initialReconnectDelay = 500; // 500 milliseconds
const maximumReconnectDelay = 15 * 1_000; // 15 seconds
const noticeFailureThreshold = 3;
const cursorStoragePrefix = "groundtruth.liveCursor.";

export type LiveUpdateStatus = "healthy" | "paused" | "retrying";

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

export const shouldShowLiveUpdateNotice = (failedAttempts: number) =>
  failedAttempts >= noticeFailureThreshold;

export const isRetryableLiveFailure = (error: unknown) => {
  const failure = normalizeConsoleFailure(error);
  return failure._tag === "ConsoleUnavailable" && failure.retryable;
};

export const changesIncidentScope = (event: LiveEvent) =>
  event._tag === "IncidentChanged" ||
  event._tag === "ResyncRequired" ||
  (event._tag === "ProductStateChanged" && event.kind.startsWith("incident."));

export interface LiveEventCommitOperations {
  readonly invalidateQueries: () => Promise<void>;
  readonly observe: (event: LiveEvent) => void;
  readonly refreshSession: () => Promise<unknown>;
  readonly updateRuntimeSnapshot: () => void;
}

export const invalidateLiveQueries = (queryClient: QueryClient, projectId: ProjectId) =>
  queryClient.invalidateQueries(
    { queryKey: ["groundtruth", String(projectId)] },
    { throwOnError: true },
  );

export const commitLiveEvent = (event: LiveEvent, operations: LiveEventCommitOperations) =>
  Effect.gen(function* () {
    if (event._tag === "Heartbeat") {
      yield* Effect.sync(() => operations.observe(event));
      return;
    }

    if (changesIncidentScope(event)) {
      yield* Effect.tryPromise({
        try: operations.refreshSession,
        catch: normalizeConsoleFailure,
      });
      yield* Effect.sync(operations.updateRuntimeSnapshot);
    }

    yield* Effect.tryPromise({
      try: operations.invalidateQueries,
      catch: normalizeConsoleFailure,
    });
    yield* Effect.sync(() => operations.observe(event));
  });

export function useLiveProjectUpdates(projectId: ProjectId | null) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveUpdateStatus>("healthy");

  useEffect(() => {
    setStatus("healthy");
    if (projectId === null) return;

    const controller = new AbortController();
    const cursor = createLiveCursorState(projectId);

    const reconnectSchedule = Schedule.exponential(Duration.millis(initialReconnectDelay)).pipe(
      Schedule.modifyDelay(({ duration }) =>
        Effect.succeed(Duration.min(duration, Duration.millis(maximumReconnectDelay))),
      ),
      Schedule.tap(({ attempt }) =>
        Effect.sync(() => {
          if (shouldShowLiveUpdateNotice(attempt)) setStatus("retrying");
        }),
      ),
    );

    const run = Effect.gen(function* () {
      const runtime = yield* Effect.tryPromise({
        try: () => getConsoleRuntime(),
        catch: normalizeConsoleFailure,
      }).pipe(
        Effect.retry({
          schedule: reconnectSchedule,
          while: isRetryableLiveFailure,
        }),
      );

      const events = Stream.unwrap(
        Effect.suspend(() =>
          runtime.api.client.live.stream({
            params: { projectId },
            query: cursor.query(),
          }),
        ),
      ).pipe(
        Stream.mapError(normalizeConsoleFailure),
        Stream.concat(Stream.fail(new ConsoleUnavailable({ retryable: true }))),
        Stream.tap((event) =>
          Effect.gen(function* () {
            yield* Effect.sync(() => setStatus("healthy"));
            yield* commitLiveEvent(event, {
              invalidateQueries: () => invalidateLiveQueries(queryClient, projectId),
              observe: cursor.observe,
              refreshSession: () => runtime.sessions.refresh(controller.signal),
              updateRuntimeSnapshot: () =>
                queryClient.setQueryData(queryKeys.runtime, runtime.sessions.getSnapshot()),
            });
          }),
        ),
        Stream.catchIf(
          () => true,
          (failure) => {
            if (isRetryableLiveFailure(failure)) return Stream.fail(failure);
            return Stream.fromEffect(Effect.sync(() => setStatus("paused")));
          },
        ),
        Stream.retry(reconnectSchedule),
      );

      yield* Effect.tryPromise({
        try: () => runtime.api.run(Stream.runDrain(events), controller.signal),
        catch: normalizeConsoleFailure,
      });
    }).pipe(
      Effect.match({
        onFailure: (failure) => {
          if (isRetryableLiveFailure(failure)) {
            setStatus("retrying");
          } else {
            setStatus("paused");
          }
        },
        onSuccess: () => undefined,
      }),
    );

    const fiber = Effect.runFork(run);
    return () => {
      controller.abort();
      fiber.interruptUnsafe();
    };
  }, [projectId, queryClient]);

  return status;
}
