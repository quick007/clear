import { Clock, Effect, Layer, Metric } from "effect";
import { Headers, HttpMiddleware, HttpServerError, HttpServerRequest } from "effect/unstable/http";
import { backendRequestDuration, backendRequests } from "./BackendMetrics.js";

export const redactedHeaderNames = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-clear-ingest-key",
  "x-groundtruth-ingest-key",
  "x-groundtruth-project-id",
  "x-groundtruth-sandbox-session",
] as const;

export const requestPathname = (url: string) => new URL(url, "http://clear.internal").pathname;

export const isInternalTelemetryPath = (pathname: string) =>
  pathname === "/internal/v1/ingest/authorize" || pathname.startsWith("/internal/v1/telemetry/");

export const isTraceSuppressedPath = (pathname: string) =>
  isInternalTelemetryPath(pathname) ||
  pathname === "/health" ||
  pathname === "/v1/auth" ||
  pathname.startsWith("/v1/auth/");

export const requestRouteFamily = (pathname: string) => {
  if (pathname === "/health") return "/health";
  if (pathname === "/v1/public/status") return "/v1/public/status";
  if (pathname.startsWith("/internal/v1/")) return "/internal/v1/*";
  if (pathname === "/v1/auth" || pathname.startsWith("/v1/auth/")) return "/v1/auth/*";
  if (pathname === "/v1/projects" || pathname.startsWith("/v1/projects/")) {
    return "/v1/projects/:projectId/*";
  }
  if (pathname === "/v1/sandbox" || pathname.startsWith("/v1/sandbox/")) {
    return "/v1/sandbox/*";
  }
  return "other";
};

export const HeaderRedactionLive = Layer.succeed(Headers.CurrentRedactedNames)(redactedHeaderNames);

export const TraceSuppressionLive = Layer.succeed(HttpMiddleware.TracerDisabledWhen)((request) =>
  isTraceSuppressedPath(requestPathname(request.url)),
);

const suppressInternalResponseLogs = HttpMiddleware.make((httpApp) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    return yield* isInternalTelemetryPath(requestPathname(request.url))
      ? HttpMiddleware.withLoggerDisabled(httpApp)
      : httpApp;
  }),
);

const requestMetrics = HttpMiddleware.make((httpApp) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const pathname = requestPathname(request.url);
    if (isInternalTelemetryPath(pathname)) return yield* httpApp;

    const startedAt = yield* Clock.currentTimeMillis;
    const exit = yield* Effect.exit(httpApp);
    const finishedAt = yield* Clock.currentTimeMillis;
    const response = HttpServerError.exitResponse(exit);
    const attributes = {
      "http.request.method": request.method,
      "http.response.status_code": String(response.status),
      "http.route": requestRouteFamily(pathname),
    };
    yield* Effect.all(
      [
        Metric.update(Metric.withAttributes(backendRequests, attributes), 1),
        Metric.update(
          Metric.withAttributes(backendRequestDuration, attributes),
          Math.max(0, finishedAt - startedAt),
        ),
      ],
      { discard: true },
    );
    return yield* exit;
  }),
);

export const BackendHttpMiddleware = HttpMiddleware.make((httpApp) =>
  suppressInternalResponseLogs(requestMetrics(HttpMiddleware.tracer(httpApp))),
);

export const HttpTelemetryPolicyLive = Layer.mergeAll(HeaderRedactionLive, TraceSuppressionLive);
