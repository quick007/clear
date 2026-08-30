import { StaticMeshGradient, type PaperShaderElement } from "@paper-design/shaders-react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

const shaderColors = ["#081415", "#54c4bd", "#c7f2e9", "#eef8f4", "#7baed1", "#d7a17a"];
const shaderPosition = 61;
const shaderWaveXShift = 0.18;
const shaderWaveYShift = 0.7;
const shaderCycleMillis = 60 * 1000; // 60 seconds
const shaderFrameMillis = 1000 / 15;

export function HomeAtmosphere() {
  const [supportsWebGl, setSupportsWebGl] = useState(false);
  const shaderRef = useRef<PaperShaderElement>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    setSupportsWebGl(context !== null);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  }, []);

  useEffect(() => {
    if (!supportsWebGl) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let lastFrameAt = 0;
    let startedAt = performance.now();

    const setBasePosition = () => {
      shaderRef.current?.paperShaderMount?.setUniforms({
        u_positions: shaderPosition,
        u_waveXShift: shaderWaveXShift,
        u_waveYShift: shaderWaveYShift,
      });
    };

    const renderFrame = (now: number) => {
      if (now - lastFrameAt >= shaderFrameMillis) {
        const phase = ((now - startedAt) / shaderCycleMillis) * Math.PI * 2;
        shaderRef.current?.paperShaderMount?.setUniforms({
          u_positions: shaderPosition + Math.sin(phase) * 0.08,
          u_waveXShift: shaderWaveXShift + Math.sin(phase * 0.8) * 0.006,
          u_waveYShift: shaderWaveYShift + Math.sin(phase * 0.65) * 0.005,
        });
        lastFrameAt = now;
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    const updateAnimation = () => {
      window.cancelAnimationFrame(animationFrame);
      setBasePosition();
      if (reducedMotion.matches) return;
      startedAt = performance.now();
      lastFrameAt = 0;
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    reducedMotion.addEventListener("change", updateAnimation);
    updateAnimation();
    return () => {
      reducedMotion.removeEventListener("change", updateAnimation);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [supportsWebGl]);

  return (
    <div aria-hidden {...stylex.props(styles.atmosphere)}>
      <div {...stylex.props(styles.shaderFrame)}>
        {supportsWebGl ? (
          <StaticMeshGradient
            ref={shaderRef}
            colors={shaderColors}
            grainMixer={0.28}
            grainOverlay={0.2}
            maxPixelCount={2_800_000}
            minPixelRatio={1}
            mixing={0.72}
            positions={shaderPosition}
            waveX={0.62}
            waveXShift={shaderWaveXShift}
            waveY={0.48}
            waveYShift={shaderWaveYShift}
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
    left: "50%",
    maskImage: "linear-gradient(to bottom, transparent 0%, #000 28%, #000 100%)",
    position: "absolute",
    transform: "translateX(-50%)",
    width: {
      default: "116%",
      "@media (min-width: 700px)": "max(116%, calc(78svh * 3.1))",
    },
    WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 28%, #000 100%)",
  },
  shader: {
    display: "block",
    filter: "saturate(0.92) contrast(1.03)",
    height: "100%",
    width: "100%",
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
