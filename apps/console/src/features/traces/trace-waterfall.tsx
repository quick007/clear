import type { SpanRecord, TraceTreeNode } from "@groundtruth/telemetry";
import * as stylex from "@stylexjs/stylex";

import { formatDuration, telemetryValueText } from "../../data/format";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { StatusDot } from "../../ui/status";
import { traceSpanGeometry } from "./trace-geometry";

type WaterfallRow = {
  depth: number;
  span: SpanRecord;
};

const flattenTraceTree = (
  nodes: ReadonlyArray<TraceTreeNode>,
  depth = 0,
): ReadonlyArray<WaterfallRow> =>
  nodes
    .toSorted((left, right) => Number(left.span.startTimeUnixNano - right.span.startTimeUnixNano))
    .flatMap((node) => [{ depth, span: node.span }, ...flattenTraceTree(node.children, depth + 1)]);

const attributeLabel = (span: SpanRecord, key: string) => {
  const value = span.attributes[key];
  return value === undefined ? null : telemetryValueText(value);
};

export function TraceWaterfall({
  durationMs,
  rootStart,
  roots,
}: {
  durationMs: number;
  rootStart: bigint;
  roots: ReadonlyArray<TraceTreeNode>;
}) {
  const rows = flattenTraceTree(roots);
  const totalNanos = Math.max(1, durationMs * 1_000_000);

  return (
    <section aria-label="Trace waterfall" {...stylex.props(styles.section)}>
      <header {...stylex.props(styles.sectionHeader)}>
        <div>
          <h2 {...stylex.props(styles.heading)}>Request path</h2>
          <p {...stylex.props(styles.sectionCopy)}>
            {rows.length} spans ordered by parent and start time
          </p>
        </div>
        <div aria-label="Span status legend" {...stylex.props(styles.legend)}>
          <span>
            <StatusDot tone="info" /> Completed
          </span>
          <span>
            <StatusDot tone="critical" /> Error
          </span>
        </div>
      </header>

      <div {...stylex.props(styles.table)}>
        <div {...stylex.props(styles.timelineHeader)}>
          <span>Service and operation</span>
          <span {...stylex.props(styles.scale)}>
            <span>0 ms</span>
            <span {...stylex.props(styles.middleTick)}>{formatDuration(durationMs / 2)}</span>
            <span>{formatDuration(durationMs)}</span>
          </span>
          <span {...stylex.props(styles.durationHeading)}>Duration</span>
        </div>

        {rows.map(({ depth, span }) => {
          const offset = Number(span.startTimeUnixNano - rootStart) / totalNanos;
          const width = Number(span.durationNanos) / totalNanos;
          const geometry = traceSpanGeometry(offset, width);
          const failed = span.status.code === "error";
          const attempt = attributeLabel(span, "attempt");
          const responseStatus = attributeLabel(span, "http.response.status_code");
          const retryDelay = attributeLabel(span, "retry.delay_ms");

          return (
            <article
              key={span.spanId}
              {...stylex.props(styles.spanRow, failed && styles.failedRow)}
            >
              <div
                {...stylex.props(styles.spanIdentity)}
                style={{ paddingLeft: Math.min(depth, 5) * 18 + 14 }}
              >
                <span {...stylex.props(styles.operation)}>
                  <StatusDot tone={failed ? "critical" : "info"} />
                  <span {...stylex.props(styles.operationName)}>{span.name}</span>
                </span>
                <span {...stylex.props(styles.spanMeta)}>
                  <code>{span.serviceName}</code>
                  <span>{span.kind}</span>
                  {attempt ? <span>attempt {attempt}</span> : null}
                  {responseStatus ? (
                    <span {...stylex.props(failed && styles.failedMeta)}>{responseStatus}</span>
                  ) : null}
                  {retryDelay && retryDelay !== "0" ? <span>waited {retryDelay} ms</span> : null}
                </span>
              </div>

              <div aria-hidden {...stylex.props(styles.track)}>
                <span
                  {...stylex.props(styles.bar, failed && styles.errorBar)}
                  style={{
                    left: `${geometry.x}%`,
                    width: `${Math.max(geometry.width, 0.5)}%`,
                  }}
                />
              </div>

              <code {...stylex.props(styles.duration)}>
                {formatDuration(Number(span.durationNanos) / 1_000_000)}
              </code>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const styles = stylex.create({
  section: { display: "grid", gap: space.x3 },
  sectionHeader: {
    alignItems: "end",
    display: "flex",
    gap: space.x4,
    justifyContent: "space-between",
  },
  heading: { fontSize: 16, fontWeight: 550, letterSpacing: "-0.01em", margin: 0 },
  sectionCopy: { color: colors.textSubtle, fontSize: 11, marginBlock: 4 },
  legend: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    fontSize: 11,
    gap: space.x4,
    paddingBottom: 4,
  },
  table: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  timelineHeader: {
    alignItems: "center",
    backgroundColor: colors.canvasRaised,
    color: colors.textSubtle,
    display: "grid",
    fontSize: 10,
    gap: space.x4,
    gridTemplateColumns: {
      default: "minmax(250px, 0.78fr) minmax(360px, 1.5fr) 68px",
      "@media (max-width: 760px)": "minmax(180px, 0.8fr) minmax(180px, 1fr) 58px",
    },
    minHeight: 38,
    paddingInline: space.x4,
  },
  scale: {
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    justifyContent: "space-between",
  },
  middleTick: { display: { default: "inline", "@media (max-width: 620px)": "none" } },
  durationHeading: { textAlign: "right" },
  spanRow: {
    alignItems: "stretch",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: {
      default: "minmax(250px, 0.78fr) minmax(360px, 1.5fr) 68px",
      "@media (max-width: 760px)": "minmax(180px, 0.8fr) minmax(180px, 1fr) 58px",
    },
    minHeight: 58,
    paddingInline: space.x4,
  },
  failedRow: { backgroundColor: "rgba(248, 113, 113, 0.035)" },
  spanIdentity: {
    alignSelf: "center",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    minWidth: 0,
    paddingBlock: 9,
  },
  operation: { alignItems: "center", display: "flex", gap: space.x2, minWidth: 0 },
  operationName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  spanMeta: {
    alignItems: "center",
    color: colors.textSubtle,
    display: "flex",
    fontSize: 9,
    gap: space.x2,
    overflow: "hidden",
    paddingLeft: 14,
    whiteSpace: "nowrap",
  },
  failedMeta: { color: colors.red },
  track: {
    alignSelf: "stretch",
    backgroundImage: `linear-gradient(to right, ${colors.line} 1px, transparent 1px)`,
    backgroundSize: "50% 100%",
    borderLeftColor: colors.line,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    borderRightColor: colors.line,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    minWidth: 0,
    position: "relative",
  },
  bar: {
    backgroundColor: colors.blue,
    borderRadius: 2,
    height: 8,
    minWidth: 3,
    position: "absolute",
    top: "calc(50% - 4px)",
  },
  errorBar: { backgroundColor: colors.red },
  duration: {
    alignSelf: "center",
    color: colors.textMuted,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    textAlign: "right",
  },
});
