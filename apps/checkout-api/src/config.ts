import { Config, Context, Layer, Option, Redacted, Schema } from "effect";

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

const withoutTrailingSlash = (url: string) => url.replace(/\/$/u, "");
const normalizedUrl = (name: string) => Config.string(name).pipe(Config.map(withoutTrailingSlash));

const runtimeBaseUrl = Config.string("GROUNDTRUTH_RUNTIME_HOSTPORT").pipe(
  Config.map((hostPort) => `http://${hostPort}`),
  Config.map(withoutTrailingSlash),
);

const runtimeEndpoint = (path: string) =>
  runtimeBaseUrl.pipe(Config.map((baseUrl) => `${baseUrl}${path}`));

const optionalRuntimeEndpoint = (overrideName: string, path: string) =>
  normalizedUrl(overrideName).pipe(
    Config.orElse(() => runtimeEndpoint(path)),
    Config.option,
  );

const otlpEndpoint = (signal: "LOGS" | "METRICS" | "TRACES", path: string) =>
  normalizedUrl(`OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`).pipe(
    Config.orElse(() =>
      normalizedUrl("OTEL_EXPORTER_OTLP_ENDPOINT").pipe(
        Config.map((baseUrl) => `${baseUrl}${path}`),
      ),
    ),
    Config.orElse(() => runtimeEndpoint(path)),
    Config.option,
  );

export class ClearRuntimeEndpoints extends Schema.Class<ClearRuntimeEndpoints>(
  "Clear/CheckoutApi/ClearRuntimeEndpoints",
)({
  deployEventsUrl: Schema.Option(Schema.String),
  otlpLogsUrl: Schema.Option(Schema.String),
  otlpMetricsUrl: Schema.Option(Schema.String),
  otlpTracesUrl: Schema.Option(Schema.String),
  paymentsBaseUrl: Schema.String,
}) {}

export const clearRuntimeEndpoints = Config.all({
  deployEventsUrl: optionalRuntimeEndpoint("GROUNDTRUTH_DEPLOY_EVENTS_URL", "/v1/events/deploy"),
  otlpLogsUrl: otlpEndpoint("LOGS", "/v1/logs"),
  otlpMetricsUrl: otlpEndpoint("METRICS", "/v1/metrics"),
  otlpTracesUrl: otlpEndpoint("TRACES", "/v1/traces"),
  paymentsBaseUrl: normalizedUrl("PAYMENTS_BASE_URL").pipe(
    Config.orElse(() =>
      Config.string("PAYMENTS_HOSTPORT").pipe(
        Config.map((hostPort) => `http://${hostPort}`),
        Config.map(withoutTrailingSlash),
      ),
    ),
    Config.orElse(() => runtimeEndpoint("/internal/payments")),
  ),
}).pipe(Config.map((endpoints) => ClearRuntimeEndpoints.make(endpoints)));

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
      ingestKey: Config.redacted("GROUNDTRUTH_INGEST_KEY").pipe(Config.option),
      paymentsServiceToken: Config.redacted("PAYMENTS_SERVICE_TOKEN"),
      renderExternalUrl: Config.string("RENDER_EXTERNAL_URL").pipe(Config.option),
      renderGitCommit: Config.string("RENDER_GIT_COMMIT").pipe(Config.withDefault("local")),
      runtime: clearRuntimeEndpoints,
      upstreamTimeoutMs: Config.schema(PositiveInt, "UPSTREAM_TIMEOUT_MS").pipe(
        Config.withDefault(1_200), // 1.2 seconds
      ),
    }).pipe(
      Config.map(({ runtime, ...config }) => ({
        ...config,
        deployEventsUrl: runtime.deployEventsUrl,
        paymentsBaseUrl: runtime.paymentsBaseUrl,
      })),
    ),
  );
}
