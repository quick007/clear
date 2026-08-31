import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite-plus";
import { readCheckoutConfig } from "./src/config";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(async ({ mode }) => {
  if (mode === "test") {
    return { plugins: [], test: { environment: "node", pool: "threads" } };
  }

  const environment = loadEnv(mode, appRoot, "");
  if (environment.VITE_CHECKOUT_API_URL !== undefined) {
    readCheckoutConfig(environment);
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
