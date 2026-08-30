import { CheckmarkCircle02Icon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, radii, space } from "../../theme/tokens.stylex";
import { Icon } from "../../ui/icon";
import type { ConnectionStepStatus } from "./connection-progress";

export function ConnectionSummary({
  completedCount,
  healthy,
  nextStep,
  connected,
}: {
  completedCount: number;
  healthy: boolean;
  nextStep: string | null;
  connected: boolean;
}) {
  return (
    <section aria-live="polite" {...stylex.props(styles.summary, connected && styles.summaryReady)}>
      <span {...stylex.props(styles.summaryIcon, connected && styles.summaryIconReady)}>
        <Icon icon={connected ? CheckmarkCircle02Icon : CloudUploadIcon} size={18} />
      </span>
      <span {...stylex.props(styles.summaryCopy)}>
        <strong>
          {healthy
            ? "Telemetry is flowing"
            : connected
              ? "Telemetry is connected"
              : `${completedCount} of 3 steps complete`}
        </strong>
        <small>
          {healthy
            ? "Clear has received a fresh signal from this project."
            : connected
              ? "Clear has received this project's signals before. Recent activity is delayed."
              : `Next: ${nextStep ?? "finish connection setup"}.`}
        </small>
      </span>
      <span aria-hidden {...stylex.props(styles.progressTrack)}>
        {[0, 1, 2].map((step) => (
          <span
            key={step}
            {...stylex.props(
              styles.progressSegment,
              step < completedCount && styles.progressSegmentComplete,
            )}
          />
        ))}
      </span>
    </section>
  );
}

export function ConnectStep({
  children,
  icon,
  number,
  status,
  title,
}: {
  children: ReactNode;
  icon: Parameters<typeof Icon>[0]["icon"];
  number: string;
  status: ConnectionStepStatus;
  title: string;
}) {
  return (
    <article
      aria-current={status === "current" ? "step" : undefined}
      {...stylex.props(styles.step, status === "current" && styles.stepCurrent)}
    >
      <span
        {...stylex.props(
          styles.stepNumber,
          status === "complete" && styles.stepNumberComplete,
          status === "upcoming" && styles.stepNumberUpcoming,
        )}
      >
        {status === "complete" ? <Icon icon={CheckmarkCircle02Icon} size={15} /> : number}
      </span>
      <div {...stylex.props(styles.stepBody)}>
        <header {...stylex.props(styles.stepHeader)}>
          <h2 {...stylex.props(styles.stepTitle)}>
            <Icon icon={icon} size={17} /> {title}
          </h2>
          <span
            {...stylex.props(
              styles.stepStatus,
              status === "complete" && styles.stepStatusComplete,
              status === "current" && styles.stepStatusCurrent,
            )}
          >
            {status === "complete" ? "Complete" : status === "current" ? "Next" : "Waiting"}
          </span>
        </header>
        {children}
      </div>
    </article>
  );
}

const styles = stylex.create({
  summary: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: {
      default: "32px minmax(0, 1fr) 180px",
      "@media (max-width: 620px)": "32px minmax(0, 1fr)",
    },
    marginBottom: space.x4,
    padding: space.x4,
  },
  summaryReady: { borderColor: "rgba(52, 211, 153, 0.24)" },
  summaryIcon: {
    alignItems: "center",
    color: colors.amber,
    display: "flex",
    height: 32,
    justifyContent: "center",
  },
  summaryIconReady: { color: colors.green },
  summaryCopy: { display: "grid", gap: 3 },
  progressTrack: {
    display: "grid",
    gap: space.x1,
    gridColumn: { default: "auto", "@media (max-width: 620px)": "1 / -1" },
    gridTemplateColumns: "repeat(3, 1fr)",
  },
  progressSegment: {
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 3,
  },
  progressSegmentComplete: { backgroundColor: colors.green },
  step: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: "32px minmax(0, 1fr)",
    padding: { default: space.x6, "@media (max-width: 620px)": space.x4 },
  },
  stepCurrent: { backgroundColor: colors.whiteWash },
  stepNumber: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.pill,
    color: colors.amber,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepNumberComplete: { backgroundColor: colors.greenWash, color: colors.green },
  stepNumberUpcoming: { backgroundColor: colors.whiteWash, color: colors.textSubtle },
  stepBody: { display: "grid", gap: space.x4, minWidth: 0 },
  stepHeader: {
    alignItems: "center",
    display: "flex",
    gap: space.x3,
    justifyContent: "space-between",
  },
  stepTitle: {
    alignItems: "center",
    display: "flex",
    fontSize: 14,
    fontWeight: 500,
    gap: space.x2,
    marginBlock: 3,
  },
  stepStatus: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  stepStatusComplete: { color: colors.green },
  stepStatusCurrent: { color: colors.amber },
});
