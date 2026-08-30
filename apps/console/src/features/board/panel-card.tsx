import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, radii, space } from "../../theme/tokens.stylex";

type PanelCardProps = {
  children: ReactNode;
  description: string;
  footer?: ReactNode;
  fullWidth?: boolean;
  legend?: ReadonlyArray<{
    dashed?: boolean;
    label: string;
    summaries?: ReadonlyArray<{ label: string; value: string }>;
    tone: keyof typeof swatchStyles;
  }>;
  legendPlacement?: "bottom" | "right";
  title: string;
  value?: string;
};

export function PanelCard({
  children,
  description,
  footer,
  fullWidth = false,
  legend = [],
  legendPlacement = "bottom",
  title,
  value,
}: PanelCardProps) {
  return (
    <article {...stylex.props(styles.card, fullWidth && styles.fullWidth)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <h2 {...stylex.props(styles.title)}>{title}</h2>
          <p {...stylex.props(styles.description)}>{description}</p>
        </div>
        <div {...stylex.props(styles.headerEnd)}>
          {value ? <strong {...stylex.props(styles.value)}>{value}</strong> : null}
        </div>
      </header>

      <div {...stylex.props(styles.content, legendPlacement === "right" && styles.contentRight)}>
        <div {...stylex.props(styles.body)}>{children}</div>
        {legend.length > 0 ? <PanelLegend items={legend} placement={legendPlacement} /> : null}
      </div>
      {footer ? <footer {...stylex.props(styles.footer)}>{footer}</footer> : null}
    </article>
  );
}

function PanelLegend({
  items,
  placement,
}: {
  items: NonNullable<PanelCardProps["legend"]>;
  placement: NonNullable<PanelCardProps["legendPlacement"]>;
}) {
  return (
    <div
      aria-label="Chart legend"
      {...stylex.props(styles.legend, placement === "right" && styles.legendRight)}
    >
      {items.map((item) => (
        <div key={item.label} {...stylex.props(styles.legendItem)}>
          <span {...stylex.props(styles.legendIdentity)}>
            <span
              aria-hidden
              {...stylex.props(
                styles.legendSwatch,
                item.dashed && styles.legendSwatchDashed,
                swatchStyles[item.tone],
              )}
            />
            <span>{item.label}</span>
          </span>
          {item.summaries?.map((summary) => (
            <span key={summary.label} {...stylex.props(styles.legendSummary)}>
              {summary.label} {summary.value}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const swatchStyles = stylex.create({
  red: { borderTopColor: colors.red },
  blue: { borderTopColor: colors.blue },
  neutral: { borderTopColor: colors.textMuted },
  orange: { borderTopColor: colors.orange },
  violet: { borderTopColor: colors.violet },
  amber: { borderTopColor: colors.amber },
  cyan: { borderTopColor: colors.cyan },
  gray: { borderTopColor: colors.textMuted },
  green: { borderTopColor: colors.green },
});

const styles = stylex.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    minWidth: 0,
    overflow: "hidden",
    padding: space.x5,
  },
  fullWidth: { gridColumn: "1 / -1" },
  header: {
    alignItems: "start",
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 600px)": "column" },
    gap: { default: space.x4, "@media (max-width: 600px)": space.x2 },
    justifyContent: "space-between",
  },
  heading: { minWidth: 0 },
  title: { fontSize: 14, fontWeight: 500, marginBlock: 0 },
  description: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 1.45,
    marginBlock: 5,
    maxWidth: 600,
  },
  headerEnd: {
    alignItems: "center",
    display: "flex",
    gap: space.x2,
    justifyContent: { default: "flex-start", "@media (max-width: 600px)": "space-between" },
    width: { default: "auto", "@media (max-width: 600px)": "100%" },
  },
  value: {
    color: colors.textMuted,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  content: { display: "flex", flexDirection: "column", gap: space.x3, marginTop: space.x2 },
  contentRight: {
    alignItems: "stretch",
    flexDirection: { default: "row", "@media (max-width: 760px)": "column" },
  },
  legend: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: space.x4 },
  legendRight: {
    alignContent: "flex-start",
    alignItems: "stretch",
    borderLeftColor: { default: colors.line, "@media (max-width: 760px)": "transparent" },
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    flexDirection: "column",
    flexWrap: "nowrap",
    minWidth: 180,
    paddingLeft: { default: space.x4, "@media (max-width: 760px)": 0 },
  },
  legendItem: {
    color: colors.textMuted,
    display: "grid",
    fontSize: 11,
    gap: space.x1,
  },
  legendIdentity: {
    alignItems: "center",
    display: "flex",
    gap: 7,
  },
  legendSummary: {
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono, monospace",
    marginLeft: 25,
  },
  legendSwatch: {
    borderRadius: radii.pill,
    borderTopStyle: "solid",
    borderTopWidth: 3,
    height: 0,
    width: 18,
  },
  legendSwatchDashed: { borderTopStyle: "dashed" },
  body: {
    flex: 1,
    height: { default: 278, "@media (max-width: 520px)": 238 },
    minWidth: 0,
  },
  footer: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: colors.textSubtle,
    display: "flex",
    fontSize: 11,
    gap: space.x3,
    marginTop: space.x3,
    paddingTop: space.x3,
  },
});
