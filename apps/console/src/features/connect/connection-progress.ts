export type ConnectionStepStatus = "complete" | "current" | "upcoming";

type SignalProgress<FirstSeen> = ReadonlyArray<{
  readonly firstSeenAt: FirstSeen | null;
  readonly status: "delayed" | "healthy" | "inactive";
}>;

export function deriveConnectionProgress<FirstSeen>({
  activeKeyCount,
  signalHealth,
}: {
  activeKeyCount: number;
  signalHealth: SignalProgress<FirstSeen>;
}) {
  const hasActiveKey = activeKeyCount > 0;
  const hasHealthySignal = signalHealth.some((signal) => signal.status === "healthy");
  const hasObservedSignal = signalHealth.some(
    (signal) => signal.firstSeenAt !== null || signal.status !== "inactive",
  );
  const nextStep = !hasActiveKey
    ? "create an ingest key"
    : !hasObservedSignal
      ? "point your exporter at Clear"
      : null;

  return {
    completedCount: [hasActiveKey, hasObservedSignal, hasObservedSignal].filter(Boolean).length,
    exporterStatus: hasObservedSignal ? "complete" : hasActiveKey ? "current" : "upcoming",
    hasActiveKey,
    hasHealthySignal,
    hasObservedSignal,
    keyStatus: hasActiveKey ? "complete" : "current",
    nextStep,
    signalStatus: hasObservedSignal ? "complete" : "upcoming",
  } satisfies {
    completedCount: number;
    exporterStatus: ConnectionStepStatus;
    hasActiveKey: boolean;
    hasHealthySignal: boolean;
    hasObservedSignal: boolean;
    keyStatus: ConnectionStepStatus;
    nextStep: string | null;
    signalStatus: ConnectionStepStatus;
  };
}
