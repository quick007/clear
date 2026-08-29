import { Effect, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

const databaseTestsEnabled = ["1", "true"].includes(
  process.env.GROUNDTRUTH_RUN_DATABASE_TESTS?.toLowerCase() ?? "",
);
const startupTimeout = 5 * 60_000; // 5 minutes
const shutdownTimeout = 30_000; // 30 seconds

const expectedTables = [
  "accounts",
  "alerts",
  "auth_handoff_codes",
  "dashboards",
  "deploy_events",
  "hosted_sessions",
  "hypotheses",
  "incidents",
  "ingest_keys",
  "manual_alerts",
  "outbox_events",
  "panels",
  "projects",
  "timeline_entries",
] as const;

describe.skipIf(!databaseTestsEnabled)("PostgreSQL migrations", () => {
  let disposeRuntime = () => Promise.resolve();
  let readVersion = () => Promise.reject<number>(new Error("PostgreSQL test runtime not started"));
  let listTables = () =>
    Promise.reject<Array<string>>(new Error("PostgreSQL test runtime not started"));
  let countProjectTables = () =>
    Promise.reject<number>(new Error("PostgreSQL test runtime not started"));
  let reapplyMigrations = () =>
    Promise.reject<void>(new Error("PostgreSQL test runtime not started"));

  beforeAll(async () => {
    const [{ sql }, { PostgresDatabase }, { runPostgresMigrations }, testing] = await Promise.all([
      import("drizzle-orm"),
      import("../src/postgres/database.ts"),
      import("../src/postgres/migrate.ts"),
      import("../src/testing/services.ts"),
    ]);
    const runtime = ManagedRuntime.make(testing.MigratedPostgresTestDatabaseLive);

    disposeRuntime = runtime.dispose;
    readVersion = () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const postgres = yield* PostgresDatabase;
          const result = yield* postgres.execute("read PostgreSQL version", () =>
            postgres.db.execute<{ server_version_num: string }>(sql`show server_version_num`),
          );
          return Number(result.rows[0]?.server_version_num);
        }),
      );
    listTables = () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const postgres = yield* PostgresDatabase;
          const result = yield* postgres.execute("list product-state tables", () =>
            postgres.db.execute<{ table_name: string }>(sql`
              select table_name
              from information_schema.tables
              where table_schema = 'public'
                and table_type = 'BASE TABLE'
              order by table_name
            `),
          );
          return result.rows.map((row) => row.table_name);
        }),
      );
    countProjectTables = () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const postgres = yield* PostgresDatabase;
          const result = yield* postgres.execute("count project tables", () =>
            postgres.db.execute<{ table_count: string }>(sql`
              select count(*)::text as table_count
              from information_schema.tables
              where table_schema = 'public'
                and table_name = 'projects'
            `),
          );
          return Number(result.rows[0]?.table_count);
        }),
      );
    reapplyMigrations = () =>
      runtime.runPromise(
        Effect.gen(function* () {
          yield* runPostgresMigrations;
          yield* runPostgresMigrations;
        }),
      );

    await runtime.runPromise(Effect.void);
  }, startupTimeout);
  afterAll(() => disposeRuntime(), shutdownTimeout);

  it("targets the production PostgreSQL 18 line", async () => {
    const version = await readVersion();

    expect(version).toBeGreaterThanOrEqual(180_000);
    expect(version).toBeLessThan(190_000);
  });

  it("installs the complete product-state schema", async () => {
    const tableNames = await listTables();

    expect(tableNames).toEqual(expect.arrayContaining([...expectedTables]));
  });

  it("can be applied repeatedly without changing the schema", async () => {
    await reapplyMigrations();
    const projectTableCount = await countProjectTables();

    expect(projectTableCount).toBe(1);
  });
});
