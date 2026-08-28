import { Effect, Layer, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { CheckoutConfig } from "./config.js";

const report = Effect.gen(function* () {
  const config = yield* CheckoutConfig;
  const client = yield* HttpClient.HttpClient;

  if (Option.isNone(config.deployEventsUrl) || Option.isNone(config.ingestKey)) {
    return;
  }

  const request = yield* HttpClientRequest.post(config.deployEventsUrl.value).pipe(
    HttpClientRequest.bearerToken(Redacted.value(config.ingestKey.value)),
    HttpClientRequest.bodyJson({
      description: "checkout-api deployment started",
      service: "checkout-api",
      sha: config.renderGitCommit,
      url: Option.getOrUndefined(config.renderExternalUrl),
    }),
  );
  const response = yield* client.execute(request);

  if (response.status < 200 || response.status >= 300) {
    return yield* Effect.fail(new Error(`deploy event returned ${response.status}`));
  }

  yield* Effect.logInfo("Deploy event reported").pipe(
    Effect.annotateLogs({ sha: config.renderGitCommit }),
  );
}).pipe(
  Effect.catch((error) =>
    Effect.logWarning("Deploy event report failed").pipe(
      Effect.annotateLogs({ reason: String(error) }),
    ),
  ),
  Effect.withSpan("groundtruth.deploy.report", { kind: "client" }),
);

export const DeployReporterLive = Layer.effectDiscard(report.pipe(Effect.forkScoped));
