import { CloseIncidentRequest } from "@groundtruth/api-contract";
import { IncidentId, NonEmptyText } from "@groundtruth/domain";
import { ArrowLeft02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import { Link, useParams } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import {
  epochMilliseconds,
  errorMessage,
  formatRelativeTime,
  formatShortTime,
} from "../../data/format";
import { useCloseIncident, useIncidentQuery, useRuntimeQuery } from "../../data/queries";
import { mutationOutcomeIsUnknown } from "../../errors";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { Icon } from "../../ui/icon";
import { MutationFailureNotice } from "../../ui/mutation-failure-notice";
import { ContentState, Page } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { StatusPill } from "../../ui/status";
import { HypothesisList } from "../../app/situation-strip";

export function IncidentDetailPage() {
  const { incidentId } = useParams({ from: "/incidents/$incidentId" });
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const incident = useIncidentQuery(projectId, incidentId);
  const incidentLoading =
    (runtime.isPending && !runtime.data) || (incident.isPending && !incident.data);
  const incidentUnavailable = !runtime.data || !projectId || !incident.data;
  const failure = runtime.isError && !runtime.data ? runtime.error : incident.error;
  const staleFailure = incidentUnavailable ? null : (runtime.error ?? incident.error);
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (incident.isError) void incident.refetch();
  };

  if (incidentLoading) {
    return (
      <Page>
        <ContentState kind="loading" title="Loading investigation" />
      </Page>
    );
  }
  if (incidentUnavailable) {
    return (
      <Page>
        <ContentState
          actions={
            <ConsoleFailureActions
              error={failure}
              notFound={{ href: "/incidents", label: "Back to incidents" }}
              onRetry={retryFailedQueries}
              returnPath={`/incidents/${encodeURIComponent(incidentId)}`}
            />
          }
          kind="error"
          title="The investigation is unavailable"
        >
          {errorMessage(failure)}
        </ContentState>
      </Page>
    );
  }

  const detail = incident.data;
  const isOpen = detail.incident.status === "open";
  const timeline = [...detail.timeline].sort(
    (left, right) => epochMilliseconds(left.occurredAt) - epochMilliseconds(right.occurredAt),
  );

  return (
    <Page>
      <Link to="/incidents" {...stylex.props(styles.back)}>
        <Icon icon={ArrowLeft02Icon} size={15} /> Incidents
      </Link>
      <StaleDataNotice
        copy="Showing the last loaded investigation."
        error={staleFailure}
        notFound={{ href: "/incidents", label: "Back to incidents" }}
        onRetry={retryFailedQueries}
        retrying={runtime.isFetching || incident.isFetching}
        returnPath={`/incidents/${encodeURIComponent(incidentId)}`}
      />
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <StatusPill tone={isOpen ? "critical" : "healthy"}>{detail.incident.status}</StatusPill>
          <div>
            <h1 {...stylex.props(styles.incidentTitle)}>{detail.incident.title}</h1>
            <p {...stylex.props(styles.incidentMeta)}>
              {isOpen ? "Opened" : "Resolved"}{" "}
              {formatRelativeTime(detail.incident.closedAt ?? detail.incident.openedAt)}
            </p>
          </div>
        </div>
        {isOpen ? (
          <CloseIncidentDialog incidentId={detail.incident.id} projectId={projectId} />
        ) : null}
      </header>

      {detail.incident.summary ? (
        <section {...stylex.props(styles.summary)}>
          <h2 {...stylex.props(styles.summaryTitle)}>Resolution</h2>
          <p {...stylex.props(styles.summaryCopy)}>{detail.incident.summary}</p>
        </section>
      ) : null}

      {detail.hypotheses.length > 0 ? (
        <section {...stylex.props(styles.section)}>
          <h2 {...stylex.props(styles.sectionTitle)}>Hypotheses</h2>
          <HypothesisList hypotheses={detail.hypotheses} />
        </section>
      ) : null}

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionTitle)}>Timeline</h2>
        {timeline.length === 0 ? (
          <ContentState title="The investigation has just started" />
        ) : (
          <div {...stylex.props(styles.timeline)}>
            {timeline.map((entry) => (
              <article key={entry.id} {...stylex.props(styles.timelineRow)}>
                <time {...stylex.props(styles.timelineTime)}>
                  {formatShortTime(entry.occurredAt)}
                </time>
                <span aria-hidden {...stylex.props(styles.axis)} />
                <span {...stylex.props(styles.event)}>{timelineCopy(entry)}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}

function CloseIncidentDialog({
  incidentId,
  projectId,
}: {
  incidentId: ReturnType<typeof IncidentId.make>;
  projectId: Parameters<typeof useCloseIncident>[0];
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [attempted, setAttempted] = useState(false);
  const closeIncident = useCloseIncident(projectId);
  const incident = useIncidentQuery(projectId, incidentId);
  const invalid = summary.trim().length === 0;
  const outcomeUnknown = closeIncident.isError && mutationOutcomeIsUnknown(closeIncident.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (invalid || outcomeUnknown) return;
    closeIncident.mutate(
      {
        incidentId,
        payload: CloseIncidentRequest.make({ summary: NonEmptyText.make(summary.trim()) }),
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog.Root
      disablePointerDismissal={closeIncident.isPending || outcomeUnknown}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && (closeIncident.isPending || outcomeUnknown)) return;
        if (nextOpen && !outcomeUnknown) {
          setSummary("");
          setAttempted(false);
          closeIncident.reset();
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <Dialog.Trigger render={<Button tone="secondary">Close incident</Button>} />
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Popup {...stylex.props(styles.popup)}>
          <form onSubmit={submit}>
            <header {...stylex.props(styles.dialogHeader)}>
              <div>
                <Dialog.Title {...stylex.props(styles.dialogTitle)}>
                  Close this incident
                </Dialog.Title>
                <Dialog.Description {...stylex.props(styles.dialogDescription)}>
                  Leave a concise resolution for the next person who reads this timeline.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close dialog"
                disabled={closeIncident.isPending || outcomeUnknown}
                {...stylex.props(styles.close)}
              >
                <Icon icon={Cancel01Icon} size={18} />
              </Dialog.Close>
            </header>
            <div {...stylex.props(styles.dialogContent)}>
              <label {...stylex.props(styles.field)}>
                Resolution summary
                <textarea
                  aria-invalid={attempted && invalid}
                  autoFocus
                  maxLength={1_000}
                  onChange={(event) => setSummary(event.currentTarget.value)}
                  placeholder="Retries returned to baseline after backoff and jitter were deployed."
                  rows={5}
                  value={summary}
                  {...stylex.props(styles.textarea)}
                />
              </label>
              {attempted && invalid ? (
                <p {...stylex.props(styles.formError)}>Add a resolution before closing.</p>
              ) : null}
              {closeIncident.isError ? (
                <MutationFailureNotice
                  checkLabel="Check incident state"
                  checking={incident.isFetching}
                  error={closeIncident.error}
                  onCheckState={() => {
                    void incident.refetch().then((result) => {
                      if (!result.isSuccess) return;
                      closeIncident.reset();
                      if (result.data.incident.status === "closed") setOpen(false);
                    });
                  }}
                />
              ) : null}
            </div>
            <footer {...stylex.props(styles.dialogFooter)}>
              <Dialog.Close
                disabled={closeIncident.isPending || outcomeUnknown}
                render={<Button tone="ghost">Cancel</Button>}
              />
              <Button
                disabled={closeIncident.isPending || outcomeUnknown}
                tone="primary"
                type="submit"
              >
                {closeIncident.isPending ? "Closing incident" : "Close incident"}
              </Button>
            </footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const timelineCopy = (
  entry: NonNullable<ReturnType<typeof useIncidentQuery>["data"]>["timeline"][number],
) => {
  if (entry._tag === "note") return entry.text;
  if (entry._tag === "hypothesis") return `Hypothesis ${entry.status}: ${entry.text}`;
  if (entry._tag === "deploy") return `${entry.serviceName} deployed ${entry.sha.slice(0, 8)}`;
  return entry.summary ?? `Incident ${entry.status}`;
};

const styles = stylex.create({
  back: {
    alignItems: "center",
    color: colors.textSubtle,
    display: "inline-flex",
    fontSize: 11,
    gap: space.x2,
    marginBottom: space.x5,
    textDecoration: "none",
    ":hover": { color: colors.text },
  },
  header: {
    alignItems: "start",
    display: "flex",
    gap: space.x5,
    justifyContent: "space-between",
    marginBottom: space.x8,
  },
  heading: {
    alignItems: "start",
    display: "flex",
    gap: space.x3,
    minWidth: 0,
  },
  incidentTitle: { fontSize: 24, fontWeight: 500, letterSpacing: "-0.025em", marginBlock: 0 },
  incidentMeta: { color: colors.textSubtle, fontSize: 11, marginBlock: 5 },
  summary: {
    backgroundColor: colors.greenWash,
    borderColor: "rgba(52, 211, 153, 0.22)",
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    marginBottom: space.x6,
    padding: space.x5,
  },
  summaryTitle: { color: colors.green, fontSize: 12, fontWeight: 500, marginBlock: 0 },
  summaryCopy: { color: colors.textMuted, lineHeight: 1.6, marginBlock: space.x2 },
  section: {
    display: "grid",
    gap: space.x3,
    marginBottom: space.x8,
  },
  sectionTitle: { fontSize: 14, fontWeight: 500, marginBlock: 0 },
  timeline: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    padding: space.x4,
  },
  timelineRow: {
    alignItems: "start",
    display: "grid",
    gridTemplateColumns: "62px 18px minmax(0, 1fr)",
    minHeight: 46,
  },
  timelineTime: {
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    paddingTop: 3,
  },
  axis: {
    backgroundColor: colors.lineStrong,
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 4,
    height: 12,
    marginTop: 2,
    width: 12,
  },
  event: { color: colors.textMuted, fontSize: 12, lineHeight: 1.5 },
  backdrop: { backgroundColor: colors.overlay, inset: 0, position: "fixed", zIndex: 90 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    left: "50%",
    maxWidth: "calc(100vw - 32px)",
    position: "fixed",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 560,
    zIndex: 100,
  },
  dialogHeader: {
    alignItems: "start",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: space.x4,
    justifyContent: "space-between",
    padding: space.x5,
  },
  dialogTitle: { fontSize: 18, fontWeight: 500, marginBlock: 0 },
  dialogDescription: { color: colors.textMuted, fontSize: 12, lineHeight: 1.5, marginBlock: 5 },
  close: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.whiteWash },
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    cursor: "pointer",
    display: "flex",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  dialogContent: { padding: space.x5 },
  field: { color: colors.textMuted, display: "grid", fontSize: 11, gap: space.x2 },
  textarea: {
    backgroundColor: colors.canvas,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    lineHeight: 1.5,
    padding: space.x3,
    resize: "vertical",
    width: "100%",
    "[aria-invalid='true']": { borderColor: colors.red },
  },
  formError: { color: colors.red, fontSize: 11, marginBlock: space.x3 },
  dialogFooter: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    gap: space.x2,
    justifyContent: "flex-end",
    padding: space.x5,
  },
});
