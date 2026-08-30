import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const sourceDirectory = resolve(repositoryRoot, "media/devpost/sources");
const codexSource = resolve(sourceDirectory, "codex-workspace-reference.png");
const clearSource = resolve(sourceDirectory, "board-agent-top.png");
const output = resolve(sourceDirectory, "hero-workspace.png");
const temporaryOutput = resolve(sourceDirectory, `.hero-workspace-${process.pid}.tmp.png`);

const requireSource = async (path, label) => {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} source image is missing or unreadable: ${path}`);
  }
};

const renderPane = ({ source, crop, width }) =>
  sharp(source)
    .extract(crop)
    .resize(width, 1440, { fit: "cover", position: "north" })
    .png()
    .toBuffer();

const renderCodexPane = async () => {
  const [header, investigation] = await Promise.all([
    sharp(codexSource)
      .extract({ left: 0, top: 0, width: 810, height: 86 })
      .resize(768, 82, { fit: "fill" })
      .png()
      .toBuffer(),
    sharp(codexSource)
      .extract({ left: 0, top: 220, width: 810, height: 830 })
      .resize(768, 787, { fit: "fill" })
      .png()
      .toBuffer(),
  ]);

  return sharp({
    create: {
      width: 768,
      height: 1440,
      channels: 4,
      background: "#191919",
    },
  })
    .composite([
      { input: header, left: 0, top: 0 },
      { input: investigation, left: 0, top: 82 },
    ])
    .png()
    .toBuffer();
};

try {
  await Promise.all([
    requireSource(codexSource, "Codex workspace"),
    requireSource(clearSource, "Clear board"),
  ]);
  await mkdir(dirname(output), { recursive: true });

  const [codexPane, clearPane] = await Promise.all([
    renderCodexPane(),
    renderPane({
      source: clearSource,
      crop: { left: 0, top: 0, width: 1792, height: 1434 },
      width: 1792,
    }),
  ]);

  await sharp({
    create: {
      width: 2560,
      height: 1440,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      { input: codexPane, left: 0, top: 0 },
      { input: clearPane, left: 768, top: 0 },
    ])
    .png()
    .toFile(temporaryOutput);

  await rename(temporaryOutput, output);
  console.log(`Prepared 2560x1440 hero workspace image at ${output}`);
} catch (error) {
  await rm(temporaryOutput, { force: true }).catch(() => undefined);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to prepare hero workspace image: ${message}`);
  process.exitCode = 1;
}
