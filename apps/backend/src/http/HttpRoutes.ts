import { GroundtruthApi } from "@groundtruth/api-contract";
import { Layer } from "effect";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { AuthHandlers } from "./AuthHandlers.js";
import { AlertHandlers } from "./AlertHandlers.js";
import { BoardHandlers } from "./BoardHandlers.js";
import { CollectorHandlers } from "./CollectorHandlers.js";
import { DeployHandlers } from "./DeployHandlers.js";
import { HealthHandlers } from "./HealthHandlers.js";
import { IncidentHandlers } from "./IncidentHandlers.js";
import { IngestKeyHandlers } from "./IngestKeyHandlers.js";
import { LiveHandlers } from "./LiveHandlers.js";
import { OverviewHandlers } from "./OverviewHandlers.js";
import { SandboxHandlers } from "./SandboxHandlers.js";
import { SecurityRoutes } from "./SecurityRoutes.js";
import { TelemetryHandlers } from "./TelemetryHandlers.js";

const ApiRoutes = HttpApiBuilder.layer(GroundtruthApi, {
  openapiPath: "/openapi.json",
}).pipe(
  Layer.provide([
    HealthHandlers,
    AuthHandlers,
    AlertHandlers,
    OverviewHandlers,
    TelemetryHandlers,
    BoardHandlers,
    IncidentHandlers,
    IngestKeyHandlers,
    DeployHandlers,
    SandboxHandlers,
    LiveHandlers,
    CollectorHandlers,
  ]),
);

const DocumentationRoutes = HttpApiScalar.layer(GroundtruthApi, {
  path: "/docs",
  scalar: {
    darkMode: true,
    defaultOpenAllTags: false,
    hideModels: false,
    layout: "modern",
    showOperationId: true,
    theme: "deepSpace",
  },
});

export const HttpRoutes = Layer.mergeAll(ApiRoutes, DocumentationRoutes, SecurityRoutes);
