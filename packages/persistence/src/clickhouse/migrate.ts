import type { ClickHouseClient } from "@clickhouse/client";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Effect } from "effect";
import { PersistenceConfigLive } from "../config.ts";
import { MigrationError } from "../errors.ts";
import { ClickHouse, ClickHouseLive } from "./client.ts";

interface MigrationFile {
  readonly name: string;
  readonly checksum: string;
  readonly statements: ReadonlyArray<string>;
}

interface AppliedMigrationRow {
  readonly migration: string;
  readonly checksum: string;
}

const migrationsDirectory = fileURLToPath(
  new URL("../../../../infra/clickhouse/migrations/", import.meta.url),
);

const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const migrationError = (migration: string, cause: unknown) =>
  new MigrationError({ store: "clickhouse", migration, message: errorMessage(cause) });

const splitSqlStatements = (source: string) => {
  const statements: Array<string> = [];
  let current = "";
  let quote: "'" | '"' | "`" | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        current += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      current += character;
      if (character === "\\") {
        current += next;
        index += 1;
      } else if (character === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      current += character;
      continue;
    }
    if (character === ";") {
      const statement = current.trim();
      if (statement.length > 0) statements.push(statement);
      current = "";
      continue;
    }
    current += character;
  }

  if (quote !== null || blockComment) {
    throw new SyntaxError("Unterminated quote or block comment in ClickHouse migration");
  }
  const finalStatement = current.trim();
  if (finalStatement.length > 0) statements.push(finalStatement);
  return statements;
};

const loadMigrations = Effect.tryPromise({
  try: async () => {
    const names = (await readdir(migrationsDirectory))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort((left, right) => left.localeCompare(right));

    if (names.length === 0) throw new Error("No ClickHouse migrations were found");

    return Promise.all(
      names.map(async (name): Promise<MigrationFile> => {
        const source = await readFile(`${migrationsDirectory}/${name}`, "utf8");
        const statements = splitSqlStatements(source);
        if (statements.length === 0) throw new Error(`Migration ${name} is empty`);
        return {
          name,
          checksum: createHash("sha256").update(source).digest("hex"),
          statements,
        };
      }),
    );
  },
  catch: (cause) => migrationError("discovery", cause),
});

const ensureMigrationLedger = (client: ClickHouseClient) =>
  Effect.tryPromise({
    try: async () => {
      await client.command({
        query: "CREATE DATABASE IF NOT EXISTS groundtruth",
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      await client.command({
        query: `CREATE TABLE IF NOT EXISTS groundtruth.schema_migrations
        (
          migration String,
          checksum FixedString(64),
          applied_at DateTime64(3, 'UTC') DEFAULT now64(3)
        )
        ENGINE = MergeTree
        ORDER BY migration`,
        clickhouse_settings: { wait_end_of_query: 1 },
      });
    },
    catch: (cause) => migrationError("ledger", cause),
  }).pipe(Effect.asVoid);

const loadAppliedMigrations = (client: ClickHouseClient) =>
  Effect.tryPromise({
    try: async () => {
      const result = await client.query({
        query: "SELECT migration, checksum FROM groundtruth.schema_migrations ORDER BY migration",
        format: "JSONEachRow",
      });
      return result.json<AppliedMigrationRow>();
    },
    catch: (cause) => migrationError("ledger", cause),
  });

const applyMigration = (client: ClickHouseClient, migration: MigrationFile) =>
  Effect.gen(function* () {
    yield* Effect.forEach(
      migration.statements,
      (statement) =>
        Effect.tryPromise({
          try: () =>
            client.command({
              query: statement,
              clickhouse_settings: { wait_end_of_query: 1 },
            }),
          catch: (cause) => migrationError(migration.name, cause),
        }),
      { concurrency: 1, discard: true },
    );
    yield* Effect.tryPromise({
      try: () =>
        client.insert<AppliedMigrationRow>({
          table: "groundtruth.schema_migrations",
          columns: ["migration", "checksum"],
          values: [{ migration: migration.name, checksum: migration.checksum }],
          format: "JSONEachRow",
        }),
      catch: (cause) => migrationError(migration.name, cause),
    });
  });

export const runClickHouseMigrations: Effect.Effect<void, MigrationError, ClickHouse> = Effect.gen(
  function* () {
    const { admin: client } = yield* ClickHouse;
    const migrations = yield* loadMigrations;
    yield* ensureMigrationLedger(client);
    const appliedRows = yield* loadAppliedMigrations(client);
    const applied = new Map(appliedRows.map((row) => [row.migration, row.checksum]));

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.name);
      if (existingChecksum !== undefined && existingChecksum !== migration.checksum) {
        return yield* Effect.fail(
          migrationError(migration.name, "Applied migration checksum does not match the file"),
        );
      }
      if (existingChecksum === undefined) yield* applyMigration(client, migration);
    }
  },
);

const mainModule = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (mainModule === import.meta.url) {
  const program = runClickHouseMigrations.pipe(
    Effect.provide(ClickHouseLive),
    Effect.provide(PersistenceConfigLive),
  );
  Effect.runPromise(program).catch((cause: unknown) => {
    console.error(errorMessage(cause));
    process.exitCode = 1;
  });
}
