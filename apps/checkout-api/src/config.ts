import { Config, Context, Layer, Option, Redacted, Schema } from "effect";

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

const paymentsBaseUrl = Config.string("PAYMENTS_BASE_URL").pipe(
  Config.orElse(() =>
    Config.string("PAYMENTS_HOSTPORT").pipe(Config.map((hostPort) => `http://${hostPort}`)),
  ),
  Config.map((url) => url.replace(/\/$/u, "")),
);

export class CheckoutConfig extends Context.Service<
  CheckoutConfig,
  {
    readonly checkoutWebOrigin: string;
    readonly deployEventsUrl: Option.Option<string>;
    readonly ingestKey: Option.Option<Redacted.Redacted>;
    readonly paymentsBaseUrl: string;
    readonly paymentsServiceToken: Redacted.Redacted;
    readonly renderExternalUrl: Option.Option<string>;
    readonly renderGitCommit: string;
    readonly upstreamTimeoutMs: number;
  }
>()("groundtruth/checkout-api/CheckoutConfig") {
  static readonly layer = Layer.effect(
    CheckoutConfig,
    Config.all({
      checkoutWebOrigin: Config.string("CHECKOUT_WEB_ORIGIN").pipe(
        Config.withDefault("http://localhost:5174"),
      ),
      deployEventsUrl: Config.string("GROUNDTRUTH_DEPLOY_EVENTS_URL").pipe(Config.option),
      ingestKey: Config.redacted("GROUNDTRUTH_INGEST_KEY").pipe(Config.option),
      paymentsBaseUrl,
      paymentsServiceToken: Config.redacted("PAYMENTS_SERVICE_TOKEN"),
      renderExternalUrl: Config.string("RENDER_EXTERNAL_URL").pipe(Config.option),
      renderGitCommit: Config.string("RENDER_GIT_COMMIT").pipe(Config.withDefault("local")),
      upstreamTimeoutMs: Config.schema(PositiveInt, "UPSTREAM_TIMEOUT_MS").pipe(
        Config.withDefault(1_200), // 1.2 seconds
      ),
    }),
  );
}
