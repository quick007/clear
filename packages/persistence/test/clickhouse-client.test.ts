import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PersistenceConfig, PersistenceConfigTest } from "../src/config.ts";
import { clickHouseClientOptions, ClickHouseMaxOpenConnections } from "../src/clickhouse/client.ts";

describe("ClickHouse client configuration", () => {
  it("keeps each client pool below the hosted user's concurrent query limit", async () => {
    const config = await Effect.runPromise(
      PersistenceConfig.pipe(Effect.provide(PersistenceConfigTest())),
    );

    const application = clickHouseClientOptions(config, config.clickhouseDatabase);
    const admin = clickHouseClientOptions(config, "default");

    expect(ClickHouseMaxOpenConnections).toBe(4);
    expect(application.max_open_connections).toBe(4);
    expect(admin.max_open_connections).toBe(4);
  });
});
