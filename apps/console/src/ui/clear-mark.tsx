import * as stylex from "@stylexjs/stylex";

export function ClearMark() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" {...stylex.props(styles.mark)}>
      <path
        d="M18.93 8A8 8 0 1 0 18.93 16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" fill="currentColor" r="1.5" />
    </svg>
  );
}

const styles = stylex.create({
  mark: {
    display: "block",
    flexShrink: 0,
    height: 27,
    width: 27,
  },
});
