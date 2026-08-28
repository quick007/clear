import { NodeHttpClient, NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";
import { CheckoutService } from "./checkout-service.js";
import { CheckoutConfig } from "./config.js";
import { DeployReporterLive } from "./deploy-reporter.js";
import { PaymentsClient } from "./payments-client.js";
import { Routes } from "./routes.js";
import { TelemetryLive } from "./telemetry.js";

const HttpLive = HttpRouter.serve(Routes, {
  middleware: HttpMiddleware.tracer,
}).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
      port: Config.port("PORT").pipe(Config.withDefault(4_101)),
    }),
  ),
);

const DependenciesLive = Layer.mergeAll(
  CheckoutConfig.layer,
  NodeHttpClient.layerUndici,
  TelemetryLive,
);

const AppLive = Layer.mergeAll(HttpLive, DeployReporterLive).pipe(
  Layer.provide(CheckoutService.layer),
  Layer.provide(PaymentsClient.layer),
  Layer.provide(DependenciesLive),
);

Layer.launch(AppLive).pipe(NodeRuntime.runMain);
