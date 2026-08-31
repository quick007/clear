import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { errorMessage, formatRelativeTime } from "../../data/format";
import { useIncidentsQuery, useRuntimeQuery } from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { ContentState, Page, PageHeader } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { StatusPill } from "../../ui/status";

export function IncidentsPage() {
  const runtime = useRuntimeQuery();
  const incidents = useIncidentsQuery(runtime.data?.projectId ?? null);
  const incidentsUnavailable =
    (runtime.isError && !runtime.data) || (incidents.isError && !incidents.data);
  const failure = runtime.isError && !runtime.data ? runtime.error : incidents.error;
  const staleFailure =
    incidentsUnavailable || !incidents.data ? null : (runtime.error ?? incidents.error);
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (incidents.isError) void incidents.refetch();
  };

  return (
    <Page>
      <PageHeader
        description="Investigations preserve the evidence, decisions, and deploys behind an incident."
        title="Incidents"
      />
      {!incidentsUnavailable && !incidents.data && (runtime.isPending || incidents.isPending) ? (
        <ContentState kind="loading" title="Loading incidents" />
      ) : null}
      {incidentsUnavailable ? (
        <ContentState
          actions={
            <ConsoleFailureActions
              error={failure}
              notFound={{ href: "/connect", label: "Open connection setup" }}
              onRetry={retryFailedQueries}
              returnPath="/incidents"
            />
          }
          kind="error"
          title="Incidents are unavailable"
        >
          {errorMessage(failure)}
        </ContentState>
      ) : null}
      <StaleDataNotice
        copy="Showing the last loaded incidents."
        error={staleFailure}
        notFound={{ href: "/connect", label: "Open connection setup" }}
        onRetry={retryFailedQueries}
        retrying={runtime.isFetching || incidents.isFetching}
        returnPath="/incidents"
      />
      {incidents.data?.items.length === 0 ? (
        <ContentState title="No investigations yet">
          Start an investigation from an alert when something needs a shared record.
        </ContentState>
      ) : null}
      {incidents.data && incidents.data.items.length > 0 ? (
        <section aria-label="Incident history" {...stylex.props(styles.list)}>
          {incidents.data.items.map((incident) => (
            <Link
              key={incident.id}
              params={{ incidentId: incident.id }}
              to="/incidents/$incidentId"
              {...stylex.props(styles.row)}
            >
              <div {...stylex.props(styles.identity)}>
                <StatusPill tone={incident.status === "open" ? "critical" : "healthy"}>
                  {incident.status}
                </StatusPill>
                <span {...stylex.props(styles.incidentCopy)}>
                  <strong {...stylex.props(styles.incidentTitle)}>{incident.title}</strong>
                  {incident.summary ? (
                    <small {...stylex.props(styles.incidentSummary)}>{incident.summary}</small>
                  ) : null}
                </span>
              </div>
              <span {...stylex.props(styles.time)}>
                {incident.status === "open" ? "Opened" : "Closed"}{" "}
                {formatRelativeTime(incident.closedAt ?? incident.openedAt)}
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </Page>
  );
}

const styles = stylex.create({
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: { default: "center", "@media (max-width: 620px)": "flex-start" },
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    color: colors.text,
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: space.x5,
    justifyContent: "space-between",
    minHeight: 72,
    padding: space.x4,
    textDecoration: "none",
    ":hover": { backgroundColor: colors.whiteWash },
  },
  identity: {
    alignItems: "center",
    display: "flex",
    gap: space.x3,
    minWidth: 0,
  },
  incidentCopy: { display: "grid", gap: 4, minWidth: 0 },
  incidentTitle: {
    fontSize: 13,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  incidentSummary: {
    color: colors.textSubtle,
    fontSize: 10,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  time: {
    color: colors.textSubtle,
    flexShrink: 0,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    paddingLeft: { default: 0, "@media (max-width: 620px)": 70 },
  },
});
