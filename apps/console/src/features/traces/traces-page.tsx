import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { TelemetryWindow } from "@groundtruth/telemetry";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { errorMessage, formatDuration, formatUnixNanoTime } from "../../data/format";
import { useRuntimeQuery, useTracesQuery } from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { Icon } from "../../ui/icon";
import { ContentState, Page, PageHeader, SearchField, Toolbar } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { StatusDot } from "../../ui/status";

export function TracesPage({
  contextFailure,
  contextRetrying = false,
  onRetryContext,
  service,
  window,
}: {
  contextFailure?: unknown;
  contextRetrying?: boolean;
  onRetryContext?: () => void;
  service?: string;
  window: TelemetryWindow;
}) {
  const [search, setSearch] = useState("");
  const runtime = useRuntimeQuery();
  const traces = useTracesQuery(runtime.data?.projectId ?? null, search.trim(), window, service);
  const tracesUnavailable = (runtime.isError && !runtime.data) || (traces.isError && !traces.data);
  const failure = runtime.isError && !runtime.data ? runtime.error : traces.error;
  const returnPath = `/explore?signal=traces&window=${window}${service ? `&service=${encodeURIComponent(service)}` : ""}`;
  const staleFailure =
    tracesUnavailable || !traces.data ? null : (runtime.error ?? traces.error ?? contextFailure);
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (traces.isError) void traces.refetch();
    if (contextFailure !== null && contextFailure !== undefined) onRetryContext?.();
  };

  return (
    <Page>
      <PageHeader
        description="Follow requests across services and open the exact spans behind a symptom."
        title="Traces"
      />
      <Toolbar>
        <SearchField
          label="Search traces"
          onChange={setSearch}
          placeholder="Search root operation"
          value={search}
        />
      </Toolbar>

      {!tracesUnavailable && !traces.data && (runtime.isPending || traces.isPending) ? (
        <ContentState kind="loading" title="Loading traces" />
      ) : null}
      {tracesUnavailable ? (
        <ContentState
          actions={
            <ConsoleFailureActions
              error={failure}
              invalidRequest={{
                href: "/explore?signal=traces&window=1h",
                label: "Clear filters",
              }}
              notFound={{ href: "/connect", label: "Open connection setup" }}
              onRetry={retryFailedQueries}
              returnPath={returnPath}
            />
          }
          kind="error"
          title="Traces are unavailable"
        >
          {errorMessage(failure)}
        </ContentState>
      ) : null}
      <StaleDataNotice
        copy="Some trace data or service context may be out of date."
        error={staleFailure}
        invalidRequest={{ href: "/explore?signal=traces&window=1h", label: "Clear filters" }}
        notFound={{ href: "/connect", label: "Open connection setup" }}
        onRetry={retryFailedQueries}
        retrying={runtime.isFetching || traces.isFetching || contextRetrying}
        returnPath={returnPath}
      />
      {traces.data && traces.data.traces.length === 0 ? (
        <ContentState
          actions={
            search ? undefined : (
              <Button render={<Link to="/connect" />} tone="secondary">
                Connect telemetry
              </Button>
            )
          }
          title="No traces found"
        >
          {search
            ? "Try a broader operation search."
            : "Send OTLP traces to inspect request paths."}
        </ContentState>
      ) : null}
      {traces.data && traces.data.traces.length > 0 ? (
        <section aria-label="Trace results" {...stylex.props(styles.results)}>
          <div {...stylex.props(styles.resultMeta)}>
            <span>{traces.data.traces.length} traces</span>
            <span>{traces.data.hasMore ? "Showing newest 50" : "Newest first"}</span>
          </div>
          <div {...stylex.props(styles.tableHeader)}>
            <span>Start</span>
            <span>Root operation</span>
            <span>Duration</span>
            <span>Services</span>
            <span>Spans</span>
            <span>Status</span>
            <span />
          </div>
          {traces.data.traces.map((trace) => (
            <Link
              key={trace.traceId}
              params={{ traceId: trace.traceId }}
              to="/traces/$traceId"
              {...stylex.props(styles.traceRow)}
            >
              <time {...stylex.props(styles.traceStart)}>
                {formatUnixNanoTime(trace.startTimeUnixNano)}
              </time>
              <span {...stylex.props(styles.operation)}>{trace.rootSpanName}</span>
              <code {...stylex.props(styles.traceDuration)}>
                {formatDuration(trace.durationMs)}
              </code>
              <code {...stylex.props(styles.desktopTraceMeta)}>{trace.services.length}</code>
              <code {...stylex.props(styles.desktopTraceMeta)}>{trace.spanCount}</code>
              <span {...stylex.props(styles.status)}>
                <StatusDot tone={trace.status === "error" ? "critical" : "healthy"} />
                {trace.status}
              </span>
              <span {...stylex.props(styles.traceArrow)}>
                <Icon icon={ArrowRight01Icon} size={15} />
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </Page>
  );
}

const styles = stylex.create({
  results: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  resultMeta: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: colors.textSubtle,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    justifyContent: "space-between",
    padding: space.x3,
  },
  tableHeader: {
    color: colors.textSubtle,
    display: { default: "grid", "@media (max-width: 620px)": "none" },
    fontSize: 11,
    gap: space.x3,
    gridTemplateColumns: "100px minmax(180px, 1fr) 100px 72px 60px 92px 18px",
    paddingBlock: 10,
    paddingInline: space.x4,
  },
  traceRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: colors.textMuted,
    display: "grid",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    gap: space.x3,
    gridTemplateColumns: {
      default: "100px minmax(180px, 1fr) 100px 72px 60px 92px 18px",
      "@media (max-width: 620px)": "minmax(0, 1fr) auto",
    },
    minHeight: 52,
    paddingBlock: { default: 0, "@media (max-width: 620px)": space.x3 },
    paddingInline: space.x4,
    textDecoration: "none",
    ":hover": { backgroundColor: colors.whiteWash, color: colors.text },
  },
  operation: {
    color: colors.text,
    fontFamily: "IBM Plex Sans, sans-serif",
    fontSize: 13,
    gridColumn: { default: "auto", "@media (max-width: 620px)": "1" },
    gridRow: { default: "auto", "@media (max-width: 620px)": "1" },
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  desktopTraceMeta: { display: { default: "inline", "@media (max-width: 620px)": "none" } },
  traceStart: {
    gridColumn: { default: "auto", "@media (max-width: 620px)": "1" },
    gridRow: { default: "auto", "@media (max-width: 620px)": "2" },
  },
  traceDuration: {
    gridColumn: { default: "auto", "@media (max-width: 620px)": "1" },
    gridRow: { default: "auto", "@media (max-width: 620px)": "3" },
  },
  status: {
    alignItems: "center",
    display: "flex",
    gap: 7,
    gridColumn: { default: "auto", "@media (max-width: 620px)": "2" },
    gridRow: { default: "auto", "@media (max-width: 620px)": "3" },
  },
  traceArrow: {
    gridColumn: { default: "auto", "@media (max-width: 620px)": "2" },
    gridRow: { default: "auto", "@media (max-width: 620px)": "1" },
  },
});
