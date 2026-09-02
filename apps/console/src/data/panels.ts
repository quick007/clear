import type { PanelView } from "@groundtruth/api-contract";
import type {
  AxisId,
  ChartQuery,
  MetricFilter,
  MetricQuery as PanelMetricQuery,
  QueryRef,
} from "@groundtruth/panel-dsl";
import {
  AttributeFilter,
  MetricName,
  MetricQuery,
  MetricSeriesPoint,
  RelativeTimeRange,
  type MetricQueryResult,
  type TelemetryAttributes,
} from "@groundtruth/telemetry";
import { useQueries } from "@tanstack/react-query";
import { Data } from "effect";

import { epochMilliseconds } from "./format";
import { colorValues } from "../theme/color-values";
import { queryKeys } from "./query-keys";
import { runGroundtruthQuery } from "./queries";

export const panelPalette = {
  amber: colorValues.amber,
  blue: colorValues.blue,
  cyan: colorValues.cyan,
  gray: colorValues.textMuted,
  green: colorValues.green,
  orange: colorValues.orange,
  red: colorValues.red,
  violet: colorValues.violet,
} as const;

const seriesTones = ["orange", "blue", "red", "violet", "amber", "green", "cyan", "gray"] as const;

const queryStepMilliseconds = {
  "5s": 5 * 1_000, // 5 seconds
  "10s": 10 * 1_000, // 10 seconds
  "30s": 30 * 1_000, // 30 seconds
  "1m": 60 * 1_000, // 1 minute
  "5m": 5 * 60 * 1_000, // 5 minutes
} as const;

export const metricQueryBucketDuration = (step: MetricQuery["step"]) =>
  queryStepMilliseconds[step ?? "30s"];

export type PanelSeries = {
  readonly attributes: TelemetryAttributes;
  readonly axis: AxisId;
  readonly bucketDurationMs: number;
  readonly color: string;
  readonly fillOpacity?: number;
  readonly label: string;
  readonly lineStyle: "solid" | "dashed";
  readonly points: ReadonlyArray<MetricSeriesPoint>;
  readonly queryRef: QueryRef;
  readonly tone: keyof typeof panelPalette;
};

export type PanelQueryPlan = {
  readonly axis: AxisId;
  readonly color: string;
  readonly fillOpacity?: number;
  readonly label: string;
  readonly lineStyle: "solid" | "dashed";
  readonly normalization?: ChartQuery["normalization"];
  readonly query: MetricQuery;
  readonly queryRef: QueryRef;
  readonly tone: keyof typeof panelPalette;
};

export class UnsupportedPanelQuery extends Data.TaggedError("UnsupportedPanelQuery")<{
  readonly diagnosis: string;
  readonly queryRef: QueryRef;
}> {}

export const panelQueryDiagnosis = (issue: UnsupportedPanelQuery) =>
  `Panel query ${issue.queryRef} needs an update: ${issue.diagnosis}.`;

export type MissingPanelQuery = Pick<PanelQueryPlan, "label" | "queryRef">;

export const findMissingPanelQueries = (
  plans: ReadonlyArray<PanelQueryPlan>,
  snapshots: ReadonlyArray<{ readonly data: unknown; readonly error: unknown }>,
) =>
  plans.flatMap((plan, index): ReadonlyArray<MissingPanelQuery> => {
    const snapshot = snapshots[index];
    return snapshot?.error !== null && snapshot?.error !== undefined && snapshot.data === undefined
      ? [{ label: plan.label, queryRef: plan.queryRef }]
      : [];
  });

export function usePanelSeries(panel: PanelView) {
  const panelQueries = panel.spec._tag === "stat" ? [panel.spec.query] : panel.spec.queries;
  const planning = buildPanelPlans(panelQueries);
  const queries = useQueries({
    queries: planning.plans.map((item, index) => ({
      queryKey: queryKeys.panel(
        panel.metadata.projectId,
        `${panel.metadata.id}-${index}`,
        panel.metadata.revision,
      ),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        runGroundtruthQuery(
          (runtime) =>
            runtime.api.client.telemetry.queryMetrics({
              params: { projectId: panel.metadata.projectId },
              payload: item.query,
            }),
          signal,
        ),
    })),
  });

  const pending = queries.some((query) => query.isPending);
  const failedQueries = queries.filter((query) => query.isError);
  const queryError =
    failedQueries.find((query) => query.data === undefined)?.error ??
    failedQueries[0]?.error ??
    null;
  const missingQueries = findMissingPanelQueries(planning.plans, queries);
  const results = queries.flatMap((query, queryIndex) =>
    query.data ? materializePanelSeries(query.data, planning.plans[queryIndex]!) : [],
  );
  const hints = queries.flatMap((query) => (query.data?.hint ? [query.data.hint] : []));
  const refetch = () =>
    Promise.all(
      (failedQueries.length > 0 ? failedQueries : queries).map((query) => query.refetch()),
    ).then(() => undefined);
  return {
    error: queryError,
    hints,
    issue: planning.error,
    missingQueries,
    pending,
    queryCount: planning.plans.length,
    refetch,
    retrying: failedQueries.some((query) => query.isFetching),
    results,
  };
}

export const buildPanelPlans = (queries: ReadonlyArray<ChartQuery | PanelMetricQuery>) => {
  const plans: Array<PanelQueryPlan> = [];
  for (const [index, query] of queries.entries()) {
    const unsupported = unsupportedQueryReason(query);
    if (unsupported !== null) {
      return {
        error: new UnsupportedPanelQuery({ diagnosis: unsupported, queryRef: query.refId }),
        plans: [] as ReadonlyArray<PanelQueryPlan>,
      };
    }
    const style = "style" in query ? query.style : undefined;
    const tone = style?.color ?? seriesTones[index % seriesTones.length]!;
    plans.push({
      axis: "axis" in query ? query.axis : "left",
      color: panelPalette[tone],
      fillOpacity: style?.fillOpacity,
      label: style?.label ?? `${query.aggregation} ${query.metric}`,
      lineStyle: style?.lineStyle ?? "solid",
      normalization: "normalization" in query ? query.normalization : undefined,
      query: MetricQuery.make({
        aggregation: query.aggregation,
        distinctKey: query.distinctKey,
        filters: convertFilters(query.filters ?? []),
        groupBy: query.groupBy?.attributes,
        maxPoints: Math.min(2_000, 240 * (query.groupBy?.maxSeries ?? 1)),
        maxSeries: query.groupBy?.maxSeries,
        metric: MetricName.make(query.metric),
        range: RelativeTimeRange.make({ window: query.window === "7d" ? "24h" : query.window }),
        step: query.step === "auto" || query.step === "15m" ? undefined : query.step,
      }),
      queryRef: query.refId,
      tone,
    });
  }
  return { error: null, plans };
};

const unsupportedQueryReason = (query: ChartQuery | PanelMetricQuery) => {
  if (query.window === "7d") return "the query service does not support the 7d window yet";
  if (query.step === "15m") return "the query service does not support a 15m step yet";
  if (query.groupBy?.includeOther) {
    return "groupBy.includeOther requires an aggregated other series that is not available yet";
  }
  for (const filter of query.filters ?? []) {
    if (filter._tag === "range") return "numeric range filters are not available yet";
    if (filter._tag === "pattern") return "regular expression filters are not available yet";
    if (filter._tag === "presence" && !filter.exists) {
      return "absent-attribute filters are not available yet";
    }
    if (filter._tag === "set" && filter.operator === "in") {
      return "set inclusion filters require OR semantics that are not available yet";
    }
  }
  return null;
};

const convertFilters = (filters: ReadonlyArray<MetricFilter>) =>
  filters.flatMap((filter) => {
    if (filter._tag === "match") {
      return [
        AttributeFilter.make({
          key: filter.attribute,
          operator: filter.operator === "eq" ? "equals" : "not-equals",
          value: filter.value,
        }),
      ];
    }
    if (filter._tag === "presence") {
      return [AttributeFilter.make({ key: filter.attribute, operator: "exists", value: null })];
    }
    if (filter._tag === "set") {
      return filter.values.map((item) =>
        AttributeFilter.make({ key: filter.attribute, operator: "not-equals", value: item }),
      );
    }
    return [];
  });

const readableSeriesLabel = (attributes: Readonly<Record<string, unknown>>, fallback: string) => {
  const attempt = attributes.attempt;
  if (typeof attempt !== "string") return fallback;
  const number = Number.parseInt(attempt, 10);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return number === 1 ? "Original attempt" : `Retry ${number - 1}`;
};

const normalizationWindowMilliseconds = {
  "1m": 60 * 1_000, // 1 minute
  "5m": 5 * 60 * 1_000, // 5 minutes
  "15m": 15 * 60 * 1_000, // 15 minutes
} as const;

export const normalizePanelPoints = (
  points: ReadonlyArray<MetricSeriesPoint>,
  normalization: ChartQuery["normalization"],
) => {
  if (normalization === undefined || points.length === 0) return points;
  const firstAt = Math.min(...points.map((point) => epochMilliseconds(point.at)));
  const baselineEnd = firstAt + normalizationWindowMilliseconds[normalization.window];
  const baselineValues = points
    .filter((point) => epochMilliseconds(point.at) < baselineEnd)
    .map((point) => point.value);
  if (baselineValues.length === 0) return points;
  const baseline =
    baselineValues.reduce((total, value) => total + value, 0) / baselineValues.length;
  if (!Number.isFinite(baseline) || baseline === 0) return points;
  return points.map(
    (point) => new MetricSeriesPoint({ at: point.at, value: point.value / baseline }),
  );
};

const attemptNumber = (attributes: Readonly<Record<string, unknown>>) => {
  const value = attributes.attempt;
  if (typeof value !== "string") return null;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const groupedTone = (attributes: Readonly<Record<string, unknown>>, index: number) => {
  const attempt = attemptNumber(attributes);
  if (attempt === 1) return "gray";
  if (attempt === 2) return "orange";
  if (attempt === 3) return "amber";
  return seriesTones[index % seriesTones.length]!;
};

export const materializePanelSeries = (result: MetricQueryResult, plan: PanelQueryPlan) =>
  result.series
    .toSorted(
      (left, right) =>
        (attemptNumber(left.attributes) ?? Number.MAX_SAFE_INTEGER) -
        (attemptNumber(right.attributes) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((series, index): PanelSeries => {
      const grouped = result.series.length > 1;
      const tone = grouped ? groupedTone(series.attributes, index) : plan.tone;
      const groupedLabel = readableSeriesLabel(series.attributes, series.label);
      return {
        attributes: series.attributes,
        axis: plan.axis,
        bucketDurationMs: metricQueryBucketDuration(result.query.step),
        color: grouped ? panelPalette[tone] : plan.color,
        fillOpacity:
          plan.fillOpacity ??
          (attemptNumber(series.attributes) === 1
            ? 0.08
            : attemptNumber(series.attributes) !== null
              ? 0.22
              : undefined),
        label: grouped
          ? plan.label === `${result.query.aggregation} ${result.query.metric}`
            ? groupedLabel
            : `${plan.label} · ${groupedLabel}`
          : plan.label,
        lineStyle: plan.lineStyle,
        points: normalizePanelPoints(series.points, plan.normalization),
        queryRef: plan.queryRef,
        tone,
      };
    });
