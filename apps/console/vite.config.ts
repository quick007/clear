import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";
import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite-plus";
import { readConsoleConfig } from "./src/config";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode !== "test") {
    const environment = loadEnv(mode, appRoot, "");
    if (
      environment.VITE_CLEAR_OTLP_ENDPOINT !== undefined ||
      environment.VITE_GROUNDTRUTH_API_URL !== undefined
    ) {
      readConsoleConfig(environment);
    }
  }

  return {
    plugins: [
      stylex.vite({ devMode: "full", useCSSLayers: true }),
      react(),
      sites(),
      cloudflare({ viteEnvironment: { name: "server" } }),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    test: {
      environment: "jsdom",
    },
  };
});
