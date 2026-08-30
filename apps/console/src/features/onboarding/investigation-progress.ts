export type InvestigationStage = "baseline" | "orient" | "challenge" | "evidence" | "diagnosed";

type HypothesisState = "proposed" | "testing" | "rejected" | "confirmed";

export function investigationStage({
  hasOpenIncident,
  hypotheses,
  panelCount,
}: {
  hasOpenIncident: boolean;
  hypotheses: ReadonlyArray<{ readonly status: HypothesisState }>;
  panelCount: number;
}): InvestigationStage {
  if (!hasOpenIncident) return "baseline";
  if (hypotheses.some((hypothesis) => hypothesis.status === "confirmed")) return "diagnosed";
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
