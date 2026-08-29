import { Effect } from "effect";
import {
  repositoryConflict,
  repositoryQuotaExceeded,
  type RepositoryConflict,
  type RepositoryQuotaExceeded,
} from "../errors.ts";
import {
  IncidentHistoryLimits,
  incidentTextIsWithinLimit,
} from "../repositories/incident-policy.ts";

export type IncidentMutationResult<Value> =
  | { readonly _tag: "success"; readonly value: Value }
  | { readonly _tag: "incident-not-open" }
  | { readonly _tag: "timeline-quota"; readonly limit: number; readonly observed: number }
  | { readonly _tag: "hypothesis-quota"; readonly limit: number; readonly observed: number };

type IncidentMutationFailure = Exclude<IncidentMutationResult<never>, { readonly _tag: "success" }>;

export const incidentNotOpen = (): IncidentMutationFailure => ({ _tag: "incident-not-open" });

export const incidentTimelineQuota = (
  limit: number,
  observed: number,
): IncidentMutationFailure => ({ _tag: "timeline-quota", limit, observed });

export const incidentHypothesisQuota = (
  limit: number,
  observed: number,
): IncidentMutationFailure => ({ _tag: "hypothesis-quota", limit, observed });

export const incidentMutationSuccess = <Value>(value: Value): IncidentMutationResult<Value> => ({
  _tag: "success",
  value,
});

export const resolveIncidentMutation = <Value>(
  result: IncidentMutationResult<Value>,
): Effect.Effect<Value, RepositoryConflict | RepositoryQuotaExceeded> => {
  switch (result._tag) {
    case "success":
      return Effect.succeed(result.value);
    case "incident-not-open":
      return Effect.fail(repositoryConflict("incident-not-open"));
    case "timeline-quota":
      return Effect.fail(
        repositoryQuotaExceeded("incident-timeline", result.limit, result.observed),
      );
    case "hypothesis-quota":
      return Effect.fail(
        repositoryQuotaExceeded("incident-hypotheses", result.limit, result.observed),
      );
  }
};

export const validateIncidentText = (text: string) =>
  incidentTextIsWithinLimit(text)
    ? Effect.void
    : Effect.fail(
        repositoryQuotaExceeded(
          "incident-text",
          IncidentHistoryLimits.textCodePoints,
          Array.from(text).length,
        ),
      );
