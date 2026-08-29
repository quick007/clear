import { HostedSubject, ProjectSlug } from "@groundtruth/domain";
import { Effect, Layer, ManagedRuntime, Option, Redacted } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { BootstrapPersistence, BootstrapPersistenceLive } from "../src/bootstrap.ts";
import { PersistenceConfig } from "../src/config.ts";
import { IdGeneratorLive } from "../src/ids.ts";
import { NodeCryptoLive } from "../src/node-crypto.ts";
import { CoreRepositoriesLive } from "../src/postgres/core-repositories.ts";
import { PostgresDatabaseLive } from "../src/postgres/database.ts";
import { runPostgresMigrations } from "../src/postgres/migrate.ts";
import { ProductRepositoriesLive } from "../src/postgres/product-repositories.ts";
import {
  AccountRepository,
  AlertRepository,
  ProjectRepository,
} from "../src/repositories/services.ts";
import {
  persistenceConfigForPostgresContainer,
  PostgresTestContainer,
  PostgresTestContainerLive,
} from "../src/testing/containers.ts";

const databaseTestsEnabled = ["1", "true"].includes(
  process.env.GROUNDTRUTH_RUN_DATABASE_TESTS?.toLowerCase() ?? "",
);
const startupTimeout = 5 * 60_000; // 5 minutes
const shutdownTimeout = 30_000; // 30 seconds
const testTimeout = 60_000; // 1 minute

const BootstrapConfigLive = Layer.effect(
  PersistenceConfig,
  Effect.map(PostgresTestContainer, (container) => ({
    ...persistenceConfigForPostgresContainer(container),
    bootstrapProjectSlug: Option.some("checkout"),
    bootstrapProjectName: Option.some("Checkout"),
    bootstrapIngestKey: Option.some(Redacted.make("groundtruth-local-ingest-key")),
  })),
).pipe(Layer.provideMerge(PostgresTestContainerLive));
const PostgresLive = PostgresDatabaseLive.pipe(Layer.provideMerge(BootstrapConfigLive));
const MigratedPostgresLive = Layer.effectDiscard(runPostgresMigrations).pipe(
  Layer.provideMerge(PostgresLive),
);
const IdentifiersLive = IdGeneratorLive.pipe(Layer.provideMerge(NodeCryptoLive));
const DriversLive = Layer.mergeAll(MigratedPostgresLive, IdentifiersLive);
const RepositoriesLive = Layer.mergeAll(CoreRepositoriesLive, ProductRepositoriesLive).pipe(
  Layer.provideMerge(DriversLive),
);
const BootstrapTestLive = BootstrapPersistenceLive.pipe(Layer.provideMerge(RepositoriesLive));

describe.skipIf(!databaseTestsEnabled)("bootstrap persistence", () => {
  const runtime = ManagedRuntime.make(BootstrapTestLive);

  beforeAll(() => runtime.runPromise(Effect.void), startupTimeout);
  afterAll(() => runtime.dispose(), shutdownTimeout);

  it(
    "creates the checkout alert once for the configured self-hosted project",
    async () => {
      await runtime.runPromise(
        Effect.gen(function* () {
          const bootstrap = yield* BootstrapPersistence;
          expect(yield* bootstrap.run).toBe(true);
          expect(yield* bootstrap.run).toBe(true);

          const accounts = yield* AccountRepository;
          const projects = yield* ProjectRepository;
          const alerts = yield* AlertRepository;
          const account = Option.getOrThrow(
            yield* accounts.findByHostedSubject(HostedSubject.make("bootstrap@local.groundtruth")),
          );
          const project = Option.getOrThrow(
            yield* projects.findBySlug(account.id, ProjectSlug.make("checkout")),
          );
          const configured = (yield* alerts.list(project.id)).filter(
            ({ name }) => name === "Checkout upstream request rate",
          );

          expect(configured).toHaveLength(1);
          expect(configured[0]).toMatchObject({
            serviceName: "checkout-api",
            metricName: "upstream.client.requests",
            aggregation: "rate",
            comparison: "above",
            threshold: 90,
            windowSeconds: 60,
            severity: "critical",
            enabled: true,
          });
        }),
      );
    },
    testTimeout,
  );
});
