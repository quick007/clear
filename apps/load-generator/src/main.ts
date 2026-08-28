import { NodeHttpClient, NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";
import { RequestAuth } from "./auth.js";
import { AutostartLive } from "./autostart.js";
import { CheckoutClient } from "./checkout-client.js";
import { GeneratorConfig } from "./config.js";
import { PaymentsAdmin } from "./payments-admin.js";
import { Routes } from "./routes.js";
import { ScenarioController } from "./scenario-controller.js";
import { TelemetryLive } from "./telemetry.js";

const HttpLive = HttpRouter.serve(Routes, {
  middleware: HttpMiddleware.tracer,
}).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
      port: Config.port("PORT").pipe(Config.withDefault(4_103)),
    }),
  ),
);

const ClientsLive = Layer.mergeAll(CheckoutClient.layer, PaymentsAdmin.layer);

const AppLive = Layer.mergeAll(HttpLive, AutostartLive).pipe(
  Layer.provide(RequestAuth.layer),
  Layer.provide(ScenarioController.layer),
  Layer.provide(ClientsLive),
  Layer.provide(GeneratorConfig.layer),
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.provide(TelemetryLive),
);

Layer.launch(AppLive).pipe(NodeRuntime.runMain);
