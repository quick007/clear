import { Config, Context, Effect, Layer, Redacted } from "effect";

export type RuntimeEnvironment = "development" | "test" | "production";

const defaultSecret = (name: string) => Redacted.make(`groundtruth-development-${name}`);

export class BackendConfig extends Context.Service<
  BackendConfig,
  {
    readonly environment: RuntimeEnvironment;
    readonly port: number;
    readonly publicUrl: string;
    readonly consoleOrigin: string;
    readonly developmentConsoleOrigin: string | undefined;
    readonly collectorSecret: Redacted.Redacted<string>;
    readonly siteHandoffSecret: Redacted.Redacted<string>;
    readonly sessionSecret: Redacted.Redacted<string>;
    readonly adminToken?: Redacted.Redacted<string>;
    readonly cookieSecure: boolean;
    readonly bootstrapProjectSlug: string;
    readonly bootstrapProjectName: string;
    readonly bootstrapIngestKey: Redacted.Redacted<string> | undefined;
    readonly sandboxSessionLimit: number;
    readonly sandboxCreationsPerMinute: number;
    readonly authenticatedRequestsPerMinute: number;
    readonly publicRequestsPerMinute: number;
  }
>()("groundtruth/backend/config/BackendConfig") {
  static readonly layer = Layer.effect(
    BackendConfig,
    Effect.gen(function* () {
      const environmentValue = yield* Config.string("NODE_ENV").pipe(
        Config.withDefault("development"),
      );
      const environment: RuntimeEnvironment =
        environmentValue === "production"
          ? "production"
          : environmentValue === "test"
            ? "test"
            : "development";
      const port = yield* Config.int("GROUNDTRUTH_PORT").pipe(Config.withDefault(3000));
      const publicUrl = yield* Config.string("GROUNDTRUTH_PUBLIC_URL").pipe(
        Config.withDefault(`http://localhost:${port}`),
      );
      const consoleOrigin = yield* Config.string("GROUNDTRUTH_CONSOLE_ORIGIN").pipe(
        Config.withDefault("http://localhost:5173"),
      );
      const developmentConsoleOriginValue = yield* Config.string(
        "GROUNDTRUTH_DEV_CONSOLE_ORIGIN",
      ).pipe(Config.withDefault(""));
      const collectorSecret = yield* Config.redacted("GROUNDTRUTH_COLLECTOR_SECRET").pipe(
        Config.withDefault(defaultSecret("collector")),
      );
      const siteHandoffSecret = yield* Config.redacted("GROUNDTRUTH_SITE_HANDOFF_SECRET").pipe(
        Config.withDefault(defaultSecret("handoff")),
      );
      const sessionSecret = yield* Config.redacted("GROUNDTRUTH_SESSION_SECRET").pipe(
        Config.withDefault(defaultSecret("session")),
      );
      const adminTokenValue = yield* Config.redacted("GROUNDTRUTH_ADMIN_TOKEN").pipe(
        Config.withDefault(Redacted.make("")),
      );
      const cookieSecure = yield* Config.boolean("GROUNDTRUTH_COOKIE_SECURE").pipe(
        Config.withDefault(environment === "production"),
      );
      const bootstrapProjectSlug = yield* Config.string("GROUNDTRUTH_BOOTSTRAP_PROJECT_SLUG").pipe(
        Config.withDefault("local"),
      );
      const bootstrapProjectName = yield* Config.string("GROUNDTRUTH_BOOTSTRAP_PROJECT_NAME").pipe(
        Config.withDefault("Local project"),
      );
      const bootstrapIngestKeyValue = yield* Config.redacted(
        "GROUNDTRUTH_BOOTSTRAP_INGEST_KEY",
      ).pipe(Config.withDefault(Redacted.make("")));
      const sandboxSessionLimit = yield* Config.int("GROUNDTRUTH_SANDBOX_SESSION_LIMIT").pipe(
        Config.withDefault(25),
      );
      const sandboxCreationsPerMinute = yield* Config.int(
        "GROUNDTRUTH_SANDBOX_CREATIONS_PER_MINUTE",
      ).pipe(Config.withDefault(5));
      const authenticatedRequestsPerMinute = yield* Config.int(
        "GROUNDTRUTH_AUTHENTICATED_REQUESTS_PER_MINUTE",
      ).pipe(Config.withDefault(120));
      const publicRequestsPerMinute = yield* Config.int(
        "GROUNDTRUTH_PUBLIC_REQUESTS_PER_MINUTE",
      ).pipe(Config.withDefault(1_200));

      if (
        Redacted.value(adminTokenValue).length > 0 &&
        Redacted.value(adminTokenValue).length < 32
      ) {
        return yield* Effect.die(
          new Error("GROUNDTRUTH_ADMIN_TOKEN must contain at least 32 characters"),
        );
      }

      if (
        environment === "production" &&
        (Redacted.value(collectorSecret).startsWith("groundtruth-development-") ||
          Redacted.value(siteHandoffSecret).startsWith("groundtruth-development-") ||
          Redacted.value(sessionSecret).startsWith("groundtruth-development-"))
      ) {
        return yield* Effect.die(
          new Error("Clear production secrets must be configured explicitly"),
        );
      }

      if (sandboxSessionLimit < 1) {
        return yield* Effect.die(new Error("GROUNDTRUTH_SANDBOX_SESSION_LIMIT must be at least 1"));
      }
      if (sandboxCreationsPerMinute < 1) {
        return yield* Effect.die(
          new Error("GROUNDTRUTH_SANDBOX_CREATIONS_PER_MINUTE must be at least 1"),
        );
      }
      if (authenticatedRequestsPerMinute < 1) {
        return yield* Effect.die(
          new Error("GROUNDTRUTH_AUTHENTICATED_REQUESTS_PER_MINUTE must be at least 1"),
        );
      }
      if (publicRequestsPerMinute < authenticatedRequestsPerMinute) {
        return yield* Effect.die(
          new Error(
            "GROUNDTRUTH_PUBLIC_REQUESTS_PER_MINUTE must be at least GROUNDTRUTH_AUTHENTICATED_REQUESTS_PER_MINUTE",
          ),
        );
      }

      return BackendConfig.of({
        environment,
        port,
        publicUrl,
        consoleOrigin,
        developmentConsoleOrigin:
          developmentConsoleOriginValue.length > 0 ? developmentConsoleOriginValue : undefined,
        collectorSecret,
        siteHandoffSecret,
        sessionSecret,
        adminToken: Redacted.value(adminTokenValue).length > 0 ? adminTokenValue : undefined,
        cookieSecure,
        bootstrapProjectSlug,
        bootstrapProjectName,
        bootstrapIngestKey:
          Redacted.value(bootstrapIngestKeyValue).length > 0 ? bootstrapIngestKeyValue : undefined,
        sandboxSessionLimit,
        sandboxCreationsPerMinute,
        authenticatedRequestsPerMinute,
        publicRequestsPerMinute,
      });
    }),
  );
}
