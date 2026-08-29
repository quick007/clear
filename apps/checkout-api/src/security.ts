import { Clock, Effect, FileSystem, Layer, Option, Ref, Semaphore } from "effect";
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

const checkoutPath = "/v1/checkout";
const defaultMaxBodyBytes = 8 * 1_024;
const defaultMaxConcurrentCheckouts = 64;
const defaultRequestsPerWindow = 12_000;
const defaultWindowMillis = 60 * 1_000; // 1 minute
const maxTrackedClients = 4_096;

interface RateLimitBucket {
  readonly count: number;
  readonly windowStartedAt: number;
}

export interface RequestGuardOptions {
  readonly maxBodyBytes?: number;
  readonly maxConcurrentCheckouts?: number;
  readonly requestsPerWindow?: number;
  readonly windowMillis?: number;
}

const isCheckoutRequest = (request: HttpServerRequest.HttpServerRequest) =>
  request.method === "POST" && request.url.split("?", 1)[0] === checkoutPath;

const jsonError = (status: number, code: string, message: string, headers?: HeadersInit) =>
  HttpServerResponse.jsonUnsafe({ code, message }, { status, headers });

const bodyLimit = (maxBodyBytes: number) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const declaredSize = Number(request.headers["content-length"]);

      if (
        isCheckoutRequest(request) &&
        Number.isFinite(declaredSize) &&
        declaredSize > maxBodyBytes
      ) {
        return jsonError(413, "request_too_large", "The checkout request is too large");
      }

      return yield* httpApp.pipe(
        Effect.provideService(HttpServerRequest.MaxBodySize, FileSystem.Size(maxBodyBytes)),
      );
    }),
  );

const clientKey = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrElse(request.remoteAddress, () => "unknown");

const rateLimit = (
  buckets: Ref.Ref<ReadonlyMap<string, RateLimitBucket>>,
  requestsPerWindow: number,
  windowMillis: number,
) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (!isCheckoutRequest(request)) {
        return yield* httpApp;
      }

      const now = yield* Clock.currentTimeMillis;
      const key = clientKey(request);
      const allowed = yield* Ref.modify(buckets, (current) => {
        const active = new Map(
          Array.from(current).filter(([, bucket]) => now - bucket.windowStartedAt < windowMillis),
        );
        const boundedKey = active.has(key) || active.size < maxTrackedClients ? key : "overflow";
        const previous = active.get(boundedKey);
        const bucket = previous === undefined ? { count: 0, windowStartedAt: now } : previous;
        active.set(boundedKey, { ...bucket, count: bucket.count + 1 });
        return [bucket.count < requestsPerWindow, active];
      });

      return allowed
        ? yield* httpApp
        : jsonError(429, "rate_limited", "Checkout traffic is temporarily limited", {
            "retry-after": String(Math.max(1, Math.ceil(windowMillis / 1_000))),
          });
    }),
  );

const concurrencyLimit = (semaphore: Semaphore.Semaphore) =>
  HttpMiddleware.make((httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (!isCheckoutRequest(request)) {
        return yield* httpApp;
      }

      const response = yield* semaphore.withPermitsIfAvailable(1)(httpApp);
      return Option.match(response, {
        onNone: () =>
          jsonError(503, "checkout_busy", "Checkout is temporarily at capacity", {
            "retry-after": "1",
          }),
        onSome: (value) => value,
      });
    }),
  );

export const makeRequestGuards = (options: RequestGuardOptions = {}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const buckets = yield* Ref.make<ReadonlyMap<string, RateLimitBucket>>(new Map());
      const semaphore = yield* Semaphore.make(
        options.maxConcurrentCheckouts ?? defaultMaxConcurrentCheckouts,
      );

      return Layer.mergeAll(
        HttpRouter.middleware(bodyLimit(options.maxBodyBytes ?? defaultMaxBodyBytes), {
          global: true,
        }),
        HttpRouter.middleware(
          rateLimit(
            buckets,
            options.requestsPerWindow ?? defaultRequestsPerWindow,
            options.windowMillis ?? defaultWindowMillis,
          ),
          { global: true },
        ),
        HttpRouter.middleware(concurrencyLimit(semaphore), { global: true }),
      );
    }),
  );

export const RequestGuards = makeRequestGuards();
