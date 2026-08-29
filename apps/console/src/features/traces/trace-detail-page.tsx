import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link, useParams } from "@tanstack/react-router";

import {
  attributesText,
  errorMessage,
  formatDuration,
  formatUnixNanoTime,
} from "../../data/format";
import { useRuntimeQuery, useTraceQuery } from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { CopyButton } from "../../ui/copy-button";
import { Icon } from "../../ui/icon";
import { ContentState, Page, PageHeader, RetryButton } from "../../ui/page";
import { StatusPill } from "../../ui/status";
import { traceSpanGeometry } from "./trace-geometry";

export function TraceDetailPage() {
  const { traceId } = useParams({ from: "/traces/$traceId" });
  const runtime = useRuntimeQuery();
  const trace = useTraceQuery(runtime.data?.projectId ?? null, traceId);
  const validTraceId = /^(?!0{32}$)[0-9a-f]{32}$/.test(traceId);

  if (!validTraceId) {
    return (
      <Page>
        <BackLink />
        <ContentState title="Invalid trace ID">
          Trace IDs contain 32 lowercase hexadecimal characters.
        </ContentState>
      </Page>
    );
  }
  if (!runtime.isError && !trace.isError && (runtime.isPending || trace.isPending)) {
    return (
      <Page>
        <BackLink />
        <ContentState kind="loading" title="Loading trace" />
      </Page>
    );
  }
  if (runtime.isError || trace.isError || !trace.data) {
    return (
      <Page>
        <BackLink />
        <ContentState
          actions={
            <RetryButton
              onRetry={() => {
                void runtime.refetch();
                void trace.refetch();
              }}
            />
          }
          kind="error"
          title="Trace is unavailable"
        >
          {errorMessage(runtime.error ?? trace.error)}
        </ContentState>
      </Page>
    );
  }

  const detail = trace.data;
  const retryCount = detail.spans.filter((span) => /attempt[= ]\d/i.test(span.name)).length;
  const rootStart = detail.summary.startTimeUnixNano;
  const totalNanos = Math.max(1, Number(detail.summary.durationMs * 1_000_000));
  const user = detail.spans
    .map((span) => span.attributes["user.id"])
    .find((value) => typeof value === "string");

  return (
    <Page>
      <BackLink />
      <PageHeader
        actions={<CopyButton compact={false} label="Copy link" value={window.location.href} />}
        description={`Trace ${traceId} · started ${formatUnixNanoTime(rootStart)} · ${detail.summary.spanCount} spans across ${detail.summary.services.length} services`}
        title={detail.summary.rootSpanName}
      />

      <section {...stylex.props(styles.summary)}>
        <Summary label="Duration" value={formatDuration(detail.summary.durationMs)} />
        <div>
          <span {...stylex.props(styles.summaryLabel)}>Status</span>
          <StatusPill tone={detail.summary.status === "error" ? "critical" : "healthy"}>
            {detail.summary.status}
          </StatusPill>
        </div>
        <Summary label="Retry attempts" value={String(retryCount)} />
        <Summary label="User" value={typeof user === "string" ? user : "Not recorded"} />
      </section>

      <section aria-label="Trace waterfall" {...stylex.props(styles.waterfall)}>
        <header {...stylex.props(styles.waterfallHeader)}>
          <h2>Span waterfall</h2>
          <span>0 ms</span>
          <span {...stylex.props(styles.middleTick)}>
            {formatDuration(detail.summary.durationMs / 2)}
          </span>
          <span>{formatDuration(detail.summary.durationMs)}</span>
        </header>
        {detail.spans.map((span) => {
          const offset = Number(span.startTimeUnixNano - rootStart) / totalNanos;
          const width = Number(span.durationNanos) / totalNanos;
          const geometry = traceSpanGeometry(offset, width);
          return (
            <article key={span.spanId} {...stylex.props(styles.spanRow)}>
              <div {...stylex.props(styles.spanCopy)}>
                <code>{span.serviceName}</code>
                <span>{span.name}</span>
                {attributesText(span.attributes) ? (
                  <small>{attributesText(span.attributes)}</small>
                ) : null}
              </div>
              <svg
                aria-hidden
                preserveAspectRatio="none"
                viewBox="0 0 100 18"
                {...stylex.props(styles.track)}
              >
                <rect
                  height="18"
                  rx="3"
                  width={geometry.width}
                  x={geometry.x}
                  y="0"
                  {...stylex.props(styles.bar, span.status.code === "error" && styles.errorBar)}
                />
              </svg>
              <code {...stylex.props(styles.duration)}>
                {formatDuration(Number(span.durationNanos) / 1_000_000)}
              </code>
            </article>
          );
        })}
      </section>
    </Page>
  );
}

function BackLink() {
  return (
    <Link to="/traces" {...stylex.props(styles.back)}>
      <Icon icon={ArrowLeft01Icon} size={15} /> Back to traces
    </Link>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
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
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: {
      default: "repeat(4, minmax(0, 1fr))",
      "@media (max-width: 480px)": "repeat(2, minmax(0, 1fr))",
    },
    marginBottom: space.x4,
    padding: space.x4,
  },
  summaryLabel: { color: colors.textSubtle, display: "block", fontSize: 11, marginBottom: 7 },
  summaryValue: { fontFamily: "IBM Plex Mono, monospace", fontSize: 14, fontWeight: 500 },
  waterfall: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  waterfallHeader: {
    alignItems: "center",
    color: colors.textSubtle,
    display: "grid",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    gap: { default: 0, "@media (max-width: 620px)": space.x4 },
    gridTemplateColumns: {
      default: "260px 1fr 1fr 1fr 80px",
      "@media (max-width: 620px)": "minmax(0, 1fr) auto auto",
    },
    minHeight: 46,
    paddingInline: space.x4,
  },
  spanRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: {
      default: "240px minmax(280px, 1fr) 72px",
      "@media (max-width: 620px)": "minmax(0, 1fr) 92px 54px",
    },
    minHeight: 70,
    paddingInline: space.x4,
  },
  spanCopy: {
    display: "flex",
    flexDirection: "column",
    fontSize: 12,
    gap: 4,
    lineHeight: 1.35,
    minWidth: 0,
  },
  track: {
    backgroundColor: colors.canvas,
    borderRadius: 4,
    display: "block",
    height: 18,
    overflow: "hidden",
    width: "100%",
  },
  bar: { fill: colors.blue },
  errorBar: { fill: colors.orange },
  duration: { color: colors.textMuted, fontFamily: "IBM Plex Mono, monospace", fontSize: 11 },
  middleTick: { display: { default: "inline", "@media (max-width: 620px)": "none" } },
});
