import { ProjectId, type Session } from "@groundtruth/domain";
import { Context } from "effect";
import { HttpApiMiddleware, HttpApiSecurity, OpenApi } from "effect/unstable/httpapi";
import {
  IngestKeyRejectedError,
  QuotaExceededError,
  ServiceUnavailable,
  Unauthorized,
} from "./errors.ts";

export class CurrentSession extends Context.Service<CurrentSession, Session>()(
  "Groundtruth/Api/CurrentSession",
) {}

export class AuthorizedIngestProject extends Context.Service<AuthorizedIngestProject, ProjectId>()(
  "Groundtruth/Api/AuthorizedIngestProject",
) {}

const sessionCookie = HttpApiSecurity.apiKey({
  key: "groundtruth_session",
  in: "cookie",
}).pipe(
  HttpApiSecurity.annotateMerge(
    OpenApi.annotations({
      description: "Hosted Clear session cookie",
    }),
  ),
);

const sandboxSession = HttpApiSecurity.apiKey({
  key: "x-groundtruth-sandbox-session",
  in: "header",
}).pipe(
  HttpApiSecurity.annotateMerge(
    OpenApi.annotations({
      description: "Ephemeral sandbox session identifier",
    }),
  ),
);

export class GroundtruthAccess extends HttpApiMiddleware.Service<
  GroundtruthAccess,
  {
    provides: CurrentSession;
  }
>()("Groundtruth/Api/GroundtruthAccess", {
  error: [Unauthorized, QuotaExceededError, ServiceUnavailable],
  security: {
    groundtruthSession: sessionCookie,
    groundtruthSandbox: sandboxSession,
  },
}) {}

export class SitesServiceAccess extends HttpApiMiddleware.Service<SitesServiceAccess>()(
  "Groundtruth/Api/SitesServiceAccess",
  {
    error: Unauthorized,
    security: {
      groundtruthSitesService: HttpApiSecurity.bearer,
    },
  },
) {}

export class CollectorServiceAccess extends HttpApiMiddleware.Service<CollectorServiceAccess>()(
  "Groundtruth/Api/CollectorServiceAccess",
  {
    error: Unauthorized,
    security: {
      groundtruthCollectorService: HttpApiSecurity.bearer,
    },
  },
) {}

export class IngestKeyAccess extends HttpApiMiddleware.Service<
  IngestKeyAccess,
  {
    provides: AuthorizedIngestProject;
  }
>()("Groundtruth/Api/IngestKeyAccess", {
  error: [IngestKeyRejectedError, ServiceUnavailable],
  security: {
    clearIngestKey: HttpApiSecurity.apiKey({
      key: "x-clear-ingest-key",
      in: "header",
    }),
  },
}) {}
