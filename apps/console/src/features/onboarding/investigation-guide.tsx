import { CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { CopyButton } from "../../ui/copy-button";
import { Icon } from "../../ui/icon";
import type { InvestigationStage } from "./investigation-progress";

const stageCopy = {
  baseline: {
    title: "Healthy checkout traffic is live",
    detail: "Fresh metrics, logs, and traces are arriving every few seconds.",
  },
  orient: {
    title: "Payment failures are entering the stream",
    detail:
      "Watch request volume and latency react. Clear will fire the alert when the threshold is crossed.",
  },
  challenge: {
    title: "Test the traffic-surge explanation",
    detail:
      "A real surge should bring more users. Ask your agent to compare demand with the work sent upstream.",
  },
  evidence: {
    title: "Trace the extra work",
    detail:
      "Incoming demand stayed flat. Break payment calls down by attempt to find what multiplied.",
  },
  diagnosed: {
    title: "Retry amplification confirmed",
    detail:
      "Repeated payment attempts explain the extra load. Deploy the sandbox fix to watch it recover.",
  },
  recovering: {
    title: "The fix is live",
    detail:
      "A deploy marker landed. Watch payment attempts and checkout latency fall in real time.",
  },
  recovered: {
    title: "The alert has cleared",
    detail:
      "Payment attempts and latency are falling after the deploy. Review the evidence before closing the incident.",
  },
  reviewed: {
    title: "Incident closed",
    detail: "Reset the workspace to watch the incident unfold again.",
  },
} satisfies Record<InvestigationStage, { readonly title: string; readonly detail: string }>;

export function InvestigationGuide({
  action,
  agentUnavailable,
  alertFiring,
  onOpenGuide,
  prompt,
  stage,
}: {
  action?: ReactNode;
  agentUnavailable: boolean;
  alertFiring: boolean;
  onOpenGuide: () => void;
  prompt: string;
  stage: InvestigationStage;
}) {
  const copy =
    alertFiring && stage === "orient"
      ? {
          title: "The payment request alert is firing",
          detail:
            "Upstream work and checkout latency are climbing. Test whether real user demand explains it.",
        }
      : stageCopy[stage];
  const canAskAgent =
    alertFiring && (stage === "orient" || stage === "challenge" || stage === "evidence");
  return (
    <aside aria-labelledby="investigation-guide-title" {...stylex.props(styles.guide)}>
      <div {...stylex.props(styles.main)}>
        <span
          {...stylex.props(
            styles.guideIcon,
            (stage === "recovered" || stage === "reviewed") && styles.completeIcon,
          )}
        >
          <Icon
            icon={
              stage === "recovered" || stage === "reviewed"
                ? CheckmarkCircle02Icon
                : InformationCircleIcon
            }
            size={17}
          />
        </span>
        <div {...stylex.props(styles.copy)}>
          <h2 id="investigation-guide-title" {...stylex.props(styles.title)}>
            {copy.title}
          </h2>
          <p {...stylex.props(styles.detail)}>{copy.detail}</p>
        </div>
        <div {...stylex.props(styles.headerActions)}>
          {action}
          <Button compact onClick={onOpenGuide} tone="ghost">
            How it works
          </Button>
        </div>
      </div>

      {agentUnavailable && canAskAgent ? (
        <p role="status" {...stylex.props(styles.agentNotice)}>
          Open Clear inside ChatGPT so your agent can read this workspace and add evidence to it.
        </p>
      ) : null}
      {canAskAgent ? (
        <div {...stylex.props(styles.prompt)}>
          <span {...stylex.props(styles.promptCopy)}>
            <small>Ask your agent</small>
            <span>{prompt}</span>
          </span>
          <CopyButton label="Copy question" value={prompt} />
        </div>
      ) : null}
    </aside>
  );
}

const styles = stylex.create({
  guide: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: space.x3,
    marginBottom: space.x5,
    padding: space.x4,
  },
  main: {
    alignItems: { default: "center", "@media (max-width: 680px)": "start" },
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: {
      default: "32px minmax(0, 1fr) auto",
      "@media (max-width: 680px)": "32px minmax(0, 1fr)",
    },
  },
  guideIcon: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.sm,
    color: colors.amber,
    display: "flex",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  completeIcon: { backgroundColor: colors.greenWash, color: colors.green },
  copy: { minWidth: 0 },
  title: { fontSize: 14, fontWeight: 500, margin: 0 },
  detail: { color: colors.textMuted, fontSize: 12, lineHeight: 1.5, marginBlock: 3 },
  headerActions: {
    alignItems: "center",
    display: "flex",
    gap: space.x2,
    "@media (max-width: 680px)": { gridColumn: "1 / -1", paddingLeft: 44 },
  },
  agentNotice: {
    backgroundColor: colors.blueWash,
    borderRadius: radii.md,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    padding: space.x3,
  },
  prompt: {
    alignItems: { default: "center", "@media (max-width: 620px)": "stretch" },
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: space.x4,
    justifyContent: "space-between",
    padding: space.x3,
  },
  promptCopy: {
    color: colors.textMuted,
    display: "grid",
    fontSize: 12,
    gap: 3,
    lineHeight: 1.45,
  },
});
