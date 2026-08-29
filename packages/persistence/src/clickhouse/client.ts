import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { Context, Effect, Layer, Redacted } from "effect";
import { PersistenceConfig } from "../config.ts";

export interface ClickHouseShape {
  readonly client: ClickHouseClient;
  readonly admin: ClickHouseClient;
}

export class ClickHouse extends Context.Service<ClickHouse, ClickHouseShape>()(
  "Groundtruth/ClickHouse",
) {}

export const ClickHouseLive = Layer.effect(
  ClickHouse,
  Effect.gen(function* () {
    const config = yield* PersistenceConfig;
    return yield* Effect.acquireRelease(
      Effect.sync(() => {
        const common = {
          url: config.clickhouseUrl,
          username: config.clickhouseUsername,
          password: Redacted.value(config.clickhousePassword),
          application: "groundtruth",
          request_timeout: 30_000, // 30 seconds
        } as const;
        return {
          client: createClient({ ...common, database: config.clickhouseDatabase }),
          admin: createClient({ ...common, database: "default" }),
        };
      }),
      ({ client, admin }) =>
        Effect.promise(() => Promise.all([client.close(), admin.close()]).then(() => undefined)),
    );
  }),
);
