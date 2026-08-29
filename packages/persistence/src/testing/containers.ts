import { ClickHouseContainer, type StartedClickHouseContainer } from "@testcontainers/clickhouse";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { PersistenceConfig, type PersistenceConfigShape } from "../config.ts";

export const POSTGRES_TEST_IMAGE =
  "postgres:18.6-alpine3.24@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2";
export const CLICKHOUSE_TEST_IMAGE =
  "clickhouse/clickhouse-server:25.8.33.6-alpine@sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146";

const postgresTestDatabase = "groundtruth_test";
const clickhouseTestDatabase = "groundtruth";
const testUsername = "groundtruth";
const testPassword = "groundtruth";
const startupTimeout = 2 * 60_000; // 2 minutes

export const DatabaseTestOperation = Schema.Literals(["start", "stop"]);
export type DatabaseTestOperation = typeof DatabaseTestOperation.Type;

export class DatabaseTestContainerError extends Schema.TaggedError<DatabaseTestContainerError>()(
  "DatabaseTestContainerError",
  {
    store: Schema.Literals(["postgres", "clickhouse"]),
    operation: DatabaseTestOperation,
    message: Schema.String,
  },
) {}

const containerError = (
  store: "postgres" | "clickhouse",
  operation: DatabaseTestOperation,
  cause: unknown,
) =>
  new DatabaseTestContainerError({
    store,
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export class PostgresTestContainer extends Context.Service<
  PostgresTestContainer,
  StartedPostgreSqlContainer
>()("Groundtruth/PostgresTestContainer") {}

export class ClickHouseTestContainer extends Context.Service<
  ClickHouseTestContainer,
  StartedClickHouseContainer
>()("Groundtruth/ClickHouseTestContainer") {}

export interface DatabaseTestContainersShape {
  readonly postgres: StartedPostgreSqlContainer;
  readonly clickhouse: StartedClickHouseContainer;
}

export class DatabaseTestContainers extends Context.Service<
  DatabaseTestContainers,
  DatabaseTestContainersShape
>()("Groundtruth/DatabaseTestContainers") {}

const stopContainer = (
  store: "postgres" | "clickhouse",
  container: StartedPostgreSqlContainer | StartedClickHouseContainer,
) =>
  Effect.tryPromise({
    try: () => container.stop().then(() => undefined),
    catch: (cause) => containerError(store, "stop", cause),
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Failed to stop an integration test container", {
        store: error.store,
        message: error.message,
      }),
    ),
  );

const acquirePostgres = Effect.acquireRelease(
  Effect.tryPromise({
    try: () =>
      new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
        .withDatabase(postgresTestDatabase)
        .withUsername(testUsername)
        .withPassword(testPassword)
        .withStartupTimeout(startupTimeout)
        .start(),
    catch: (cause) => containerError("postgres", "start", cause),
  }),
  (container) => stopContainer("postgres", container),
);

const acquireClickHouse = Effect.acquireRelease(
  Effect.tryPromise({
    try: () =>
      new ClickHouseContainer(CLICKHOUSE_TEST_IMAGE)
        .withDatabase(clickhouseTestDatabase)
        .withUsername(testUsername)
        .withPassword(testPassword)
        .withStartupTimeout(startupTimeout)
        .start(),
    catch: (cause) => containerError("clickhouse", "start", cause),
  }),
  (container) => stopContainer("clickhouse", container),
);

export const PostgresTestContainerLive = Layer.effect(PostgresTestContainer, acquirePostgres);

export const ClickHouseTestContainerLive = Layer.effect(ClickHouseTestContainer, acquireClickHouse);

const DatabaseTestContainersFromStarted = Layer.effect(
  DatabaseTestContainers,
  Effect.gen(function* () {
    return {
      postgres: yield* PostgresTestContainer,
      clickhouse: yield* ClickHouseTestContainer,
    };
  }),
);

const StartedTestContainersLive = Layer.mergeAll(
  PostgresTestContainerLive,
  ClickHouseTestContainerLive,
);

export const DatabaseTestContainersLive = DatabaseTestContainersFromStarted.pipe(
  Layer.provideMerge(StartedTestContainersLive),
);

export const persistenceConfigForContainers = (
  containers: DatabaseTestContainersShape,
): PersistenceConfigShape => ({
  databaseUrl: Redacted.make(containers.postgres.getConnectionUri()),
  postgresMaxConnections: 4,
  clickhouseUrl: containers.clickhouse.getHttpUrl(),
  clickhouseDatabase: containers.clickhouse.getDatabase(),
  clickhouseUsername: containers.clickhouse.getUsername(),
  clickhousePassword: Redacted.make(containers.clickhouse.getPassword()),
  bootstrapProjectSlug: Option.none(),
  bootstrapProjectName: Option.none(),
  bootstrapIngestKey: Option.none(),
});

const defaultTestConfig = (): PersistenceConfigShape => ({
  databaseUrl: Redacted.make("postgres://groundtruth:groundtruth@localhost:5432/groundtruth"),
  postgresMaxConnections: 4,
  clickhouseUrl: "http://localhost:8123",
  clickhouseDatabase: clickhouseTestDatabase,
  clickhouseUsername: testUsername,
  clickhousePassword: Redacted.make(testPassword),
  bootstrapProjectSlug: Option.none(),
  bootstrapProjectName: Option.none(),
  bootstrapIngestKey: Option.none(),
});

export const persistenceConfigForPostgresContainer = (
  postgres: StartedPostgreSqlContainer,
): PersistenceConfigShape => ({
  ...defaultTestConfig(),
  databaseUrl: Redacted.make(postgres.getConnectionUri()),
});

export const persistenceConfigForClickHouseContainer = (
  clickhouse: StartedClickHouseContainer,
): PersistenceConfigShape => ({
  ...defaultTestConfig(),
  clickhouseUrl: clickhouse.getHttpUrl(),
  clickhouseDatabase: clickhouse.getDatabase(),
  clickhouseUsername: clickhouse.getUsername(),
  clickhousePassword: Redacted.make(clickhouse.getPassword()),
});

export const PersistenceConfigFromTestContainers = Layer.effect(
  PersistenceConfig,
  Effect.map(DatabaseTestContainers, persistenceConfigForContainers),
);

export const DatabaseTestInfrastructureLive = PersistenceConfigFromTestContainers.pipe(
  Layer.provideMerge(DatabaseTestContainersLive),
);

const PersistenceConfigFromPostgresTestContainer = Layer.effect(
  PersistenceConfig,
  Effect.map(PostgresTestContainer, persistenceConfigForPostgresContainer),
);

const PersistenceConfigFromClickHouseTestContainer = Layer.effect(
  PersistenceConfig,
  Effect.map(ClickHouseTestContainer, persistenceConfigForClickHouseContainer),
);

export const PostgresTestInfrastructureLive = PersistenceConfigFromPostgresTestContainer.pipe(
  Layer.provideMerge(PostgresTestContainerLive),
);

export const ClickHouseTestInfrastructureLive = PersistenceConfigFromClickHouseTestContainer.pipe(
  Layer.provideMerge(ClickHouseTestContainerLive),
);
