import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const consoleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cloudflareWorker = resolve(consoleRoot, "dist/clear_console/index.js");
const sitesWorker = resolve(consoleRoot, "dist/server/index.js");

await mkdir(dirname(sitesWorker), { recursive: true });
await copyFile(cloudflareWorker, sitesWorker);
