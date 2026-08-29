import { Effect, Layer } from "effect";
import { ClickHouseLive } from "../clickhouse/client.ts";
import { runClickHouseMigrations } from "../clickhouse/migrate.ts";
import { PostgresDatabaseLive } from "../postgres/database.ts";
import { runPostgresMigrations } from "../postgres/migrate.ts";
import {
  ClickHouseTestInfrastructureLive,
  DatabaseTestInfrastructureLive,
  PostgresTestInfrastructureLive,
} from "./containers.ts";

export const PostgresTestDatabaseLive = PostgresDatabaseLive.pipe(
  Layer.provide(PostgresTestInfrastructureLive),
);

export const ClickHouseTestDatabaseLive = ClickHouseLive.pipe(
  Layer.provide(ClickHouseTestInfrastructureLive),
);

export const DatabaseTestServicesLive = Layer.mergeAll(PostgresDatabaseLive, ClickHouseLive).pipe(
  Layer.provide(DatabaseTestInfrastructureLive),
);

export const MigratedPostgresTestDatabaseLive = Layer.effectDiscard(runPostgresMigrations).pipe(
  Layer.provideMerge(PostgresTestDatabaseLive),
);

export const MigratedClickHouseTestDatabaseLive = Layer.effectDiscard(runClickHouseMigrations).pipe(
  Layer.provideMerge(ClickHouseTestDatabaseLive),
);

export const MigratedDatabaseTestServicesLive = Layer.effectDiscard(
  Effect.all([runPostgresMigrations, runClickHouseMigrations], {
    concurrency: "unbounded",
    discard: true,
  }),
).pipe(Layer.provideMerge(DatabaseTestServicesLive));
