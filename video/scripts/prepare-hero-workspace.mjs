import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const sourceDirectory = resolve(repositoryRoot, "media/devpost/sources");
const codexSource = resolve(sourceDirectory, "codex-workspace-reference.png");
const clearSource = resolve(sourceDirectory, "board-agent-pane.png");
const output = resolve(sourceDirectory, "hero-workspace.png");
const temporaryOutput = resolve(sourceDirectory, `.hero-workspace-${process.pid}.tmp.png`);

const workspaceWidth = 2500;
const workspaceHeight = 1200;
const codexWidth = 700;
const clearWidth = 1800;

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
  const [header, investigation, composer] = await Promise.all([
    sharp(codexSource)
      .extract({ left: 0, top: 0, width: 810, height: 86 })
      .resize(codexWidth, 74, { fit: "fill" })
      .png()
      .toBuffer(),
    sharp(codexSource)
      .extract({ left: 0, top: 220, width: 810, height: 830 })
      .resize(codexWidth, 717, { fit: "fill" })
      .png()
      .toBuffer(),
    sharp(codexSource)
      .extract({ left: 0, top: 1745, width: 810, height: 257 })
      .resize(codexWidth, 222, { fit: "fill" })
      .png()
      .toBuffer(),
  ]);

  return sharp({
    create: {
      width: codexWidth,
      height: workspaceHeight,
      channels: 4,
      background: "#191919",
    },
  })
    .composite([
      { input: header, left: 0, top: 0 },
      { input: investigation, left: 0, top: 74 },
      { input: composer, left: 0, top: 978 },
    ])
    .png()
    .toBuffer();
};

try {
  await Promise.all([
    requireSource(codexSource, "Codex workspace"),
    requireSource(clearSource, "Clear board"),
  ]);
  await requireDimensions(clearSource, "Clear board", clearWidth, workspaceHeight);
  await mkdir(dirname(output), { recursive: true });

  const [codexPane, clearPane] = await Promise.all([
    renderCodexPane(),
    sharp(clearSource).png().toBuffer(),
  ]);

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
