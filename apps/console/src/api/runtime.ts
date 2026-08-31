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

export const forceSandboxForTab = (search: string, storage?: DemoModeStorage) => {
  const searchParams = new URLSearchParams(search);
  const requestedDemo = searchParams.get("demo") === "true";
  const requestedHosted = searchParams.get("hosted") === "true";
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

const browserExplicitlyRequestedDemo = () => {
  if (typeof window === "undefined") return false;
  try {
    return forceSandboxForTab(window.location.search, window.sessionStorage);
  } catch {
    return forceSandboxForTab(window.location.search);
  }
};

export const getConsoleRuntime = () => {
  runtime ??= (async () => {
    try {
      const api = await makeBrowserApiClient({ forceSandbox: browserExplicitlyRequestedDemo() });
      const sessions = await makeToolSessionSource(api);
      return { api, sessions };
    } catch (error) {
      runtime = null;
      Effect.runSync(reportConsoleFailure("Console runtime failed", error));
      throw normalizeConsoleFailure(error);
    }
  })();
  return runtime;
};
