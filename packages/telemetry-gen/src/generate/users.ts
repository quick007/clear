import { Array as EffectArray } from "effect";

import type { UserId } from "../domain/primitives.ts";
import { userId } from "../domain/primitives.ts";
import type { ScenarioConfig } from "../domain/scenario.ts";
import { integer } from "../random.ts";

export interface UserAllocation {
  readonly userId: UserId;
  readonly count: number;
}

export interface StatusAllocation extends UserAllocation {
  readonly statusCode: number;
}

export const selectUsers = (config: ScenarioConfig, phaseBucket: number, activeUsers: number) => {
  const poolSize = config.uniqueUsersPerFiveMinutes;
  const start =
    (integer(config.seed, 0, "user-cohort-offset", 0, poolSize - 1) + phaseBucket * 29) % poolSize;

  return EffectArray.makeBy(activeUsers, (offset) =>
    userId(`user-${((start + offset) % poolSize).toString().padStart(4, "0")}`),
  );
};

export const allocateAcrossUsers = (
  total: number,
  users: ReadonlyArray<UserId>,
  config: ScenarioConfig,
  phaseBucket: number,
  channel: string,
) => {
  const base = Math.floor(total / users.length);
  const remainder = total % users.length;
  const remainderStart = integer(
    config.seed,
    phaseBucket,
    `${channel}-allocation`,
    0,
    users.length - 1,
  );

  return users.map((id, index) => ({
    userId: id,
    count:
      base +
      (index >= remainderStart && index < remainderStart + remainder ? 1 : 0) +
      (remainderStart + remainder > users.length &&
      index < remainderStart + remainder - users.length
        ? 1
        : 0),
  }));
};

export const splitErrors = (
  allocations: ReadonlyArray<UserAllocation>,
  errorCount: number,
  config: ScenarioConfig,
  phaseBucket: number,
  channel: string,
) => {
  const errors = new Map<UserId, number>();
  const start = integer(config.seed, phaseBucket, `${channel}-errors`, 0, allocations.length - 1);
  let remaining = errorCount;
  let cursor = start;

  while (remaining > 0) {
    const allocation = allocations[cursor % allocations.length];
    if (allocation === undefined) {
      throw new Error("User allocation unexpectedly missing");
    }
    const alreadyErrored = errors.get(allocation.userId) ?? 0;
    if (alreadyErrored < allocation.count) {
      errors.set(allocation.userId, alreadyErrored + 1);
      remaining -= 1;
    }
    cursor += 1;
  }

  return allocations.flatMap((allocation): ReadonlyArray<StatusAllocation> => {
    const failed = errors.get(allocation.userId) ?? 0;
    const succeeded = allocation.count - failed;
    return [
      ...(succeeded > 0 ? [{ ...allocation, count: succeeded, statusCode: 200 }] : []),
      ...(failed > 0 ? [{ ...allocation, count: failed, statusCode: 503 }] : []),
    ];
  });
};
