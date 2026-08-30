import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";

const steps = [
  {
    title: "Start the checkout incident",
    detail: "A small upstream failure will expose the service's aggressive retry behavior.",
  },
  {
    title: "Investigate with your agent",
    detail: "Your agent can query the same metrics, logs, traces, and board you are watching.",
  },
  {
    title: "Pressure-test the explanation",
    detail: "Follow the evidence until retries, not real users, explain the extra traffic.",
  },
] as const;

export function SandboxIntroDialog({
  blocked,
  error,
  onOpenChange,
  onStart,
  open,
  pending,
}: {
  blocked: boolean;
  error?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onStart: () => void;
  open: boolean;
  pending: boolean;
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
                Find the cause of a checkout incident
              </Dialog.Title>
              <Dialog.Description {...stylex.props(styles.description)}>
                This is an isolated two-hour workspace. The failure is controlled, but the
                OpenTelemetry evidence and the investigation are real.
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
            <p {...stylex.props(styles.boundary)}>
              This walkthrough ends at diagnosis. Clear observes your systems. It never deploys a
              fix.
            </p>
            {error}
          </div>

          <footer {...stylex.props(styles.footer)}>
            <Dialog.Close
              disabled={pending || blocked}
              render={<Button tone="ghost">View healthy baseline</Button>}
            />
            <Button disabled={pending || blocked} onClick={onStart} tone="primary">
              {pending ? "Starting incident" : "Start incident"}
            </Button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
  footer: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    gap: space.x2,
    justifyContent: "flex-end",
    padding: { default: space.x5, "@media (max-width: 520px)": space.x4 },
  },
});
