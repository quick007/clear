import * as stylex from "@stylexjs/stylex";

export function ClearMark() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" {...stylex.props(styles.mark)}>
      <rect
        fill="none"
        height="17"
        rx="5.25"
        stroke="currentColor"
        strokeOpacity="0.48"
        strokeWidth="1.25"
        width="17"
        x="3.5"
        y="3.5"
      />
      <path
        d="M7.25 14.9c1.5-3.8 4.1-5.7 7.8-5.7h1.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <circle cx="16.75" cy="9.2" fill="currentColor" r="1.45" />
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
