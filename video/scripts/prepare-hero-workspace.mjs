import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const sourceDirectory = resolve(repositoryRoot, "media/devpost/sources");
const codexReference = resolve(sourceDirectory, "codex-ui-reference.png");
const clearSource = resolve(sourceDirectory, "board-agent-pane.png");
const output = resolve(sourceDirectory, "hero-workspace.png");
const temporaryOutput = resolve(sourceDirectory, `.hero-workspace-${process.pid}.tmp.png`);

const workspaceWidth = 1920;
const workspaceHeight = 1080;
const topBarHeight = 50;
const codexWidth = 579;
const clearWidth = workspaceWidth - codexWidth;
const contentHeight = workspaceHeight - topBarHeight;

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

const headerPatch = Buffer.from(`
  <svg width="400" height="36" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="36" fill="#181818"/>
    <g fill="none" stroke="#9e9e9e" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="11" width="13" height="13" rx="3"/>
      <path d="M9 12v11"/>
      <path d="m37 22 2.5-8.5 6-2-2 6zM39.5 13.5l4 4"/>
      <path d="M77 13h6l2 2h10v9H77z"/>
    </g>
    <path d="M62 6v24" stroke="#303030"/>
    <text x="103" y="23" font-family=".SF NS, Helvetica Neue, sans-serif" font-size="14" font-weight="500" fill="#eeeeee">Checkout retry incident</text>
    <circle cx="255" cy="18" r="1.35" fill="#969696"/>
    <circle cx="261" cy="18" r="1.35" fill="#969696"/>
    <circle cx="267" cy="18" r="1.35" fill="#969696"/>
  </svg>
`);

const codexConversation = Buffer.from(`
  <svg width="${codexWidth}" height="${contentHeight}" viewBox="0 0 ${codexWidth} ${contentHeight}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .ui { font-family: ".SF NS", "Helvetica Neue", sans-serif; }
      .body { fill: #ededed; font-size: 17px; font-weight: 400; }
      .muted { fill: #9a9a9a; font-size: 15px; font-weight: 400; }
      .bubble { fill: #f3f6fb; font-size: 16px; font-weight: 400; }
      .mono { font-family: ".SF NS Mono", "SFMono-Regular", monospace; fill: #ededed; font-size: 14px; }
    </style>
    <rect width="${codexWidth}" height="${contentHeight}" fill="#181818"/>

    <text x="20" y="46" class="ui muted">Worked for 2m 18s  ›</text>
    <path d="M20 62H559" stroke="#303030"/>

    <rect x="180" y="82" width="379" height="116" rx="18" fill="#183e76"/>
    <text x="202" y="113" class="ui bubble">
      <tspan x="202">Requests tripled while traffic stayed flat.</tspan>
      <tspan x="202" dy="24">Find the cause in Clear and leave the</tspan>
      <tspan x="202" dy="24">evidence on the incident board.</tspan>
    </text>

    <text x="20" y="242" class="ui body">
      <tspan x="20">I’ll compare user demand with payment attempts, then</tspan>
      <tspan x="20" dy="25">inspect a failed checkout to verify the retry path.</tspan>
    </text>

    <text x="20" y="326" class="ui muted">Worked for 1m 47s  ›</text>
    <path d="M20 342H559" stroke="#303030"/>

    <text x="20" y="382" class="ui body">
      <tspan x="20">Root cause established: retry amplification, not a</tspan>
      <tspan x="20" dy="25">user surge.</tspan>
      <tspan x="34" dy="34">•</tspan><tspan x="58">Incoming traffic stayed at its healthy baseline.</tspan>
      <tspan x="34" dy="30">•</tspan><tspan x="58">Retries 1 and 2 each added one extra layer.</tspan>
      <tspan x="34" dy="30">•</tspan><tspan x="58">A failed trace shows three sequential attempts.</tspan>
      <tspan x="20" dy="39">The matching panels, trace, and logs are open in Clear.</tspan>
    </text>

    <rect x="219" y="626" width="340" height="72" rx="18" fill="#183e76"/>
    <text x="241" y="656" class="ui bubble">
      <tspan x="241">Are the retries actually sequential, or is</tspan>
      <tspan x="241" dy="24">the waterfall just grouped that way?</tspan>
    </text>

    <text x="20" y="746" class="ui body">
      <tspan x="20">They’re sequential. Attempt 2 starts when attempt 1</tspan>
      <tspan x="20" dy="25">ends, and attempt 3 starts when attempt 2 ends. The</tspan>
      <tspan x="20" dy="25">exhaustion log lands after the third attempt.</tspan>
    </text>

    <text x="20" y="844" class="ui muted">Worked for 24s  ›</text>
    <path d="M20 860H559" stroke="#303030"/>

    <rect x="18" y="882" width="543" height="126" rx="20" fill="#292929" stroke="#3a3a3a"/>
    <text x="34" y="916" class="ui muted" style="font-size:15px">Do anything</text>
    <circle cx="45" cy="978" r="16" fill="#343434"/>
    <path d="M39 978h12M45 972v12" stroke="#c8c8c8" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="83" cy="978" r="7" fill="none" stroke="#e47b38" stroke-width="1.5"/>
    <path d="M83 974v5M83 982v.5" stroke="#e47b38" stroke-width="1.3" stroke-linecap="round"/>
    <text x="390" y="983" class="ui muted">5.6 Sol High⌄</text>
    <g transform="translate(510 964)" stroke="#bdbdbd" fill="none" stroke-width="1.4" stroke-linecap="round">
      <rect x="5" y="1" width="8" height="13" rx="4"/>
      <path d="M2 10c0 5 14 5 14 0M9 17v4"/>
    </g>
    <circle cx="541" cy="978" r="17" fill="#31598f"/>
    <path d="m535 980 6-6 6 6M541 974v12" fill="none" stroke="#e2ecf8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`);

try {
  await Promise.all([
    requireSource(codexReference, "Codex UI reference"),
    requireSource(clearSource, "Clear board"),
  ]);
  await Promise.all([
    requireDimensions(codexReference, "Codex UI reference", 3456, 2006),
    requireDimensions(clearSource, "Clear board", 1310, 1024),
  ]);
  await mkdir(dirname(output), { recursive: true });

  const shell = await sharp(codexReference)
    .extract({ left: 0, top: 0, width: 3456, height: 1944 })
    .resize({ width: workspaceWidth, height: workspaceHeight, fit: "fill" })
    .png()
    .toBuffer();
  const clearPane = await sharp(clearSource)
    .resize({
      width: clearWidth,
      height: contentHeight,
      fit: "contain",
      position: "centre",
      background: "#080b0c",
    })
    .png()
    .toBuffer();

  await sharp(shell)
    .composite([
      { input: codexConversation, left: 0, top: topBarHeight },
      { input: headerPatch, left: 58, top: 7 },
      { input: clearPane, left: codexWidth, top: topBarHeight },
    ])
    .png()
    .toFile(temporaryOutput);

  await rename(temporaryOutput, output);
  console.log(`Prepared ${workspaceWidth}x${workspaceHeight} Codex-rooted workspace at ${output}`);
} catch (error) {
  await rm(temporaryOutput, { force: true }).catch(() => undefined);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to prepare hero workspace image: ${message}`);
  process.exitCode = 1;
}
