import { compactIncident, compactMutation, incidentWasCompacted } from "./compact";
import type { GroundtruthToolOperations } from "./operations";
import { AddTimelineNoteInput, CloseIncidentInput, SetHypothesisInput } from "./schemas";
import { tool } from "./tool-contract";

export const makeIncidentTools = (operations: GroundtruthToolOperations) =>
  [
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
      description:
        "Closes the currently open incident with an evidence-based summary. Use only after recovery is visible and the root cause is established.",
      input: CloseIncidentInput,
      readOnly: false,
      returnsUntrustedContent: true,
      invoke: operations.closeIncident,
      afterSuccess: () => operations.refreshSession(),
      format: compactIncident,
      resultOptions: (incident) => ({ truncated: incidentWasCompacted(incident) }),
      successHint: "The incident-scoped tools are now unavailable until another incident opens.",
      failureHint: "Confirm recovery with current telemetry and provide a non-empty summary.",
    }),
  ] as const;
