import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const resultsPath = resolve(repositoryRoot, "video/benchmarks/webmcp-vs-grafana-results.json");
const outputPath = resolve(repositoryRoot, "media/devpost/sources/benchmark-card.png");

const results = JSON.parse(await readFile(resultsPath, "utf8"));
const clearSteps = results.workflow.clearPanelCreation.webMcpCalls;
const grafanaSteps = results.workflow.grafanaPanelCreation.documentedSteps;
const clearMedian = results.clear.persistedPanelUpdate.medianMs;
const grafanaMedian = results.grafana.persistedPanelUpdate.medianMs;
const clearBytes = results.clear.query.requestBytes;
const grafanaBytes = results.grafana.query.requestBytes;
const latencyRatio = grafanaMedian / clearMedian;
const byteReduction = Math.round((1 - clearBytes / grafanaBytes) * 100);

const chartStart = 285;
const chartWidth = 690;
const clearWidth = Math.max(22, (clearSteps / grafanaSteps) * chartWidth);

const svg = String.raw`<svg width="1620" height="911" viewBox="0 0 1620 911" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="1620" y2="911" gradientUnits="userSpaceOnUse">
      <stop stop-color="#101617"/>
      <stop offset="0.58" stop-color="#0b0f10"/>
      <stop offset="1" stop-color="#090c0d"/>
    </linearGradient>
    <linearGradient id="clearBar" x1="285" y1="0" x2="975" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7bd4c6"/>
      <stop offset="1" stop-color="#39a894"/>
    </linearGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>
  <rect width="1620" height="911" fill="url(#panel)"/>
  <path d="M0 0H1620V911H0Z" fill="none" stroke="#ffffff" stroke-opacity="0.045"/>

  <g transform="translate(72 54)">
    <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="10.25" fill="none" stroke="#d9e3e1" stroke-opacity="0.48" stroke-width="1.5"/>
    <path d="M9 24c3-7.5 8.2-11.3 15.6-11.3H28" fill="none" stroke="#e8efed" stroke-linecap="round" stroke-width="2.25"/>
    <circle cx="28" cy="12.7" r="2.8" fill="#7bd4c6"/>
    <text x="50" y="28" fill="#f2f5f4" font-family="Helvetica, Arial, sans-serif" font-size="27" font-weight="600">Clear</text>
    <text x="128" y="28" fill="#899694" font-family="Helvetica, Arial, sans-serif" font-size="18">workflow benchmark</text>
  </g>

  <text x="72" y="164" fill="#f4f6f5" font-family="Helvetica, Arial, sans-serif" font-size="62" font-weight="600" letter-spacing="-1.8">One typed call replaces an</text>
  <text x="72" y="232" fill="#7bd4c6" font-family="Helvetica, Arial, sans-serif" font-size="62" font-weight="600" letter-spacing="-1.8">18-step workflow</text>
  <text x="74" y="282" fill="#9da8a6" font-family="Helvetica, Arial, sans-serif" font-size="21">From agent instruction to a persisted dashboard update</text>

  <g transform="translate(72 344)">
    <rect width="992" height="363" rx="16" fill="#111617" stroke="#ffffff" stroke-opacity="0.075"/>
    <text x="36" y="48" fill="#edf1f0" font-family="Helvetica, Arial, sans-serif" font-size="23" font-weight="600">Interactions to create a new panel</text>
    <text x="36" y="76" fill="#87918f" font-family="Helvetica, Arial, sans-serif" font-size="16">The same finished dashboard change, counted from the user’s request</text>

    <g stroke="#ffffff" stroke-opacity="0.07">
      <line x1="213" y1="111" x2="213" y2="296"/>
      <line x1="443" y1="111" x2="443" y2="296"/>
      <line x1="673" y1="111" x2="673" y2="296"/>
      <line x1="903" y1="111" x2="903" y2="296"/>
    </g>
    <g fill="#66716f" font-family="Menlo, Monaco, monospace" font-size="13">
      <text x="209" y="323">0</text>
      <text x="438" y="323">6</text>
      <text x="664" y="323">12</text>
      <text x="893" y="323">18</text>
    </g>

    <text x="36" y="155" fill="#e8edec" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="600">Clear WebMCP</text>
    <text x="36" y="179" fill="#7b8785" font-family="Helvetica, Arial, sans-serif" font-size="14">typed tool call</text>
    <rect x="213" y="132" width="${clearWidth}" height="54" rx="9" fill="#55bfad" opacity="0.25" filter="url(#glow)"/>
    <rect x="213" y="132" width="${clearWidth}" height="54" rx="9" fill="url(#clearBar)"/>
    <text x="${chartStart - 72 + clearWidth + 18}" y="169" fill="#a9e1d8" font-family="Menlo, Monaco, monospace" font-size="22" font-weight="700">${clearSteps}</text>

    <text x="36" y="246" fill="#e8edec" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="600">Grafana 13.2</text>
    <text x="36" y="270" fill="#7b8785" font-family="Helvetica, Arial, sans-serif" font-size="14">documented UI steps</text>
    <rect x="213" y="223" width="${chartWidth}" height="54" rx="9" fill="#596361"/>
    <text x="920" y="260" fill="#f1f4f3" font-family="Menlo, Monaco, monospace" font-size="22" font-weight="700">${grafanaSteps}</text>
  </g>

  <g transform="translate(1092 344)">
    <rect width="456" height="363" rx="16" fill="#111617" stroke="#ffffff" stroke-opacity="0.075"/>
    <text x="34" y="48" fill="#8d9896" font-family="Helvetica, Arial, sans-serif" font-size="17">What else changed</text>

    <text x="34" y="112" fill="#f4f6f5" font-family="Helvetica, Arial, sans-serif" font-size="48" font-weight="600" letter-spacing="-1">${byteReduction}% smaller</text>
    <text x="34" y="145" fill="#a1aaa8" font-family="Helvetica, Arial, sans-serif" font-size="17">metric-query request body</text>
    <text x="34" y="174" fill="#75817f" font-family="Menlo, Monaco, monospace" font-size="14">${clearBytes} B vs ${grafanaBytes} B</text>

    <line x1="34" y1="206" x2="422" y2="206" stroke="#ffffff" stroke-opacity="0.08"/>

    <text x="34" y="270" fill="#f4f6f5" font-family="Helvetica, Arial, sans-serif" font-size="48" font-weight="600" letter-spacing="-1">${Math.round(latencyRatio)}× faster</text>
    <text x="34" y="303" fill="#a1aaa8" font-family="Helvetica, Arial, sans-serif" font-size="17">median persisted panel update</text>
  </g>

  <g transform="translate(72 758)">
    <line x1="0" y1="0" x2="1476" y2="0" stroke="#ffffff" stroke-opacity="0.09"/>
    <text x="0" y="45" fill="#b7c0be" font-family="Helvetica, Arial, sans-serif" font-size="17">${results.environment.iterations} measured iterations · ${results.environment.warmups} warmups · localhost HTTP</text>
    <text x="0" y="78" fill="#707c7a" font-family="Helvetica, Arial, sans-serif" font-size="15">Grafana step count follows its official Create dashboards workflow · Latency measures persistence acknowledgement, not browser paint</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(outputPath);
console.log(`Prepared benchmark card: ${outputPath}`);
