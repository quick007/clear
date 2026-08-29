import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import type { TelemetryWindow } from "@groundtruth/telemetry";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { attributesText, errorMessage, formatUnixNanoTime, logBodyText } from "../../data/format";
import { useLogsQuery, useRuntimeQuery } from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Icon } from "../../ui/icon";
import { Button } from "../../ui/button";
import { ContentState, Page, PageHeader, RetryButton, SearchField, Toolbar } from "../../ui/page";

export function LogsPage({ service, window }: { service?: string; window: TelemetryWindow }) {
  const [search, setSearch] = useState("");
  const runtime = useRuntimeQuery();
  const logs = useLogsQuery(runtime.data?.projectId ?? null, search.trim(), window, service);

  return (
    <Page>
      <PageHeader
        description="Structured events correlated with services and traces."
        title="Logs"
      />
      <Toolbar>
        <SearchField
          label="Search logs"
          onChange={setSearch}
          placeholder="Search message or attribute"
          value={search}
        />
      </Toolbar>

      {!runtime.isError && !logs.isError && (runtime.isPending || logs.isPending) ? (
        <ContentState kind="loading" title="Loading logs" />
      ) : null}
      {runtime.isError || logs.isError ? (
        <ContentState
          actions={
            <RetryButton
              onRetry={() => {
                void runtime.refetch();
                void logs.refetch();
              }}
            />
          }
          kind="error"
          title="Logs are unavailable"
        >
          {errorMessage(runtime.error ?? logs.error)}
        </ContentState>
      ) : null}
      {logs.data && logs.data.records.length === 0 ? (
        <ContentState
          actions={
            search ? undefined : (
              <Button render={<Link to="/connect" />} tone="secondary">
                Connect telemetry
              </Button>
            )
          }
          title="No logs found"
        >
          {search ? "Try a broader search." : "Send OTLP logs to this project to see them here."}
        </ContentState>
      ) : null}
      {logs.data && logs.data.records.length > 0 ? (
        <section aria-label="Log results" {...stylex.props(styles.stream)}>
          <div {...stylex.props(styles.resultMeta)}>
            <span>{logs.data.records.length} events</span>
            <span>{logs.data.hasMore ? "Showing newest 50" : "Newest first"}</span>
          </div>
          {logs.data.records.map((log, index) => (
            <article
              key={`${String(log.timeUnixNano)}-${log.spanId ?? index}`}
              {...stylex.props(styles.row)}
            >
              <time {...stylex.props(styles.time)}>{formatUnixNanoTime(log.timeUnixNano)}</time>
              <span {...stylex.props(styles.level, levelStyle(log.severity))}>{log.severity}</span>
              <code {...stylex.props(styles.service)}>{log.serviceName}</code>
              <div {...stylex.props(styles.message)}>
                <span>{logBodyText(log.body)}</span>
                {attributesText(log.attributes) ? (
                  <code {...stylex.props(styles.attributes)}>{attributesText(log.attributes)}</code>
                ) : null}
              </div>
              {log.traceId ? (
                <Link
                  aria-label={`Open trace ${log.traceId}`}
                  params={{ traceId: log.traceId }}
                  to="/traces/$traceId"
                  {...stylex.props(styles.traceLink)}
                >
                  <Icon icon={LinkSquare02Icon} size={14} />
                  <span {...stylex.props(styles.traceId)}>{log.traceId.slice(0, 8)}</span>
                </Link>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
    </Page>
  );
}

const levelStyles = stylex.create({
  error: { backgroundColor: colors.redWash, color: colors.red },
  warn: { backgroundColor: colors.amberWash, color: colors.amber },
  info: { backgroundColor: colors.blueWash, color: colors.blue },
  neutral: { backgroundColor: colors.whiteWash, color: colors.textMuted },
});

const levelStyle = (level: string) => {
  if (level === "error" || level === "fatal") return levelStyles.error;
  if (level === "warn") return levelStyles.warn;
  if (level === "info") return levelStyles.info;
  return levelStyles.neutral;
};

const styles = stylex.create({
  stream: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  resultMeta: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: colors.textSubtle,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    justifyContent: "space-between",
    paddingBlock: 10,
    paddingInline: space.x4,
  },
  row: {
    alignItems: "start",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: {
      default: "98px 52px 120px minmax(280px, 1fr) 84px",
      "@media (max-width: 860px)": "82px 46px minmax(220px, 1fr) 74px",
      "@media (max-width: 620px)": "64px 42px minmax(0, 1fr) 36px",
    },
    minHeight: 72,
    paddingBlock: 14,
    paddingInline: space.x4,
    ":hover": { backgroundColor: colors.whiteWash },
  },
  time: {
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    gridColumn: { default: "auto", "@media (max-width: 620px)": "1" },
  },
  level: {
    borderRadius: radii.sm,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    gridColumn: { default: "auto", "@media (max-width: 620px)": "2" },
    paddingBlock: 3,
    textAlign: "center",
  },
  service: {
    color: colors.textMuted,
    display: {
      default: "block",
      "@media (max-width: 860px)": "none",
      "@media (max-width: 620px)": "block",
    },
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    gridColumn: { default: "auto", "@media (max-width: 620px)": "3" },
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  message: {
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    fontSize: 13,
    gap: 6,
    gridColumn: { default: "auto", "@media (max-width: 620px)": "1 / -1" },
    minWidth: 0,
  },
  attributes: {
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    overflowWrap: "anywhere",
  },
  traceLink: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    gap: 5,
    gridColumn: { default: "auto", "@media (max-width: 620px)": "4" },
    gridRow: { default: "auto", "@media (max-width: 620px)": "1" },
    justifyContent: { default: "start", "@media (max-width: 620px)": "center" },
    textDecoration: "none",
    ":hover": { color: colors.blue },
  },
  traceId: { display: { default: "inline", "@media (max-width: 620px)": "none" } },
});
