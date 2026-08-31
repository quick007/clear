import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { CopyButton } from "../../ui/copy-button";
import { Icon } from "../../ui/icon";

export type SandboxAgentAccess = "checking" | "failed" | "ready" | "unsupported";

const steps = [
  {
    title: "Watch healthy traffic",
    detail: "The board is already receiving fresh checkout telemetry every few seconds.",
  },
  {
    title: "Start the incident",
    detail:
      "Inject payment failures and watch retries, latency, and the alert threshold react over time.",
  },
  {
    title: "Investigate together",
    detail:
      "Open this workspace with the agent that knows your code, then ask it to test a hypothesis and add the evidence here.",
  },
] as const;

export function SandboxIntroDialog({
  agentAccess,
  blocked,
  error,
  onOpenChange,
  onRestart,
  onRetryAgentAccess,
  onStart,
  open,
  pending,
  shareUrl,
  state,
}: {
  agentAccess: SandboxAgentAccess;
  blocked: boolean;
  error?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onRestart: () => void;
  onRetryAgentAccess: () => void;
  onStart: () => void;
  open: boolean;
  pending: boolean;
  shareUrl: string;
  state: "active" | "baseline" | "complete";
}) {
  return (
    <Dialog.Root
      disablePointerDismissal={pending || blocked}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && (pending || blocked)) return;
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Popup {...stylex.props(styles.popup)}>
          <header {...stylex.props(styles.header)}>
            <span {...stylex.props(styles.headerIcon)}>
              <Icon icon={Search01Icon} size={19} />
            </span>
            <div {...stylex.props(styles.heading)}>
              <Dialog.Title {...stylex.props(styles.title)}>
                {state === "complete"
                  ? "Reset the checkout investigation"
                  : state === "active"
                    ? "How this investigation works"
                    : "Watch a checkout incident unfold"}
              </Dialog.Title>
              <Dialog.Description {...stylex.props(styles.description)}>
                {state === "complete"
                  ? "Resetting clears this sandbox's panels and incident record, then returns checkout telemetry to a healthy baseline."
                  : state === "active"
                    ? "The incident is live. Follow the guide on the board to move from symptoms to an evidence-backed cause."
                    : "Clear will stream an isolated checkout workload into this workspace. Your project and telemetry stay untouched."}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close walkthrough"
              disabled={pending || blocked}
              {...stylex.props(styles.close)}
            >
              <Icon icon={Cancel01Icon} size={18} />
            </Dialog.Close>
          </header>

          <div {...stylex.props(styles.content)}>
            <ol {...stylex.props(styles.steps)}>
              {steps.map((step, index) => (
                <li key={step.title} {...stylex.props(styles.step)}>
                  <span {...stylex.props(styles.stepNumber)}>{index + 1}</span>
                  <span {...stylex.props(styles.stepCopy)}>
                    <strong {...stylex.props(styles.stepTitle)}>{step.title}</strong>
                    <span {...stylex.props(styles.stepDetail)}>{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            {state === "baseline" ? <AgentAccessNotice access={agentAccess} /> : null}
            <p {...stylex.props(styles.boundary)}>
              Clear helps you diagnose and preserves the evidence. Your coding agent keeps control
              of the repository and any fix.
            </p>
            {error}
          </div>

          <footer {...stylex.props(styles.footer)}>
            {state === "active" ? (
              <Dialog.Close render={<Button tone="primary">Return to investigation</Button>} />
            ) : state === "complete" ? (
              <Button disabled={pending || blocked} onClick={onRestart} tone="primary">
                {pending ? "Resetting sandbox" : "Reset to healthy baseline"}
              </Button>
            ) : (
              <BaselineActions
                access={agentAccess}
                blocked={blocked}
                onRetryAgentAccess={onRetryAgentAccess}
                onStart={onStart}
                pending={pending}
                shareUrl={shareUrl}
              />
            )}
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AgentAccessNotice({ access }: { access: SandboxAgentAccess }) {
  const copy = {
    checking: {
      title: "Checking agent access",
      detail: "Clear is confirming that your agent can join this workspace before you begin.",
    },
    failed: {
      title: "Agent access could not start",
      detail:
        "Try again before starting. You can still inspect the healthy telemetry in this browser tab.",
    },
    ready: {
      title: "Ready to investigate with your agent",
      detail:
        "Keep this page open with your agent. The questions you ask and the evidence it adds stay visible in the same workspace.",
    },
    unsupported: {
      title: "Open this page inside ChatGPT before starting",
      detail:
        "Agent collaboration is not available in this browser. Copy the live URL and open it inside ChatGPT to run the investigation.",
    },
  }[access];

  return (
    <section
      aria-live="polite"
      {...stylex.props(
        styles.agentAccess,
        access === "ready" && styles.agentAccessReady,
        access === "unsupported" && styles.agentAccessWarning,
        access === "failed" && styles.agentAccessWarning,
      )}
    >
      <strong {...stylex.props(styles.agentAccessTitle)}>{copy.title}</strong>
      <span {...stylex.props(styles.agentAccessDetail)}>{copy.detail}</span>
    </section>
  );
}

function BaselineActions({
  access,
  blocked,
  onRetryAgentAccess,
  onStart,
  pending,
  shareUrl,
}: {
  access: SandboxAgentAccess;
  blocked: boolean;
  onRetryAgentAccess: () => void;
  onStart: () => void;
  pending: boolean;
  shareUrl: string;
}) {
  if (access === "unsupported") {
    return (
      <>
        <Dialog.Close render={<Button tone="ghost">Inspect healthy telemetry</Button>} />
        <CopyButton
          compact={false}
          label="Copy live URL for ChatGPT"
          tone="primary"
          value={shareUrl}
        />
      </>
    );
  }
  if (access === "failed") {
    return (
      <>
        <Dialog.Close render={<Button tone="ghost">Inspect healthy telemetry</Button>} />
        <Button disabled={pending || blocked} onClick={onRetryAgentAccess} tone="primary">
          Try agent access again
        </Button>
      </>
    );
  }
  return (
    <>
      <Dialog.Close
        disabled={pending || blocked}
        render={<Button tone="ghost">Inspect healthy baseline</Button>}
      />
      <Button
        disabled={pending || blocked || access === "checking"}
        onClick={onStart}
        tone="primary"
      >
        {access === "checking"
          ? "Checking agent access"
          : pending
            ? "Starting incident"
            : "Start live incident"}
      </Button>
    </>
  );
}

const styles = stylex.create({
  backdrop: { backgroundColor: colors.overlay, inset: 0, position: "fixed", zIndex: 90 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: 14,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    left: "50%",
    maxHeight: "calc(100svh - 32px)",
    maxWidth: "calc(100vw - 32px)",
    overflowY: "auto",
    position: "fixed",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 600,
    zIndex: 100,
  },
  header: {
    alignItems: "start",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "40px minmax(0, 1fr) 36px",
    padding: { default: space.x6, "@media (max-width: 520px)": space.x4 },
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.md,
    color: colors.amber,
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  heading: { minWidth: 0 },
  title: { fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em", marginBlock: 0 },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 1.55, marginBlock: space.x2 },
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
  content: {
    display: "grid",
    gap: space.x5,
    padding: { default: space.x6, "@media (max-width: 520px)": space.x4 },
  },
  steps: { display: "grid", gap: space.x4, listStyle: "none", margin: 0, padding: 0 },
  step: {
    alignItems: "start",
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "28px minmax(0, 1fr)",
  },
  stepNumber: {
    alignItems: "center",
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepCopy: { display: "grid", gap: 3 },
  stepTitle: { fontSize: 13, fontWeight: 500 },
  stepDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 1.5 },
  boundary: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 1.5,
    margin: 0,
    padding: space.x3,
  },
  agentAccess: {
    backgroundColor: colors.canvas,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: space.x1,
    padding: space.x3,
  },
  agentAccessReady: {
    backgroundColor: colors.greenWash,
    borderColor: "rgba(52, 211, 153, 0.24)",
  },
  agentAccessWarning: {
    backgroundColor: colors.amberWash,
    borderColor: "rgba(251, 191, 36, 0.26)",
  },
  agentAccessTitle: { fontSize: 12, fontWeight: 500 },
  agentAccessDetail: { color: colors.textMuted, fontSize: 11, lineHeight: 1.5 },
  footer: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: space.x2,
    justifyContent: "flex-end",
    padding: { default: space.x5, "@media (max-width: 520px)": space.x4 },
  },
});
