import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";
import { RequestAuth } from "./auth.js";
import { PaymentsConfig } from "./config.js";
import { FailureModel } from "./failure-model.js";
import { PaymentsService } from "./payments-service.js";
import { Routes } from "./routes.js";
import { TelemetryLive } from "./telemetry.js";

const HttpLive = HttpRouter.serve(Routes, {
  middleware: HttpMiddleware.tracer,
}).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
      port: Config.port("PORT").pipe(Config.withDefault(4_102)),
    }),
  ),
);

const AppLive = HttpLive.pipe(
  Layer.provide(PaymentsService.layer),
  Layer.provide(FailureModel.layer),
  Layer.provide(RequestAuth.layer),
  Layer.provide(PaymentsConfig.layer),
  Layer.provide(TelemetryLive),
);

Layer.launch(AppLive).pipe(NodeRuntime.runMain);
