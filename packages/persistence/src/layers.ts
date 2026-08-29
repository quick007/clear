import { Layer } from "effect";
import { BootstrapPersistenceLive } from "./bootstrap.ts";
import { ClickHouseLive } from "./clickhouse/client.ts";
import { TelemetryRepositoryLive } from "./clickhouse/telemetry-repository.ts";
import { PersistenceConfigLive } from "./config.ts";
import { IdGeneratorLive } from "./ids.ts";
import { NodeCryptoLive } from "./node-crypto.ts";
import { AuthRepositoriesLive } from "./postgres/auth-repositories.ts";
import { CoreRepositoriesLive } from "./postgres/core-repositories.ts";
import { PostgresDatabaseLive } from "./postgres/database.ts";
import { ManualAlertRepositoryLive } from "./postgres/manual-alert-repository.ts";
import { ProductRepositoriesLive } from "./postgres/product-repositories.ts";
import { ProjectPurgerLive } from "./purge.ts";

const StoresLive = Layer.mergeAll(PostgresDatabaseLive, ClickHouseLive).pipe(
  Layer.provideMerge(PersistenceConfigLive),
);

const IdentifiersLive = IdGeneratorLive.pipe(Layer.provideMerge(NodeCryptoLive));

const DriversLive = Layer.mergeAll(StoresLive, IdentifiersLive);

export const RepositoriesLive = Layer.mergeAll(
  CoreRepositoriesLive,
  AuthRepositoriesLive,
  ProductRepositoriesLive,
  ManualAlertRepositoryLive,
  TelemetryRepositoryLive,
).pipe(Layer.provideMerge(DriversLive));

export const PersistenceLive = Layer.mergeAll(BootstrapPersistenceLive, ProjectPurgerLive).pipe(
  Layer.provideMerge(RepositoriesLive),
);
