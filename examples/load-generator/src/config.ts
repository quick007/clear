import { Config, Context, Layer, Redacted } from "effect";
import { FailureRate, ScenarioDuration, ScenarioRate, ScenarioUserCount } from "./contracts.js";

const serviceUrl = (baseName: string, hostPortName: string) =>
  Config.string(baseName).pipe(
    Config.orElse(() =>
      Config.string(hostPortName).pipe(Config.map((hostPort) => `http://${hostPort}`)),
    ),
    Config.map((url) => url.replace(/\/$/u, "")),
  );

export class GeneratorConfig extends Context.Service<
  GeneratorConfig,
  {
    readonly autostart: boolean;
    readonly baselineDurationMs: number;
    readonly baselineRps: number;
    readonly blipDurationMs: number;
    readonly checkoutBaseUrl: string;
    readonly controlToken: Redacted.Redacted;
    readonly incidentFailureRate: number;
    readonly maxDurationMs: number;
    readonly paymentsBaseUrl: string;
    readonly paymentsControlToken: Redacted.Redacted;
    readonly scenarioSeed: string;
    readonly uniqueUsers: number;
  }
>()("groundtruth/load-generator/GeneratorConfig") {
  static readonly layer = Layer.effect(
    GeneratorConfig,
    Config.all({
      autostart: Config.boolean("AUTOSTART").pipe(Config.withDefault(false)),
      baselineDurationMs: Config.schema(ScenarioDuration, "BASELINE_DURATION_MS").pipe(
        Config.withDefault(20_000), // 20 seconds
      ),
      baselineRps: Config.schema(ScenarioRate, "BASELINE_RPS").pipe(Config.withDefault(50)),
      blipDurationMs: Config.schema(ScenarioDuration, "BLIP_DURATION_MS").pipe(
        Config.withDefault(10_000), // 10 seconds
      ),
      checkoutBaseUrl: serviceUrl("CHECKOUT_BASE_URL", "CHECKOUT_HOSTPORT"),
      controlToken: Config.redacted("CONTROL_TOKEN"),
      incidentFailureRate: Config.schema(FailureRate, "INCIDENT_FAILURE_RATE").pipe(
        Config.withDefault(0.65),
      ),
      maxDurationMs: Config.schema(ScenarioDuration, "MAX_SCENARIO_DURATION_MS").pipe(
        Config.withDefault(900_000), // 15 minutes
      ),
      paymentsBaseUrl: serviceUrl("PAYMENTS_BASE_URL", "PAYMENTS_HOSTPORT"),
      paymentsControlToken: Config.redacted("PAYMENTS_CONTROL_TOKEN"),
      scenarioSeed: Config.string("SCENARIO_SEED").pipe(Config.withDefault("groundtruth-video-v1")),
      uniqueUsers: Config.schema(ScenarioUserCount, "UNIQUE_USERS").pipe(Config.withDefault(800)),
    }),
  );
}
