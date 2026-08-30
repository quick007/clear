import { ArrowUpRight01Icon, CodeIcon, Rocket01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { useSearch } from "@tanstack/react-router";

import { useDeploysQuery } from "../../data/deploy-queries";
import { errorMessage, formatClockTime, formatRelativeTime } from "../../data/format";
import { uniquePageItems } from "../../data/pagination";
import { useOverviewQuery, useRuntimeQuery } from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { Icon } from "../../ui/icon";
import { ContentState, Page, PageHeader } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { StatusPill } from "../../ui/status";
import { ChangesNavigation } from "../explore/explore-navigation";

export function DeploysPage() {
  const search = useSearch({ from: "/deploys" });
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const overview = useOverviewQuery(projectId);
  const deploys = useDeploysQuery(projectId, search.service, search.window);
  const events = deploys.data
    ? uniquePageItems(
        deploys.data.pages,
        (page) => page.events,
        (event) => event.id,
      )
    : [];
  const deploysUnavailable =
    (runtime.isError && !runtime.data) || (deploys.isError && !deploys.data);
  const failure = runtime.isError && !runtime.data ? runtime.error : deploys.error;
  const staleFailure =
    deploysUnavailable || !deploys.data ? null : (runtime.error ?? deploys.error ?? overview.error);
  const returnPath = `/deploys?window=${search.window}${search.service ? `&service=${encodeURIComponent(search.service)}` : ""}`;
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (deploys.isFetchNextPageError) void deploys.fetchNextPage();
    else if (deploys.isError) void deploys.refetch();
    if (overview.isError) void overview.refetch();
  };

  return (
    <>
      <ChangesNavigation services={overview.data?.services ?? []} />
      <Page>
        <PageHeader
          description="Correlate deploys with telemetry from the same service and time window."
          title="Deploys"
        />
        {!deploysUnavailable && !deploys.data && (runtime.isPending || deploys.isPending) ? (
          <ContentState kind="loading" title="Loading deploys" />
        ) : null}
        {deploysUnavailable ? (
          <ContentState
            actions={
              <ConsoleFailureActions
                error={failure}
                notFound={{ href: "/connect", label: "Open connection setup" }}
                onRetry={retryFailedQueries}
                returnPath={returnPath}
              />
            }
            kind="error"
            title="Deploys are unavailable"
          >
            {errorMessage(failure)}
          </ContentState>
        ) : null}
        <StaleDataNotice
          copy={
            deploys.isFetchNextPageError
              ? "Older deploys could not be loaded. The changes shown are still available."
              : "Some deploy data or service context may be out of date."
          }
          error={staleFailure}
          notFound={{ href: "/connect", label: "Open connection setup" }}
          onRetry={retryFailedQueries}
          retrying={runtime.isFetching || deploys.isFetching || overview.isFetching}
          returnPath={returnPath}
        />
        {deploys.data && events.length === 0 ? (
          <ContentState
            actions={
              search.service ? undefined : (
                <Button render={<a href="/connect#deploy-events" />} tone="primary">
                  Configure deploy events
                </Button>
              )
            }
            title="No deploys in this window"
          >
            {search.service
              ? `No deploys were recorded for ${search.service}. Try another service or time range.`
              : "Add Clear's deploy-event webhook to your deployment pipeline to correlate code changes with telemetry."}
          </ContentState>
        ) : null}
        {deploys.data && events.length > 0 ? (
          <section
            aria-busy={deploys.isFetchingNextPage}
            aria-label="Deploy history"
            {...stylex.props(styles.timeline)}
          >
            {events.map((deploy) => (
              <article key={deploy.id} {...stylex.props(styles.event)}>
                <time title={formatClockTime(deploy.deployedAt)} {...stylex.props(styles.time)}>
                  {formatRelativeTime(deploy.deployedAt)}
                </time>
                <span {...stylex.props(styles.axis)}>
                  <span {...stylex.props(styles.marker)}>
                    <Icon icon={Rocket01Icon} size={15} />
                  </span>
                </span>
                <div {...stylex.props(styles.content)}>
                  <div {...stylex.props(styles.eventHeader)}>
                    <span {...stylex.props(styles.service)}>{deploy.serviceName}</span>
                    <StatusPill tone="healthy">Deployed</StatusPill>
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
            {deploys.hasNextPage ? (
              <div aria-live="polite" {...stylex.props(styles.pagination)}>
                <Button
                  aria-label={
                    deploys.isFetchingNextPage
                      ? "Loading older deploys"
                      : deploys.isFetchNextPageError
                        ? "Try loading older deploys again"
                        : "Load older deploys"
                  }
                  disabled={deploys.isFetchingNextPage}
                  onClick={() => void deploys.fetchNextPage()}
                  tone="secondary"
                >
                  {deploys.isFetchingNextPage
                    ? "Loading older"
                    : deploys.isFetchNextPageError
                      ? "Try again"
                      : "Load older"}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </Page>
    </>
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
    whiteSpace: "nowrap",
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
  pagination: { display: "flex", justifyContent: "center", paddingTop: space.x4 },
});
