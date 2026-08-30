import { ArrowUpRight01Icon, CodeIcon, Rocket01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { errorMessage, formatClockTime } from "../../data/format";
import { useDeploysQuery, useRuntimeQuery } from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { Icon } from "../../ui/icon";
import { ContentState, Page, PageHeader } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { StatusPill } from "../../ui/status";

export function DeploysPage() {
  const runtime = useRuntimeQuery();
  const deploys = useDeploysQuery(runtime.data?.projectId ?? null);
  const deploysUnavailable =
    (runtime.isError && !runtime.data) || (deploys.isError && !deploys.data);
  const failure = runtime.isError && !runtime.data ? runtime.error : deploys.error;
  const staleFailure =
    deploysUnavailable || !deploys.data ? null : (runtime.error ?? deploys.error);
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (deploys.isError) void deploys.refetch();
  };

  return (
    <Page>
      <PageHeader
        description="Inbound deploy events annotate panels for the affected service."
        title="Deploy events"
      />
      {!deploysUnavailable && !deploys.data && (runtime.isPending || deploys.isPending) ? (
        <ContentState kind="loading" title="Loading deploy events" />
      ) : null}
      {deploysUnavailable ? (
        <ContentState
          actions={
            <ConsoleFailureActions
              error={failure}
              notFound={{ href: "/connect", label: "Open connection setup" }}
              onRetry={retryFailedQueries}
              returnPath="/deploys"
            />
          }
          kind="error"
          title="Deploy events are unavailable"
        >
          {errorMessage(failure)}
        </ContentState>
      ) : null}
      <StaleDataNotice
        copy="Showing the last loaded deploy events."
        error={staleFailure}
        notFound={{ href: "/connect", label: "Open connection setup" }}
        onRetry={retryFailedQueries}
        retrying={runtime.isFetching || deploys.isFetching}
        returnPath="/deploys"
      />
      {deploys.data?.events.length === 0 ? (
        <ContentState
          actions={
            <Button render={<Link to="/connect" />} tone="secondary">
              Connect deploy events
            </Button>
          }
          title="No deploy events yet"
        >
          Connect your deployment webhook to correlate changes with telemetry.
        </ContentState>
      ) : null}
      {deploys.data && deploys.data.events.length > 0 ? (
        <section aria-label="Deploy history" {...stylex.props(styles.timeline)}>
          {deploys.data.events.map((deploy) => (
            <article key={deploy.id} {...stylex.props(styles.event)}>
              <time {...stylex.props(styles.time)}>{formatClockTime(deploy.deployedAt)}</time>
              <span {...stylex.props(styles.axis)}>
                <span {...stylex.props(styles.marker)}>
                  <Icon icon={Rocket01Icon} size={15} />
                </span>
              </span>
              <div {...stylex.props(styles.content)}>
                <div {...stylex.props(styles.eventHeader)}>
                  <span {...stylex.props(styles.service)}>{deploy.serviceName}</span>
                  <StatusPill tone="healthy">Recorded</StatusPill>
                </div>
                <p {...stylex.props(styles.description)}>
                  {deploy.description ?? "Deployment recorded"}
                </p>
                <div {...stylex.props(styles.meta)}>
                  <span>
                    <Icon icon={CodeIcon} size={14} /> <code>{deploy.sha.slice(0, 12)}</code>
                  </span>
                  {deploy.url ? (
                    <a
                      href={deploy.url}
                      rel="noreferrer"
                      target="_blank"
                      {...stylex.props(styles.openLink)}
                    >
                      Open deployment <Icon icon={ArrowUpRight01Icon} size={13} />
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {deploys.data.hasMore ? (
            <p {...stylex.props(styles.more)}>Showing the newest 50 deploy events.</p>
          ) : null}
        </section>
      ) : null}
    </Page>
  );
}

const styles = stylex.create({
  timeline: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    padding: space.x5,
  },
  event: {
    display: "grid",
    gridTemplateColumns: { default: "74px 42px 1fr", "@media (max-width: 480px)": "54px 34px 1fr" },
    minHeight: 132,
  },
  time: {
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    paddingTop: 9,
  },
  axis: {
    alignSelf: "stretch",
    borderLeftColor: colors.lineStrong,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    marginLeft: 16,
    position: "relative",
  },
  marker: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.amber,
    display: "flex",
    height: 32,
    justifyContent: "center",
    left: -16,
    position: "absolute",
    top: 0,
    width: 32,
  },
  content: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: space.x5,
  },
  eventHeader: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: space.x3 },
  service: { fontFamily: "IBM Plex Mono, monospace", fontSize: 13, fontWeight: 500 },
  description: { color: colors.text, fontSize: 13, marginBlock: 10 },
  meta: {
    alignItems: "center",
    color: colors.textSubtle,
    display: "flex",
    flexWrap: "wrap",
    fontSize: 11,
    gap: space.x4,
  },
  openLink: {
    alignItems: "center",
    color: { default: colors.textMuted, ":hover": colors.text },
    display: "flex",
    fontSize: 11,
    gap: 5,
    textDecoration: "none",
  },
  more: { color: colors.textSubtle, fontSize: 11, marginBottom: 0 },
});
