import { Schema } from "effect";

export class AuthenticationFailed extends Schema.TaggedError<AuthenticationFailed>()(
  "AuthenticationFailed",
  {},
) {}

export class ScenarioAlreadyRunning extends Schema.TaggedError<ScenarioAlreadyRunning>()(
  "ScenarioAlreadyRunning",
  { runId: Schema.String },
) {}

export class ScenarioNotRunning extends Schema.TaggedError<ScenarioNotRunning>()(
  "ScenarioNotRunning",
  {},
) {}

export class InvalidScenario extends Schema.TaggedError<InvalidScenario>()("InvalidScenario", {
  reason: Schema.String,
}) {}

export class ExampleServiceUnavailable extends Schema.TaggedError<ExampleServiceUnavailable>()(
  "ExampleServiceUnavailable",
  {
    reason: Schema.String,
    service: Schema.Literals(["checkout-api", "payments-stub"]),
    status: Schema.optionalKey(Schema.Number),
  },
) {}
