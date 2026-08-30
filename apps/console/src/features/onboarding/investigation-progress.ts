export type InvestigationStage =
  | "baseline"
  | "orient"
  | "challenge"
  | "evidence"
  | "diagnosed"
  | "reviewed";

type HypothesisState = "proposed" | "testing" | "rejected" | "confirmed";

export function investigationStage({
  hasClosedIncident,
  hasOpenIncident,
  hypotheses,
  panelCount,
}: {
  hasClosedIncident: boolean;
  hasOpenIncident: boolean;
  hypotheses: ReadonlyArray<{ readonly status: HypothesisState; readonly text: string }>;
  panelCount: number;
}): InvestigationStage {
  if (!hasOpenIncident) return hasClosedIncident ? "reviewed" : "baseline";
  if (
    hypotheses.some(
      (hypothesis) =>
        hypothesis.status === "confirmed" && /amplif|reattempt|retr(y|ies)/i.test(hypothesis.text),
    )
  ) {
    return "diagnosed";
  }
  if (panelCount >= 3 || hypotheses.some((hypothesis) => hypothesis.status === "rejected")) {
    return "evidence";
  }
  if (
    hypotheses.some(
      (hypothesis) => hypothesis.status === "proposed" || hypothesis.status === "testing",
    )
  ) {
    return "challenge";
  }
  return "orient";
}
