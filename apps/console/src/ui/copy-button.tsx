import { CheckmarkCircle02Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { colors } from "../theme/tokens.stylex";
import { Button } from "./button";
import { Icon } from "./icon";

type CopyStatus = "failed" | "idle" | "success";

export function CopyButton({
  compact = true,
  label = "Copy",
  tone = "ghost",
  value,
}: {
  compact?: boolean;
  label?: string;
  tone?: "ghost" | "primary" | "secondary";
  value: string;
}) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current !== null) clearTimeout(timeout.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("success");
    } catch {
      setStatus("failed");
    }
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setStatus("idle"), 2_000); // 2 seconds
  };

  const statusLabel = status === "success" ? "Copied" : status === "failed" ? "Copy failed" : label;

  return (
    <span {...stylex.props(styles.wrapper)}>
      <Button compact={compact} onClick={copy} tone={tone}>
        <Icon icon={status === "success" ? CheckmarkCircle02Icon : Copy01Icon} size={14} />
        {statusLabel}
      </Button>
      <span aria-live="polite" {...stylex.props(styles.srOnly)}>
        {status === "success"
          ? `${label} copied to clipboard`
          : status === "failed"
            ? `${label} could not be copied`
            : ""}
      </span>
    </span>
  );
}

const styles = stylex.create({
  wrapper: { alignItems: "center", display: "inline-flex" },
  srOnly: {
    clip: "rect(0, 0, 0, 0)",
    clipPath: "inset(50%)",
    color: colors.text,
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
