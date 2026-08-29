import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import { PersistenceConfigLive } from "../config.ts";
import { MigrationError } from "../errors.ts";
import { PostgresDatabase, PostgresDatabaseLive } from "./database.ts";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export const runPostgresMigrations = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;

  yield* postgres
    .execute("migrate", () =>
      migrate(postgres.db, { migrationsFolder }).then((result) => {
        if (result !== undefined) {
          throw new Error(JSON.stringify(result));
        }
      }),
    )
    .pipe(
      Effect.mapError(
        (error) =>
          new MigrationError({
            store: "postgres",
            migration: "drizzle",
            message: error.message,
          }),
      ),
    );
});

if (import.meta.main) {
  await Effect.runPromise(
    runPostgresMigrations.pipe(
      Effect.provide(PostgresDatabaseLive),
      Effect.provide(PersistenceConfigLive),
    ),
  );
}
