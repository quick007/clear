import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig(async ({ mode }) => {
  if (mode === "test") {
    return { plugins: [], test: { environment: "node", pool: "threads" } };
  }

  return {
    plugins: [
      stylex.vite({ devMode: "full", useCSSLayers: true }),
      react(),
      (await import("@openai/sites-vite-plugin")).sites(),
      (await import("@cloudflare/vite-plugin")).cloudflare(),
    ],
  };
});
