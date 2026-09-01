import {
  Alert02Icon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Rocket01Icon,
  Search02Icon,
} from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link, useParams, useSearch } from "@tanstack/react-router";

import {
  errorMessage,
  formatDuration,
  formatUnixNanoTime,
  telemetryValueText,
} from "../../data/format";
import { useRuntimeQuery, useTraceQuery } from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { CopyButton } from "../../ui/copy-button";
import { Icon } from "../../ui/icon";
import { ContentState, Page, PageHeader } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { retryAttemptCount } from "./trace-insights";
import {
  traceContextPath,
  traceExplorerSearch,
  type TraceNavigationContext,
} from "./trace-navigation";
import { TraceWaterfall } from "./trace-waterfall";

export function TraceDetailPage() {
  const { traceId } = useParams({ from: "/traces/$traceId" });
  const traceContext = useSearch({ from: "/traces/$traceId" });
  const runtime = useRuntimeQuery();
  const trace = useTraceQuery(runtime.data?.projectId ?? null, traceId);
  const validTraceId = /^(?!0{32}$)[0-9a-f]{32}$/.test(traceId);
  const traceLoading = (runtime.isPending && !runtime.data) || (trace.isPending && !trace.data);
  const traceUnavailable = !runtime.data || !trace.data;
  const failure = runtime.isError && !runtime.data ? runtime.error : trace.error;
  const staleFailure = traceUnavailable ? null : (runtime.error ?? trace.error);
  const sourceLabel = traceContext.source === "logs" ? "logs" : "traces";
  const sourcePath = traceContextPath("/explore", traceContext, true);
  const detailReturnPath = traceContextPath(`/traces/${encodeURIComponent(traceId)}`, traceContext);
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (trace.isError) void trace.refetch();
  };

  if (!validTraceId) {
    return (
      <Page>
        <BackLink context={traceContext} />
        <ContentState title="Invalid trace ID">
          Trace IDs contain 32 lowercase hexadecimal characters.
        </ContentState>
      </Page>
    );
  }
  if (traceLoading) {
    return (
      <Page>
        <BackLink context={traceContext} />
        <ContentState kind="loading" title="Loading trace" />
      </Page>
    );
  }
  if (traceUnavailable) {
    return (
      <Page>
        <BackLink context={traceContext} />
        <ContentState
          actions={
            <ConsoleFailureActions
              error={failure}
              notFound={{
                href: sourcePath,
                label: `Back to ${sourceLabel}`,
              }}
              onRetry={retryFailedQueries}
              returnPath={detailReturnPath}
            />
          }
          kind="error"
          title="Trace is unavailable"
        >
          {errorMessage(failure)}
        </ContentState>
      </Page>
    );
  }

  const detail = trace.data;
  const retryCount = retryAttemptCount(detail.spans);
  const rootStart = detail.summary.startTimeUnixNano;
  const user = detail.spans
    .map((span) => span.attributes["user.id"])
    .find((value) => typeof value === "string");
  const firstServerError = detail.spans.find(
    (span) => span.kind === "server" && span.status.code === "error",
  );
  const rootSpan = detail.roots[0]?.span ?? detail.spans[0];
  const rootResponse = rootSpan?.attributes["http.response.status_code"];
  const rootResponseText =
    rootResponse === undefined ? "Not recorded" : telemetryValueText(rootResponse);
  const reportedStatus = firstServerError?.attributes["http.response.status_code"];
  const statusText = reportedStatus === undefined ? null : telemetryValueText(reportedStatus);
  const containsErrors = detail.summary.errorSpanCount > 0;
  const rootFailed = rootSpan?.status.code === "error";
  const diagnosisTitle = rootFailed
    ? retryCount > 0
      ? `Request failed on attempt ${retryCount + 1}`
      : "Request failed"
    : containsErrors && retryCount > 0
      ? `Request succeeded on attempt ${retryCount + 1}`
      : containsErrors
        ? "Completed with span errors"
        : "Request completed";
  const diagnosisCopy = containsErrors
    ? `${firstServerError?.serviceName ?? "A downstream service"} reported${statusText ? ` ${statusText}` : " an error"}. ${detail.summary.errorSpanCount} of ${detail.summary.spanCount} spans were marked as errors.`
    : `${detail.summary.spanCount} spans completed across ${detail.summary.services.length} services without a recorded error.`;

  return (
    <Page>
      <BackLink context={traceContext} />
      <StaleDataNotice
        copy="Showing the last loaded trace."
        error={staleFailure}
        notFound={{
          href: sourcePath,
          label: `Back to ${sourceLabel}`,
        }}
        onRetry={retryFailedQueries}
        retrying={runtime.isFetching || trace.isFetching}
        returnPath={detailReturnPath}
      />
      <PageHeader
        actions={
          <>
            {detail.correlatedLogs.length > 0 ? (
              <Button
                compact
                render={
                  <Link
                    search={{
                      metric: undefined,
                      query: undefined,
                      service: undefined,
                      signal: "logs",
                      trace: traceId,
                      window: traceContext.window,
                    }}
                    to="/explore"
                  />
                }
                tone="secondary"
              >
                <Icon icon={Search02Icon} size={15} /> Correlated logs (
                {detail.correlatedLogs.length})
              </Button>
            ) : null}
            <Button
              compact
              render={
                <Link
                  search={{
                    service: String(detail.summary.rootServiceName),
                    window: traceContext.window,
                  }}
                  to="/deploys"
                />
              }
              tone="ghost"
            >
              <Icon icon={Rocket01Icon} size={15} /> Nearby deploys
            </Button>
            <CopyButton label="Copy trace ID" value={traceId} />
          </>
        }
        description={`Started ${formatUnixNanoTime(rootStart)} · ${detail.summary.spanCount} spans · ${detail.summary.services.length} services${typeof user === "string" ? ` · ${user}` : ""}`}
        title={detail.summary.rootSpanName}
      />

      <section {...stylex.props(styles.overview, containsErrors && styles.failedOverview)}>
        <div {...stylex.props(styles.diagnosis)}>
          <span
            {...stylex.props(styles.diagnosisIcon, containsErrors && styles.failedDiagnosisIcon)}
          >
            <Icon icon={containsErrors ? Alert02Icon : CheckmarkCircle02Icon} size={18} />
          </span>
          <div>
            <h2 {...stylex.props(styles.diagnosisTitle)}>{diagnosisTitle}</h2>
            <p {...stylex.props(styles.diagnosisCopy)}>{diagnosisCopy}</p>
          </div>
        </div>
        <div {...stylex.props(styles.metrics)}>
          <Summary label="Duration" value={formatDuration(detail.summary.durationMs)} />
          <Summary label="Attempts" value={`${retryCount + 1} total`} />
          <Summary label="Root response" value={rootResponseText} />
          <Summary label="Related logs" value={String(detail.correlatedLogs.length)} />
        </div>
      </section>

      <TraceWaterfall
        durationMs={detail.summary.durationMs}
        rootStart={rootStart}
        roots={detail.roots}
      />
    </Page>
  );
}

function BackLink({ context }: { context: TraceNavigationContext }) {
  return (
    <Link search={traceExplorerSearch(context)} to="/explore" {...stylex.props(styles.back)}>
      <Icon icon={ArrowLeft01Icon} size={15} /> Back to {context.source}
    </Link>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div {...stylex.props(styles.summaryItem)}>
      <span {...stylex.props(styles.summaryLabel)}>{label}</span>
      <strong {...stylex.props(styles.summaryValue)}>{value}</strong>
    </div>
  );
}

const styles = stylex.create({
  back: {
    alignItems: "center",
    color: colors.textMuted,
    display: "inline-flex",
    fontSize: 12,
    gap: 6,
    marginBottom: space.x4,
    textDecoration: "none",
    ":hover": { color: colors.text },
  },
  overview: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: space.x6,
    gridTemplateColumns: {
      default: "minmax(320px, 1.35fr) minmax(440px, 1fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    marginBottom: space.x6,
    padding: space.x5,
  },
  failedOverview: {
    backgroundColor: "rgba(248, 113, 113, 0.025)",
    borderColor: "rgba(248, 113, 113, 0.18)",
  },
  diagnosis: { alignItems: "flex-start", display: "flex", gap: space.x3, minWidth: 0 },
  diagnosisIcon: {
    alignItems: "center",
    backgroundColor: colors.greenWash,
    borderRadius: radii.sm,
    color: colors.green,
    display: "inline-flex",
    flex: "0 0 auto",
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  failedDiagnosisIcon: { backgroundColor: colors.redWash, color: colors.red },
  diagnosisTitle: {
    fontSize: 15,
    fontWeight: 550,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  diagnosisCopy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.5,
    marginBlock: 5,
    maxWidth: 620,
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  },
  summaryItem: {
    borderLeftColor: colors.line,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    minWidth: 0,
    paddingInline: space.x3,
  },
  summaryLabel: { color: colors.textSubtle, display: "block", fontSize: 10 },
  summaryValue: {
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 12,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
