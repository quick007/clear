import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const sourceDirectory = resolve(repositoryRoot, "media/devpost/sources");
const codexShellSource = resolve(sourceDirectory, "codex-ui-reference.png");
const codexBrowserSource = resolve(sourceDirectory, "codex-workspace-reference.png");
const codexConversationOverlay = resolve(sourceDirectory, "codex-conversation-overlay.png");
const clearSource = resolve(sourceDirectory, "board-agent-pane.png");
const output = resolve(sourceDirectory, "hero-workspace.png");
const temporaryOutput = resolve(sourceDirectory, `.hero-workspace-${process.pid}.tmp.png`);

const workspaceWidth = 1920;
const workspaceHeight = 1080;
const codexConversation = {
  left: 0,
  top: 0,
  width: 579,
  height: 899,
};
const codexComposer = {
  sourceLeft: 32,
  sourceTop: 1766,
  sourceWidth: 747,
  sourceHeight: 205,
  targetLeft: 19,
  targetTop: 899,
  targetWidth: 541,
  targetHeight: 171,
};
const browserPane = {
  sourceLeft: 537,
  targetLeft: 579,
  width: 1341,
  height: 1080,
};
const browserViewport = {
  left: browserPane.targetLeft,
  top: 109,
  width: browserPane.width,
  height: 971,
};
const browserTabCleanup = {
  left: 796,
  top: 0,
  width: 1019,
  height: 55,
};
const browserAddTab = {
  sourceLeft: 1086,
  sourceTop: 0,
  width: 40,
  height: 55,
  targetLeft: 812,
  targetTop: 0,
};

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

try {
  await Promise.all([
    requireSource(codexShellSource, "Codex shell"),
    requireSource(codexBrowserSource, "Codex browser"),
    requireSource(codexConversationOverlay, "Codex conversation overlay"),
    requireSource(clearSource, "Clear board"),
  ]);
  await Promise.all([
    requireDimensions(codexShellSource, "Codex shell", 3456, 2006),
    requireDimensions(codexBrowserSource, "Codex browser", 2902, 2002),
    requireDimensions(
      codexConversationOverlay,
      "Codex conversation overlay",
      codexConversation.width,
      codexConversation.height,
    ),
    requireDimensions(clearSource, "Clear board", 1310, 1024),
  ]);
  await mkdir(dirname(output), { recursive: true });

  const codexShell = await sharp(codexShellSource)
    .resize({
      width: workspaceWidth,
      height: workspaceHeight,
      fit: "fill",
    })
    .png()
    .toBuffer();
  const codexComposerPane = await sharp(codexBrowserSource)
    .extract({
      left: codexComposer.sourceLeft,
      top: codexComposer.sourceTop,
      width: codexComposer.sourceWidth,
      height: codexComposer.sourceHeight,
    })
    .resize({
      width: codexComposer.targetWidth,
      height: codexComposer.targetHeight,
      fit: "fill",
    })
    .png()
    .toBuffer();
  const codexBrowser = await sharp(codexBrowserSource)
    .resize({
      width: workspaceWidth,
      height: workspaceHeight,
      fit: "cover",
      position: "north",
    })
    .extract({
      left: browserPane.sourceLeft,
      top: 0,
      width: browserPane.width,
      height: browserPane.height,
    })
    .png()
    .toBuffer();
  const addTabControl = await sharp(codexBrowser)
    .extract({
      left: browserAddTab.sourceLeft,
      top: browserAddTab.sourceTop,
      width: browserAddTab.width,
      height: browserAddTab.height,
    })
    .png()
    .toBuffer();
  const cleanTabStrip = await sharp({
    create: {
      width: browserTabCleanup.width,
      height: browserTabCleanup.height,
      channels: 4,
      background: "#181818",
    },
  })
    .png()
    .toBuffer();
  const clearPane = await sharp(clearSource)
    .resize({
      width: browserViewport.width,
      height: browserViewport.height,
      fit: "cover",
      position: "north",
    })
    .png()
    .toBuffer();

  await sharp(codexShell)
    .composite([
      { input: codexBrowser, left: browserPane.targetLeft, top: 0 },
      {
        input: cleanTabStrip,
        left: browserTabCleanup.left,
        top: browserTabCleanup.top,
      },
      {
        input: addTabControl,
        left: browserAddTab.targetLeft,
        top: browserAddTab.targetTop,
      },
      { input: clearPane, left: browserViewport.left, top: browserViewport.top },
      {
        input: codexConversationOverlay,
        left: codexConversation.left,
        top: codexConversation.top,
      },
      {
        input: codexComposerPane,
        left: codexComposer.targetLeft,
        top: codexComposer.targetTop,
      },
    ])
    .png()
    .toFile(temporaryOutput);

  await rename(temporaryOutput, output);
  console.log(
    `Prepared ${workspaceWidth}x${workspaceHeight} selectively composited Codex workspace at ${output}`,
  );
} catch (error) {
  await rm(temporaryOutput, { force: true }).catch(() => undefined);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to prepare hero workspace image: ${message}`);
  process.exitCode = 1;
}
