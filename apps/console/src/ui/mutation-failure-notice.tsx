import * as stylex from "@stylexjs/stylex";

import { mutationOutcomeIsUnknown, presentConsoleFailure } from "../errors";
import { colors, radii, space } from "../theme/tokens.stylex";
import { Button } from "./button";

export function MutationFailureNotice({
  checkLabel = "Check current state",
  checking = false,
  compact = false,
  error,
  message,
  onCheckState,
}: {
  readonly checkLabel?: string;
  readonly checking?: boolean;
  readonly compact?: boolean;
  readonly error: unknown;
  readonly message?: string;
  readonly onCheckState?: () => void;
}) {
  const outcomeUnknown = mutationOutcomeIsUnknown(error);
  const presentation = presentConsoleFailure(error);

  return (
    <div
      aria-live="polite"
      role="alert"
      {...stylex.props(styles.notice, compact && styles.compact, outcomeUnknown && styles.unknown)}
    >
      <span>{message ?? presentation.message}</span>
      {outcomeUnknown && onCheckState ? (
        <Button compact disabled={checking} onClick={onCheckState} tone="secondary">
          {checking ? "Checking state" : checkLabel}
        </Button>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  notice: {
    alignItems: "start",
    backgroundColor: colors.redWash,
    borderColor: "rgba(248, 113, 113, 0.2)",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.red,
    display: "flex",
    flexDirection: "column",
    fontSize: 12,
    gap: space.x3,
    lineHeight: 1.45,
    padding: space.x3,
  },
  compact: { fontSize: 11, gap: space.x2, padding: space.x2 },
  unknown: {
    backgroundColor: colors.amberWash,
    borderColor: "rgba(245, 158, 11, 0.24)",
    color: colors.amber,
  },
});
