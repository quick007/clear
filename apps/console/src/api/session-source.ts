import type { ConsoleOverview, SessionView } from "@groundtruth/api-contract";
import type { Incident, ProjectId, SessionId } from "@groundtruth/domain";
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
    throw new Error("The current session has no active Clear project");
  }
  return projectId;
};

const sessionMode = (session: SessionView): SessionMode => {
  if (session.session._tag === "sandbox") return "sandbox";
  return "hosted";
};

const loadSession = (api: BrowserApiClient, signal?: AbortSignal) =>
  api.run(api.client.auth.getSession({}), signal);

const createSandbox = async (api: BrowserApiClient, signal?: AbortSignal) => {
  const state = await api.run(api.client.sandbox.createSession({}), signal);
  api.access.setSandboxSessionId(state.session.id);
  return loadSession(api, signal);
};

const bootstrapSession = async (api: BrowserApiClient, signal?: AbortSignal) => {
  try {
    return await loadSession(api, signal);
  } catch {
    return createSandbox(api, signal);
  }
};

const loadOverview = (
  api: BrowserApiClient,
  projectId: ProjectId,
  signal?: AbortSignal,
): Promise<ConsoleOverview> =>
  api.run(api.client.overview.getOverview({ params: { projectId } }), signal);

export const makeToolSessionSource = async (
  api: BrowserApiClient,
  signal?: AbortSignal,
): Promise<ToolSessionSource> => {
  const session = await bootstrapSession(api, signal);
  const projectId = activeProject(session);
  const overview = await loadOverview(api, projectId, signal);
  let snapshot: ToolSessionSnapshot = {
    projectId,
    mode: sessionMode(session),
    incident: overview.openIncident,
  };
  const listeners = new Set<(next: ToolSessionSnapshot) => void>();

  return {
    getSnapshot: () => snapshot,
    refresh: async (refreshSignal) => {
      const refreshedSession = await bootstrapSession(api, refreshSignal);
      const refreshedProjectId = activeProject(refreshedSession);
      const refreshedOverview = await loadOverview(api, refreshedProjectId, refreshSignal);
      snapshot = {
        projectId: refreshedProjectId,
        mode: sessionMode(refreshedSession),
        incident: refreshedOverview.openIncident,
      };
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
