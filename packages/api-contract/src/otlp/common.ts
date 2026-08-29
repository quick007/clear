import { Schema } from "effect";

const signedDecimal = Schema.String.check(Schema.isPattern(/^-?(?:0|[1-9][0-9]*)$/));

const unsignedDecimal = Schema.String.check(Schema.isPattern(/^(?:0|[1-9][0-9]*)$/));

export const OtlpInt64 = Schema.Union([signedDecimal, Schema.Int]);
export const OtlpUint64 = Schema.Union([unsignedDecimal, Schema.Natural]);

export const OtlpAnyValueLimits = {
  maxDepth: 16,
  maxNodes: 10_000,
  maxStringLength: 65_536,
  maxBytesLength: 65_536,
  maxArrayEntries: 1_024,
  maxKvlistEntries: 1_024,
} as const;

export const OtlpBytes = Schema.String.check(
  Schema.isPattern(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
);

export const OtlpTraceId = Schema.String.check(Schema.isPattern(/^(?:[0-9a-fA-F]{32})?$/));

export const OtlpSpanId = Schema.String.check(Schema.isPattern(/^(?:[0-9a-fA-F]{16})?$/));

export interface OtlpAnyValue {
  readonly stringValue?: string;
  readonly boolValue?: boolean;
  readonly intValue?: string | number;
  readonly doubleValue?: number;
  readonly arrayValue?: {
    readonly values?: ReadonlyArray<OtlpAnyValue>;
  };
  readonly kvlistValue?: {
    readonly values?: ReadonlyArray<OtlpKeyValue>;
  };
  readonly bytesValue?: string;
  readonly stringValueStrindex?: number;
}

export interface OtlpKeyValue {
  readonly key?: string;
  readonly value?: OtlpAnyValue;
  readonly keyStrindex?: number;
}

const keyValueSchema = (depth: number): Schema.Codec<OtlpKeyValue> =>
  Schema.Struct({
    key: Schema.optional(Schema.String),
    value: Schema.optional(Schema.suspend(() => anyValueSchema(depth))),
    keyStrindex: Schema.optional(Schema.Natural),
  });

const schemaDepthLimit = OtlpAnyValueLimits.maxDepth + 1;

const anyValueSchema = (depth: number): Schema.Codec<OtlpAnyValue> => {
  const childValue =
    depth < schemaDepthLimit ? Schema.suspend(() => anyValueSchema(depth + 1)) : Schema.Never;
  const childKeyValue =
    depth < schemaDepthLimit
      ? Schema.suspend(() => keyValueSchema(depth + 1))
      : Schema.Struct({
          key: Schema.optional(Schema.String),
          value: Schema.optional(Schema.Never),
          keyStrindex: Schema.optional(Schema.Natural),
        });
  return Schema.Struct({
    stringValue: Schema.optional(Schema.String),
    boolValue: Schema.optional(Schema.Boolean),
    intValue: Schema.optional(OtlpInt64),
    doubleValue: Schema.optional(Schema.Finite),
    arrayValue: Schema.optional(
      Schema.Struct({
        values: Schema.optional(Schema.Array(childValue)),
      }),
    ),
    kvlistValue: Schema.optional(
      Schema.Struct({
        values: Schema.optional(Schema.Array(childKeyValue)),
      }),
    ),
    bytesValue: Schema.optional(OtlpBytes),
    stringValueStrindex: Schema.optional(Schema.Natural),
  });
};

export const OtlpAnyValue = anyValueSchema(1);

export const OtlpKeyValue = keyValueSchema(1);

export const OtlpInstrumentationScope = Schema.Struct({
  name: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  droppedAttributesCount: Schema.optional(Schema.Natural),
});

export const OtlpEntityRef = Schema.Struct({
  schemaUrl: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  idKeys: Schema.optional(Schema.Array(Schema.String)),
  descriptionKeys: Schema.optional(Schema.Array(Schema.String)),
});

export const OtlpResource = Schema.Struct({
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  droppedAttributesCount: Schema.optional(Schema.Natural),
  entityRefs: Schema.optional(Schema.Array(OtlpEntityRef)),
});
