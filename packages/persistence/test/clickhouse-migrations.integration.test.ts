import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { ClickHouse, ClickHouseLive } from "../src/clickhouse/client.ts";
import { runClickHouseMigrations } from "../src/clickhouse/migrate.ts";
import { ClickHouseTestInfrastructureLive } from "../src/testing/containers.ts";

const databaseTestsEnabled = ["1", "true"].includes(
  process.env.GROUNDTRUTH_RUN_DATABASE_TESTS?.toLowerCase() ?? "",
);
const startupTimeout = 5 * 60_000; // 5 minutes
const shutdownTimeout = 30_000; // 30 seconds

const expectedTables = [
  "log_rollups_10s",
  "log_rollups_10s_mv",
  "logs",
  "metric_exemplars",
  "metric_numeric_rollups_10s",
  "metric_numeric_rollups_10s_mv",
  "metric_points",
  "span_events",
  "span_links",
  "spans",
  "trace_rollups_10s",
  "trace_rollups_10s_mv",
] as const;

const projectScopedTables = [
  "logs",
  "metric_exemplars",
  "metric_points",
  "span_events",
  "span_links",
  "spans",
] as const;

const ClickHouseTestDatabaseLive = ClickHouseLive.pipe(
  Layer.provide(ClickHouseTestInfrastructureLive),
);
const MigratedClickHouseTestDatabaseLive = Layer.effectDiscard(runClickHouseMigrations).pipe(
  Layer.provideMerge(ClickHouseTestDatabaseLive),
);

describe.skipIf(!databaseTestsEnabled)("ClickHouse migrations", () => {
  const runtime = ManagedRuntime.make(MigratedClickHouseTestDatabaseLive);

  beforeAll(() => runtime.runPromise(Effect.void), startupTimeout);
  afterAll(() => runtime.dispose(), shutdownTimeout);

  it("targets the ClickHouse 25.8 LTS line", async () => {
    const version = await runtime.runPromise(
      Effect.gen(function* () {
        const { client: clickhouse } = yield* ClickHouse;
        const result = yield* Effect.promise(() =>
          clickhouse.query({ query: "select version() as version", format: "JSONEachRow" }),
        );
        const rows = yield* Effect.promise(() => result.json<{ version: string }>());
        return rows[0]?.version;
      }),
    );

    expect(version).toMatch(/^25\.8\./);
  });

  it("installs raw stores, rollups, and materialized views", async () => {
    const tables = await runtime.runPromise(
      Effect.gen(function* () {
        const { client: clickhouse } = yield* ClickHouse;
        const result = yield* Effect.promise(() =>
          clickhouse.query({
            query: `select name, engine
              from system.tables
              where database = {database:String}
              order by name`,
            format: "JSONEachRow",
            query_params: { database: "groundtruth" },
          }),
        );
        return yield* Effect.promise(() => result.json<{ name: string; engine: string }>());
      }),
    );

    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining([...expectedTables]));
    expect(
      tables
        .filter((table) => table.name.endsWith("_mv"))
        .every((table) => table.engine === "MaterializedView"),
    ).toBe(true);
  });

  it("keeps project scope first in raw-store sorting keys and applies retention TTLs", async () => {
    const definitions = await runtime.runPromise(
      Effect.gen(function* () {
        const { client: clickhouse } = yield* ClickHouse;
        const result = yield* Effect.promise(() =>
          clickhouse.query({
            query: `select name, sorting_key, create_table_query
              from system.tables
              where database = {database:String}
                and name in ({tables:Array(String)})
              order by name`,
            format: "JSONEachRow",
            query_params: {
              database: "groundtruth",
              tables: [...projectScopedTables],
            },
          }),
        );
        return yield* Effect.promise(() =>
          result.json<{ name: string; sorting_key: string; create_table_query: string }>(),
        );
      }),
    );

    expect(definitions).toHaveLength(projectScopedTables.length);
    for (const definition of definitions) {
      expect(definition.sorting_key).toMatch(/^project_id(?:,|$)/);
      expect(definition.create_table_query).toContain("TTL expires_at");
    }
  });

  it("retains compact rollups for six days beyond raw telemetry", async () => {
    const definitions = await runtime.runPromise(
      Effect.gen(function* () {
        const { client: clickhouse } = yield* ClickHouse;
        const result = yield* Effect.promise(() =>
          clickhouse.query({
            query: `select name, create_table_query
              from system.tables
              where database = {database:String}
                and name in ({tables:Array(String)})
              order by name`,
            format: "JSONEachRow",
            query_params: {
              database: "groundtruth",
              tables: ["metric_numeric_rollups_10s", "trace_rollups_10s", "log_rollups_10s"],
            },
          }),
        );
        return yield* Effect.promise(() =>
          result.json<{ name: string; create_table_query: string }>(),
        );
      }),
    );

    expect(definitions).toHaveLength(3);
    for (const definition of definitions) {
      expect(definition.create_table_query).toContain("addDays(expires_at, 6)");
    }
  });

  it("can be applied repeatedly without duplicating its migration ledger", async () => {
    await runtime.runPromise(runClickHouseMigrations);
    await runtime.runPromise(runClickHouseMigrations);

    const migrations = await runtime.runPromise(
      Effect.gen(function* () {
        const { client: clickhouse } = yield* ClickHouse;
        const result = yield* Effect.promise(() =>
          clickhouse.query({
            query: `select migration, count() as count
              from groundtruth.schema_migrations
              group by migration
              order by migration`,
            format: "JSONEachRow",
          }),
        );
        return yield* Effect.promise(() => result.json<{ migration: string; count: string }>());
      }),
    );

    expect(migrations).not.toHaveLength(0);
    expect(migrations.every((migration) => Number(migration.count) === 1)).toBe(true);
  });
});
