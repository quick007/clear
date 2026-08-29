import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";
import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [stylex.vite({ devMode: "full", useCSSLayers: true }), react(), sites(), cloudflare()],
  test: {
    environment: "jsdom",
  },
});
