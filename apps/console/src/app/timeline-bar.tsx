import type { ConsoleOverview, IncidentDetail } from "@groundtruth/api-contract";
import {
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons";
import { Collapsible } from "@base-ui/react/collapsible";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import { epochMilliseconds, formatShortTime } from "../data/format";
import { colors, radii, space } from "../theme/tokens.stylex";
import { Icon } from "../ui/icon";

export function TimelineBar({
  incidentDetail,
  overview,
}: {
  incidentDetail?: IncidentDetail;
  overview?: ConsoleOverview;
}) {
  const [open, setOpen] = useState(false);
  const incident = incidentDetail?.incident ?? overview?.openIncident;
  if (!incident) return null;
  const isClosed = incident.status === "closed";
  const alertStillFiring = overview?.alerts.some((alert) => alert.status === "firing") ?? false;

  const entries = [
    { detail: "Incident opened", icon: Clock01Icon, time: incident.openedAt },
    ...(incidentDetail?.timeline.map((entry) => ({
      detail: timelineCopy(entry),
      icon:
        entry._tag === "deploy"
          ? Rocket01Icon
          : entry._tag === "hypothesis"
            ? CheckmarkCircle02Icon
            : Clock01Icon,
      time: entry.occurredAt,
    })) ?? []),
  ].sort((left, right) => epochMilliseconds(left.time) - epochMilliseconds(right.time));
  const latest = entries.at(-1)!;

  return (
    <Collapsible.Root onOpenChange={setOpen} open={open} {...stylex.props(styles.root)}>
      <Collapsible.Trigger
        aria-label={`Toggle incident timeline, ${entries.length} events`}
        {...stylex.props(styles.trigger)}
      >
        <span {...stylex.props(styles.triggerTitle)}>
          {isClosed ? "Closed incident timeline" : "Incident timeline"}
          <span {...stylex.props(styles.entryCount)}>{entries.length} events</span>
        </span>
        <span {...stylex.props(styles.latest)}>
          <span
            {...stylex.props(styles.latestDot, isClosed && !alertStillFiring && styles.resolvedDot)}
          />
          {isClosed ? `Summary: ${incident.summary ?? latest.detail}` : `Latest: ${latest.detail}`}
        </span>
        <span {...stylex.props(styles.chevron, open && styles.chevronOpen)}>
          <Icon icon={ArrowDown01Icon} size={16} />
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.entries)}>
          {entries.map((entry) => (
            <article
              key={`${entry.detail}-${epochMilliseconds(entry.time)}`}
              {...stylex.props(styles.entry)}
            >
              <time {...stylex.props(styles.time)}>{formatShortTime(entry.time)}</time>
              <span {...stylex.props(styles.axis)}>
                <span {...stylex.props(styles.axisDot)} />
              </span>
              <span {...stylex.props(styles.entryIcon)}>
                <Icon icon={entry.icon} size={15} />
              </span>
              <span {...stylex.props(styles.detail)}>{entry.detail}</span>
            </article>
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

const timelineCopy = (entry: IncidentDetail["timeline"][number]) => {
  if (entry._tag === "note") return entry.text;
  if (entry._tag === "hypothesis") return `Hypothesis ${entry.status}: ${entry.text}`;
  if (entry._tag === "deploy") return `${entry.serviceName} deployed ${entry.sha.slice(0, 8)}`;
  return entry.summary ?? `Incident ${entry.status}`;
};

const styles = stylex.create({
  root: {
    backgroundColor: colors.canvasRaised,
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    bottom: 0,
    position: "sticky",
    zIndex: 30,
  },
  trigger: {
    alignItems: "center",
    backgroundColor: { default: colors.canvasRaised, ":hover": colors.surface },
    borderWidth: 0,
    color: colors.textMuted,
    cursor: "pointer",
    display: "grid",
    fontSize: 12,
    gap: space.x4,
    gridTemplateColumns: "1fr auto 16px",
    height: 44,
    paddingInline: space.x6,
    textAlign: "left",
    width: "100%",
  },
  triggerTitle: { color: colors.text, fontWeight: 500 },
  entryCount: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    marginLeft: space.x2,
    paddingBlock: 3,
    paddingInline: 7,
  },
  latest: {
    alignItems: "center",
    display: { default: "flex", "@media (max-width: 720px)": "none" },
    gap: space.x2,
    maxWidth: "min(60vw, 760px)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  latestDot: {
    backgroundColor: colors.amber,
    borderRadius: radii.pill,
    boxShadow: "0 0 0 4px rgba(251, 191, 36, 0.10)",
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  resolvedDot: {
    backgroundColor: colors.green,
    boxShadow: "0 0 0 4px rgba(34, 197, 94, 0.10)",
  },
  chevron: {
    display: "flex",
    transform: "rotate(0deg)",
    transitionDuration: "140ms",
    transitionProperty: "transform",
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  chevronOpen: { transform: "rotate(180deg)" },
  panel: { height: "var(--collapsible-panel-height)", overflow: "hidden" },
  entries: {
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    paddingBlock: space.x3,
    paddingInline: space.x6,
  },
  entry: {
    alignItems: "center",
    display: "grid",
    gridTemplateColumns: "56px 18px 24px 1fr",
    minHeight: 34,
  },
  time: { color: colors.textSubtle, fontFamily: "IBM Plex Mono, monospace", fontSize: 10 },
  axis: { alignSelf: "stretch", display: "flex", justifyContent: "center" },
  axisDot: {
    backgroundColor: colors.lineStrong,
    borderColor: colors.canvasRaised,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 3,
    height: 10,
    marginTop: 12,
    width: 10,
  },
  entryIcon: { color: colors.textSubtle, display: "flex" },
  detail: { color: colors.textMuted, fontSize: 12 },
});
