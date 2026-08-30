import { Match } from "effect";

import { recoveryActionForConsoleFailure, type ConsoleRecoveryLink } from "../errors";
import { Button } from "./button";

export function ConsoleFailureActions({
  compact = false,
  disabled = false,
  error,
  invalidRequest,
  notFound,
  onRetry,
  returnPath,
}: {
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly error: unknown;
  readonly invalidRequest?: ConsoleRecoveryLink;
  readonly notFound?: ConsoleRecoveryLink;
  readonly onRetry: () => void;
  readonly returnPath: string;
}) {
  const action = recoveryActionForConsoleFailure(error, {
    invalidRequest,
    notFound,
    returnPath,
  });

  return Match.value(action).pipe(
    Match.tags({
      Link: ({ href, label }) => (
        <Button compact={compact} render={<a href={href} />} tone={compact ? "ghost" : "secondary"}>
          {label}
        </Button>
      ),
      None: () => null,
      Retry: ({ label }) => (
        <Button
          compact={compact}
          disabled={disabled}
          onClick={onRetry}
          tone={compact ? "ghost" : "secondary"}
        >
          {label}
        </Button>
      ),
    }),
    Match.exhaustive,
  );
}
