import {
  AlertName,
  DisplayName,
  EmailAddress,
  HostedSubject,
  IngestKeyName,
  ProjectName,
  ProjectSlug,
  ServiceName,
} from "@groundtruth/domain";
import { and, eq } from "drizzle-orm";
import { Context, Crypto, Effect, Layer, Option, Redacted, Schema } from "effect";
import { PersistenceConfig } from "./config.ts";
import { hostedProjectQuotas, hostedRawRetentionDays } from "./policies.ts";
import { persistenceError, type PersistenceError } from "./errors.ts";
import { PostgresDatabase } from "./postgres/database.ts";
import {
  AlertRepository,
  IngestKeyRepository,
  AccountRepository,
  ProjectRepository,
} from "./repositories/services.ts";
import { ingestKeys } from "./schema/projects.ts";

export interface BootstrapPersistenceShape {
  readonly run: Effect.Effect<boolean, PersistenceError>;
}

export class BootstrapPersistence extends Context.Service<
  BootstrapPersistence,
  BootstrapPersistenceShape
>()("Groundtruth/BootstrapPersistence") {}

const decode = <A, I>(schema: Schema.Codec<A, I>, value: unknown, field: string) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((error) =>
      persistenceError("postgres", `decode-bootstrap-${field}`, error, false),
    ),
  );

const hexadecimal = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const BootstrapIngestKeyMinimumLength = 16;

export const bootstrapIngestKeyIsValid = (secret: string) =>
  secret.length >= BootstrapIngestKeyMinimumLength;

export const BootstrapPersistenceLive = Layer.effect(
  BootstrapPersistence,
  Effect.gen(function* () {
    const config = yield* PersistenceConfig;
    const crypto = yield* Crypto.Crypto;
    const accounts = yield* AccountRepository;
    const alerts = yield* AlertRepository;
    const projectRepository = yield* ProjectRepository;
    const keyRepository = yield* IngestKeyRepository;
    const postgres = yield* PostgresDatabase;

    const run = Effect.gen(function* () {
      const noBootstrapConfig =
        Option.isNone(config.bootstrapProjectSlug) &&
        Option.isNone(config.bootstrapProjectName) &&
        Option.isNone(config.bootstrapIngestKey);
      if (noBootstrapConfig) {
        return false;
      }
      if (
        Option.isNone(config.bootstrapProjectSlug) ||
        Option.isNone(config.bootstrapProjectName) ||
        Option.isNone(config.bootstrapIngestKey)
      ) {
        return yield* Effect.fail(
          persistenceError(
            "postgres",
            "bootstrap-config",
            "All three GROUNDTRUTH_BOOTSTRAP_* variables must be set together",
            false,
          ),
        );
      }

      const slug = yield* decode(ProjectSlug, config.bootstrapProjectSlug.value, "project-slug");
      const name = yield* decode(ProjectName, config.bootstrapProjectName.value, "project-name");
      const secret = Redacted.value(config.bootstrapIngestKey.value);
      if (!bootstrapIngestKeyIsValid(secret)) {
        return yield* Effect.fail(
          persistenceError(
            "postgres",
            "bootstrap-config",
            `GROUNDTRUTH_BOOTSTRAP_INGEST_KEY must contain at least ${BootstrapIngestKeyMinimumLength} characters`,
            false,
          ),
        );
      }

      const [hostedSubject, email, displayName, keyName, alertName, serviceName] =
        yield* Effect.all([
          decode(HostedSubject, "bootstrap@local.groundtruth", "subject"),
          decode(EmailAddress, "bootstrap@local.groundtruth", "email"),
          decode(DisplayName, "Clear local", "display-name"),
          decode(IngestKeyName, "Local collector", "key-name"),
          decode(AlertName, "Checkout upstream request rate", "alert-name"),
          decode(ServiceName, "checkout-api", "alert-service"),
        ]);
      const account = yield* accounts.upsertHosted({ hostedSubject, email, displayName });
      const existingProject = yield* projectRepository.findBySlug(account.id, slug);
      const project = Option.isSome(existingProject)
        ? existingProject.value
        : yield* projectRepository.create({
            ownerId: account.id,
            slug,
            name,
            mode: "hosted",
            retentionDays: hostedRawRetentionDays,
            quotas: hostedProjectQuotas,
          });

      const digest = yield* crypto
        .digest("SHA-256", new TextEncoder().encode(secret))
        .pipe(
          Effect.mapError((error) =>
            persistenceError("postgres", "hash-bootstrap-ingest-key", error, false),
          ),
        );
      const secretHash = hexadecimal(digest);
      const prefix = secret.slice(0, 12);
      const existingKey = yield* postgres.execute("find-bootstrap-ingest-key", () =>
        postgres.db.query.ingestKeys.findFirst({
          where: {
            projectId: { eq: project.id },
            keyPrefix: { eq: prefix },
          },
        }),
      );
      if (existingKey === undefined) {
        yield* keyRepository.create({
          projectId: project.id,
          name: keyName,
          prefix,
          secretHash,
        });
      } else if (existingKey.secretHash !== secretHash || existingKey.revokedAt !== null) {
        yield* postgres.execute("refresh-bootstrap-ingest-key", () =>
          postgres.db
            .update(ingestKeys)
            .set({ name: keyName, secretHash, revokedAt: null })
            .where(and(eq(ingestKeys.projectId, project.id), eq(ingestKeys.id, existingKey.id))),
        );
      }
      const existingAlerts = yield* alerts.list(project.id);
      if (!existingAlerts.some((alert) => alert.name === alertName)) {
        yield* alerts.create(project.id, {
          name: alertName,
          serviceName,
          metricName: "upstream.client.requests",
          aggregation: "rate",
          comparison: "above",
          threshold: 90,
          windowSeconds: 60,
          severity: "critical",
          summary: null,
          enabled: true,
        });
      }
      return true;
    });

    return BootstrapPersistence.of({ run });
  }),
);
