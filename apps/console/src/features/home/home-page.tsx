import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";

const loginHref = "/auth/chatgpt?returnPath=%2Fconnect";

export function HomePage() {
  return (
    <div {...stylex.props(styles.page)}>
      <div aria-hidden {...stylex.props(styles.atmosphere)}>
        <span {...stylex.props(styles.glow, styles.glowAmber)} />
        <span {...stylex.props(styles.glow, styles.glowGreen)} />
        <span {...stylex.props(styles.paper)} />
      </div>

      <header {...stylex.props(styles.header)}>
        <a aria-label="Clear home" href="/" {...stylex.props(styles.brand)}>
          <BrandMark />
          <span>Clear</span>
        </a>
        <a href={loginHref} {...stylex.props(styles.headerLogin)}>
          Log in
        </a>
      </header>

      <main {...stylex.props(styles.main)}>
        <section {...stylex.props(styles.hero)}>
          <div {...stylex.props(styles.copy)}>
            <h1 {...stylex.props(styles.title)}>See the system with your agent.</h1>
            <p {...stylex.props(styles.description)}>
              Clear is an OpenTelemetry workspace built for people and agents to investigate
              together. Bring the agent that already knows your code, then give it the same view of
              production that you have.
            </p>
            <div {...stylex.props(styles.actions)}>
              <Button render={<Link search={{ start: true }} to="/board" />} tone="primary">
                Demo incident
                <Icon icon={ArrowRight01Icon} size={16} />
              </Button>
              <Button render={<a href={loginHref} />} tone="secondary">
                Log in to create a project
              </Button>
            </div>
            <p {...stylex.props(styles.supporting)}>
              Metrics, logs, and traces through standard OTLP.
            </p>
          </div>

          <SystemSketch />
        </section>
      </main>

      <footer {...stylex.props(styles.footer)}>
        <span>Open source observability for the agent era.</span>
        <a href="https://github.com/quick007/clear">GitHub</a>
      </footer>
    </div>
  );
}

function BrandMark() {
  return (
    <span aria-hidden {...stylex.props(styles.brandMark)}>
      <span {...stylex.props(styles.brandLine, styles.brandLineOne)} />
      <span {...stylex.props(styles.brandLine, styles.brandLineTwo)} />
      <span {...stylex.props(styles.brandLine, styles.brandLineThree)} />
    </span>
  );
}

function SystemSketch() {
  return (
    <div aria-hidden {...stylex.props(styles.sketch)}>
      <div {...stylex.props(styles.sketchHeader)}>
        <span {...stylex.props(styles.sketchTitle)}>checkout-api</span>
        <span {...stylex.props(styles.liveDot)} />
      </div>
      <div {...stylex.props(styles.metricRow)}>
        <SketchMetric label="Requests" value="142/s" tone="amber" />
        <SketchMetric label="Users" value="steady" tone="green" />
        <SketchMetric label="Retries" value="62%" tone="red" />
      </div>
      <svg role="presentation" viewBox="0 0 560 230" {...stylex.props(styles.chart)}>
        <defs>
          <linearGradient id="clear-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fbbf24" stopOpacity="0.18" />
            <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="#292524" strokeWidth="1">
          <path d="M0 45H560M0 100H560M0 155H560M0 210H560" />
          <path d="M70 0V230M210 0V230M350 0V230M490 0V230" opacity="0.55" />
        </g>
        <path
          d="M0 181 C44 178 68 184 112 175 S188 171 228 168 S300 165 340 124 S391 62 433 78 S505 38 560 30 L560 230 L0 230 Z"
          fill="url(#clear-chart-fill)"
        />
        <path
          d="M0 181 C44 178 68 184 112 175 S188 171 228 168 S300 165 340 124 S391 62 433 78 S505 38 560 30"
          fill="none"
          stroke="#fbbf24"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M0 193 C58 190 96 196 146 191 S242 193 290 190 S390 194 438 189 S514 193 560 188"
          fill="none"
          stroke="#34d399"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      <div {...stylex.props(styles.annotation)}>
        <span {...stylex.props(styles.annotationRule)} />
        <span>Requests climbed. Users did not.</span>
      </div>
    </div>
  );
}

function SketchMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "green" | "red";
  value: string;
}) {
  return (
    <span {...stylex.props(styles.metric)}>
      <span {...stylex.props(styles.metricLabel)}>{label}</span>
      <span {...stylex.props(styles.metricValue, metricTones[tone])}>{value}</span>
    </span>
  );
}

const drift = stylex.keyframes({
  from: { transform: "translate3d(-4%, -2%, 0) scale(1)" },
  to: { transform: "translate3d(4%, 3%, 0) scale(1.08)" },
});

const metricTones = stylex.create({
  amber: { color: colors.amber },
  green: { color: colors.green },
  red: { color: colors.red },
});

const styles = stylex.create({
  page: {
    backgroundColor: colors.canvas,
    color: colors.text,
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    minHeight: "100vh",
    overflow: "hidden",
    position: "relative",
  },
  atmosphere: { inset: 0, overflow: "hidden", pointerEvents: "none", position: "absolute" },
  glow: {
    animationDirection: "alternate",
    animationDuration: "12s",
    animationIterationCount: "infinite",
    animationName: drift,
    animationTimingFunction: "ease-in-out",
    borderRadius: "50%",
    filter: "blur(80px)",
    opacity: 0.45,
    position: "absolute",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  glowAmber: {
    backgroundColor: "rgba(217, 119, 6, 0.20)",
    height: 640,
    right: "-13%",
    top: "-24%",
    width: 640,
  },
  glowGreen: {
    animationDelay: "-5s",
    backgroundColor: "rgba(16, 185, 129, 0.10)",
    bottom: "-36%",
    height: 520,
    left: "30%",
    width: 520,
  },
  paper: {
    backgroundImage:
      "radial-gradient(circle at 25% 35%, rgba(255,255,255,0.035) 0 0.7px, transparent 0.8px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.02) 0 0.6px, transparent 0.8px)",
    backgroundSize: "5px 5px, 7px 7px",
    inset: 0,
    opacity: 0.65,
    position: "absolute",
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginInline: "auto",
    maxWidth: 1260,
    paddingBlock: { default: space.x6, "@media (max-width: 620px)": space.x5 },
    paddingInline: { default: space.x8, "@media (max-width: 620px)": space.x5 },
    position: "relative",
    width: "100%",
    zIndex: 1,
  },
  brand: {
    alignItems: "center",
    color: colors.text,
    display: "flex",
    fontSize: 16,
    fontWeight: 600,
    gap: space.x3,
    letterSpacing: "-0.01em",
    textDecoration: "none",
  },
  brandMark: {
    alignItems: "center",
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 3,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  brandLine: { borderRadius: radii.pill, height: 2 },
  brandLineOne: { backgroundColor: colors.textMuted, marginLeft: 5, width: 9 },
  brandLineTwo: { backgroundColor: colors.amber, width: 16 },
  brandLineThree: { backgroundColor: colors.green, marginRight: 5, width: 8 },
  headerLogin: {
    color: { default: colors.textMuted, ":hover": colors.text },
    fontSize: 13,
    textDecoration: "none",
  },
  main: {
    alignItems: "center",
    display: "flex",
    marginInline: "auto",
    maxWidth: 1260,
    paddingBlock: { default: space.x12, "@media (max-width: 760px)": space.x8 },
    paddingInline: { default: space.x8, "@media (max-width: 620px)": space.x5 },
    position: "relative",
    width: "100%",
    zIndex: 1,
  },
  hero: {
    alignItems: "center",
    display: "grid",
    gap: { default: 88, "@media (max-width: 980px)": space.x12 },
    gridTemplateColumns: {
      default: "minmax(0, 0.9fr) minmax(440px, 1.1fr)",
      "@media (max-width: 980px)": "1fr",
    },
    width: "100%",
  },
  copy: { maxWidth: 650 },
  title: {
    fontSize: { default: 68, "@media (max-width: 760px)": 48, "@media (max-width: 460px)": 40 },
    fontWeight: 500,
    letterSpacing: "-0.055em",
    lineHeight: 0.98,
    marginBlock: 0,
    textWrap: "balance",
  },
  description: {
    color: colors.textMuted,
    fontSize: { default: 17, "@media (max-width: 620px)": 15 },
    lineHeight: 1.65,
    marginBlock: space.x6,
    maxWidth: 600,
  },
  actions: {
    alignItems: { default: "center", "@media (max-width: 520px)": "stretch" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 520px)": "column" },
    gap: space.x3,
  },
  supporting: {
    color: colors.textSubtle,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    marginBlock: space.x4,
  },
  sketch: {
    backdropFilter: "blur(18px)",
    backgroundColor: "rgba(20, 18, 16, 0.82)",
    borderColor: colors.lineStrong,
    borderRadius: 14,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 28px 80px rgba(0, 0, 0, 0.34)",
    justifySelf: "end",
    maxWidth: 620,
    overflow: "hidden",
    padding: { default: space.x6, "@media (max-width: 520px)": space.x4 },
    position: "relative",
    transform: "rotate(1.3deg)",
    width: "100%",
    "@media (max-width: 980px)": { justifySelf: "start", maxWidth: 720, transform: "none" },
  },
  sketchHeader: { alignItems: "center", display: "flex", justifyContent: "space-between" },
  sketchTitle: { fontSize: 14, fontWeight: 500 },
  liveDot: {
    backgroundColor: colors.green,
    borderRadius: radii.pill,
    boxShadow: "0 0 0 5px rgba(52, 211, 153, 0.09)",
    height: 7,
    width: 7,
  },
  metricRow: {
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    marginBlock: space.x6,
  },
  metric: { display: "grid", gap: 4 },
  metricLabel: { color: colors.textSubtle, fontSize: 11 },
  metricValue: {
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: { default: 18, "@media (max-width: 520px)": 14 },
  },
  chart: { display: "block", height: "auto", width: "100%" },
  annotation: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    fontSize: 11,
    gap: space.x3,
    justifyContent: "flex-end",
    marginTop: space.x4,
  },
  annotationRule: { backgroundColor: colors.amber, height: 1, width: 28 },
  footer: {
    color: colors.textSubtle,
    display: "flex",
    fontSize: 11,
    justifyContent: "space-between",
    marginInline: "auto",
    maxWidth: 1260,
    paddingBlock: space.x5,
    paddingInline: { default: space.x8, "@media (max-width: 620px)": space.x5 },
    position: "relative",
    width: "100%",
    zIndex: 1,
  },
});
