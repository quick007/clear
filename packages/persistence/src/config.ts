import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

export interface PersistenceConfigShape {
  readonly databaseUrl: Redacted.Redacted<string>;
  readonly postgresMaxConnections: number;
  readonly clickhouseUrl: string;
  readonly clickhouseDatabase: string;
  readonly clickhouseUsername: string;
  readonly clickhousePassword: Redacted.Redacted<string>;
  readonly bootstrapProjectSlug: Option.Option<string>;
  readonly bootstrapProjectName: Option.Option<string>;
  readonly bootstrapIngestKey: Option.Option<Redacted.Redacted<string>>;
}

export class PersistenceConfig extends Context.Service<PersistenceConfig, PersistenceConfigShape>()(
  "Groundtruth/PersistenceConfig",
) {}

const clickhouseUrl = Config.string("GROUNDTRUTH_CLICKHOUSE_URL").pipe(
  Config.orElse(() =>
    Config.string("GROUNDTRUTH_CLICKHOUSE_HOSTPORT").pipe(
      Config.map((hostport) => `http://${hostport}`),
    ),
  ),
  Config.withDefault("http://localhost:8123"),
);

const persistenceConfig = Config.all({
  databaseUrl: Config.string("GROUNDTRUTH_POSTGRES_URL").pipe(
    Config.orElse(() => Config.string("DATABASE_URL")),
    Config.withDefault("postgres://groundtruth:groundtruth@localhost:5432/groundtruth"),
    Config.map(Redacted.make),
  ),
  postgresMaxConnections: Config.int("GROUNDTRUTH_POSTGRES_MAX_CONNECTIONS").pipe(
    Config.withDefault(10),
  ),
  clickhouseUrl,
  clickhouseDatabase: Config.string("GROUNDTRUTH_CLICKHOUSE_DATABASE").pipe(
    Config.withDefault("groundtruth"),
  ),
  clickhouseUsername: Config.string("GROUNDTRUTH_CLICKHOUSE_USER").pipe(
    Config.withDefault("groundtruth"),
  ),
  clickhousePassword: Config.string("GROUNDTRUTH_CLICKHOUSE_PASSWORD").pipe(
    Config.withDefault("groundtruth"),
    Config.map(Redacted.make),
  ),
  bootstrapProjectSlug: Config.option(Config.string("GROUNDTRUTH_BOOTSTRAP_PROJECT_SLUG")),
  bootstrapProjectName: Config.option(Config.string("GROUNDTRUTH_BOOTSTRAP_PROJECT_NAME")),
  bootstrapIngestKey: Config.option(
    Config.string("GROUNDTRUTH_BOOTSTRAP_INGEST_KEY").pipe(Config.map(Redacted.make)),
  ),
});

export const PersistenceConfigLive = Layer.effect(
  PersistenceConfig,
  Effect.map(persistenceConfig, (config) => ({ ...config })),
);

export const PersistenceConfigTest = (overrides: Partial<PersistenceConfigShape> = {}) =>
  Layer.succeed(PersistenceConfig, {
    databaseUrl: Redacted.make("postgres://groundtruth:groundtruth@localhost:5432/groundtruth"),
    postgresMaxConnections: 4,
    clickhouseUrl: "http://localhost:8123",
    clickhouseDatabase: "groundtruth",
    clickhouseUsername: "groundtruth",
    clickhousePassword: Redacted.make("groundtruth"),
    bootstrapProjectSlug: Option.none(),
    bootstrapProjectName: Option.none(),
    bootstrapIngestKey: Option.none(),
    ...overrides,
  });
