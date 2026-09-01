import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const sourceDirectory = resolve(repositoryRoot, "media/devpost/sources");
const codexPromptSource = resolve(sourceDirectory, "codex-agent.png");
const codexResponseSource = resolve(sourceDirectory, "codex-workspace-reference.png");
const clearSource = resolve(sourceDirectory, "board-diagnosis-v2.png");
const output = resolve(sourceDirectory, "hero-workspace.png");
const temporaryOutput = resolve(sourceDirectory, `.hero-workspace-${process.pid}.tmp.png`);

const workspaceWidth = 2500;
const workspaceHeight = 1200;
const codexWidth = 950;
const clearWidth = 1550;

const requireSource = async (path, label) => {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} source image is missing or unreadable: ${path}`);
  }
};

const requireDimensions = async (path, label, expectedWidth, expectedHeight) => {
  const metadata = await sharp(path).metadata();
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    throw new Error(
      `${label} must be ${expectedWidth}x${expectedHeight}, got ${metadata.width ?? "unknown"}x${metadata.height ?? "unknown"}`,
    );
  }
};

const renderCodexPane = async () => {
  const prompt = await sharp(codexPromptSource)
    .extract({ left: 0, top: 85, width: 1264, height: 315 })
    .resize({ width: codexWidth })
    .png()
    .toBuffer();
  const responses = await Promise.all(
    [
      { top: 220, height: 210 },
      { top: 520, height: 140 },
      { top: 650, height: 260 },
    ].map(({ top, height }) =>
      sharp(codexResponseSource)
        .extract({ left: 0, top, width: 810, height })
        .resize({ width: codexWidth })
        .png()
        .toBuffer(),
    ),
  );

  return sharp({
    create: {
      width: codexWidth,
      height: workspaceHeight,
      channels: 4,
      background: "#191919",
    },
  })
    .composite([
      { input: prompt, left: 0, top: 0 },
      { input: responses[0], left: 0, top: 310 },
      { input: responses[1], left: 0, top: 560 },
      { input: responses[2], left: 0, top: 750 },
    ])
    .png()
    .toBuffer();
};

const renderClearPane = () =>
  sharp(clearSource)
    .extract({ left: 300, top: 0, width: 1388, height: 1074 })
    .resize(clearWidth, workspaceHeight, { fit: "fill" })
    .png()
    .toBuffer();

try {
  await Promise.all([
    requireSource(codexPromptSource, "Codex prompt"),
    requireSource(codexResponseSource, "Codex response"),
    requireSource(clearSource, "Clear board"),
  ]);
  await Promise.all([
    requireDimensions(codexPromptSource, "Codex prompt", 2560, 1440),
    requireDimensions(codexResponseSource, "Codex response", 2902, 2002),
    requireDimensions(clearSource, "Clear board", 1910, 1074),
  ]);
  await mkdir(dirname(output), { recursive: true });

  const [codexPane, clearPane] = await Promise.all([renderCodexPane(), renderClearPane()]);

  await sharp({
    create: {
      width: workspaceWidth,
      height: workspaceHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      { input: codexPane, left: 0, top: 0 },
      { input: clearPane, left: codexWidth, top: 0 },
      {
        input: Buffer.from(
          `<svg width="1" height="${workspaceHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="${workspaceHeight}" fill="rgba(255,255,255,0.12)"/></svg>`,
        ),
        left: codexWidth,
        top: 0,
      },
    ])
    .png()
    .toFile(temporaryOutput);

  await rename(temporaryOutput, output);
  console.log(`Prepared ${workspaceWidth}x${workspaceHeight} hero workspace image at ${output}`);
} catch (error) {
  await rm(temporaryOutput, { force: true }).catch(() => undefined);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to prepare hero workspace image: ${message}`);
  process.exitCode = 1;
}
