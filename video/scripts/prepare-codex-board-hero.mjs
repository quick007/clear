import { rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const sourceDirectory = resolve(repositoryRoot, "media/devpost/sources");
const input = resolve(sourceDirectory, "codex-board-fix.png");
const output = resolve(sourceDirectory, "codex-board-fix-hero.png");
const temporaryOutput = resolve(sourceDirectory, `.codex-board-fix-hero-${process.pid}.tmp.png`);

const leftPaneWidth = 990;
const cleanContentTop = 1710;
const composerSourceTop = 1948;
const composerHeight = 222;
const composerTargetTop = 1720;

try {
  const composer = await sharp(input)
    .extract({ left: 0, top: composerSourceTop, width: leftPaneWidth, height: composerHeight })
    .png()
    .toBuffer();
  const cleanBackground = {
    input: {
      create: {
        width: leftPaneWidth,
        height: 2170 - cleanContentTop,
        channels: 4,
        background: "#181818",
      },
    },
    left: 0,
    top: cleanContentTop,
  };

  await sharp(input)
    .composite([cleanBackground, { input: composer, left: 0, top: composerTargetTop }])
    .png({ compressionLevel: 9 })
    .toFile(temporaryOutput);
  await rename(temporaryOutput, output);
  console.log(`Prepared ${output}`);
} catch (error) {
  await rm(temporaryOutput, { force: true });
  throw error;
}
