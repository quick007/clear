import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";
import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite-plus";
import { readConsoleConfig } from "./src/config";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode !== "test") readConsoleConfig(loadEnv(mode, appRoot, ""));

  return {
    plugins: [stylex.vite({ devMode: "full", useCSSLayers: true }), react(), sites(), cloudflare()],
    test: {
      environment: "jsdom",
    },
  };
});
