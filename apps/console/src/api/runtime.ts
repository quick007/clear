import { Effect } from "effect";

import { makeBrowserApiClient, type BrowserApiClient } from "./client";
import { makeToolSessionSource, type ToolSessionSource } from "./session-source";
import { normalizeConsoleFailure, reportConsoleFailure } from "../errors";

export interface ConsoleRuntime {
  readonly api: BrowserApiClient;
  readonly sessions: ToolSessionSource;
}

let runtime: Promise<ConsoleRuntime> | null = null;
const forceSandboxStorageKey = "groundtruth.forceSandbox";

interface DemoModeStorage {
  readonly getItem: (key: string) => string | null;
  readonly removeItem: (key: string) => void;
  readonly setItem: (key: string, value: string) => void;
}

export const explicitDemoRequested = (search: string) =>
  new URLSearchParams(search).get("demo") === "true";

export const explicitHostedRequested = (search: string) =>
  new URLSearchParams(search).get("hosted") === "true";

export const forceSandboxForTab = (search: string, storage?: DemoModeStorage) => {
  const searchParams = new URLSearchParams(search);
  const requestedDemo = searchParams.get("demo") === "true";
  const requestedHosted = explicitHostedRequested(search);
  try {
    if (requestedHosted) {
      storage?.removeItem(forceSandboxStorageKey);
      return false;
    }
    if (requestedDemo) storage?.setItem(forceSandboxStorageKey, "true");
    return requestedDemo || storage?.getItem(forceSandboxStorageKey) === "true";
  } catch {
    return requestedDemo && !requestedHosted;
  }
};

export const sandboxRequestedForTab = (
  search: string,
  sandboxSessionId: string | null,
  storage?: DemoModeStorage,
) =>
  !explicitHostedRequested(search) &&
  (forceSandboxForTab(search, storage) || sandboxSessionId !== null);

const browserSandboxRequested = (sandboxSessionId: string | null) => {
  if (typeof window === "undefined") return sandboxSessionId !== null;
  try {
    return sandboxRequestedForTab(window.location.search, sandboxSessionId, window.sessionStorage);
  } catch {
    return sandboxRequestedForTab(window.location.search, sandboxSessionId);
  }
};

export const getConsoleRuntime = () => {
  runtime ??= (async () => {
    try {
      const api = await makeBrowserApiClient();
      const demoRequested = browserSandboxRequested(api.access.get().sandboxSessionId);
      if (typeof window !== "undefined" && explicitHostedRequested(window.location.search)) {
        api.access.setSandboxSessionId(null);
      }
      const sessions = await makeToolSessionSource(api, { demoRequested });
      return { api, sessions };
    } catch (error) {
      runtime = null;
      Effect.runSync(reportConsoleFailure("Console runtime failed", error));
      throw normalizeConsoleFailure(error);
    }
  })();
  return runtime;
};
