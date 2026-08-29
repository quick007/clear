import { StaticMeshGradient } from "@paper-design/shaders-react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

const shaderColors = ["#081415", "#54c4bd", "#c7f2e9", "#eef8f4", "#7baed1", "#d7a17a"];

const shaderDrift = stylex.keyframes({
  "0%": { transform: "translate3d(-1.2%, 0.7%, 0) scale(1.06)" },
  "45%": { transform: "translate3d(0.9%, -0.6%, 0) scale(1.075)" },
  "100%": { transform: "translate3d(1.3%, 0.5%, 0) scale(1.06)" },
});

export function HomeAtmosphere() {
  const [supportsWebGl, setSupportsWebGl] = useState(false);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    setSupportsWebGl(context !== null);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  }, []);

  return (
    <div aria-hidden {...stylex.props(styles.atmosphere)}>
      <div {...stylex.props(styles.shaderFrame)}>
        {supportsWebGl ? (
          <StaticMeshGradient
            colors={shaderColors}
            grainMixer={0.28}
            grainOverlay={0.2}
            maxPixelCount={1_800_000}
            minPixelRatio={1}
            mixing={0.72}
            positions={61}
            waveX={0.62}
            waveXShift={0.18}
            waveY={0.48}
            waveYShift={0.7}
            width="100%"
            height="100%"
            {...stylex.props(styles.shader)}
          />
        ) : null}
      </div>
      <span {...stylex.props(styles.topFade)} />
      <span {...stylex.props(styles.vignette)} />
      <span {...stylex.props(styles.paper)} />
    </div>
  );
}

const styles = stylex.create({
  atmosphere: {
    backgroundColor: "#070909",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
  },
  shaderFrame: {
    backgroundImage:
      "radial-gradient(circle at 52% 68%, #d8f4ed 0, #6abdbb 24%, #497a8e 45%, #121c1d 74%, #070909 100%)",
    bottom: "-10%",
    height: "78%",
    left: "-8%",
    maskImage: "linear-gradient(to bottom, transparent 0%, #000 28%, #000 100%)",
    position: "absolute",
    right: "-8%",
    WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 28%, #000 100%)",
  },
  shader: {
    animationDuration: "30s",
    animationIterationCount: "infinite",
    animationName: shaderDrift,
    animationTimingFunction: "ease-in-out",
    display: "block",
    filter: "saturate(0.92) contrast(1.03)",
    height: "100%",
    transformOrigin: "50% 62%",
    willChange: "transform",
    width: "100%",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
      transform: "none",
      willChange: "auto",
    },
  },
  topFade: {
    backgroundImage:
      "linear-gradient(to bottom, #070909 0%, rgba(7, 9, 9, 0.98) 22%, rgba(7, 9, 9, 0.66) 48%, rgba(7, 9, 9, 0.12) 72%, rgba(7, 9, 9, 0.32) 100%)",
    inset: 0,
    position: "absolute",
  },
  vignette: {
    backgroundImage:
      "radial-gradient(ellipse at 50% 68%, transparent 24%, rgba(5, 7, 7, 0.24) 63%, rgba(5, 7, 7, 0.78) 100%)",
    inset: 0,
    position: "absolute",
  },
  paper: {
    backgroundImage:
      "radial-gradient(circle at 25% 35%, rgba(255,255,255,0.045) 0 0.6px, transparent 0.8px), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.06) 0 0.6px, transparent 0.8px)",
    backgroundSize: "5px 5px, 7px 7px",
    inset: 0,
    mixBlendMode: "soft-light",
    opacity: 0.36,
    position: "absolute",
  },
});
