import type { Axis } from "@groundtruth/panel-dsl";
import type { TelemetryWindow } from "@groundtruth/telemetry";
import { Search02Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { errorMessage, formatRelativeTime } from "../../data/format";
import {
  useMetricCatalogQuery,
  useMetricExploreQuery,
  useOverviewQuery,
  useRuntimeQuery,
} from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { Icon } from "../../ui/icon";
import { ContentState, Page, PageHeader, SearchField } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { MetricChart } from "../overview/metric-chart";
import { LogsPage } from "../logs/logs-page";
import { TracesPage } from "../traces/traces-page";
import { aggregationFor, formatStat, toPanelSeries, windowLabels } from "./explore-format";
import { overviewContextFailure } from "./explore-context";
import { ExploreNavigation } from "./explore-navigation";

export function ExplorePage() {
  const search = useSearch({ from: "/explore" });
  const runtime = useRuntimeQuery();
  const overview = useOverviewQuery(runtime.data?.projectId ?? null);
  const services = overview.data?.services ?? [];
  const contextFailure = overviewContextFailure(overview);

  return (
    <>
      <ExploreNavigation services={services} />
      {search.signal === "metrics" ? (
        <MetricsExplorer
          contextFailure={contextFailure}
          contextRetrying={overview.isFetching}
          onRetryContext={() => void overview.refetch()}
          selectedMetric={search.metric}
          service={search.service}
          window={search.window}
        />
      ) : null}
      {search.signal === "logs" ? (
        <LogsPage
          contextFailure={contextFailure}
          contextRetrying={overview.isFetching}
          onRetryContext={() => void overview.refetch()}
          service={search.service}
          window={search.window}
        />
      ) : null}
      {search.signal === "traces" ? (
        <TracesPage
          contextFailure={contextFailure}
          contextRetrying={overview.isFetching}
          onRetryContext={() => void overview.refetch()}
          service={search.service}
          window={search.window}
        />
      ) : null}
    </>
  );
}

function MetricsExplorer({
  contextFailure,
  contextRetrying = false,
  onRetryContext,
  selectedMetric,
  service,
  window,
}: {
  contextFailure?: unknown;
  contextRetrying?: boolean;
  onRetryContext?: () => void;
  selectedMetric?: string;
  service?: string;
  window: TelemetryWindow;
}) {
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const catalog = useMetricCatalogQuery(projectId);
  const navigate = useNavigate({ from: "/explore" });
  const [filter, setFilter] = useState("");
  const visibleMetrics = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return catalog.data ?? [];
    return (catalog.data ?? []).filter(
      (metric) =>
        String(metric.name).toLowerCase().includes(query) ||
        metric.description.toLowerCase().includes(query) ||
        metric.services.some((service) => String(service).toLowerCase().includes(query)),
    );
  }, [catalog.data, filter]);
  const activeMetric =
    selectedMetric === undefined
      ? null
      : (catalog.data?.find((metric) => String(metric.name) === selectedMetric) ?? null);
  const aggregation = activeMetric ? aggregationFor(activeMetric) : "avg";
  const metricResult = useMetricExploreQuery(
    projectId,
    activeMetric ? String(activeMetric.name) : null,
    aggregation,
    window,
    service,
  );
  const series = metricResult.data ? toPanelSeries(metricResult.data) : [];
  const axis: Axis = { id: "left", unit: { _tag: "auto" } };
  const catalogUnavailable =
    (runtime.isError && !runtime.data) || (catalog.isError && !catalog.data);
  const metricUnavailable = metricResult.isError && !metricResult.data;
  const catalogFailure = runtime.isError && !runtime.data ? runtime.error : catalog.error;
  const returnPath = `/explore?signal=metrics&window=${window}${selectedMetric ? `&metric=${encodeURIComponent(selectedMetric)}` : ""}${service ? `&service=${encodeURIComponent(service)}` : ""}`;
  const staleFailure =
    catalogUnavailable || metricUnavailable || !catalog.data
      ? null
      : (runtime.error ?? catalog.error ?? metricResult.error ?? contextFailure);
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (catalog.isError) void catalog.refetch();
    if (metricResult.isError) void metricResult.refetch();
    if (contextFailure !== null && contextFailure !== undefined) onRetryContext?.();
  };

  return (
    <Page>
      <PageHeader
        description="Inspect every metric your services emit without changing the board."
        title="Metrics"
      />
      {!catalogUnavailable && !catalog.data && (runtime.isPending || catalog.isPending) ? (
        <ContentState kind="loading" title="Discovering metrics" />
      ) : null}
      {catalogUnavailable ? (
        <ContentState
          actions={
            <ConsoleFailureActions
              error={catalogFailure}
              invalidRequest={{
                href: "/explore?signal=metrics&window=1h",
                label: "Reset explorer",
              }}
              notFound={{ href: "/connect", label: "Open connection setup" }}
              onRetry={retryFailedQueries}
              returnPath={returnPath}
            />
          }
          kind="error"
          title="Metrics are unavailable"
        >
          {errorMessage(catalogFailure)}
        </ContentState>
      ) : null}
      <StaleDataNotice
        copy="Some metric data or service context may be out of date."
        error={staleFailure}
        invalidRequest={{
          href: "/explore?signal=metrics&window=1h",
          label: "Reset explorer",
        }}
        notFound={{
          href: "/explore?signal=metrics&window=1h",
          label: "Choose another metric",
        }}
        onRetry={retryFailedQueries}
        retrying={
          runtime.isFetching || catalog.isFetching || metricResult.isFetching || contextRetrying
        }
        returnPath={returnPath}
      />
      {catalog.data?.length === 0 ? (
        <ContentState title="No metrics yet">
          Send OTLP metrics to this project and they will appear here automatically.
        </ContentState>
      ) : null}
      {catalog.data && catalog.data.length > 0 ? (
        <div {...stylex.props(styles.metricsLayout)}>
          <aside aria-label="Metric catalog" {...stylex.props(styles.catalog)}>
            <div {...stylex.props(styles.catalogSearch)}>
              <Icon icon={Search02Icon} size={16} />
              <SearchField
                label="Filter metrics"
                onChange={setFilter}
                placeholder="Filter metrics"
                value={filter}
              />
            </div>
            <div {...stylex.props(styles.metricList)}>
              {visibleMetrics.map((metric) => {
                const selected = activeMetric?.name === metric.name;
                return (
                  <button
                    aria-pressed={selected}
                    key={metric.name}
                    onClick={() =>
                      void navigate({
                        search: (current) => ({ ...current, metric: String(metric.name) }),
                      })
                    }
                    type="button"
                    {...stylex.props(styles.metricButton, selected && styles.metricButtonActive)}
                  >
                    <span {...stylex.props(styles.metricIdentity)}>
                      <code {...stylex.props(styles.metricIdentityName)}>{metric.name}</code>
                      <span {...stylex.props(styles.metricIdentityDescription)}>
                        {metric.description || metric.type}
                      </span>
                    </span>
                    <span {...stylex.props(styles.metricType)}>{metric.type}</span>
                  </button>
                );
              })}
              {visibleMetrics.length === 0 ? (
                <span {...stylex.props(styles.noMatches)}>No metrics match that search.</span>
              ) : null}
            </div>
          </aside>

          {activeMetric ? (
            <section
              aria-label={`${activeMetric.name} details`}
              {...stylex.props(styles.metricDetail)}
            >
              <header {...stylex.props(styles.metricHeader)}>
                <div>
                  <code {...stylex.props(styles.metricName)}>{activeMetric.name}</code>
                  <p {...stylex.props(styles.metricDescription)}>
                    {activeMetric.description || `${activeMetric.type} metric`}
                  </p>
                </div>
                <span {...stylex.props(styles.aggregation)}>{aggregation}</span>
              </header>
              <div {...stylex.props(styles.stats)}>
                <Stat label="Latest" value={formatStat(metricResult.data?.stats.last)} />
                <Stat label="Average" value={formatStat(metricResult.data?.stats.average)} />
                <Stat label="Maximum" value={formatStat(metricResult.data?.stats.maximum)} />
                <Stat label="Series" value={String(metricResult.data?.series.length ?? 0)} />
              </div>
              <div {...stylex.props(styles.chartFrame)}>
                {metricResult.isPending && !metricResult.data ? (
                  <ContentState kind="loading" title="Loading metric" />
                ) : metricUnavailable ? (
                  <ContentState
                    actions={
                      <ConsoleFailureActions
                        error={metricResult.error}
                        invalidRequest={{
                          href: "/explore?signal=metrics&window=1h",
                          label: "Reset explorer",
                        }}
                        notFound={{
                          href: "/explore?signal=metrics&window=1h",
                          label: "Choose another metric",
                        }}
                        onRetry={retryFailedQueries}
                        returnPath={returnPath}
                      />
                    }
                    kind="error"
                    title="This metric is unavailable"
                  >
                    {errorMessage(metricResult.error)}
                  </ContentState>
                ) : series.length === 0 ? (
                  <ContentState title={`No points in the ${windowLabels[window]}`} />
                ) : (
                  <MetricChart
                    accessibleName={`${activeMetric.name} over the ${windowLabels[window]}`}
                    axes={[axis]}
                    resolvedUnits={{ left: activeMetric.unit }}
                    series={series}
                    summary={`${series.length} series for ${activeMetric.name} over the ${windowLabels[window]}.`}
                    visualization="line"
                  />
                )}
              </div>
              <footer {...stylex.props(styles.metricFooter)}>
                <span>
                  Seen {formatRelativeTime(activeMetric.lastSeenAt)} in{" "}
                  {activeMetric.services.length}{" "}
                  {activeMetric.services.length === 1 ? "service" : "services"}
                </span>
                <span>{activeMetric.attributes.length} attributes</span>
              </footer>
            </section>
          ) : (
            <div {...stylex.props(styles.metricChoice)}>
              <ContentState title={selectedMetric ? "Metric not found" : "Choose a metric"}>
                {selectedMetric
                  ? "That metric is not available in this project. Choose another from the catalog."
                  : "Select a metric from the catalog to inspect its values and recent shape."}
              </ContentState>
            </div>
          )}
        </div>
      ) : null}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span {...stylex.props(styles.stat)}>
      <span {...stylex.props(styles.statLabel)}>{label}</span>
      <strong {...stylex.props(styles.statValue)}>{value}</strong>
    </span>
  );
}

const styles = stylex.create({
  metricsLayout: {
    display: "grid",
    gap: space.x5,
    gridTemplateColumns: { default: "320px minmax(0, 1fr)", "@media (max-width: 900px)": "1fr" },
  },
  catalog: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  catalogSearch: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: colors.textSubtle,
    display: "flex",
    gap: space.x2,
    paddingInline: space.x3,
  },
  metricList: {
    display: "grid",
    maxHeight: { default: 560, "@media (max-width: 900px)": 280 },
    overflowY: "auto",
  },
  metricButton: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.whiteWash },
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderLeftColor: "transparent",
    borderLeftStyle: "solid",
    borderLeftWidth: 2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    color: colors.text,
    cursor: "pointer",
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: 64,
    padding: space.x3,
    textAlign: "left",
  },
  metricButtonActive: { backgroundColor: colors.surfaceRaised, borderLeftColor: colors.amber },
  metricIdentity: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  metricIdentityName: {
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metricIdentityDescription: {
    color: colors.textSubtle,
    fontSize: 10,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metricType: { color: colors.textSubtle, fontFamily: "IBM Plex Mono, monospace", fontSize: 9 },
  noMatches: { color: colors.textSubtle, fontSize: 12, padding: space.x5 },
  metricDetail: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gridTemplateRows: "auto auto minmax(320px, 1fr) auto",
    minWidth: 0,
    overflow: "hidden",
  },
  metricChoice: { alignSelf: "start" },
  metricHeader: {
    alignItems: "start",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: space.x4,
    justifyContent: "space-between",
    padding: space.x5,
  },
  metricName: { color: colors.text, fontSize: 14 },
  metricDescription: { color: colors.textSubtle, fontSize: 11, marginBlock: 5 },
  aggregation: {
    backgroundColor: colors.amberWash,
    borderRadius: radii.pill,
    color: colors.amber,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 9,
    paddingBlock: 4,
    paddingInline: 8,
  },
  stats: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  },
  stat: {
    borderRightColor: colors.line,
    borderRightStyle: "solid",
    borderRightWidth: { default: 1, ":last-child": 0 },
    display: "grid",
    gap: 5,
    padding: space.x4,
  },
  statLabel: { color: colors.textSubtle, fontSize: 10 },
  statValue: { fontFamily: "IBM Plex Mono, monospace", fontSize: 14, fontWeight: 500 },
  chartFrame: { minHeight: 320, padding: space.x4 },
  metricFooter: {
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: colors.textSubtle,
    display: "flex",
    fontSize: 10,
    justifyContent: "space-between",
    padding: space.x4,
  },
});
