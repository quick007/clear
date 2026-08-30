import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, radii, space } from "../theme/tokens.stylex";
import { Button } from "./button";
import { Icon } from "./icon";

export function ConfirmDialog({
  confirmDisabled = false,
  confirmLabel,
  description,
  dismissDisabled = false,
  error,
  onConfirm,
  onOpenChange,
  open,
  pending = false,
  pendingLabel = "Working",
  title,
}: {
  confirmDisabled?: boolean;
  confirmLabel: string;
  description: string;
  dismissDisabled?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  pendingLabel?: string;
  title: string;
}) {
  return (
    <Dialog.Root
      disablePointerDismissal={pending || dismissDisabled}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && (pending || dismissDisabled)) return;
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Popup {...stylex.props(styles.popup)}>
          <header {...stylex.props(styles.header)}>
            <Dialog.Title {...stylex.props(styles.title)}>{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close confirmation"
              disabled={pending || dismissDisabled}
              {...stylex.props(styles.close)}
            >
              <Icon icon={Cancel01Icon} size={18} />
            </Dialog.Close>
          </header>
          <Dialog.Description {...stylex.props(styles.description)}>
            {description}
          </Dialog.Description>
          {error ? (
            <div aria-live="polite" role="alert" {...stylex.props(styles.error)}>
              {error}
            </div>
          ) : null}
          <footer {...stylex.props(styles.footer)}>
            <Dialog.Close
              disabled={pending || dismissDisabled}
              render={<Button tone="ghost">Cancel</Button>}
            />
            <Button disabled={pending || confirmDisabled} onClick={onConfirm} tone="danger">
              {pending ? pendingLabel : confirmLabel}
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
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    left: "50%",
    maxWidth: "calc(100vw - 40px)",
    position: "fixed",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 440,
    zIndex: 100,
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: space.x4,
    paddingInline: space.x5,
  },
  title: { fontSize: 17, fontWeight: 500, marginBlock: 0 },
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
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 1.55,
    margin: 0,
    paddingInline: space.x5,
  },
  error: {
    backgroundColor: colors.redWash,
    borderColor: "rgba(248, 113, 113, 0.2)",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.red,
    fontSize: 12,
    lineHeight: 1.45,
    marginBlock: space.x4,
    marginInline: space.x5,
    padding: space.x3,
  },
  footer: {
    alignItems: "center",
    display: "flex",
    gap: space.x2,
    justifyContent: "flex-end",
    padding: space.x5,
  },
});
