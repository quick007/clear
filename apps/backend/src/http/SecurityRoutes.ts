import { Clock, Effect, FileSystem, Layer, Ref } from "effect";
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { BackendConfig } from "../config/BackendConfig.js";

export const sessionCookieName = "groundtruth_session";

const corsMaxAgeSeconds = 10 * 60; // 10 minutes
const maxRequestBodyBytes = 16 * 1024 * 1024;
const rateLimitWindowMillis = 60 * 1_000; // 1 minute
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

interface RateLimitBucket {
  readonly windowStartedAt: number;
  readonly count: number;
}

const requestBodyLimit = HttpMiddleware.make((httpApp) =>
  httpApp.pipe(
    Effect.provideService(HttpServerRequest.MaxBodySize, FileSystem.Size(maxRequestBodyBytes)),
  ),
);

const collectorRequestsPerMinute = 60_000;

const rateLimit = (
  buckets: Ref.Ref<ReadonlyMap<string, RateLimitBucket>>,
  publicRequestsPerMinute: number,
) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (request.method === "OPTIONS") {
        return yield* httpApp;
      }

      const pathname = new URL(request.url, "http://groundtruth.internal").pathname;
      const internalTelemetry = pathname.startsWith("/internal/v1/telemetry/");
      const requestLimit = internalTelemetry ? collectorRequestsPerMinute : publicRequestsPerMinute;
      const key = internalTelemetry ? "collector" : "public";
      const now = yield* Clock.currentTimeMillis;
      const allowed = yield* Ref.modify(buckets, (current) => {
        const previous = current.get(key);
        const active =
          previous === undefined || now - previous.windowStartedAt >= rateLimitWindowMillis
            ? { windowStartedAt: now, count: 0 }
            : previous;
        const next = new Map(
          Array.from(current).filter(
            ([, bucket]) => now - bucket.windowStartedAt < rateLimitWindowMillis,
          ),
        );
        next.set(key, { ...active, count: active.count + 1 });
        return [active.count < requestLimit, next];
      });

      return allowed
        ? yield* httpApp
        : HttpServerResponse.text("Request rate limit exceeded", {
            status: 429,
            headers: { "retry-after": "60" },
          });
    }),
  );

const sandboxCreationRateLimit = (bucket: Ref.Ref<RateLimitBucket | undefined>, limit: number) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const pathname = new URL(request.url, "http://groundtruth.internal").pathname;
      if (request.method !== "POST" || pathname !== "/v1/sandbox/session") {
        return yield* httpApp;
      }

      const now = yield* Clock.currentTimeMillis;
      const attempt = yield* Ref.modify(bucket, (previous) => {
        const active =
          previous === undefined || now - previous.windowStartedAt >= rateLimitWindowMillis
            ? { windowStartedAt: now, count: 0 }
            : previous;
        const observed = active.count + 1;
        return [
          { allowed: active.count < limit, observed },
          { ...active, count: observed },
        ];
      });

      return attempt.allowed
        ? yield* httpApp
        : HttpServerResponse.jsonUnsafe(
            {
              _tag: "QuotaExceeded",
              quota: "sandbox session creations per minute",
              limit,
              observed: attempt.observed,
              message: "Sandbox creation is temporarily busy. Try again in one minute.",
            },
            { status: 429, headers: { "retry-after": "60" } },
          );
    }),
  );

const originGuard = (allowedOrigins: ReadonlySet<string>) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const cookieHeader = request.headers.cookie ?? "";
      const hasSessionCookie = cookieHeader.includes(`${sessionCookieName}=`);

      if (!hasSessionCookie || safeMethods.has(request.method)) {
        return yield* httpApp;
      }

      const origin = request.headers.origin;
      if (origin !== undefined && allowedOrigins.has(origin)) {
        return yield* httpApp;
      }

      return HttpServerResponse.text("Request origin is not allowed", { status: 403 });
    }),
  );

export const SecurityRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* BackendConfig;
    const rateLimitBuckets = yield* Ref.make<ReadonlyMap<string, RateLimitBucket>>(new Map());
    const sandboxCreationBucket = yield* Ref.make<RateLimitBucket | undefined>(undefined);
    const allowedOrigins = [
      config.consoleOrigin,
      ...(config.developmentConsoleOrigin === undefined ? [] : [config.developmentConsoleOrigin]),
    ];

    return Layer.mergeAll(
      HttpRouter.middleware(requestBodyLimit, { global: true }),
      HttpRouter.middleware(rateLimit(rateLimitBuckets, config.publicRequestsPerMinute), {
        global: true,
      }),
      HttpRouter.middleware(
        sandboxCreationRateLimit(sandboxCreationBucket, config.sandboxCreationsPerMinute),
        { global: true },
      ),
      HttpRouter.cors({
        allowedOrigins,
        allowedMethods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
        allowedHeaders: [
          "Authorization",
          "B3",
          "Baggage",
          "Content-Type",
          "Last-Event-ID",
          "Traceparent",
          "Tracestate",
          "X-B3-Flags",
          "X-B3-ParentSpanId",
          "X-B3-Sampled",
          "X-B3-SpanId",
          "X-B3-TraceId",
          "X-Groundtruth-Ingest-Key",
          "X-Groundtruth-Project-Id",
          "X-Groundtruth-Sandbox-Session",
        ],
        exposedHeaders: ["Location"],
        credentials: true,
        maxAge: corsMaxAgeSeconds,
      }),
      HttpRouter.middleware(originGuard(new Set(allowedOrigins)), { global: true }),
    );
  }),
);

export const SecurityRoutesConfigured = SecurityRoutes.pipe(Layer.provide(BackendConfig.layer));
