import {
  createClient,
  type ClickHouseClient,
  type ClickHouseClientConfigOptions,
} from "@clickhouse/client";
import { Context, Effect, Layer, Redacted } from "effect";
import { PersistenceConfig, type PersistenceConfigShape } from "../config.ts";

export interface ClickHouseShape {
  readonly client: ClickHouseClient;
  readonly admin: ClickHouseClient;
}

export class ClickHouse extends Context.Service<ClickHouse, ClickHouseShape>()(
  "Groundtruth/ClickHouse",
) {}

export const ClickHouseMaxOpenConnections = 4;

export const clickHouseClientOptions = (
  config: PersistenceConfigShape,
  database: string,
): ClickHouseClientConfigOptions => ({
  url: config.clickhouseUrl,
  username: config.clickhouseUsername,
  password: Redacted.value(config.clickhousePassword),
  application: "groundtruth",
  database,
  request_timeout: 30_000, // 30 seconds
  max_open_connections: ClickHouseMaxOpenConnections,
});

export const ClickHouseLive = Layer.effect(
  ClickHouse,
  Effect.gen(function* () {
    const config = yield* PersistenceConfig;
    return yield* Effect.acquireRelease(
      Effect.sync(() => {
        return {
          client: createClient(clickHouseClientOptions(config, config.clickhouseDatabase)),
          admin: createClient(clickHouseClientOptions(config, "default")),
        };
      }),
      ({ client, admin }) =>
        Effect.promise(() => Promise.all([client.close(), admin.close()]).then(() => undefined)),
    );
  }),
);
