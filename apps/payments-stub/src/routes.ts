import { Effect, Layer } from "effect";
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { RequestAuth } from "./auth.js";
import {
  FailureRateUpdate,
  FailureState,
  PaymentAuthorizationRequest,
  PaymentAuthorizationResponse,
} from "./contracts.js";
import { AuthenticationFailed } from "./errors.js";
import { FailureModel } from "./failure-model.js";
import { PaymentsService } from "./payments-service.js";

const health = HttpServerResponse.jsonUnsafe({
  service: "payments-stub",
  status: "ok",
});

const unauthorized = (error: AuthenticationFailed) =>
  HttpServerResponse.jsonUnsafe(
    {
      code: "unauthorized",
      message: `A valid ${error.scope} token is required`,
    },
    { status: 401 },
  );

const invalidRequest = HttpServerResponse.jsonUnsafe(
  { code: "invalid_request", message: "The request body is invalid" },
  { status: 400 },
);

const withRouteErrors = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catch((error) =>
      Effect.succeed(error instanceof AuthenticationFailed ? unauthorized(error) : invalidRequest),
    ),
    Effect.catchCause(() => Effect.succeed(invalidRequest)),
  );

const authorizeRoute = withRouteErrors(
  HttpMiddleware.withLoggerDisabled(
    Effect.gen(function* () {
      const auth = yield* RequestAuth;
      yield* auth.service;
      const input = yield* HttpServerRequest.schemaBodyJson(PaymentAuthorizationRequest);
      const service = yield* PaymentsService;
      const outcome = yield* service.authorize(input);

      return outcome._tag === "Approved"
        ? yield* HttpServerResponse.schemaJson(PaymentAuthorizationResponse)(outcome.value)
        : HttpServerResponse.jsonUnsafe(
            {
              code: "upstream_unavailable",
              message: "The payment processor is temporarily unavailable",
              retryable: true,
            },
            { status: 503 },
          );
    }),
  ),
);

const stateRoute = withRouteErrors(
  Effect.gen(function* () {
    const auth = yield* RequestAuth;
    yield* auth.control;
    const model = yield* FailureModel;
    return yield* HttpServerResponse.schemaJson(FailureState)(yield* model.state);
  }),
);

const updateRoute = withRouteErrors(
  Effect.gen(function* () {
    const auth = yield* RequestAuth;
    yield* auth.control;
    const input = yield* HttpServerRequest.schemaBodyJson(FailureRateUpdate);
    const model = yield* FailureModel;
    const state = yield* model.update(input);
    yield* Effect.logInfo("Failure rate changed").pipe(
      Effect.annotateLogs({
        failureRate: state.failureRate,
        seed: state.seed,
      }),
    );
    return yield* HttpServerResponse.schemaJson(FailureState)(state);
  }),
);

const resetRoute = withRouteErrors(
  Effect.gen(function* () {
    const auth = yield* RequestAuth;
    yield* auth.control;
    const model = yield* FailureModel;
    return yield* HttpServerResponse.schemaJson(FailureState)(yield* model.reset);
  }),
);

export const Routes = Layer.mergeAll(
  HttpRouter.add("GET", "/healthz", health),
  HttpRouter.add("GET", "/readyz", health),
  HttpRouter.add("POST", "/v1/authorize", authorizeRoute),
  HttpRouter.add("GET", "/v1/admin/state", stateRoute),
  HttpRouter.add("PUT", "/v1/admin/failure-rate", updateRoute),
  HttpRouter.add("POST", "/v1/admin/reset", resetRoute),
);
