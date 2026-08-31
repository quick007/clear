import { DateTime, Schema } from "effect";

const namedText = (maximum: number) =>
  Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, maximum));

export const MetricName = namedText(255).pipe(Schema.brand("MetricName"));
export type MetricName = typeof MetricName.Type;

export const AttributeKey = namedText(255).pipe(Schema.brand("AttributeKey"));
export type AttributeKey = typeof AttributeKey.Type;

export const ServiceName = namedText(255).pipe(Schema.brand("TelemetryServiceName"));
export type ServiceName = typeof ServiceName.Type;

export const TraceId = Schema.String.check(Schema.isPattern(/^(?!0{32}$)[0-9a-f]{32}$/)).pipe(
  Schema.brand("TraceId"),
);
export type TraceId = typeof TraceId.Type;

export const SpanId = Schema.String.check(Schema.isPattern(/^(?!0{16}$)[0-9a-f]{16}$/)).pipe(
  Schema.brand("SpanId"),
);
export type SpanId = typeof SpanId.Type;

export const Cursor = Schema.String.check(
  Schema.isLengthBetween(1, 2_048),
  Schema.isBase64Url(),
).pipe(Schema.brand("TelemetryCursor"));
export type Cursor = typeof Cursor.Type;

const Uint64 = Schema.BigIntFromString.check(
  Schema.isBetweenBigInt({ minimum: 0n, maximum: 18_446_744_073_709_551_615n }),
);

export const SignedInt64 = Schema.BigIntFromString.check(
  Schema.isBetweenBigInt({
    minimum: -9_223_372_036_854_775_808n,
    maximum: 9_223_372_036_854_775_807n,
  }),
);
export type SignedInt64 = typeof SignedInt64.Type;

export const UnixNano = Uint64.pipe(Schema.brand("UnixNano"));
export type UnixNano = typeof UnixNano.Type;

export const OtelFlags = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 4_294_967_295 }),
).pipe(Schema.brand("OtelFlags"));
export type OtelFlags = typeof OtelFlags.Type;

export const UnsignedCount = Uint64;
export type UnsignedCount = typeof UnsignedCount.Type;

export class TelemetryBytes extends Schema.TaggedClass<TelemetryBytes>(
  "Groundtruth/Telemetry/TelemetryBytes",
)("bytes", {
  value: Schema.Uint8ArrayFromBase64,
}) {}

export class TelemetryInteger extends Schema.TaggedClass<TelemetryInteger>(
  "Groundtruth/Telemetry/TelemetryInteger",
)("int", {
  value: SignedInt64,
}) {}

export type TelemetryValue =
  | null
  | boolean
  | number
  | string
  | TelemetryBytes
  | TelemetryInteger
  | ReadonlyArray<TelemetryValue>
  | { readonly [key: string]: TelemetryValue };

export const TelemetryValue: Schema.Codec<TelemetryValue> = Schema.Union([
  Schema.Null,
  Schema.Boolean,
  Schema.Finite,
  Schema.String,
  TelemetryBytes,
  TelemetryInteger,
  Schema.Array(Schema.suspend((): Schema.Codec<TelemetryValue> => TelemetryValue)),
  Schema.Record(
    Schema.String,
    Schema.suspend((): Schema.Codec<TelemetryValue> => TelemetryValue),
  ),
]);

export const AttributeValue = Schema.Union([
  Schema.String,
  Schema.Finite,
  Schema.Boolean,
  Schema.Array(Schema.String),
  Schema.Array(Schema.Finite),
  Schema.Array(Schema.Boolean),
]);
export type AttributeValue = typeof AttributeValue.Type;

export const TelemetryAttributes = Schema.Record(Schema.String, TelemetryValue);
export type TelemetryAttributes = typeof TelemetryAttributes.Type;

export class EntityReference extends Schema.Class<EntityReference>(
  "Groundtruth/Telemetry/EntityReference",
)({
  schemaUrl: Schema.NullOr(Schema.String),
  type: Schema.String,
  idKeys: Schema.Array(AttributeKey),
  descriptionKeys: Schema.Array(AttributeKey),
}) {}

export class ResourceContext extends Schema.Class<ResourceContext>(
  "Groundtruth/Telemetry/ResourceContext",
)({
  attributes: TelemetryAttributes,
  droppedAttributesCount: UnsignedCount,
  entityRefs: Schema.Array(EntityReference),
  schemaUrl: Schema.NullOr(Schema.String),
}) {}

export class InstrumentationScope extends Schema.Class<InstrumentationScope>(
  "Groundtruth/Telemetry/InstrumentationScope",
)({
  name: Schema.String,
  version: Schema.NullOr(Schema.String),
  attributes: TelemetryAttributes,
  droppedAttributesCount: UnsignedCount,
  schemaUrl: Schema.NullOr(Schema.String),
}) {}

export const SignalKind = Schema.Literals(["metrics", "logs", "traces"]);
export type SignalKind = typeof SignalKind.Type;

export const TelemetryWindow = Schema.Literals(["5m", "15m", "1h", "3h", "6h", "12h", "24h", "7d"]);
export type TelemetryWindow = typeof TelemetryWindow.Type;

export const QueryStep = Schema.Literals(["5s", "10s", "30s", "1m", "5m"]);
export type QueryStep = typeof QueryStep.Type;

export class RelativeTimeRange extends Schema.TaggedClass<RelativeTimeRange>(
  "Groundtruth/Telemetry/RelativeTimeRange",
)("relative", {
  window: TelemetryWindow,
}) {}

const AbsoluteTimeRangeFields = {
  start: Schema.DateTimeUtcFromString,
  end: Schema.DateTimeUtcFromString,
} as const;

const AbsoluteTimeRangeStruct = Schema.Struct(AbsoluteTimeRangeFields);

const ValidAbsoluteTimeRange = AbsoluteTimeRangeStruct.check(
  Schema.makeFilter<typeof AbsoluteTimeRangeStruct.Type>((range) =>
    DateTime.toEpochMillis(range.start) < DateTime.toEpochMillis(range.end)
      ? undefined
      : {
          path: ["end"],
          issue: "end must be later than start",
        },
  ),
);

export class AbsoluteTimeRange extends Schema.TaggedClass<AbsoluteTimeRange>(
  "Groundtruth/Telemetry/AbsoluteTimeRange",
)("absolute", ValidAbsoluteTimeRange) {}

export const TimeRange = Schema.Union([RelativeTimeRange, AbsoluteTimeRange]).pipe(
  Schema.toTaggedUnion("_tag"),
);
export type TimeRange = typeof TimeRange.Type;

export const AttributeFilterOperator = Schema.Literals([
  "equals",
  "not-equals",
  "contains",
  "exists",
]);
export type AttributeFilterOperator = typeof AttributeFilterOperator.Type;

export class AttributeFilter extends Schema.Class<AttributeFilter>(
  "Groundtruth/Telemetry/AttributeFilter",
)({
  key: AttributeKey,
  operator: AttributeFilterOperator,
  value: Schema.NullOr(AttributeValue),
}) {}
