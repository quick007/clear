import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { AuthApi } from "./groups/auth.ts";
import { AlertsApi } from "./groups/alerts.ts";
import { BoardApi } from "./groups/board.ts";
import { CollectorApi } from "./groups/collector.ts";
import { DeploysApi } from "./groups/deploys.ts";
import { HealthApi } from "./groups/health.ts";
import { IncidentsApi } from "./groups/incidents.ts";
import { IngestKeysApi } from "./groups/ingest-keys.ts";
import { LiveApi } from "./groups/live.ts";
import { OverviewApi } from "./groups/overview.ts";
import { PublicStatusApi } from "./groups/public-status.ts";
import { SandboxApi } from "./groups/sandbox.ts";
import { TelemetryApi } from "./groups/telemetry.ts";

export class GroundtruthApi extends HttpApi.make("groundtruth")
  .add(
    HealthApi,
    PublicStatusApi,
    AuthApi,
    AlertsApi,
    OverviewApi,
    TelemetryApi,
    BoardApi,
    IncidentsApi,
    IngestKeysApi,
    DeploysApi,
    SandboxApi,
    LiveApi,
    CollectorApi,
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Clear API",
      version: "0.1.0",
      description: "Typed observability API for people and their agents",
      license: {
        name: "MIT",
        url: "https://opensource.org/license/mit",
      },
    }),
  ) {}
