import type { SessionMode } from "../api/session-source";
import { compactIncident, compactMutation, incidentWasCompacted } from "./compact";
import type { GroundtruthToolOperations } from "./operations";
import { AddTimelineNoteInput, CloseIncidentInput, SetHypothesisInput } from "./schemas";
import { tool } from "./tool-contract";

const closeIncidentGuidance = (mode: SessionMode) =>
  mode === "sandbox"
    ? {
        description:
          "Closes the currently open incident with an evidence-based summary. Use after reviewing the relevant evidence and establishing the root cause. The sandbox has no remediation step, so visible recovery is not required.",
        failureHint:
          "Establish the root cause from the available evidence and provide a non-empty summary.",
      }
    : {
        description:
          "Closes the currently open incident with an evidence-based summary. Use after establishing the root cause. If remediation occurred, confirm that recovery is visible in current telemetry before closing.",
        failureHint:
          "Establish the root cause, confirm visible recovery when remediation occurred, and provide a non-empty summary.",
      };

export const makeIncidentTools = (operations: GroundtruthToolOperations, mode: SessionMode) => {
  const closeGuidance = closeIncidentGuidance(mode);
  return [
    tool({
      name: "add_timeline_note",
      title: "Add timeline note",
      description:
        "Adds a concise investigation note to the currently open incident timeline. Record evidence or a decision, not hidden reasoning.",
      input: AddTimelineNoteInput,
      readOnly: false,
      returnsUntrustedContent: true,
      invoke: operations.addTimelineNote,
      format: compactMutation,
      successHint: "Continue testing the current hypothesis with telemetry evidence.",
      failureHint: "Confirm an incident is open and provide a non-empty note.",
    }),
    tool({
      name: "set_hypothesis",
      title: "Set incident hypothesis",
      description:
        "Creates or updates a root-cause hypothesis on the currently open incident. Mark it proposed, testing, rejected, or confirmed as evidence changes.",
      input: SetHypothesisInput,
      readOnly: false,
      returnsUntrustedContent: true,
      invoke: operations.setHypothesis,
      format: compactMutation,
      successHint: "Query the telemetry needed to prove or reject this hypothesis.",
      failureHint: "Confirm an incident is open and use a current hypothesis ID when updating one.",
    }),
    tool({
      name: "close_incident",
      title: "Close incident",
      description: closeGuidance.description,
      input: CloseIncidentInput,
      readOnly: false,
      returnsUntrustedContent: true,
      invoke: operations.closeIncident,
      afterSuccess: (_, signal) => operations.refreshSession(signal),
      format: compactIncident,
      resultOptions: (incident) => ({ truncated: incidentWasCompacted(incident) }),
      successHint: "The incident-scoped tools are now unavailable until another incident opens.",
      failureHint: closeGuidance.failureHint,
    }),
  ] as const;
};
