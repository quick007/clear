import { Schema } from "effect";
import { AxisId, Label, PaletteColor, SafeTimestampMs } from "./primitives.ts";

const DecimalPlaces = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 }));

export const AutoUnit = Schema.TaggedStruct("auto", {}).pipe(
  Schema.annotate({
    identifier: "AutoUnit",
    description: "Uses the unit reported by the OpenTelemetry metric.",
  }),
);
export type AutoUnit = typeof AutoUnit.Type;

export const NumberUnit = Schema.TaggedStruct("number", {
  format: Schema.Literals(["decimal", "short", "scientific"]),
  decimals: Schema.optionalKey(DecimalPlaces),
}).pipe(
  Schema.annotate({
    identifier: "NumberUnit",
    description: "Formats a dimensionless numeric value.",
  }),
);
export type NumberUnit = typeof NumberUnit.Type;

export const PercentUnit = Schema.TaggedStruct("percent", {
  input: Schema.Literals(["ratio", "percent"]),
  decimals: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))),
}).pipe(
  Schema.annotate({
    identifier: "PercentUnit",
    description: "Formats a ratio or an already-scaled percentage.",
  }),
);
export type PercentUnit = typeof PercentUnit.Type;

export const DurationUnit = Schema.TaggedStruct("duration", {
  input: Schema.Literals(["ns", "us", "ms", "s"]),
  display: Schema.Literals(["auto", "ns", "us", "ms", "s"]),
  decimals: Schema.optionalKey(DecimalPlaces),
}).pipe(
  Schema.annotate({
    identifier: "DurationUnit",
    description: "Converts and formats a duration from a declared base unit.",
  }),
);
export type DurationUnit = typeof DurationUnit.Type;

export const BytesUnit = Schema.TaggedStruct("bytes", {
  input: Schema.Literals(["B", "kB", "MB", "GB", "KiB", "MiB", "GiB"]),
  base: Schema.Literals(["decimal", "binary"]),
  decimals: Schema.optionalKey(DecimalPlaces),
}).pipe(
  Schema.annotate({
    identifier: "BytesUnit",
    description: "Converts and formats a data-size value.",
  }),
);
export type BytesUnit = typeof BytesUnit.Type;

export const RateUnit = Schema.TaggedStruct("rate", {
  per: Schema.Literals(["second", "minute", "hour"]),
  noun: Schema.optionalKey(Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 24))),
  decimals: Schema.optionalKey(DecimalPlaces),
}).pipe(
  Schema.annotate({
    identifier: "RateUnit",
    description: "Formats throughput per second, minute, or hour.",
  }),
);
export type RateUnit = typeof RateUnit.Type;

export const CustomUnit = Schema.TaggedStruct("custom", {
  symbol: Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 16)),
  position: Schema.Literals(["before", "after"]),
  decimals: Schema.optionalKey(DecimalPlaces),
}).pipe(
  Schema.annotate({
    identifier: "CustomUnit",
    description: "Formats a value with a short custom symbol.",
  }),
);
export type CustomUnit = typeof CustomUnit.Type;

export const DisplayUnit = Schema.Union([
  AutoUnit,
  NumberUnit,
  PercentUnit,
  DurationUnit,
  BytesUnit,
  RateUnit,
  CustomUnit,
]).pipe(
  Schema.annotate({
    identifier: "DisplayUnit",
    description: "A deterministic value-formatting strategy.",
  }),
);
export type DisplayUnit = typeof DisplayUnit.Type;

const AxisBase = Schema.Struct({
  id: AxisId,
  label: Schema.optionalKey(Label),
  unit: DisplayUnit,
  scale: Schema.optionalKey(Schema.Literals(["linear", "log"])),
  minimum: Schema.optionalKey(Schema.Finite),
  maximum: Schema.optionalKey(Schema.Finite),
  showGrid: Schema.optionalKey(Schema.Boolean),
});

export const Axis = AxisBase.check(
  Schema.makeFilter<typeof AxisBase.Type>((axis) => {
    if (axis.minimum !== undefined && axis.maximum !== undefined && axis.minimum >= axis.maximum) {
      return { path: ["maximum"], issue: "maximum must be greater than minimum" };
    }
    if (axis.scale === "log" && axis.minimum !== undefined && axis.minimum <= 0) {
      return { path: ["minimum"], issue: "a logarithmic axis minimum must be positive" };
    }
    return undefined;
  }),
).pipe(
  Schema.annotate({
    identifier: "Axis",
    description: "A chart value axis with explicit formatting and optional bounds.",
  }),
);
export type Axis = typeof Axis.Type;

export const ValueThreshold = Schema.Struct({
  value: Schema.Finite,
  condition: Schema.Literals(["above", "at_or_above", "below", "at_or_below"]),
  severity: Schema.Literals(["info", "warning", "critical"]),
  label: Schema.optionalKey(Label),
}).pipe(
  Schema.annotate({
    identifier: "ValueThreshold",
    description: "A semantic boundary used to color or contextualize a value.",
  }),
);
export type ValueThreshold = typeof ValueThreshold.Type;

export const ChartThreshold = Schema.Struct({
  ...ValueThreshold.fields,
  axis: AxisId,
}).pipe(
  Schema.annotate({
    identifier: "ChartThreshold",
    description: "A value threshold rendered against one chart axis.",
  }),
);
export type ChartThreshold = typeof ChartThreshold.Type;

export const DeployAnnotation = Schema.TaggedStruct("deploy", {
  atMs: SafeTimestampMs,
  label: Label,
  service: Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 255)),
  sha: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[0-9a-f]{7,64}$/))),
}).pipe(
  Schema.annotate({
    identifier: "DeployAnnotation",
    description: "Marks when a service deployment reached the environment.",
  }),
);
export type DeployAnnotation = typeof DeployAnnotation.Type;

export const NoteAnnotation = Schema.TaggedStruct("note", {
  atMs: SafeTimestampMs,
  label: Label,
}).pipe(
  Schema.annotate({
    identifier: "NoteAnnotation",
    description: "Marks an operator or agent observation on a panel.",
  }),
);
export type NoteAnnotation = typeof NoteAnnotation.Type;

export const PanelAnnotation = Schema.Union([DeployAnnotation, NoteAnnotation]).pipe(
  Schema.annotate({
    identifier: "PanelAnnotation",
    description: "A time-aligned event displayed over panel data.",
  }),
);
export type PanelAnnotation = typeof PanelAnnotation.Type;

export const Legend = Schema.Struct({
  visibility: Schema.Literals(["auto", "always", "hidden"]),
  placement: Schema.optionalKey(Schema.Literals(["bottom", "right"])),
  values: Schema.optionalKey(
    Schema.Array(Schema.Literals(["last", "min", "max", "avg"])).check(
      Schema.isMaxLength(4),
      Schema.isUnique(),
    ),
  ),
}).pipe(
  Schema.annotate({
    identifier: "Legend",
    description: "Controls chart-series identification and compact summary values.",
  }),
);
export type Legend = typeof Legend.Type;

export const SeriesStyle = Schema.Struct({
  label: Schema.optionalKey(Label),
  color: Schema.optionalKey(PaletteColor),
  lineStyle: Schema.optionalKey(Schema.Literals(["solid", "dashed"])),
  fillOpacity: Schema.optionalKey(
    Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  ),
}).pipe(
  Schema.annotate({
    identifier: "SeriesStyle",
    description: "Optional presentation overrides for one chart query.",
  }),
);
export type SeriesStyle = typeof SeriesStyle.Type;
