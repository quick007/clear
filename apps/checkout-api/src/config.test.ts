import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Option } from "effect";
import { clearRuntimeEndpoints } from "./config.js";

const loadEndpoints = (values: Readonly<Record<string, string>>) =>
  clearRuntimeEndpoints.pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(values)),
  );

describe("Clear runtime endpoint config", () => {
  it.effect("derives every owned path from the private runtime hostport", () =>
    Effect.gen(function* () {
      const endpoints = yield* loadEndpoints({
        GROUNDTRUTH_RUNTIME_HOSTPORT: "clear-runtime:10001",
      });

      assert.strictEqual(endpoints.paymentsBaseUrl, "http://clear-runtime:10001/internal/payments");
      assert.strictEqual(
        Option.getOrUndefined(endpoints.deployEventsUrl),
        "http://clear-runtime:10001/v1/events/deploy",
      );
      assert.strictEqual(
        Option.getOrUndefined(endpoints.otlpLogsUrl),
        "http://clear-runtime:10001/v1/logs",
      );
      assert.strictEqual(
        Option.getOrUndefined(endpoints.otlpMetricsUrl),
        "http://clear-runtime:10001/v1/metrics",
      );
      assert.strictEqual(
        Option.getOrUndefined(endpoints.otlpTracesUrl),
        "http://clear-runtime:10001/v1/traces",
      );
    }),
  );

  it.effect("keeps explicit local service and signal overrides", () =>
    Effect.gen(function* () {
      const endpoints = yield* loadEndpoints({
        GROUNDTRUTH_DEPLOY_EVENTS_URL: "http://localhost:3000/events",
        GROUNDTRUTH_RUNTIME_HOSTPORT: "clear-runtime:10001",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318/",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://localhost:14318/custom-traces",
        PAYMENTS_BASE_URL: "http://localhost:4102/",
      });

      assert.strictEqual(endpoints.paymentsBaseUrl, "http://localhost:4102");
      assert.strictEqual(
        Option.getOrUndefined(endpoints.deployEventsUrl),
        "http://localhost:3000/events",
      );
      assert.strictEqual(
        Option.getOrUndefined(endpoints.otlpLogsUrl),
        "http://localhost:4318/v1/logs",
      );
      assert.strictEqual(
        Option.getOrUndefined(endpoints.otlpMetricsUrl),
        "http://localhost:4318/v1/metrics",
      );
      assert.strictEqual(
        Option.getOrUndefined(endpoints.otlpTracesUrl),
        "http://localhost:14318/custom-traces",
      );
    }),
  );
});
