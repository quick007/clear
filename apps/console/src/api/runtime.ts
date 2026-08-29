import { makeBrowserApiClient, type BrowserApiClient } from "./client";
import { makeToolSessionSource, type ToolSessionSource } from "./session-source";

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
      throw error;
    }
  })();
  return runtime;
};
