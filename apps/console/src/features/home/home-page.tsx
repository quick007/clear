import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { colors, space } from "../../theme/tokens.stylex";
import { buttonStyles, buttonToneStyles } from "../../ui/button";
import { ClearMark } from "../../ui/clear-mark";
import { Icon } from "../../ui/icon";
import { HomeAtmosphere } from "./home-atmosphere";

const loginHref = "/auth/chatgpt?returnPath=%2Fconnect";

export function HomePage() {
  return (
    <div {...stylex.props(styles.page)}>
      <HomeAtmosphere />

      <main {...stylex.props(styles.main)}>
        <section {...stylex.props(styles.hero)}>
          <a aria-label="Clear home" href="/" {...stylex.props(styles.brand)}>
            <ClearMark />
            <span>Clear</span>
          </a>

          <h1 {...stylex.props(styles.title)}>See clearly.</h1>
          <p {...stylex.props(styles.description)}>
            OpenTelemetry for you and the agent that knows your code.
          </p>

          <div {...stylex.props(styles.actions)}>
            <Link
              search={{ start: true }}
              to="/board"
              {...stylex.props(buttonStyles.button, buttonToneStyles.primary, buttonStyles.large)}
            >
              Demo incident
              <Icon icon={ArrowRight01Icon} size={17} />
            </Link>
            <a
              href={loginHref}
              {...stylex.props(buttonStyles.button, buttonToneStyles.secondary, buttonStyles.large)}
            >
              Log in
            </a>
          </div>
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
    overflow: "hidden",
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
    backdropFilter: "blur(4px) saturate(105%)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: { default: 28, "@media (max-width: 520px)": 22 },
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 32px 100px rgba(0, 0, 0, 0.18)",
    display: "flex",
    flexDirection: "column",
    maxWidth: "clamp(680px, 32vw, 820px)",
    paddingBlock: {
      default: "clamp(64px, 3.1vw, 80px)",
      "@media (max-width: 620px)": space.x10,
    },
    paddingInline: {
      default: "clamp(64px, 3.1vw, 80px)",
      "@media (max-width: 620px)": space.x6,
    },
    textAlign: "center",
    width: "100%",
  },
  brand: {
    alignItems: "center",
    color: colors.text,
    display: "flex",
    fontSize: 15,
    fontWeight: 600,
    gap: 10,
    letterSpacing: "-0.01em",
    marginBottom: space.x8,
    textDecoration: "none",
  },
  title: {
    fontSize: {
      default: "clamp(72px, 3.2vw, 84px)",
      "@media (max-width: 620px)": 52,
      "@media (max-width: 390px)": 44,
    },
    fontWeight: 500,
    letterSpacing: "-0.06em",
    lineHeight: 0.96,
    margin: 0,
    textWrap: "balance",
  },
  description: {
    color: "rgba(231, 229, 228, 0.72)",
    fontSize: { default: 18, "@media (max-width: 520px)": 16 },
    lineHeight: 1.55,
    marginBottom: space.x8,
    marginTop: space.x5,
    maxWidth: 450,
    textWrap: "balance",
  },
  actions: {
    alignItems: { default: "center", "@media (max-width: 460px)": "stretch" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 460px)": "column" },
    gap: space.x3,
    justifyContent: "center",
    width: { default: "auto", "@media (max-width: 460px)": "100%" },
  },
});
