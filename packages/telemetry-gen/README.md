# Telemetry generator

Deterministic OpenTelemetry-shaped data for Clear sandbox sessions. The generator produces ten-second batches of metrics, logs, traces, and alert transitions across the retry-storm lifecycle.

## Lifecycle

- `P0`: healthy baseline at roughly 50 requests per second
- `P1`: a payments upstream starts returning 503 responses
- `P2`: immediate retries amplify upstream request volume to 3 times baseline while incoming checkout traffic and the user cohort stay flat

The same seed, start time, and calls produce byte-equivalent encoded batches. All public state and telemetry values are backed by Effect Schema.

## Usage

```ts
import { Effect } from "effect";
import { makeTelemetryGenerator } from "@groundtruth/telemetry-gen";

const program = Effect.gen(function* () {
  const generator = yield* makeTelemetryGenerator({
    seed: "sandbox-session-id",
    startedAt: Date.now(),
  });

  const baseline = yield* generator.advance(30);
  yield* generator.triggerIncident;
  const upstreamBlip = yield* generator.advance(6);
  const amplification = yield* generator.advance(30);

  yield* generator.reset;

  return { baseline, upstreamBlip, amplification };
});
```

`evaluateAcceptance` measures the required reveal against two batch windows:
upstream request ratio, distinct-user ratio from incoming requests, and upstream
retry share.
