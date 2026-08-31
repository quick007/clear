import type { PanelSpec } from "@groundtruth/panel-dsl";

export type InvestigationStage =
  | "baseline"
  | "orient"
  | "challenge"
  | "evidence"
  | "diagnosed"
  | "recovering"
  | "recovered"
  | "reviewed";

export const investigationJourneyPosition = (stage: InvestigationStage) =>
  ({
    baseline: 0,
    orient: 0,
    challenge: 1,
    evidence: 2,
    diagnosed: 3,
    recovering: 4,
    recovered: 4,
    reviewed: 4,
  })[stage];

type HypothesisState = "proposed" | "testing" | "rejected" | "confirmed";

type InvestigationHypothesis = {
  readonly status: HypothesisState;
  readonly text: string;
};

type InvestigationPanel = {
  readonly spec: PanelSpec;
};

const trafficConcepts = new Set(["traffic", "surge", "spike"]);
const retryConcepts = new Set([
  "amplification",
  "amplified",
  "amplifies",
  "reattempt",
  "reattempts",
  "retried",
  "retries",
  "retry",
]);

const words = (text: string) => text.toLocaleLowerCase().split(/[^a-z0-9]+/u);

const describesConcept = (text: string, concepts: ReadonlySet<string>) =>
  words(text).some((word) => concepts.has(word));

const queriesForPanel = (spec: PanelSpec) => (spec._tag === "stat" ? [spec.query] : spec.queries);

export const isRequestsVersusUsersPanel = ({ spec }: InvestigationPanel) => {
  const queries = queriesForPanel(spec);
  const hasRequestVolume = queries.some(
    (query) => query.metric.endsWith(".requests") && query.aggregation !== "count-distinct",
  );
  const hasUniqueUsers = queries.some(
    (query) => query.aggregation === "count-distinct" && query.distinctKey === "user.id",
  );
  return hasRequestVolume && hasUniqueUsers;
};

export const isAttemptsGroupedRetryPanel = ({ spec }: InvestigationPanel) =>
  queriesForPanel(spec).some(
    (query) =>
      query.metric === "upstream.client.requests" &&
      query.groupBy?.attributes.some((attribute) => attribute === "attempt") === true,
  );

const isTrafficHypothesis = (hypothesis: InvestigationHypothesis) =>
  describesConcept(hypothesis.text, trafficConcepts);

const isRetryHypothesis = (hypothesis: InvestigationHypothesis) =>
  describesConcept(hypothesis.text, retryConcepts);

export function investigationStage({
  hasClosedIncident,
  hasDeployEvent = false,
  hasFiringAlert = false,
  hasOpenIncident,
  hypotheses,
  panels,
}: {
  hasClosedIncident: boolean;
  hasDeployEvent?: boolean;
  hasFiringAlert?: boolean;
  hasOpenIncident: boolean;
  hypotheses: ReadonlyArray<InvestigationHypothesis>;
  panels: ReadonlyArray<InvestigationPanel>;
}): InvestigationStage {
  if (!hasOpenIncident) return hasClosedIncident ? "reviewed" : "baseline";
  if (hasDeployEvent) return hasFiringAlert ? "recovering" : "recovered";

  const hasRequestsVersusUsers = panels.some(isRequestsVersusUsersPanel);
  const hasAttemptsGroupedRetries = panels.some(isAttemptsGroupedRetryPanel);
  const hasRejectedTrafficHypothesis = hypotheses.some(
    (hypothesis) => hypothesis.status === "rejected" && isTrafficHypothesis(hypothesis),
  );
  const hasConfirmedRetryHypothesis = hypotheses.some(
    (hypothesis) => hypothesis.status === "confirmed" && isRetryHypothesis(hypothesis),
  );

  if (hasAttemptsGroupedRetries && hasConfirmedRetryHypothesis) {
    return "diagnosed";
  }
  if (hasRequestsVersusUsers && hasRejectedTrafficHypothesis) return "evidence";
  if (
    hypotheses.some(
      (hypothesis) =>
        (hypothesis.status === "proposed" || hypothesis.status === "testing") &&
        isTrafficHypothesis(hypothesis),
    )
  ) {
    return "challenge";
  }
  return "orient";
}
