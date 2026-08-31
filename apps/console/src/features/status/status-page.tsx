import type {
  PublicStatusComponent,
  PublicStatusMetric,
  PublicStatusResponse,
} from "@groundtruth/api-contract";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { formatRelativeTime } from "../../data/format";
import { usePublicStatusQuery } from "../../data/public-status";
import { colors, radii } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ClearMark } from "../../ui/clear-mark";
import { StatusDot, StatusPill } from "../../ui/status";
import { MetricChart } from "../overview/metric-chart";
import {
  formatPublicMetricValue,
  latestMetricValue,
  publicMetricAxis,
  publicMetricSeries,
  publicStatusPresentation,
} from "./public-status-model";

export function StatusPage() {
  const status = usePublicStatusQuery();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Clear status";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <StatusFrame>
      {status.data ? (
        <StatusContent
          data={status.data}
          error={status.isError ? status.error : null}
          refreshing={status.isFetching}
          retry={() => void status.refetch()}
        />
      ) : status.isError ? (
        <InitialError retry={() => void status.refetch()} />
      ) : (
        <StatusLoading />
      )}
    </StatusFrame>
  );
}

function StatusFrame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <Link aria-label="Clear home" to="/" {...stylex.props(styles.brand)}>
          <ClearMark />
          <span>Clear</span>
          <span aria-hidden {...stylex.props(styles.brandDivider)} />
          <span {...stylex.props(styles.brandSection)}>Status</span>
        </Link>
        <Button render={<Link to="/" />} tone="ghost">
          Open Clear
        </Button>
      </header>
      <main {...stylex.props(styles.main)}>{children}</main>
    </div>
  );
}

function StatusContent({
  data,
  error,
  refreshing,
  retry,
}: {
  readonly data: PublicStatusResponse;
  readonly error: unknown;
  readonly refreshing: boolean;
  readonly retry: () => void;
}) {
  const presentation = publicStatusPresentation[data.status];
  return (
    <>
      <section aria-labelledby="status-heading" {...stylex.props(styles.hero)}>
        <StatusPill tone={presentation.tone}>{presentation.label}</StatusPill>
        <h1 id="status-heading" {...stylex.props(styles.heading)}>
          {presentation.headline}
        </h1>
        <p {...stylex.props(styles.summary)}>{data.summary}</p>
        <p aria-live="polite" {...stylex.props(styles.checkedAt)}>
          Checked {formatRelativeTime(data.checkedAt)}
          {refreshing ? <span {...stylex.props(styles.screenReaderOnly)}>Refreshing</span> : null}
        </p>
      </section>

      {error ? <StaleStatusNotice retry={retry} /> : null}

      <section aria-labelledby="components-heading" {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.sectionHeading)}>
          <div>
            <h2 id="components-heading" {...stylex.props(styles.sectionTitle)}>
              Systems
            </h2>
            <p {...stylex.props(styles.sectionDescription)}>
              The services that receive, store, and serve Clear telemetry.
            </p>
          </div>
        </div>
        <div {...stylex.props(styles.componentList)}>
          {data.components.map((component) => (
            <ComponentRow component={component} key={component.key} />
          ))}
        </div>
      </section>

      <section aria-labelledby="telemetry-heading" {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.sectionHeading)}>
          <div>
            <h2 id="telemetry-heading" {...stylex.props(styles.sectionTitle)}>
              Live telemetry
            </h2>
            <p {...stylex.props(styles.sectionDescription)}>
              Recent signals emitted by the services running Clear.
            </p>
          </div>
          <span {...stylex.props(styles.liveIndicator)}>
            <StatusDot tone="neutral" /> Updates every 15 seconds
          </span>
        </div>
        <div {...stylex.props(styles.metricGrid)}>
          {data.metrics.map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <footer {...stylex.props(styles.footer)}>
        <span>Clear observes itself with OpenTelemetry.</span>
        <span>Version {shortVersion(data.version)}</span>
      </footer>
    </>
  );
}

function ComponentRow({ component }: { readonly component: PublicStatusComponent }) {
  const presentation = publicStatusPresentation[component.status];
  return (
    <article {...stylex.props(styles.componentRow)}>
      <div {...stylex.props(styles.componentCopy)}>
        <div {...stylex.props(styles.componentTitleRow)}>
          <StatusDot tone={presentation.tone} />
          <h3 {...stylex.props(styles.componentName)}>{component.name}</h3>
        </div>
        <p {...stylex.props(styles.componentSummary)}>{component.summary}</p>
      </div>
      <div {...stylex.props(styles.componentState)}>
        <span {...stylex.props(styles.componentStatus)}>{presentation.label}</span>
        <span {...stylex.props(styles.componentObserved)}>
          {component.observedAt === null
            ? "Awaiting a signal"
            : `Observed ${formatRelativeTime(component.observedAt)}`}
        </span>
      </div>
    </article>
  );
}

function MetricCard({ metric }: { readonly metric: PublicStatusMetric }) {
  const series = publicMetricSeries(metric);
  const axis = publicMetricAxis(metric);
  const latest = latestMetricValue(metric);
  const hasData = metric.status === "ready" && series.some((item) => item.points.length > 0);
  return (
    <article {...stylex.props(styles.metricCard)}>
      <div {...stylex.props(styles.metricHeader)}>
        <div>
          <h3 {...stylex.props(styles.metricTitle)}>{metric.title}</h3>
          <p {...stylex.props(styles.metricDescription)}>{metric.description}</p>
        </div>
        {latest === undefined ? null : (
          <strong {...stylex.props(styles.metricValue)}>
            {formatPublicMetricValue(metric, latest)}
          </strong>
        )}
      </div>
      {hasData ? (
        <MetricChart
          accessibleName={`${metric.title} over the last 15 minutes`}
          axes={[axis]}
          series={series}
          summary={`${metric.description} ${series.length} service series are shown.`}
          visualization="line"
        />
      ) : (
        <div role="status" {...stylex.props(styles.metricEmpty)}>
          <span>No recent samples</span>
          <small>This signal will appear after the next telemetry export.</small>
        </div>
      )}
      {hasData ? (
        <div aria-label={`${metric.title} services`} {...stylex.props(styles.legend)}>
          {series.map((item) => (
            <span key={item.queryRef} {...stylex.props(styles.legendItem)}>
              <span
                aria-hidden
                style={{ backgroundColor: item.color }}
                {...stylex.props(styles.legendLine)}
              />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function StaleStatusNotice({ retry }: { readonly retry: () => void }) {
  return (
    <div aria-live="polite" role="status" {...stylex.props(styles.staleNotice)}>
      <div {...stylex.props(styles.staleCopy)}>
        <strong>Live refresh paused</strong>
        <span>The last successful status remains visible while Clear reconnects.</span>
      </div>
      <Button compact disabled={false} onClick={retry} tone="ghost">
        Try again
      </Button>
    </div>
  );
}

function InitialError({ retry }: { readonly retry: () => void }) {
  return (
    <section aria-labelledby="status-unavailable" {...stylex.props(styles.stateCard)}>
      <StatusPill tone="attention">Status unavailable</StatusPill>
      <h1 id="status-unavailable" {...stylex.props(styles.stateTitle)}>
        Clear status could not be loaded
      </h1>
      <p {...stylex.props(styles.stateDescription)}>
        The status endpoint did not respond. Try again in a moment.
      </p>
      <Button onClick={retry} tone="secondary">
        Try again
      </Button>
    </section>
  );
}

function StatusLoading() {
  return (
    <section aria-label="Loading Clear status" aria-live="polite" {...stylex.props(styles.loading)}>
      <span {...stylex.props(styles.loadingPill)} />
      <span {...stylex.props(styles.loadingTitle)} />
      <span {...stylex.props(styles.loadingCopy)} />
      <span {...stylex.props(styles.screenReaderOnly)}>Loading Clear status</span>
    </section>
  );
}

const shortVersion = (version: string) =>
  /^[0-9a-f]{12,}$/i.test(version) ? version.slice(0, 7) : version;

const styles = stylex.create({
  page: { backgroundColor: colors.canvas, color: colors.text, minHeight: "100vh" },
  header: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    height: 64,
    justifyContent: "space-between",
    marginInline: "auto",
    maxWidth: 1120,
    paddingInline: { default: 32, "@media (max-width: 620px)": 20 },
  },
  brand: {
    alignItems: "center",
    color: colors.text,
    display: "inline-flex",
    fontSize: 14,
    fontWeight: 600,
    gap: 9,
    textDecoration: "none",
  },
  brandDivider: { backgroundColor: colors.lineStrong, height: 18, marginInline: 3, width: 1 },
  brandSection: { color: colors.textMuted, fontWeight: 500 },
  main: {
    marginInline: "auto",
    maxWidth: 1040,
    paddingBlock: { default: "68px 40px", "@media (max-width: 620px)": "44px 28px" },
    paddingInline: { default: 32, "@media (max-width: 620px)": 20 },
  },
  hero: { maxWidth: 700, paddingBottom: { default: 64, "@media (max-width: 620px)": 44 } },
  heading: {
    fontSize: { default: 44, "@media (max-width: 620px)": 34 },
    fontWeight: 500,
    letterSpacing: "-0.035em",
    lineHeight: 1.08,
    marginBlock: "20px 14px",
  },
  summary: {
    color: colors.textMuted,
    fontSize: { default: 17, "@media (max-width: 620px)": 16 },
    lineHeight: 1.55,
    margin: 0,
    maxWidth: 660,
  },
  checkedAt: {
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono",
    fontSize: 11,
    marginBlock: "18px 0",
  },
  section: { marginBottom: 56 },
  sectionHeading: {
    alignItems: { default: "flex-end", "@media (max-width: 620px)": "flex-start" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: 16,
    justifyContent: "space-between",
    marginBottom: 18,
  },
  sectionTitle: { fontSize: 18, fontWeight: 500, letterSpacing: "-0.012em", margin: 0 },
  sectionDescription: { color: colors.textMuted, fontSize: 13, marginBlock: "5px 0" },
  liveIndicator: {
    alignItems: "center",
    color: colors.textSubtle,
    display: "inline-flex",
    fontSize: 11,
    gap: 8,
  },
  componentList: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  componentRow: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: 24,
    justifyContent: "space-between",
    minHeight: 88,
    paddingBlock: 18,
    paddingInline: { default: 22, "@media (max-width: 620px)": 16 },
    ":last-child": { borderBottomWidth: 0 },
  },
  componentCopy: { minWidth: 0 },
  componentTitleRow: { alignItems: "center", display: "flex", gap: 10 },
  componentName: { fontSize: 14, fontWeight: 500, margin: 0 },
  componentSummary: { color: colors.textMuted, fontSize: 12, marginBlock: "5px 0", maxWidth: 600 },
  componentState: { flexShrink: 0, textAlign: "right" },
  componentStatus: { display: "block", fontSize: 12, fontWeight: 500 },
  componentObserved: { color: colors.textSubtle, display: "block", fontSize: 11, marginTop: 4 },
  metricGrid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 760px)": "1fr",
    },
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    minHeight: 390,
    padding: { default: 22, "@media (max-width: 620px)": 16 },
  },
  metricHeader: { display: "flex", gap: 16, justifyContent: "space-between", minHeight: 68 },
  metricTitle: { fontSize: 14, fontWeight: 500, margin: 0 },
  metricDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.45,
    marginBlock: "5px 0",
    maxWidth: 250,
  },
  metricValue: { flexShrink: 0, fontFamily: "IBM Plex Mono", fontSize: 16, fontWeight: 500 },
  metricEmpty: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "dashed",
    borderWidth: 1,
    color: colors.textMuted,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    height: 250,
    justifyContent: "center",
    textAlign: "center",
  },
  legend: { display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 2 },
  legendItem: {
    alignItems: "center",
    color: colors.textMuted,
    display: "inline-flex",
    fontSize: 11,
    gap: 7,
  },
  legendLine: { borderRadius: radii.pill, height: 2, width: 15 },
  staleNotice: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderColor: "rgba(251, 191, 36, 0.24)",
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    display: "flex",
    fontSize: 12,
    gap: 18,
    justifyContent: "space-between",
    marginBottom: 36,
    paddingBlock: 12,
    paddingInline: 14,
  },
  staleCopy: { display: "flex", flexDirection: "column", gap: 3 },
  stateCard: {
    alignItems: "flex-start",
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    marginBlock: 52,
    maxWidth: 600,
    padding: { default: 32, "@media (max-width: 620px)": 22 },
  },
  stateTitle: { fontSize: 26, fontWeight: 500, letterSpacing: "-0.025em", marginBlock: "20px 8px" },
  stateDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 1.55,
    marginBlock: "0 10px",
  },
  loading: { display: "flex", flexDirection: "column", gap: 18, paddingTop: 28 },
  loadingPill: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    height: 24,
    width: 92,
  },
  loadingTitle: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    height: 48,
    width: "min(460px, 86vw)",
  },
  loadingCopy: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    height: 22,
    width: "min(620px, 86vw)",
  },
  footer: {
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: colors.textSubtle,
    display: "flex",
    fontSize: 11,
    justifyContent: "space-between",
    paddingTop: 24,
  },
  screenReaderOnly: {
    clip: "rect(0, 0, 0, 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
