import type { DisplayUnit, ValueThreshold } from "@groundtruth/panel-dsl";

const compactNumber = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
  notation: "compact",
});

const decimal = (value: number, places = 2) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: places,
    minimumFractionDigits: places,
  }).format(value);

const durationSeconds = {
  ns: 1 / 1_000_000_000,
  us: 1 / 1_000_000,
  ms: 1 / 1_000,
  s: 1,
} as const;

const byteFactors = {
  B: 1,
  GB: 1_000_000_000,
  GiB: 1_073_741_824,
  KiB: 1_024,
  MB: 1_000_000,
  MiB: 1_048_576,
  kB: 1_000,
} as const;

export const formatPanelValue = (value: number, unit: DisplayUnit, resolvedAutoUnit?: string) => {
  if (unit._tag === "number") {
    if (unit.format === "short") return compactNumber.format(value);
    if (unit.format === "scientific") return value.toExponential(unit.decimals ?? 2);
    return decimal(value, unit.decimals ?? 2);
  }
  if (unit._tag === "percent") {
    const percent = unit.input === "ratio" ? value * 100 : value;
    return `${decimal(percent, unit.decimals ?? 1)}%`;
  }
  if (unit._tag === "duration") {
    const seconds = value * durationSeconds[unit.input];
    const display = unit.display === "auto" ? autoDurationUnit(seconds) : unit.display;
    return `${decimal(seconds / durationSeconds[display], unit.decimals ?? 2)} ${display}`;
  }
  if (unit._tag === "bytes") {
    return formatBytes(value * byteFactors[unit.input], unit.base, unit.decimals ?? 1);
  }
  if (unit._tag === "rate") {
    const factor = unit.per === "second" ? 1 : unit.per === "minute" ? 60 : 3_600;
    const suffix = unit.noun
      ? ` ${unit.noun}/${shortPeriod(unit.per)}`
      : `/${shortPeriod(unit.per)}`;
    return `${decimal(value * factor, unit.decimals ?? 1)}${suffix}`;
  }
  if (unit._tag === "custom") {
    const number = decimal(value, unit.decimals ?? 2);
    return unit.position === "before" ? `${unit.symbol}${number}` : `${number} ${unit.symbol}`;
  }
  const suffix = normalizeAutoUnit(resolvedAutoUnit);
  return suffix.length === 0
    ? compactNumber.format(value)
    : `${compactNumber.format(value)} ${suffix}`;
};

const autoDurationUnit = (seconds: number): "ns" | "us" | "ms" | "s" => {
  const magnitude = Math.abs(seconds);
  if (magnitude >= 1) return "s";
  if (magnitude >= 0.001) return "ms";
  if (magnitude >= 0.000_001) return "us";
  return "ns";
};

const formatBytes = (bytes: number, base: "binary" | "decimal", places: number) => {
  const step = base === "binary" ? 1_024 : 1_000;
  const units = base === "binary" ? ["B", "KiB", "MiB", "GiB"] : ["B", "kB", "MB", "GB"];
  let scaled = bytes;
  let index = 0;
  while (Math.abs(scaled) >= step && index < units.length - 1) {
    scaled /= step;
    index += 1;
  }
  return `${decimal(scaled, places)} ${units[index]}`;
};

const shortPeriod = (period: "hour" | "minute" | "second") =>
  period === "second" ? "s" : period === "minute" ? "min" : "hr";

const normalizeAutoUnit = (unit?: string) => {
  const value = unit?.trim();
  if (!value || value === "1") return "";
  if (value === "By") return "B";
  return value;
};

export const thresholdMatches = (value: number, threshold: ValueThreshold) => {
  if (threshold.condition === "above") return value > threshold.value;
  if (threshold.condition === "at_or_above") return value >= threshold.value;
  if (threshold.condition === "below") return value < threshold.value;
  return value <= threshold.value;
};

const severityRank = { critical: 3, warning: 2, info: 1 } as const;

export const activeThreshold = (
  value: number,
  thresholds: ReadonlyArray<ValueThreshold> | undefined,
) =>
  thresholds
    ?.filter((threshold) => thresholdMatches(value, threshold))
    .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])[0];

export const summarizeValues = (
  values: ReadonlyArray<number>,
  summaries: ReadonlyArray<"avg" | "last" | "max" | "min">,
) => {
  if (values.length === 0) return [];
  const sum = values.reduce((total, value) => total + value, 0);
  return summaries.map((summary) => ({
    label: summary,
    value:
      summary === "last"
        ? values.at(-1)!
        : summary === "min"
          ? Math.min(...values)
          : summary === "max"
            ? Math.max(...values)
            : sum / values.length,
  }));
};

export const reducePanelValues = (
  values: ReadonlyArray<number>,
  reduction: "avg" | "count" | "last" | "max" | "min" | "sum",
) => {
  if (values.length === 0) return undefined;
  if (reduction === "last") return values.at(-1);
  if (reduction === "count") return values.length;
  if (reduction === "min") return Math.min(...values);
  if (reduction === "max") return Math.max(...values);
  const sum = values.reduce((total, value) => total + value, 0);
  return reduction === "avg" ? sum / values.length : sum;
};
