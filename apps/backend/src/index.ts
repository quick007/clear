import { NodeCrypto, NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { BootstrapPersistence, PersistenceLive } from "@groundtruth/persistence";
import { Config, Effect, Layer, Schedule } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";
import { AlertEvaluatorRuntime } from "./alerts/AlertEvaluator.js";
import { AlertService } from "./alerts/AlertService.js";
import { ManualAlertService } from "./alerts/ManualAlertService.js";
import { AuthService, AuthServiceMaintenance } from "./auth/AuthService.js";
import { BoardServiceLive } from "./board/BoardServiceLive.js";
import { BackendConfig } from "./config/BackendConfig.js";
import { DeployService } from "./deploys/DeployService.js";
import {
  CollectorServiceAccessLayer,
  GroundtruthAccessLayer,
  IngestKeyAccessLayer,
  SitesServiceAccessLayer,
} from "./http/ApiMiddleware.js";
import { HttpRoutes } from "./http/HttpRoutes.js";
import { IdentityService } from "./identity/IdentityService.js";
import { IncidentServiceLive } from "./incidents/IncidentServiceLive.js";
import { IncidentState } from "./incidents/IncidentState.js";
import { IngestKeyService } from "./ingest/IngestKeyService.js";
import { LiveEventBus } from "./live/LiveEventBus.js";
import { SandboxService } from "./sandbox/SandboxService.js";
import { CollectorIngestService } from "./telemetry/CollectorIngestService.js";
import { CollectorQuotaService } from "./telemetry/CollectorQuotaService.js";
import { TelemetryStore } from "./telemetry/TelemetryStore.js";

const sandboxPruneInterval = "10 minutes"; // 10 minutes
const sandboxTickInterval = "5 seconds"; // 5 seconds
const collectorQuotaPruneInterval = "1 minute"; // 1 minute

const PersistenceReady = Layer.effectDiscard(
  Effect.flatMap(BootstrapPersistence, (bootstrap) => bootstrap.run),
).pipe(Layer.provideMerge(PersistenceLive));

const LiveEventsLive = LiveEventBus.layerDurable.pipe(Layer.provideMerge(PersistenceReady));

const FoundationLive = Layer.mergeAll(
  BackendConfig.layer,
  NodeCrypto.layer,
  IncidentState.layer,
  LiveEventsLive,
);

const PrimaryServicesLive = Layer.mergeAll(
  AuthService.layerPersistence,
  IdentityService.layerPersistence,
  IngestKeyService.layerPersistence,
  BoardServiceLive,
  IncidentServiceLive,
  AlertService.layer,
  ManualAlertService.layer,
  TelemetryStore.layerPersistence,
).pipe(Layer.provideMerge(FoundationLive));

const AuthServicesLive = AuthServiceMaintenance.pipe(Layer.provideMerge(PrimaryServicesLive));

const DeployServicesLive = DeployService.layerPersistence.pipe(
  Layer.provideMerge(AuthServicesLive),
);

const AlertServicesLive = AlertEvaluatorRuntime.pipe(Layer.provideMerge(DeployServicesLive));

const CollectorQuotaLive = CollectorQuotaService.layer.pipe(Layer.provideMerge(AlertServicesLive));

const CollectorQuotaMaintenanceLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const quotas = yield* CollectorQuotaService;
    yield* quotas
      .pruneStale()
      .pipe(Effect.repeat(Schedule.spaced(collectorQuotaPruneInterval)), Effect.forkScoped);
  }),
).pipe(Layer.provideMerge(CollectorQuotaLive));

const CollectorServicesLive = CollectorIngestService.layer.pipe(
  Layer.provideMerge(CollectorQuotaMaintenanceLive),
);

const SandboxServicesLive = SandboxService.layer.pipe(Layer.provideMerge(CollectorServicesLive));

const SandboxMaintenanceLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const sandboxes = yield* SandboxService;
    const prune = sandboxes
      .pruneExpired()
      .pipe(Effect.catch((error) => Effect.logWarning("Sandbox cleanup failed", { error })));
    const tick = sandboxes
      .advanceActive()
      .pipe(Effect.catch((error) => Effect.logWarning("Sandbox telemetry tick failed", { error })));
    yield* prune.pipe(Effect.repeat(Schedule.spaced(sandboxPruneInterval)), Effect.forkScoped);
    yield* tick.pipe(Effect.repeat(Schedule.spaced(sandboxTickInterval)), Effect.forkScoped);
  }),
).pipe(Layer.provideMerge(SandboxServicesLive));

const PublicServicesLive = Layer.mergeAll(SandboxMaintenanceLive, PrimaryServicesLive);

const RuntimeLayers = Layer.mergeAll(
  GroundtruthAccessLayer,
  SitesServiceAccessLayer,
  CollectorServiceAccessLayer,
  IngestKeyAccessLayer,
).pipe(Layer.provideMerge(PublicServicesLive));

const RoutesLive = HttpRoutes.pipe(Layer.provide(RuntimeLayers));

const ServerLive = HttpRouter.serve(RoutesLive, {
  middleware: HttpMiddleware.tracer,
}).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.string("GROUNDTRUTH_HOST").pipe(Config.withDefault("0.0.0.0")),
      port: Config.port("GROUNDTRUTH_PORT").pipe(Config.withDefault(3_000)),
    }),
  ),
);

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
