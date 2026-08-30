import { Effect } from "effect";

import { makeBrowserApiClient, type BrowserApiClient } from "./client";
import { makeToolSessionSource, type ToolSessionSource } from "./session-source";
import { normalizeConsoleFailure, reportConsoleFailure } from "../errors";

export interface ConsoleRuntime {
  readonly api: BrowserApiClient;
  readonly sessions: ToolSessionSource;
}

let runtime: Promise<ConsoleRuntime> | null = null;

export const getConsoleRuntime = () => {
  runtime ??= (async () => {
    try {
      const api = await makeBrowserApiClient();
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
