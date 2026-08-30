import * as stylex from "@stylexjs/stylex";

import type { ConsoleRecoveryLink } from "../errors";
import { colors, radii, space } from "../theme/tokens.stylex";
import { ConsoleFailureActions } from "./console-failure-actions";

export function StaleDataNotice({
  copy,
  error,
  invalidRequest,
  notFound,
  onRetry,
  retrying = false,
  returnPath,
}: {
  readonly copy: string;
  readonly error: unknown;
  readonly invalidRequest?: ConsoleRecoveryLink;
  readonly notFound?: ConsoleRecoveryLink;
  readonly onRetry: () => void;
  readonly retrying?: boolean;
  readonly returnPath: string;
}) {
  if (error === null || error === undefined) return null;

  return (
    <div aria-live="polite" role="status" {...stylex.props(styles.notice)}>
      <span>{copy}</span>
      <ConsoleFailureActions
        compact
        disabled={retrying}
        error={error}
        invalidRequest={invalidRequest}
        notFound={notFound}
        onRetry={onRetry}
        returnPath={returnPath}
      />
    </div>
  );
}

const styles = stylex.create({
  notice: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    display: "flex",
    fontSize: 11,
    gap: space.x2,
    justifyContent: "space-between",
    marginBottom: space.x4,
    paddingBlock: space.x2,
    paddingInline: space.x3,
  },
});
