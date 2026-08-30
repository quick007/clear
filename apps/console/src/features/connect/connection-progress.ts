export type ConnectionStepStatus = "complete" | "current" | "upcoming";
export type ConnectionState =
  | "awaiting-signal"
  | "connected"
  | "not-started"
  | "previously-received-data";

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
  const connectionState: ConnectionState = hasActiveKey
    ? hasObservedSignal
      ? "connected"
      : "awaiting-signal"
    : hasObservedSignal
      ? "previously-received-data"
      : "not-started";
  const isConnected = connectionState === "connected";
  const nextStep = !hasActiveKey
    ? "create an ingest key"
    : !hasObservedSignal
      ? "point your exporter at Clear"
      : null;

  return {
    completedCount: [hasActiveKey, isConnected, isConnected].filter(Boolean).length,
    connectionState,
    exporterStatus: isConnected ? "complete" : hasActiveKey ? "current" : "upcoming",
    hasActiveKey,
    hasHealthySignal,
    hasObservedSignal,
    isConnected,
    keyStatus: hasActiveKey ? "complete" : "current",
    nextStep,
    signalStatus: isConnected ? "complete" : "upcoming",
  } satisfies {
    completedCount: number;
    connectionState: ConnectionState;
    exporterStatus: ConnectionStepStatus;
    hasActiveKey: boolean;
    hasHealthySignal: boolean;
    hasObservedSignal: boolean;
    isConnected: boolean;
    keyStatus: ConnectionStepStatus;
    nextStep: string | null;
    signalStatus: ConnectionStepStatus;
  };
}
