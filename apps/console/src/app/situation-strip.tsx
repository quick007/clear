import type { ConsoleOverview, IncidentDetail } from "@groundtruth/api-contract";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";

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

  return (
    <section aria-label="Current incident" {...stylex.props(styles.strip)}>
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
          <span {...stylex.props(styles.incidentTitle)}>{incident.title}</span>
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
      {incidentDetail && incidentDetail.hypotheses.length > 0 ? (
        <HypothesisList hypotheses={incidentDetail.hypotheses} />
      ) : null}
    </section>
  );
}

export function HypothesisList({ hypotheses }: Pick<IncidentDetail, "hypotheses">) {
  return (
    <div aria-label="Incident hypotheses" role="group" {...stylex.props(styles.hypothesisGroup)}>
      <span {...stylex.props(styles.hypothesisLabel)}>Hypotheses</span>
      <div role="list" {...stylex.props(styles.hypotheses)}>
        {hypotheses.map((hypothesis) => (
          <span
            aria-label={`${hypothesis.status} hypothesis: ${hypothesis.text}`}
            key={hypothesis.id}
            role="listitem"
            {...stylex.props(styles.hypothesis, hypothesisStatusStyles[hypothesis.status])}
          >
            <span aria-hidden {...stylex.props(styles.hypothesisDot)} />
            <span
              {...stylex.props(
                styles.hypothesisText,
                hypothesis.status === "rejected" && styles.rejectedText,
              )}
            >
              {hypothesis.text}
            </span>
            <span {...stylex.props(styles.hypothesisStatus)}>{hypothesis.status}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const hypothesisStatusStyles = stylex.create({
  proposed: {
    backgroundColor: colors.whiteWash,
    borderColor: colors.lineStrong,
    color: colors.textMuted,
  },
  testing: {
    backgroundColor: colors.amberWash,
    borderColor: colors.amber,
    color: colors.amber,
  },
  rejected: {
    backgroundColor: colors.whiteWash,
    borderColor: colors.line,
    color: colors.textSubtle,
  },
  confirmed: {
    backgroundColor: colors.greenWash,
    borderColor: colors.green,
    color: colors.green,
  },
});

const styles = stylex.create({
  strip: {
    alignItems: "center",
    backdropFilter: "blur(12px) saturate(108%)",
    backgroundColor: "rgba(16, 18, 18, 0.78)",
    borderBottomColor: colors.materialLine,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: space.x5,
    gridTemplateColumns: {
      default: "minmax(260px, 0.8fr) minmax(0, 1.2fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    minHeight: 72,
    paddingBlock: space.x4,
    paddingInline: { default: space.x6, "@media (max-width: 620px)": space.x5 },
  },
  alertBlock: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: space.x3 },
  alertCopy: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  incidentTitle: {
    fontSize: 14,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  hypothesisGroup: {
    alignItems: "baseline",
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: {
      default: "auto minmax(0, 1fr)",
      "@media (max-width: 620px)": "minmax(0, 1fr)",
    },
    minWidth: 0,
  },
  hypothesisLabel: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: 500,
  },
  hypotheses: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: space.x2,
    minWidth: 0,
  },
  hypothesis: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    fontSize: 12,
    gap: 7,
    lineHeight: 1.35,
    maxWidth: "100%",
    paddingBlock: 6,
    paddingInline: 9,
  },
  hypothesisDot: {
    backgroundColor: "currentColor",
    borderRadius: radii.pill,
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  hypothesisText: {
    color: colors.text,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  rejectedText: {
    color: colors.textSubtle,
    textDecorationLine: "line-through",
  },
  hypothesisStatus: {
    flexShrink: 0,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
  },
});
