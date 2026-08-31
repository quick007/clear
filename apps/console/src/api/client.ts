import { GroundtruthAccess, GroundtruthApi } from "@groundtruth/api-contract";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";
import { getConsoleConfig } from "../config";
import { normalizeConsoleEffect } from "../errors";

export type GroundtruthClient = HttpApiClient.ForApi<typeof GroundtruthApi>;

export interface AccessState {
  readonly sandboxSessionId: string | null;
}

export interface BrowserApiClient {
  readonly client: GroundtruthClient;
  readonly access: {
    readonly get: () => AccessState;
    readonly setSandboxSessionId: (sessionId: string | null) => void;
  };
  readonly run: <A, E>(effect: Effect.Effect<A, E>, signal?: AbortSignal) => Promise<A>;
}

interface SessionStorage {
  readonly getItem: (key: string) => string | null;
  readonly removeItem: (key: string) => void;
  readonly setItem: (key: string, value: string) => void;
}

const sandboxSessionStorageKey = "groundtruth.sandboxSessionId";

const browserSessionStorage = (): SessionStorage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

const storedSandboxSessionId = (storage: SessionStorage | null) => {
  try {
    const sessionId = storage?.getItem(sandboxSessionStorageKey)?.trim();
    return sessionId === undefined || sessionId.length === 0 ? null : sessionId;
  } catch {
    return null;
  }
};

const persistSandboxSessionId = (storage: SessionStorage | null, sessionId: string | null) => {
  try {
    if (sessionId === null) storage?.removeItem(sandboxSessionStorageKey);
    else storage?.setItem(sandboxSessionStorageKey, sessionId);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

export const makeBrowserApiClient = async (
  options: {
    readonly baseUrl?: string;
    readonly forceSandbox?: boolean;
    readonly sessionStorage?: SessionStorage | null;
  } = {},
): Promise<BrowserApiClient> => {
  const sessionStorage =
    options.sessionStorage === undefined ? browserSessionStorage() : options.sessionStorage;
  let accessState: AccessState = {
    sandboxSessionId: storedSandboxSessionId(sessionStorage),
  };

  const accessLayer = HttpApiMiddleware.layerClient(GroundtruthAccess, ({ request, next }) => {
    const sessionId = accessState.sandboxSessionId;
    return next(
      sessionId === null
        ? request
        : HttpClientRequest.setHeader(request, "x-groundtruth-sandbox-session", sessionId),
    );
  });

  const clientLayer = Layer.mergeAll(FetchHttpClient.layer, accessLayer);
  const requestInitLayer = Layer.succeed(FetchHttpClient.RequestInit, {
    credentials: options.forceSandbox === true ? "omit" : "include",
  });
  const baseUrl =
    options.baseUrl ??
    (await Effect.runPromise(
      Effect.sync(() => getConsoleConfig().apiOrigin).pipe(
        normalizeConsoleEffect("Console configuration failed"),
      ),
    ));

  const client = await Effect.runPromise(
    HttpApiClient.make(GroundtruthApi, {
      baseUrl,
    }).pipe(normalizeConsoleEffect("API client setup failed"), Effect.provide(clientLayer)),
  );

  return {
    client,
    access: {
      get: () => accessState,
      setSandboxSessionId: (sandboxSessionId) => {
        accessState = { sandboxSessionId };
        persistSandboxSessionId(sessionStorage, sandboxSessionId);
      },
    },
    run: (effect, signal) =>
      Effect.runPromise(
        effect.pipe(normalizeConsoleEffect("API request failed"), Effect.provide(requestInitLayer)),
        { signal },
      ),
  };
};
