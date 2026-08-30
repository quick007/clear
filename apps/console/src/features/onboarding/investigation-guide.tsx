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
    title: "Begin with a healthy baseline",
    detail:
      "See normal checkout behavior first, then introduce the controlled failure when you are ready.",
  },
  orient: {
    title: "Ask your agent to investigate",
    detail:
      "Copy the prompt into your agent conversation. Its findings and new panels will appear on this board.",
  },
  challenge: {
    title: "Challenge the first explanation",
    detail:
      "If this were a real traffic surge, unique users should rise with request volume. Ask your agent to test that.",
  },
  evidence: {
    title: "Follow the retry evidence",
    detail:
      "Compare incoming requests, unique users, and payment attempts until the amplification is visible.",
  },
  diagnosed: {
    title: "Diagnosis complete",
    detail:
      "The evidence now supports retry amplification. Review the hypotheses and timeline before closing the incident.",
  },
} satisfies Record<InvestigationStage, { title: string; detail: string }>;

const stageIndex: Record<InvestigationStage, number> = {
  baseline: 0,
  orient: 0,
  challenge: 1,
  evidence: 1,
  diagnosed: 2,
};

const journey = ["Orient", "Test the explanation", "Confirm the cause"] as const;

export function InvestigationGuide({
  action,
  onOpenGuide,
  prompt,
  stage,
}: {
  action?: ReactNode;
  onOpenGuide: () => void;
  prompt: string;
  stage: InvestigationStage;
}) {
  const copy = stageCopy[stage];
  const activeIndex = stageIndex[stage];
  return (
    <aside aria-labelledby="investigation-guide-title" {...stylex.props(styles.guide)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <span {...stylex.props(styles.guideIcon)}>
            <Icon
              icon={stage === "diagnosed" ? CheckmarkCircle02Icon : InformationCircleIcon}
              size={17}
            />
          </span>
          <div>
            <h2 id="investigation-guide-title" {...stylex.props(styles.title)}>
              {copy.title}
            </h2>
            <p {...stylex.props(styles.detail)}>{copy.detail}</p>
          </div>
        </div>
        <Button compact onClick={onOpenGuide} tone="ghost">
          How this works
        </Button>
      </div>

      <ol aria-label="Investigation steps" {...stylex.props(styles.journey)}>
        {journey.map((label, index) => (
          <li
            key={label}
            {...stylex.props(
              styles.journeyStep,
              index < activeIndex && styles.journeyComplete,
              index === activeIndex && styles.journeyActive,
            )}
          >
            <span {...stylex.props(styles.journeyDot)}>
              {index < activeIndex ? "✓" : index + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <div {...stylex.props(styles.actions)}>
        {stage === "baseline" ? action : null}
        {stage === "orient" || stage === "challenge" ? (
          <div {...stylex.props(styles.prompt)}>
            <span {...stylex.props(styles.promptCopy)}>
              <small>Suggested prompt</small>
              <span>{prompt}</span>
            </span>
            <CopyButton label="Copy prompt for your agent" value={prompt} />
          </div>
        ) : null}
      </div>
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
    gap: space.x4,
    marginBottom: space.x6,
    padding: { default: space.x5, "@media (max-width: 620px)": space.x4 },
  },
  header: { alignItems: "start", display: "flex", gap: space.x4, justifyContent: "space-between" },
  heading: { alignItems: "start", display: "flex", gap: space.x3, minWidth: 0 },
  guideIcon: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.sm,
    color: colors.amber,
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  title: { fontSize: 15, fontWeight: 500, margin: 0 },
  detail: { color: colors.textMuted, fontSize: 12, lineHeight: 1.5, marginBlock: 4, maxWidth: 720 },
  journey: {
    display: "grid",
    gap: 0,
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 620px)": "1fr",
    },
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  journeyStep: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: colors.textSubtle,
    display: "flex",
    fontSize: 11,
    gap: space.x2,
    paddingBlock: space.x3,
  },
  journeyActive: { borderTopColor: colors.amber, color: colors.text },
  journeyComplete: { borderTopColor: colors.green, color: colors.textMuted },
  journeyDot: {
    alignItems: "center",
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 9,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  actions: { display: "grid", gap: space.x3 },
  prompt: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: space.x4,
    justifyContent: "space-between",
    padding: space.x3,
  },
  promptCopy: { color: colors.textMuted, display: "grid", fontSize: 12, gap: 3, lineHeight: 1.45 },
});
