import type { SessionId } from "@groundtruth/domain";
import { DateTime } from "effect";

export const sandboxMinimumIdleBeforeEvictionMilliseconds = 10 * 60 * 1_000; // 10 minutes

interface SandboxActivity {
  readonly record: {
    readonly session: {
      readonly createdAt: DateTime.Utc;
    };
  };
  readonly lastActiveAt: number;
}

export const leastRecentlyUsedIdleSession = <Activity extends SandboxActivity>(
  store: ReadonlyMap<SessionId, Activity>,
  now: DateTime.Utc,
) => {
  const cutoff = DateTime.toEpochMillis(now) - sandboxMinimumIdleBeforeEvictionMilliseconds;
  return [...store.entries()]
    .filter(([, stored]) => stored.lastActiveAt <= cutoff)
    .sort(
      ([leftId, left], [rightId, right]) =>
        left.lastActiveAt - right.lastActiveAt ||
        DateTime.toEpochMillis(left.record.session.createdAt) -
          DateTime.toEpochMillis(right.record.session.createdAt) ||
        String(leftId).localeCompare(String(rightId)),
    )[0]?.[0];
};
