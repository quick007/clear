import { drizzle } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer, Redacted } from "effect";
import { Pool } from "pg";
import { PersistenceConfig } from "../config.ts";
import { persistenceError, type PersistenceError, postgresCauseIsRetryable } from "../errors.ts";
import { relations } from "../schema/relations.ts";

const makeDatabase = (pool: Pool) => drizzle({ client: pool, relations });

export type GroundtruthDatabase = ReturnType<typeof makeDatabase>;

export interface PostgresDatabaseShape {
  readonly db: GroundtruthDatabase;
  readonly execute: <A>(
    operation: string,
    evaluate: () => Promise<A>,
  ) => Effect.Effect<A, PersistenceError>;
}

export class PostgresDatabase extends Context.Service<PostgresDatabase, PostgresDatabaseShape>()(
  "Groundtruth/PostgresDatabase",
) {}

export const PostgresDatabaseLive = Layer.effect(
  PostgresDatabase,
  Effect.gen(function* () {
    const config = yield* PersistenceConfig;
    const pool = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new Pool({
            connectionString: Redacted.value(config.databaseUrl),
            max: config.postgresMaxConnections,
            application_name: "groundtruth",
          }),
      ),
      (pool) => Effect.promise(() => pool.end()),
    );
    const db = makeDatabase(pool);

    return PostgresDatabase.of({
      db,
      execute: (operation, evaluate) =>
        Effect.tryPromise({
          try: evaluate,
          catch: (error) =>
            persistenceError("postgres", operation, error, postgresCauseIsRetryable(error)),
        }),
    });
  }),
);
