import type { ConsoleOverview, IncidentDetail } from "@groundtruth/api-contract";
import { ArrowDown01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { Popover } from "@base-ui/react/popover";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { formatOpenDuration } from "../data/format";
import { colors, radii, space } from "../theme/tokens.stylex";
import { Icon } from "../ui/icon";
import { StatusPill } from "../ui/status";

export function SituationStrip({
  incidentDetail,
  overview,
}: {
  incidentDetail?: IncidentDetail;
  overview?: ConsoleOverview;
}) {
  const incident = incidentDetail?.incident ?? overview?.openIncident;
  const firingCount = overview?.alerts.filter((alert) => alert.status === "firing").length ?? 0;
  if (!incident) return null;
  const isClosed = incident.status === "closed";
  const hasHypotheses = (incidentDetail?.hypotheses.length ?? 0) > 0;

  return (
    <section
      aria-label="Current incident"
      {...stylex.props(styles.strip, !hasHypotheses && styles.stripCompact)}
    >
      <div {...stylex.props(styles.alertBlock)}>
        {isClosed ? (
          firingCount > 0 ? (
            <StatusPill tone="critical">Closed with alert firing</StatusPill>
          ) : (
            <StatusPill tone="healthy">Closed</StatusPill>
          )
        ) : firingCount === 0 ? (
          <StatusPill>Investigation open</StatusPill>
        ) : (
          <StatusPill tone="critical">
            {firingCount} {firingCount === 1 ? "alert" : "alerts"} firing
          </StatusPill>
        )}
        <div {...stylex.props(styles.alertCopy)}>
          <Link
            params={{ incidentId: incident.id }}
            to="/incidents/$incidentId"
            {...stylex.props(styles.incidentTitle)}
          >
            {incident.title}
          </Link>
          {isClosed ? (
            incident.summary === null ? null : (
              <span {...stylex.props(styles.incidentSummary)}>{incident.summary}</span>
            )
          ) : (
            <span {...stylex.props(styles.incidentMeta)}>
              <Icon icon={Clock01Icon} size={13} /> Open for {formatOpenDuration(incident.openedAt)}
            </span>
          )}
        </div>
      </div>
      {incidentDetail && hasHypotheses ? (
        <HypothesisPopover hypotheses={incidentDetail.hypotheses} />
      ) : null}
    </section>
  );
}

export function HypothesisPopover({ hypotheses }: Pick<IncidentDetail, "hypotheses">) {
  const summaryHypothesis =
    hypotheses.find(({ status }) => status === "confirmed") ??
    hypotheses.find(({ status }) => status === "testing") ??
    hypotheses.find(({ status }) => status === "proposed") ??
    hypotheses[0]!;
  const summaryCount = hypotheses.filter(
    ({ status }) => status === summaryHypothesis.status,
  ).length;
  const statusSummary = ["confirmed", "testing", "proposed", "rejected"]
    .map((status) => {
      const count = hypotheses.filter((hypothesis) => hypothesis.status === status).length;
      return count === 0 ? null : `${count} ${status}`;
    })
    .filter((summary) => summary !== null)
    .join(", ");

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`View hypotheses: ${statusSummary}`}
        {...stylex.props(styles.hypothesisTrigger)}
      >
        <span>Hypotheses</span>
        <span
          aria-hidden
          {...stylex.props(styles.hypothesisDot, hypothesisStatusStyles[summaryHypothesis.status])}
        />
        <span
          {...stylex.props(
            styles.hypothesisSummary,
            hypothesisStatusStyles[summaryHypothesis.status],
          )}
        >
          {summaryCount} {summaryHypothesis.status}
        </span>
        <Icon icon={ArrowDown01Icon} size={14} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          side="bottom"
          sideOffset={8}
          {...stylex.props(styles.hypothesisPositioner)}
        >
          <Popover.Popup {...stylex.props(styles.hypothesisPopup)}>
            <header {...stylex.props(styles.hypothesisPopupHeader)}>
              <Popover.Title {...stylex.props(styles.hypothesisPopupTitle)}>
                Incident hypotheses
              </Popover.Title>
              <Popover.Description {...stylex.props(styles.hypothesisPopupDescription)}>
                {hypotheses.length} explanations tracked for this incident
              </Popover.Description>
            </header>
            <HypothesisList hypotheses={hypotheses} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function HypothesisList({ hypotheses }: Pick<IncidentDetail, "hypotheses">) {
  return (
    <div aria-label="Incident hypotheses" role="list" {...stylex.props(styles.hypotheses)}>
      {hypotheses.map((hypothesis) => (
        <article
          aria-label={`${hypothesis.status} hypothesis: ${hypothesis.text}`}
          key={hypothesis.id}
          role="listitem"
          {...stylex.props(styles.hypothesis)}
        >
          <span {...stylex.props(styles.hypothesisStatusLine)}>
            <span
              aria-hidden
              {...stylex.props(styles.hypothesisDot, hypothesisStatusStyles[hypothesis.status])}
            />
            <span
              {...stylex.props(styles.hypothesisStatus, hypothesisStatusStyles[hypothesis.status])}
            >
              {hypothesis.status}
            </span>
          </span>
          <span
            {...stylex.props(
              styles.hypothesisText,
              hypothesis.status === "rejected" && styles.rejectedText,
            )}
          >
            {hypothesis.text}
          </span>
        </article>
      ))}
    </div>
  );
}

const hypothesisStatusStyles = stylex.create({
  proposed: {
    color: colors.textMuted,
  },
  testing: {
    color: colors.amber,
  },
  rejected: {
    color: colors.textSubtle,
  },
  confirmed: {
    color: colors.green,
  },
});

const styles = stylex.create({
  strip: {
    alignItems: "center",
    backgroundColor: colors.canvasRaised,
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: space.x5,
    gridTemplateColumns: {
      default: "minmax(340px, 1fr) auto",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    minHeight: 58,
    paddingBlock: 10,
    paddingInline: { default: space.x6, "@media (max-width: 620px)": space.x5 },
  },
  stripCompact: { gridTemplateColumns: "minmax(0, 1fr)" },
  alertBlock: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: space.x3 },
  alertCopy: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  incidentTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textDecoration: "none",
    whiteSpace: "nowrap",
    ":hover": { textDecoration: "underline" },
  },
  incidentMeta: {
    alignItems: "center",
    color: colors.textSubtle,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 12,
    gap: 5,
  },
  incidentSummary: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.45,
    maxWidth: "72ch",
  },
  hypothesisTrigger: {
    alignItems: "center",
    backgroundColor: { default: colors.whiteWash, ":hover": colors.surfaceHover },
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 500,
    gap: 7,
    justifySelf: { default: "end", "@media (max-width: 900px)": "start" },
    minHeight: 32,
    paddingInline: 10,
  },
  hypothesisSummary: { fontFamily: "IBM Plex Mono, monospace", fontSize: 10 },
  hypothesisPositioner: { zIndex: 80 },
  hypothesisPopup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.32)",
    color: colors.text,
    maxWidth: "calc(100vw - 32px)",
    overflow: "hidden",
    transformOrigin: "var(--transform-origin)",
    width: 420,
  },
  hypothesisPopupHeader: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBlock: space.x4,
    paddingInline: space.x4,
  },
  hypothesisPopupTitle: { fontSize: 14, fontWeight: 600, margin: 0 },
  hypothesisPopupDescription: {
    color: colors.textSubtle,
    fontSize: 12,
    marginBlock: "4px 0",
  },
  hypotheses: {
    display: "flex",
    flexDirection: "column",
  },
  hypothesis: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    display: "flex",
    flexDirection: "column",
    gap: 7,
    paddingBlock: space.x3,
    paddingInline: space.x4,
  },
  hypothesisDot: {
    backgroundColor: "currentColor",
    borderRadius: radii.pill,
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  hypothesisStatusLine: { alignItems: "center", display: "flex", gap: 7 },
  hypothesisText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 1.5,
  },
  rejectedText: {
    color: colors.textSubtle,
  },
  hypothesisStatus: {
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    textTransform: "capitalize",
  },
});
