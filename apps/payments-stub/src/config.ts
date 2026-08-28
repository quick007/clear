import { Config, Context, Layer, Redacted, Schema } from "effect";

const FailureRate = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
const Natural = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Positive = Schema.Finite.check(Schema.isGreaterThan(0));
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

export class PaymentsConfig extends Context.Service<
  PaymentsConfig,
  {
    readonly baseLatencyMs: number;
    readonly controlToken: Redacted.Redacted;
    readonly expectedRps: number;
    readonly failureRate: number;
    readonly failureSeed: string;
    readonly latencyJitterMs: number;
    readonly overloadGain: number;
    readonly overloadLatencyMs: number;
    readonly serviceToken: Redacted.Redacted;
  }
>()("groundtruth/payments-stub/PaymentsConfig") {
  static readonly layer = Layer.effect(
    PaymentsConfig,
    Config.all({
      baseLatencyMs: Config.schema(Natural, "BASE_LATENCY_MS").pipe(Config.withDefault(85)),
      controlToken: Config.redacted("CONTROL_TOKEN"),
      expectedRps: Config.schema(PositiveInt, "EXPECTED_RPS").pipe(Config.withDefault(51)),
      failureRate: Config.schema(FailureRate, "FAILURE_RATE").pipe(Config.withDefault(0.002)),
      failureSeed: Config.string("FAILURE_SEED").pipe(
        Config.withDefault("groundtruth-payments-v1"),
      ),
      latencyJitterMs: Config.schema(Natural, "LATENCY_JITTER_MS").pipe(Config.withDefault(35)),
      overloadGain: Config.schema(Positive, "OVERLOAD_GAIN").pipe(Config.withDefault(0.22)),
      overloadLatencyMs: Config.schema(Natural, "OVERLOAD_LATENCY_MS").pipe(Config.withDefault(35)),
      serviceToken: Config.redacted("SERVICE_TOKEN"),
    }),
  );
}
