import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const source = resolve(repositoryRoot, "apps/checkout-api");
const destinationArgument = process.argv[2];

if (!destinationArgument) {
  console.error("Usage: vp exec node video/scripts/prepare-shoot-workspace.mjs <empty-directory>");
  process.exit(1);
}

const destination = resolve(destinationArgument);
await mkdir(destination, { recursive: false }).catch((error) => {
  if (error.code !== "EEXIST") throw error;
});

const entries = await import("node:fs/promises").then(({ readdir }) => readdir(destination));
if (entries.length > 0) {
  console.error(`Refusing to write into non-empty directory: ${destination}`);
  process.exit(1);
}

await cp(source, destination, {
  recursive: true,
  filter: (path) => !path.includes("/node_modules") && !path.includes("/dist"),
});

const packagePath = resolve(destination, "package.json");
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
packageJson.name = "groundtruth-checkout-shoot";
packageJson.private = true;
packageJson.devDependencies = {
  "@effect/vitest": "4.0.0-beta.107",
  "@types/node": "^24",
  tsx: "4.23.12",
  typescript: "^7.0.2",
  "vite-plus": "0.3.0",
  vitest: "4.1.11",
};
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

const tsconfigPath = resolve(destination, "tsconfig.json");
await writeFile(
  tsconfigPath,
  `${JSON.stringify(
    {
      compilerOptions: {
        allowImportingTsExtensions: true,
        esModuleInterop: true,
        module: "nodenext",
        moduleResolution: "nodenext",
        noEmit: true,
        noUncheckedIndexedAccess: true,
        rootDir: "src",
        skipLibCheck: true,
        strict: true,
        types: ["node"],
      },
      include: ["src/**/*.ts"],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

await writeFile(
  resolve(destination, ".gitignore"),
  [".env", "dist/", "node_modules/", "*.log", ""].join("\n"),
  "utf8",
);

await writeFile(
  resolve(destination, "pnpm-workspace.yaml"),
  ["allowBuilds:", "  esbuild: true", "  msgpackr-extract: false", "  protobufjs: false", ""].join(
    "\n",
  ),
  "utf8",
);

await writeFile(
  resolve(destination, "AGENTS.md"),
  [
    "# Checkout API",
    "",
    "Use Vite Plus commands through `vp`.",
    "Keep the service on Effect v4 and preserve its OpenTelemetry instrumentation.",
    "Keep changes focused and test the retry behavior before reporting completion.",
    "Do not use em dashes.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`Prepared checkout-only shoot workspace at ${destination}`);
