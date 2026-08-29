import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { colors, radii, space } from "../theme/tokens.stylex";
import { Button } from "./button";

export function Page({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.page)}>{children}</div>;
}

export function PageHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <header {...stylex.props(styles.header)}>
      <div>
        <h1 {...stylex.props(styles.title)}>{title}</h1>
        <p {...stylex.props(styles.description)}>{description}</p>
      </div>
      {actions ? <div {...stylex.props(styles.actions)}>{actions}</div> : null}
    </header>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.toolbar)}>{children}</div>;
}

export function FilterChip({ children }: { children: ReactNode }) {
  return <span {...stylex.props(styles.chip)}>{children}</span>;
}

export function SearchField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  placeholder: string;
  value?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shortcut = useMemo(
    () =>
      typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
        ? "⌘K"
        : "Ctrl K",
    [],
  );

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <label {...stylex.props(styles.searchLabel)}>
      <span {...stylex.props(styles.srOnly)}>{label}</span>
      <input
        aria-label={label}
        onChange={onChange ? (event) => onChange(event.currentTarget.value) : undefined}
        placeholder={placeholder}
        ref={inputRef}
        value={value}
        {...stylex.props(styles.searchInput)}
      />
      <kbd {...stylex.props(styles.shortcut)}>{shortcut}</kbd>
    </label>
  );
}

export function ContentState({
  actions,
  children,
  kind = "empty",
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  kind?: "empty" | "error" | "loading";
  title: string;
}) {
  return (
    <section
      aria-busy={kind === "loading"}
      aria-live="polite"
      {...stylex.props(styles.contentState, kind === "loading" && styles.loadingState)}
    >
      {kind === "loading" ? (
        <span aria-hidden {...stylex.props(styles.loadingLines)}>
          <span {...stylex.props(styles.loadingLine)} />
          <span {...stylex.props(styles.loadingLine, styles.loadingLineShort)} />
        </span>
      ) : null}
      <strong {...stylex.props(kind === "error" && styles.errorTitle)}>{title}</strong>
      {children ? <span {...stylex.props(styles.stateCopy)}>{children}</span> : null}
      {actions ? <div {...stylex.props(styles.stateActions)}>{actions}</div> : null}
    </section>
  );
}

export function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button onClick={onRetry} tone="secondary">
      Try again
    </Button>
  );
}

const styles = stylex.create({
  page: {
    marginInline: "auto",
    maxWidth: 1400,
    padding: { default: space.x6, "@media (max-width: 620px)": space.x5 },
    paddingBottom: space.x10,
  },
  header: {
    alignItems: { default: "end", "@media (max-width: 620px)": "start" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: space.x5,
    justifyContent: "space-between",
    marginBottom: space.x6,
  },
  title: { fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginBlock: 0 },
  description: { color: colors.textMuted, fontSize: 13, marginBlock: 6 },
  actions: { alignItems: "center", display: "flex", gap: space.x2 },
  toolbar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: space.x2,
    marginBottom: space.x4,
    minHeight: 52,
    padding: space.x2,
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    display: "inline-flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    gap: 6,
    height: 32,
    paddingInline: 10,
  },
  searchLabel: { alignItems: "center", display: "flex", flex: "1 1 280px", position: "relative" },
  searchInput: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    height: 34,
    paddingInline: 10,
    paddingRight: 48,
    width: "100%",
    "::placeholder": { color: colors.textSubtle },
  },
  shortcut: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: 4,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 9,
    paddingBlock: 2,
    paddingInline: 5,
    position: "absolute",
    right: 8,
  },
  srOnly: {
    clip: "rect(0, 0, 0, 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  contentState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: 13,
    gap: space.x2,
    justifyContent: "center",
    minHeight: 150,
    padding: space.x6,
    textAlign: "center",
  },
  loadingState: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    minHeight: 112,
  },
  loadingLines: { display: "grid", gap: space.x2, width: "min(320px, 75%)" },
  loadingLine: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    height: 8,
    width: "100%",
  },
  loadingLineShort: { justifySelf: "center", width: "62%" },
  errorTitle: { color: colors.text },
  stateCopy: { lineHeight: 1.5, maxWidth: 520 },
  stateActions: { alignItems: "center", display: "flex", gap: space.x2, marginTop: space.x2 },
});
