import {
  AlertId,
  DashboardId,
  DeployEventId,
  HypothesisId,
  IncidentId,
  PanelId,
  ProjectId,
  type SessionId,
  TimelineEntryId,
  UserId,
} from "@groundtruth/domain";
import { createHash } from "node:crypto";

export const sandboxUserId = UserId.make("01993f71-0001-7000-8000-000000000001");
export const sandboxProjectId = ProjectId.make("01993f71-0001-7000-8000-000000000002");
export const sandboxDashboardId = DashboardId.make("01993f71-0001-7000-8000-000000000003");
export const requestsPanelId = PanelId.make("01993f71-0001-7000-8000-000000000004");
export const latencyPanelId = PanelId.make("01993f71-0001-7000-8000-000000000005");
export const retriesPanelId = PanelId.make("01993f71-0001-7000-8000-000000000006");
export const sandboxIncidentId = IncidentId.make("01993f71-0001-7000-8000-000000000007");
export const retryAlertId = AlertId.make("01993f71-0001-7000-8000-000000000008");
export const surgeHypothesisId = HypothesisId.make("01993f71-0001-7000-8000-000000000009");
export const firstTimelineEntryId = TimelineEntryId.make("01993f71-0001-7000-8000-00000000000a");
export const recoveryDeployId = DeployEventId.make("01993f71-0001-7000-8000-00000000000b");

const sandboxProjectNamespace = "groundtruth/sandbox-project/v1";
const sandboxProjectPrefix = "00000000-0000-7";

export const sandboxProjectIdForSession = (sessionId: SessionId) => {
  const digest = createHash("sha256")
    .update(sandboxProjectNamespace)
    .update("\0")
    .update(String(sessionId))
    .digest("hex")
    .slice(0, 32);
  const variant = ((Number.parseInt(digest[3] ?? "0", 16) & 0b0011) | 0b1000).toString(16);
  const uuid = `${sandboxProjectPrefix}${digest.slice(0, 3)}-${variant}${digest.slice(4, 7)}-${digest.slice(7, 19)}`;
  return ProjectId.make(uuid);
};

export const isSandboxProjectId = (projectId: ProjectId) =>
  projectId === sandboxProjectId || String(projectId).startsWith(sandboxProjectPrefix);
