import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import type { TelemetryWindow } from "@groundtruth/telemetry";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { attributesText, errorMessage, formatUnixNanoTime, logBodyText } from "../../data/format";
import { uniquePageItems } from "../../data/pagination";
import { useLogsQuery, useRuntimeQuery } from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { Icon } from "../../ui/icon";
import { ContentState, Page, PageHeader, SearchField, Toolbar } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";

export function LogsPage({
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
  const routeSearch = useSearch({ from: "/explore" });
  const navigate = useNavigate({ from: "/explore" });
  const query = routeSearch.query ?? "";
  const runtime = useRuntimeQuery();
  const logs = useLogsQuery(runtime.data?.projectId ?? null, query.trim(), window, service);
  const records = logs.data
    ? uniquePageItems(
        logs.data.pages,
        (page) => page.records,
        (log) =>
          [
            String(log.timeUnixNano),
            String(log.observedTimeUnixNano),
            log.traceId,
            log.spanId,
            log.serviceName,
            log.severity,
            logBodyText(log.body),
          ].join(":"),
      )
    : [];
  const logsUnavailable = (runtime.isError && !runtime.data) || (logs.isError && !logs.data);
  const failure = runtime.isError && !runtime.data ? runtime.error : logs.error;
  const returnPath = `/explore?signal=logs&window=${window}${service ? `&service=${encodeURIComponent(service)}` : ""}${query ? `&query=${encodeURIComponent(query)}` : ""}`;
  const staleFailure =
    logsUnavailable || !logs.data ? null : (runtime.error ?? logs.error ?? contextFailure);
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (logs.isFetchNextPageError) void logs.fetchNextPage();
    else if (logs.isError) void logs.refetch();
    if (contextFailure !== null && contextFailure !== undefined) onRetryContext?.();
  };

  return (
    <Page>
      <PageHeader
        description="Structured events correlated with services and traces."
        title="Logs"
      />
      <Toolbar>
        <SearchField
          label="Search logs"
          onChange={(nextQuery) =>
            void navigate({
              replace: true,
              search: (current) => ({ ...current, query: nextQuery || undefined }),
            })
          }
          placeholder="Search message or attribute"
          value={query}
        />
      </Toolbar>

      {!logsUnavailable && !logs.data && (runtime.isPending || logs.isPending) ? (
        <ContentState kind="loading" title="Loading logs" />
      ) : null}
      {logsUnavailable ? (
        <ContentState
          actions={
            <ConsoleFailureActions
              error={failure}
              invalidRequest={{
                href: "/explore?signal=logs&window=1h",
                label: "Clear filters",
              }}
              notFound={{ href: "/connect", label: "Open connection setup" }}
              onRetry={retryFailedQueries}
              returnPath={returnPath}
            />
          }
          kind="error"
          title="Logs are unavailable"
        >
          {errorMessage(failure)}
        </ContentState>
      ) : null}
      <StaleDataNotice
        copy={
          logs.isFetchNextPageError
            ? "Older logs could not be loaded. The events shown are still available."
            : "Some log data or service context may be out of date."
        }
        error={staleFailure}
        invalidRequest={{ href: "/explore?signal=logs&window=1h", label: "Clear filters" }}
        notFound={{ href: "/connect", label: "Open connection setup" }}
        onRetry={retryFailedQueries}
        retrying={runtime.isFetching || logs.isFetching || contextRetrying}
        returnPath={returnPath}
      />
      {logs.data && records.length === 0 ? (
        <ContentState
          actions={
            query ? undefined : (
              <Button render={<Link to="/connect" />} tone="secondary">
                Connect telemetry
              </Button>
            )
          }
          title="No logs found"
        >
          {query ? "Try a broader search." : "Send OTLP logs to this project to see them here."}
        </ContentState>
      ) : null}
      {logs.data && records.length > 0 ? (
        <section
          aria-busy={logs.isFetchingNextPage}
          aria-label="Log results"
          {...stylex.props(styles.stream)}
        >
          <div {...stylex.props(styles.resultMeta)}>
            <span>{records.length} events loaded</span>
            <span>Newest first</span>
          </div>
          {records.map((log, index) => (
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
                  search={{ query: query || undefined, service, source: "logs", window }}
                  to="/traces/$traceId"
                  {...stylex.props(styles.traceLink)}
                >
                  <Icon icon={LinkSquare02Icon} size={14} />
                  <span {...stylex.props(styles.traceId)}>{log.traceId.slice(0, 8)}</span>
                </Link>
              ) : null}
            </article>
          ))}
          {logs.hasNextPage ? (
            <div aria-live="polite" {...stylex.props(styles.pagination)}>
              <Button
                aria-label={
                  logs.isFetchingNextPage
                    ? "Loading older logs"
                    : logs.isFetchNextPageError
                      ? "Try loading older logs again"
                      : "Load older logs"
                }
                disabled={logs.isFetchingNextPage}
                onClick={() => void logs.fetchNextPage()}
                tone="secondary"
              >
                {logs.isFetchingNextPage
                  ? "Loading older"
                  : logs.isFetchNextPageError
                    ? "Try again"
                    : "Load older"}
              </Button>
            </div>
          ) : null}
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
  pagination: {
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    justifyContent: "center",
    padding: space.x4,
  },
});
