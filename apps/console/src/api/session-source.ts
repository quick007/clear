import type { SessionView } from "@groundtruth/api-contract";
import type { Incident, ProjectId, SessionId } from "@groundtruth/domain";
import { Effect } from "effect";
import { ConsoleNoActiveProject, normalizeConsoleFailure } from "../errors";
import type { BrowserApiClient } from "./client";

export type SessionMode = "sandbox" | "hosted";

export interface ToolSessionSnapshot {
  readonly projectId: ProjectId;
  readonly mode: SessionMode;
  readonly incident: Incident | null;
}

export interface ToolSessionSource {
  readonly getSnapshot: () => ToolSessionSnapshot;
  readonly refresh: (signal?: AbortSignal) => Promise<ToolSessionSnapshot>;
  readonly subscribe: (listener: (snapshot: ToolSessionSnapshot) => void) => () => void;
}

const activeProject = (session: SessionView) => {
  const projectId = session.activeProjectId ?? session.projects[0]?.id;
  if (projectId === undefined || projectId === null) {
    return Effect.fail(new ConsoleNoActiveProject());
  }
  return Effect.succeed(projectId);
};

const sessionMode = (session: SessionView): SessionMode => {
  if (session.session._tag === "sandbox") return "sandbox";
  return "hosted";
};

const apiRequest = <A>(request: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({
    try: request,
    catch: normalizeConsoleFailure,
  });

const loadSession = (api: BrowserApiClient) =>
  apiRequest((signal) => api.run(api.client.auth.getSession({}), signal));

const createSandbox = (api: BrowserApiClient) =>
  Effect.gen(function* () {
    const state = yield* apiRequest((signal) =>
      api.run(api.client.sandbox.createSession({}), signal),
    );
    yield* Effect.sync(() => api.access.setSandboxSessionId(state.session.id));
    return yield* loadSession(api);
  });

const bootstrapSession = (api: BrowserApiClient, demoRequested: boolean) => {
  if (demoRequested && api.access.get().sandboxSessionId === null) return createSandbox(api);
  return loadSession(api).pipe(
    Effect.catchTag("ConsoleAuthenticationRequired", () => createSandbox(api)),
  );
};

const loadOverview = (api: BrowserApiClient, projectId: ProjectId) =>
  apiRequest((signal) =>
    api.run(api.client.overview.getOverview({ params: { projectId } }), signal),
  );

const loadSnapshot = (api: BrowserApiClient, demoRequested: boolean) =>
  Effect.gen(function* () {
    const session = yield* bootstrapSession(api, demoRequested);
    const projectId = yield* activeProject(session);
    const overview = yield* loadOverview(api, projectId);
    return {
      projectId,
      mode: sessionMode(session),
      incident: overview.openIncident,
    } satisfies ToolSessionSnapshot;
  });

export const makeToolSessionSource = async (
  api: BrowserApiClient,
  options: { readonly demoRequested?: boolean } = {},
  signal?: AbortSignal,
): Promise<ToolSessionSource> => {
  const demoRequested = options.demoRequested === true;
  let snapshot = await Effect.runPromise(loadSnapshot(api, demoRequested), { signal });
  const listeners = new Set<(next: ToolSessionSnapshot) => void>();

  return {
    getSnapshot: () => snapshot,
    refresh: async (refreshSignal) => {
      snapshot = await Effect.runPromise(loadSnapshot(api, demoRequested), {
        signal: refreshSignal,
      });
      listeners.forEach((listener) => listener(snapshot));
      return snapshot;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export const seedSandboxAccess = (api: BrowserApiClient, sessionId: SessionId) => {
  api.access.setSandboxSessionId(sessionId);
};
