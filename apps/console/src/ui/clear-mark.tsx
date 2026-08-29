import * as stylex from "@stylexjs/stylex";

import { colors, radii } from "../theme/tokens.stylex";

export function ClearMark() {
  return (
    <span aria-hidden {...stylex.props(styles.mark)}>
      <span {...stylex.props(styles.stroke, styles.strokeOne)} />
      <span {...stylex.props(styles.stroke, styles.strokeTwo)} />
      <span {...stylex.props(styles.stroke, styles.strokeThree)} />
    </span>
  );
}

const styles = stylex.create({
  mark: {
    alignItems: "center",
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stroke: { borderRadius: radii.pill, height: 2 },
  strokeOne: { backgroundColor: colors.textSubtle, marginLeft: 4, width: 8 },
  strokeTwo: { backgroundColor: colors.amber, width: 14 },
  strokeThree: { backgroundColor: colors.green, marginRight: 4, width: 7 },
});
