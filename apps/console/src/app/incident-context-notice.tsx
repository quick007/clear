import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";

import { colors, space } from "../theme/tokens.stylex";
import { ConsoleFailureActions } from "../ui/console-failure-actions";
import { Icon } from "../ui/icon";

export function IncidentContextNotice({
  error,
  hasDetail,
  onRetry,
  retrying,
  returnPath,
}: {
  readonly error: unknown;
  readonly hasDetail: boolean;
  readonly onRetry: () => void;
  readonly retrying: boolean;
  readonly returnPath: string;
}) {
  if (error === null || error === undefined) return null;

  return (
    <div aria-live="polite" role="status" {...stylex.props(styles.notice)}>
      <span {...stylex.props(styles.icon)}>
        <Icon icon={InformationCircleIcon} size={15} />
      </span>
      <span {...stylex.props(styles.copy)}>
        <strong {...stylex.props(styles.title)}>
          {hasDetail
            ? "Investigation context is out of date."
            : "Investigation context is unavailable."}
        </strong>{" "}
        {hasDetail
          ? "Showing the last loaded hypotheses and timeline."
          : "Hypotheses and timeline could not be loaded."}
      </span>
      <ConsoleFailureActions
        compact
        disabled={retrying}
        error={error}
        notFound={{ href: "/incidents", label: "Open incidents" }}
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
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: colors.textMuted,
    display: "grid",
    fontSize: 11,
    gap: space.x2,
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    lineHeight: 1.45,
    minHeight: 42,
    paddingBlock: space.x2,
    paddingInline: { default: space.x6, "@media (max-width: 620px)": space.x5 },
  },
  icon: { color: colors.amber, display: "flex" },
  copy: { minWidth: 0 },
  title: { color: colors.text, fontWeight: 500 },
});
