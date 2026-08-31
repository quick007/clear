import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { signInHref } from "../../auth-route";
import { colors, space } from "../../theme/tokens.stylex";
import { buttonStyles, buttonToneStyles } from "../../ui/button";
import { ClearMark } from "../../ui/clear-mark";
import { Icon } from "../../ui/icon";
import { HomeAtmosphere } from "./home-atmosphere";

export function HomePage() {
  return (
    <div {...stylex.props(styles.page)}>
      <HomeAtmosphere />

      <main {...stylex.props(styles.main)}>
        <section {...stylex.props(styles.hero)}>
          <div {...stylex.props(styles.intro)}>
            <a aria-label="Clear home" href="/" {...stylex.props(styles.brand)}>
              <ClearMark />
              <span>Clear</span>
            </a>

            <h1 {...stylex.props(styles.title)}>
              Your agent knows the code. Give it live evidence.
            </h1>
            <p {...stylex.props(styles.description)}>
              Clear turns OpenTelemetry into one investigation surface for you and your coding
              agent. You steer in the board while typed WebMCP tools let it query the same evidence
              and add what it finds.
            </p>

            <div {...stylex.props(styles.actions)}>
              <Link
                search={{ demo: true, guide: true }}
                to="/board"
                {...stylex.props(buttonStyles.button, buttonToneStyles.primary, buttonStyles.large)}
              >
                Explore the live sandbox
                <Icon icon={ArrowRight01Icon} size={17} />
              </Link>
              <a
                href={signInHref("/connect")}
                {...stylex.props(
                  buttonStyles.button,
                  buttonToneStyles.secondary,
                  buttonStyles.large,
                )}
              >
                Connect your telemetry
              </a>
            </div>
            <p {...stylex.props(styles.sandboxNote)}>
              No setup required. The sandbox is isolated to this tab and expires after two hours.
            </p>
          </div>

          <aside aria-label="How Clear investigations work" {...stylex.props(styles.proof)}>
            <header {...stylex.props(styles.proofHeader)}>
              <strong>One investigation, two interfaces</strong>
              <span {...stylex.props(styles.proofStatus)}>Human + agent</span>
            </header>
            <ol {...stylex.props(styles.proofSteps)}>
              <li {...stylex.props(styles.proofStep)}>
                <span {...stylex.props(styles.proofStepNumber)}>1</span>
                <span {...stylex.props(styles.proofStepCopy)}>
                  <strong>See the same system</strong>
                  <span>Metrics, logs, traces, alerts, and deploys stay correlated.</span>
                </span>
              </li>
              <li {...stylex.props(styles.proofStep)}>
                <span {...stylex.props(styles.proofStepNumber)}>2</span>
                <span {...stylex.props(styles.proofStepCopy)}>
                  <strong>Test the explanation</strong>
                  <span>Typed WebMCP tools query bounded evidence and compose shared panels.</span>
                </span>
              </li>
              <li {...stylex.props(styles.proofStep)}>
                <span {...stylex.props(styles.proofStepNumber)}>3</span>
                <span {...stylex.props(styles.proofStepCopy)}>
                  <strong>Preserve the conclusion</strong>
                  <span>Hypotheses, evidence, deploys, and recovery remain in one timeline.</span>
                </span>
              </li>
            </ol>
            <div {...stylex.props(styles.toolCall)}>
              <small>Agent entry point</small>
              <code>get_console_overview()</code>
            </div>
            <p {...stylex.props(styles.boundary)}>
              Clear reads and records. Your coding agent keeps control of code and deployment.
            </p>
          </aside>
        </section>
      </main>
    </div>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: "#070909",
    color: colors.text,
    minHeight: "100svh",
    overflowX: "hidden",
    position: "relative",
  },
  main: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    minHeight: "100svh",
    padding: { default: space.x6, "@media (max-width: 520px)": space.x4 },
    position: "relative",
    zIndex: 1,
  },
  hero: {
    alignItems: "center",
    backdropFilter: "blur(6px) saturate(105%)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: { default: 28, "@media (max-width: 520px)": 22 },
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 32px 100px rgba(0, 0, 0, 0.18)",
    display: "grid",
    gap: { default: "clamp(48px, 6vw, 80px)", "@media (max-width: 820px)": space.x10 },
    gridTemplateColumns: {
      default: "minmax(0, 1.08fr) minmax(340px, 0.92fr)",
      "@media (max-width: 820px)": "1fr",
    },
    maxWidth: 1120,
    paddingBlock: {
      default: "clamp(64px, 3.1vw, 80px)",
      "@media (max-width: 620px)": space.x10,
    },
    paddingInline: {
      default: "clamp(64px, 3.1vw, 80px)",
      "@media (max-width: 620px)": space.x6,
    },
    width: "min(100%, 1120px)",
  },
  intro: { alignItems: "start", display: "flex", flexDirection: "column", minWidth: 0 },
  brand: {
    alignItems: "center",
    color: colors.text,
    display: "flex",
    fontSize: 15,
    fontWeight: 600,
    gap: 10,
    letterSpacing: "-0.01em",
    marginBottom: space.x10,
    textDecoration: "none",
  },
  title: {
    fontSize: {
      default: "clamp(48px, 5.2vw, 72px)",
      "@media (max-width: 620px)": 44,
      "@media (max-width: 390px)": 38,
    },
    fontWeight: 500,
    letterSpacing: "-0.055em",
    lineHeight: 0.98,
    margin: 0,
    maxWidth: 620,
    textWrap: "balance",
  },
  description: {
    color: "rgba(231, 229, 228, 0.72)",
    fontSize: { default: 18, "@media (max-width: 520px)": 16 },
    lineHeight: 1.55,
    marginBottom: space.x8,
    marginTop: space.x5,
    maxWidth: 590,
    textWrap: "balance",
  },
  actions: {
    alignItems: { default: "center", "@media (max-width: 520px)": "stretch" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 520px)": "column" },
    gap: space.x3,
    width: { default: "auto", "@media (max-width: 520px)": "100%" },
  },
  sandboxNote: {
    color: "rgba(231, 229, 228, 0.52)",
    fontSize: 11,
    lineHeight: 1.5,
    marginBottom: 0,
    marginTop: space.x3,
  },
  proof: {
    backgroundColor: "rgba(7, 9, 9, 0.44)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 16,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 0 rgba(255, 255, 255, 0.04) inset",
    minWidth: 0,
    overflow: "hidden",
  },
  proofHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(255, 255, 255, 0.09)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    fontSize: 12,
    gap: space.x3,
    justifyContent: "space-between",
    paddingBlock: space.x4,
    paddingInline: space.x5,
  },
  proofStatus: { color: "rgba(231, 229, 228, 0.60)", fontSize: 10, whiteSpace: "nowrap" },
  proofSteps: {
    display: "grid",
    gap: 0,
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  proofStep: {
    alignItems: "start",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "24px minmax(0, 1fr)",
    padding: space.x5,
  },
  proofStepNumber: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 999,
    borderStyle: "solid",
    borderWidth: 1,
    color: "rgba(231, 229, 228, 0.62)",
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 9,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  proofStepCopy: {
    color: "rgba(231, 229, 228, 0.58)",
    display: "grid",
    fontSize: 11,
    gap: 4,
    lineHeight: 1.5,
  },
  toolCall: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    display: "flex",
    flexWrap: "wrap",
    gap: space.x3,
    justifyContent: "space-between",
    paddingBlock: space.x3,
    paddingInline: space.x5,
  },
  boundary: {
    color: "rgba(231, 229, 228, 0.48)",
    fontSize: 10,
    lineHeight: 1.5,
    margin: 0,
    paddingBlock: space.x3,
    paddingInline: space.x5,
  },
});
