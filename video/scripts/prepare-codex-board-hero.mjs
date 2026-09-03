import { rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const sourceDirectory = resolve(repositoryRoot, "media/devpost/sources");
const leftPaneWidth = 990;
const composerSourceTop = 1948;
const composerHeight = 222;
const composerTargetTop = 1720;

const compositions = [
  ["codex-board-fix.png", "codex-board-fix-hero.png"],
  ["codex-trace-investigation.png", "codex-trace-investigation-hero.png"],
];

const prepare = async ([inputName, outputName]) => {
  const input = resolve(sourceDirectory, inputName);
  const output = resolve(sourceDirectory, outputName);
  const temporaryOutput = resolve(sourceDirectory, `.${outputName}-${process.pid}.tmp.png`);
  const composer = await sharp(input)
    .extract({ left: 0, top: composerSourceTop, width: leftPaneWidth, height: composerHeight })
    .png()
    .toBuffer();

  try {
    await sharp(input)
      .composite([{ input: composer, left: 0, top: composerTargetTop }])
      .png({ compressionLevel: 9 })
      .toFile(temporaryOutput);
    await rename(temporaryOutput, output);
    console.log(`Prepared ${output}`);
  } catch (error) {
    await rm(temporaryOutput, { force: true });
    throw error;
  }
};

for (const composition of compositions) await prepare(composition);
