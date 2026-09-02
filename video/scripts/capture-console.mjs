import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    if (separator === -1) throw new Error(`Expected --name=value, received ${argument}`);
    return [argument.slice(2, separator), argument.slice(separator + 1)];
  }),
);

const required = (name) => {
  const value = args[name];
  if (value === undefined || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
};

const width = Number(required("width"));
const height = Number(required("height"));
const targetUrl = required("url");
const output = resolve(repositoryRoot, required("output"));
const sessionId = required("session");
const waitForText = args["wait-for"] ?? "Checkout operations";
const minimumCanvasCount = Number(args["min-canvases"] ?? 2);

if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320) {
  throw new Error(`Invalid viewport ${width}x${height}`);
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const waitForFile = async (path, timeoutMilliseconds) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
};

const userDataDirectory = await mkdtemp(resolve(tmpdir(), "clear-media-capture-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--hide-scrollbars",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDirectory}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let socket;
let nextRequestId = 0;
const pending = new Map();

const send = (method, params = {}) =>
  new Promise((resolveSend, rejectSend) => {
    const id = ++nextRequestId;
    pending.set(id, { resolve: resolveSend, reject: rejectSend });
    socket.send(JSON.stringify({ id, method, params }));
  });

const evaluate = (expression, awaitPromise = true) =>
  send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  }).then((response) => {
    if (response.exceptionDetails !== undefined) {
      throw new Error(response.exceptionDetails.text ?? "Page evaluation failed");
    }
    return response.result?.value;
  });

try {
  const activePort = await waitForFile(resolve(userDataDirectory, "DevToolsActivePort"), 10_000);
  const [port] = activePort.trim().split("\n");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === "page");
  if (page?.webSocketDebuggerUrl === undefined) throw new Error("Chrome page target was not found");

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) return;
    const request = pending.get(message.id);
    if (request === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await Promise.all([send("Page.enable"), send("Runtime.enable")]);
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      sessionStorage.setItem("groundtruth.sandboxSessionId", ${JSON.stringify(sessionId)});
      sessionStorage.setItem("groundtruth.forceSandbox", "true");
    `,
  });
  await send("Page.navigate", { url: targetUrl });

  await evaluate(`
    new Promise((resolveReady, rejectReady) => {
      const startedAt = Date.now();
      const timer = setInterval(async () => {
        const hasText = document.body?.innerText.includes(${JSON.stringify(waitForText)}) ?? false;
        const chartsReady = document.querySelectorAll("canvas").length >= ${minimumCanvasCount};
        if (hasText && chartsReady) {
          clearInterval(timer);
          await document.fonts.ready;
          requestAnimationFrame(() => requestAnimationFrame(() => resolveReady(true)));
        } else if (Date.now() - startedAt > 30_000) {
          clearInterval(timer);
          rejectReady(new Error("Timed out waiting for the board to render"));
        }
      }, 100);
    })
  `);
  await delay(1_000);

  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(output, Buffer.from(screenshot.data, "base64"));
  console.log(`Captured ${width}x${height} console image at ${output}`);
} finally {
  socket?.close();
  const chromeExited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
  chrome.kill("SIGTERM");
  await Promise.race([chromeExited, delay(2_000)]);
  await rm(userDataDirectory, { recursive: true, force: true });
}
