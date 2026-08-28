import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { RequestAuth } from "./auth.js";
import { ScenarioStart, ScenarioState } from "./contracts.js";
import { ScenarioController } from "./scenario-controller.js";

const health = HttpServerResponse.jsonUnsafe({
  service: "load-generator",
  status: "ok",
});

const unauthorized = HttpServerResponse.jsonUnsafe(
  { code: "unauthorized", message: "A valid control token is required" },
  { status: 401 },
);

const invalidRequest = HttpServerResponse.jsonUnsafe(
  { code: "invalid_request", message: "The request body is invalid" },
  { status: 400 },
);

const notRunning = HttpServerResponse.jsonUnsafe(
  { code: "scenario_not_running", message: "No scenario is running" },
  { status: 409 },
);

const unavailable = (service: string, status?: number) =>
  HttpServerResponse.jsonUnsafe(
    {
      code: "example_service_unavailable",
      message: `${service} is unavailable`,
      service,
      status,
    },
    { status: 502 },
  );

const stateRoute = Effect.gen(function* () {
  const auth = yield* RequestAuth;
  yield* auth.control;
  const controller = yield* ScenarioController;
  return yield* HttpServerResponse.schemaJson(ScenarioState)(yield* controller.state);
}).pipe(
  Effect.catchTag("AuthenticationFailed", () => Effect.succeed(unauthorized)),
  Effect.catchCause(() => Effect.succeed(invalidRequest)),
);

const startRoute = Effect.gen(function* () {
  const auth = yield* RequestAuth;
  yield* auth.control;
  const input = yield* HttpServerRequest.schemaBodyJson(ScenarioStart);
  const controller = yield* ScenarioController;
  const state = yield* controller.start(input);
  return yield* HttpServerResponse.schemaJson(ScenarioState)(state, {
    status: 201,
  });
}).pipe(
  Effect.catchTags({
    AuthenticationFailed: () => Effect.succeed(unauthorized),
    ExampleServiceUnavailable: (error) => Effect.succeed(unavailable(error.service, error.status)),
    ScenarioAlreadyRunning: (error) =>
      Effect.succeed(
        HttpServerResponse.jsonUnsafe(
          {
            code: "scenario_already_running",
            message: "A scenario is already running",
            runId: error.runId,
          },
          { status: 409 },
        ),
      ),
  }),
  Effect.catchCause(() => Effect.succeed(invalidRequest)),
);

const recoverRoute = Effect.gen(function* () {
  const auth = yield* RequestAuth;
  yield* auth.control;
  const controller = yield* ScenarioController;
  return yield* HttpServerResponse.schemaJson(ScenarioState)(yield* controller.recover);
}).pipe(
  Effect.catchTags({
    AuthenticationFailed: () => Effect.succeed(unauthorized),
    ExampleServiceUnavailable: (error) => Effect.succeed(unavailable(error.service, error.status)),
    ScenarioNotRunning: () => Effect.succeed(notRunning),
  }),
  Effect.catchCause(() => Effect.succeed(invalidRequest)),
);

const stopRoute = Effect.gen(function* () {
  const auth = yield* RequestAuth;
  yield* auth.control;
  const controller = yield* ScenarioController;
  return yield* HttpServerResponse.schemaJson(ScenarioState)(yield* controller.stop);
}).pipe(
  Effect.catchTags({
    AuthenticationFailed: () => Effect.succeed(unauthorized),
    ScenarioNotRunning: () => Effect.succeed(notRunning),
  }),
  Effect.catchCause(() => Effect.succeed(invalidRequest)),
);

export const Routes = Layer.mergeAll(
  HttpRouter.add("GET", "/healthz", health),
  HttpRouter.add("GET", "/readyz", health),
  HttpRouter.add("GET", "/v1/scenario", stateRoute),
  HttpRouter.add("POST", "/v1/scenario/start", startRoute),
  HttpRouter.add("POST", "/v1/scenario/recover", recoverRoute),
  HttpRouter.add("POST", "/v1/scenario/stop", stopRoute),
);
