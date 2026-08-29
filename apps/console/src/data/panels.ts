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
  RelativeTimeRange,
  type MetricQueryResult,
  type MetricSeriesPoint,
  type TelemetryAttributes,
} from "@groundtruth/telemetry";
import { useQueries } from "@tanstack/react-query";

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

export type PanelSeries = {
  readonly attributes: TelemetryAttributes;
  readonly axis: AxisId;
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
  readonly query: MetricQuery;
  readonly queryRef: QueryRef;
  readonly tone: keyof typeof panelPalette;
};

export class UnsupportedPanelQuery extends Error {
  readonly name = "UnsupportedPanelQuery";
}

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
  const error = planning.error ?? queries.find((query) => query.error)?.error;
  const results = queries.flatMap((query, queryIndex) =>
    query.data ? materializePanelSeries(query.data, planning.plans[queryIndex]!) : [],
  );
  const hints = queries.flatMap((query) => (query.data?.hint ? [query.data.hint] : []));
  return { error, hints, pending, results };
}

export const buildPanelPlans = (queries: ReadonlyArray<ChartQuery | PanelMetricQuery>) => {
  const plans: Array<PanelQueryPlan> = [];
  for (const [index, query] of queries.entries()) {
    const unsupported = unsupportedQueryReason(query);
    if (unsupported !== null) {
      return {
        error: new UnsupportedPanelQuery(`${query.refId}: ${unsupported}`),
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
      query: MetricQuery.make({
        aggregation: query.aggregation,
        distinctKey: query.distinctKey,
        filters: convertFilters(query.filters ?? []),
        groupBy: query.groupBy?.attributes,
        maxPoints: 240,
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

export const materializePanelSeries = (result: MetricQueryResult, plan: PanelQueryPlan) =>
  result.series.map((series, index): PanelSeries => {
    const grouped = result.series.length > 1;
    const tone = grouped ? seriesTones[index % seriesTones.length]! : plan.tone;
    return {
      attributes: series.attributes,
      axis: plan.axis,
      color: grouped ? panelPalette[tone] : plan.color,
      fillOpacity: plan.fillOpacity,
      label: grouped
        ? plan.label === `${result.query.aggregation} ${result.query.metric}`
          ? series.label
          : `${plan.label} · ${series.label}`
        : plan.label,
      lineStyle: plan.lineStyle,
      points: series.points,
      queryRef: plan.queryRef,
      tone,
    };
  });
