import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const sourceDirectory = resolve(repositoryRoot, "media/devpost/sources");
const clearSource = resolve(sourceDirectory, "board-agent-pane.png");
const output = resolve(sourceDirectory, "hero-workspace.png");
const temporaryOutput = resolve(sourceDirectory, `.hero-workspace-${process.pid}.tmp.png`);

const workspaceWidth = 1920;
const workspaceHeight = 1080;
const codexWidth = 610;
const paneHeaderHeight = 56;
const clearWidth = workspaceWidth - codexWidth;

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

const codexPane = Buffer.from(`
  <svg width="${codexWidth}" height="${workspaceHeight}" viewBox="0 0 ${codexWidth} ${workspaceHeight}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .ui { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .title { fill: #f2f2f2; font-size: 14px; font-weight: 620; }
      .body { fill: #e9e9e9; font-size: 16px; font-weight: 430; }
      .muted { fill: #9b9b9b; font-size: 12px; }
      .tool-title { fill: #ededed; font-size: 13px; font-weight: 580; }
      .tool-detail { fill: #a6a6a6; font-size: 12px; }
    </style>
    <rect width="610" height="1080" fill="#181818"/>
    <rect x="0.5" y="0.5" width="609" height="55" fill="#1b1b1b" stroke="#303030"/>
    <circle cx="22" cy="28" r="5" fill="#ff5f57"/>
    <circle cx="40" cy="28" r="5" fill="#febc2e"/>
    <circle cx="58" cy="28" r="5" fill="#28c840"/>
    <text x="82" y="33" class="ui title">Checkout reliability investigation</text>
    <g transform="translate(542 18)" stroke="#9c9c9c" fill="none" stroke-width="1.5" stroke-linecap="round">
      <path d="M8 1v12M3.5 5.5 8 1l4.5 4.5M2 11v5h12v-5"/>
    </g>
    <circle cx="580" cy="28" r="2" fill="#9c9c9c"/><circle cx="586" cy="28" r="2" fill="#9c9c9c"/><circle cx="592" cy="28" r="2" fill="#9c9c9c"/>

    <rect x="108" y="88" width="462" height="126" rx="18" fill="#214a84"/>
    <text x="130" y="120" class="ui body">
      <tspan x="130" dy="0">Requests tripled, but users look flat. Test</tspan>
      <tspan x="130" dy="25">whether retries are creating the extra upstream</tspan>
      <tspan x="130" dy="25">load, and put the evidence on the Clear board.</tspan>
    </text>

    <text x="38" y="255" class="ui body">
      <tspan x="38" dy="0">I’ll compare demand with payment attempts, then</tspan>
      <tspan x="38" dy="24">verify one failed checkout.</tspan>
    </text>

    <g transform="translate(38 306)">
      <rect width="534" height="67" rx="11" fill="#202020" stroke="#343434"/>
      <rect x="14" y="14" width="38" height="38" rx="9" fill="#302a18"/>
      <circle cx="33" cy="33" r="9" fill="none" stroke="#f2b94b" stroke-width="1.5"/>
      <path d="M29 33h8M33 29v8" stroke="#f2b94b" stroke-width="1.5" stroke-linecap="round"/>
      <text x="66" y="28" class="ui tool-title">Clear · get_board_state</text>
      <text x="66" y="48" class="ui tool-detail">Board loaded · 1 firing alert · incident open</text>
      <circle cx="507" cy="33" r="10" fill="#17372d"/><path d="m502 33 3 3 6-7" fill="none" stroke="#68d5ae" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <g transform="translate(38 385)">
      <rect width="534" height="67" rx="11" fill="#202020" stroke="#343434"/>
      <rect x="14" y="14" width="38" height="38" rx="9" fill="#302a18"/>
      <path d="M24 43V29M32 43V35M40 43V25" stroke="#f2b94b" stroke-width="1.6" stroke-linecap="round"/>
      <text x="66" y="28" class="ui tool-title">Clear · create_panel</text>
      <text x="66" y="48" class="ui tool-detail">Upstream requests vs unique users · added to board</text>
      <circle cx="507" cy="33" r="10" fill="#17372d"/><path d="m502 33 3 3 6-7" fill="none" stroke="#68d5ae" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <text x="38" y="491" class="ui body">
      <tspan x="38">User demand stays at 1.0× while payment work</tspan>
      <tspan x="38" dy="24">rises to 3.1× its healthy baseline.</tspan>
    </text>

    <g transform="translate(38 538)">
      <rect width="534" height="67" rx="11" fill="#202020" stroke="#343434"/>
      <rect x="14" y="14" width="38" height="38" rx="9" fill="#302a18"/>
      <path d="M24 43V35M32 43V29M40 43V23" stroke="#f2b94b" stroke-width="1.6" stroke-linecap="round"/>
      <text x="66" y="28" class="ui tool-title">Clear · create_panel</text>
      <text x="66" y="48" class="ui tool-detail">Upstream requests by attempt · added to board</text>
      <circle cx="507" cy="33" r="10" fill="#17372d"/><path d="m502 33 3 3 6-7" fill="none" stroke="#68d5ae" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <g transform="translate(38 617)">
      <rect width="534" height="76" rx="11" fill="#202020" stroke="#343434"/>
      <rect x="14" y="19" width="38" height="38" rx="9" fill="#302a18"/>
      <path d="m24 38 6 6 12-14" fill="none" stroke="#f2b94b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="66" y="31" class="ui tool-title">Clear · set_hypothesis</text>
      <text x="66" y="51" class="ui tool-detail">Traffic surge rejected · Retry amplification confirmed</text>
      <circle cx="507" cy="38" r="10" fill="#17372d"/><path d="m502 38 3 3 6-7" fill="none" stroke="#68d5ae" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <text x="38" y="733" class="ui muted">Worked for 2m 26s</text>
    <path d="M38 749h534" stroke="#303030"/>
    <text x="38" y="784" class="ui body">
      <tspan x="38">Confirmed. The original attempt stays at baseline.</tspan>
      <tspan x="38" dy="25">Retry 1 and Retry 2 add two extra payment layers.</tspan>
      <tspan x="38" dy="25">I left both panels and the trace evidence on the board.</tspan>
    </text>

    <rect x="26" y="918" width="558" height="136" rx="18" fill="#242424" stroke="#3a3a3a"/>
    <text x="48" y="953" class="ui muted" style="font-size:14px">Ask a follow-up</text>
    <circle cx="54" cy="1023" r="12" fill="none" stroke="#aaa"/>
    <path d="M48 1023h12M54 1017v12" stroke="#aaa" stroke-width="1.5"/>
    <text x="418" y="1028" class="ui muted">5.6 Sol High</text>
    <circle cx="548" cy="1022" r="17" fill="#31598f"/>
    <path d="m542 1024 6-6 6 6M548 1018v12" fill="none" stroke="#dce9fb" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`);

const paneHeader = Buffer.from(`
  <svg width="${clearWidth}" height="${paneHeaderHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${clearWidth}" height="${paneHeaderHeight}" fill="#111315"/>
    <path d="M0 55.5h${clearWidth}" stroke="#2c3033"/>
    <circle cx="25" cy="28" r="8" fill="#1f2729" stroke="#5ec7b5"/>
    <path d="M21 29c3-6 7-7 9-5-1 5-4 8-9 7" fill="none" stroke="#78d9c6" stroke-width="1.4" stroke-linecap="round"/>
    <text x="45" y="33" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="620" fill="#f0f2f2">Clear</text>
    <rect x="104" y="12" width="470" height="32" rx="9" fill="#181b1d" stroke="#2c3033"/>
    <circle cx="124" cy="28" r="4" fill="#58c6aa"/>
    <text x="138" y="32" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12" fill="#abb2b5">clear.local/board</text>
    <rect x="${clearWidth - 92}" y="17" width="64" height="22" rx="11" fill="#17372d"/>
    <circle cx="${clearWidth - 76}" cy="28" r="3" fill="#65d6af"/>
    <text x="${clearWidth - 67}" y="32" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="11" fill="#92e6c7">Live</text>
  </svg>
`);

try {
  await requireSource(clearSource, "Clear board");
  await requireDimensions(clearSource, "Clear board", 1310, 1024);
  await mkdir(dirname(output), { recursive: true });

  await sharp({
    create: {
      width: workspaceWidth,
      height: workspaceHeight,
      channels: 4,
      background: "#111315",
    },
  })
    .composite([
      { input: codexPane, left: 0, top: 0 },
      { input: paneHeader, left: codexWidth, top: 0 },
      { input: clearSource, left: codexWidth, top: paneHeaderHeight },
      {
        input: Buffer.from(
          `<svg width="1" height="${workspaceHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="${workspaceHeight}" fill="#3a3d40"/></svg>`,
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
