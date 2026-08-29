import type { OtlpAnyValue, OtlpKeyValue } from "@groundtruth/api-contract";
import {
  AttributeKey,
  EntityReference,
  InstrumentationScope,
  ResourceContext,
  ServiceName,
  TelemetryBytes,
  TelemetryInteger,
  type TelemetryAttributes,
  type TelemetryValue,
} from "@groundtruth/telemetry";
import { Effect } from "effect";
import { InvalidOtlpPayload } from "./InvalidOtlpPayload.js";
import { signedInt64, unsignedInt64 } from "./OtlpNumber.js";

type OtlpResource = {
  readonly attributes?: ReadonlyArray<OtlpKeyValue>;
  readonly droppedAttributesCount?: number;
  readonly entityRefs?: ReadonlyArray<{
    readonly schemaUrl?: string;
    readonly type?: string;
    readonly idKeys?: ReadonlyArray<string>;
    readonly descriptionKeys?: ReadonlyArray<string>;
  }>;
};

type OtlpScope = {
  readonly name?: string;
  readonly version?: string;
  readonly attributes?: ReadonlyArray<OtlpKeyValue>;
  readonly droppedAttributesCount?: number;
};

const valueArms = [
  "stringValue",
  "boolValue",
  "intValue",
  "doubleValue",
  "arrayValue",
  "kvlistValue",
  "bytesValue",
  "stringValueStrindex",
] as const;

const keyFor = (item: OtlpKeyValue) =>
  item.key ?? (item.keyStrindex === undefined ? undefined : `[string-index:${item.keyStrindex}]`);

export const anyValue = (
  value: OtlpAnyValue | undefined,
  path: string,
): Effect.Effect<TelemetryValue, InvalidOtlpPayload> =>
  Effect.gen(function* () {
    if (value === undefined) return null;
    const present = valueArms.filter((arm) => value[arm] !== undefined);
    if (present.length !== 1) {
      return yield* new InvalidOtlpPayload({
        path,
        message: "AnyValue must contain exactly one value field",
      });
    }
    const arm = present[0];
    if (arm === "stringValue") return value.stringValue ?? "";
    if (arm === "boolValue") return value.boolValue ?? false;
    if (arm === "intValue") {
      return new TelemetryInteger({
        value: yield* signedInt64(value.intValue, `${path}.intValue`),
      });
    }
    if (arm === "doubleValue") return value.doubleValue ?? 0;
    if (arm === "bytesValue") {
      return new TelemetryBytes({
        value: Uint8Array.from(Buffer.from(value.bytesValue ?? "", "base64")),
      });
    }
    if (arm === "arrayValue") {
      return yield* Effect.forEach(value.arrayValue?.values ?? [], (item, index) =>
        anyValue(item, `${path}.arrayValue.values[${index}]`),
      );
    }
    if (arm === "kvlistValue") {
      const entries = yield* Effect.forEach(value.kvlistValue?.values ?? [], (item, index) =>
        Effect.gen(function* () {
          const key = keyFor(item);
          if (key === undefined) return null;
          const itemValue = yield* anyValue(
            item.value,
            `${path}.kvlistValue.values[${index}].value`,
          );
          return [key, itemValue] as const;
        }),
      );
      return Object.fromEntries(entries.filter((entry) => entry !== null));
    }
    return `[string-index:${value.stringValueStrindex ?? 0}]`;
  });

export const attributes = (
  values: ReadonlyArray<OtlpKeyValue> | undefined,
  path: string,
): Effect.Effect<TelemetryAttributes, InvalidOtlpPayload> =>
  Effect.gen(function* () {
    const entries = yield* Effect.forEach(values ?? [], (item, index) =>
      Effect.gen(function* () {
        const key = keyFor(item);
        if (key === undefined) return null;
        const value = yield* anyValue(item.value, `${path}[${index}].value`);
        return [key, value] as const;
      }),
    );
    return Object.fromEntries(entries.filter((entry) => entry !== null));
  });

export const resourceContext = (
  resource: OtlpResource | undefined,
  schemaUrl: string | undefined,
  path: string,
) =>
  Effect.gen(function* () {
    return new ResourceContext({
      attributes: yield* attributes(resource?.attributes, `${path}.attributes`),
      droppedAttributesCount: yield* unsignedInt64(
        resource?.droppedAttributesCount,
        `${path}.droppedAttributesCount`,
      ),
      entityRefs: (resource?.entityRefs ?? []).map(
        (reference) =>
          new EntityReference({
            schemaUrl: reference.schemaUrl ?? null,
            type: reference.type ?? "",
            idKeys: (reference.idKeys ?? []).map((key) => AttributeKey.make(key)),
            descriptionKeys: (reference.descriptionKeys ?? []).map((key) => AttributeKey.make(key)),
          }),
      ),
      schemaUrl: schemaUrl ?? null,
    });
  });

export const instrumentationScope = (
  scope: OtlpScope | undefined,
  schemaUrl: string | undefined,
  path: string,
) =>
  Effect.gen(function* () {
    return new InstrumentationScope({
      name: scope?.name ?? "",
      version: scope?.version ?? null,
      attributes: yield* attributes(scope?.attributes, `${path}.attributes`),
      droppedAttributesCount: yield* unsignedInt64(
        scope?.droppedAttributesCount,
        `${path}.droppedAttributesCount`,
      ),
      schemaUrl: schemaUrl ?? null,
    });
  });

export const serviceName = (resource: ResourceContext) => {
  const name = resource.attributes["service.name"];
  return ServiceName.make(
    typeof name === "string" && name.trim().length > 0 ? name.trim() : "unknown-service",
  );
};
