import { describe, expect, it } from "vite-plus/test";

import { deriveConnectionProgress } from "./connection-progress";

const inactiveSignals = [
  { firstSeenAt: null, status: "inactive" as const },
  { firstSeenAt: null, status: "inactive" as const },
  { firstSeenAt: null, status: "inactive" as const },
];

describe("connection progress", () => {
  it("starts with the ingest key as the only current step", () => {
    expect(deriveConnectionProgress({ activeKeyCount: 0, signalHealth: inactiveSignals })).toEqual(
      expect.objectContaining({
        completedCount: 0,
        exporterStatus: "upcoming",
        keyStatus: "current",
        nextStep: "create an ingest key",
        signalStatus: "upcoming",
      }),
    );
  });

  it("resumes at exporter setup when an active key already exists", () => {
    expect(deriveConnectionProgress({ activeKeyCount: 1, signalHealth: inactiveSignals })).toEqual(
      expect.objectContaining({
        completedCount: 1,
        exporterStatus: "current",
        keyStatus: "complete",
        nextStep: "point your exporter at Clear",
        signalStatus: "upcoming",
      }),
    );
  });

  it("keeps setup complete when previously received telemetry becomes delayed", () => {
    const progress = deriveConnectionProgress({
      activeKeyCount: 1,
      signalHealth: [
        { firstSeenAt: "2026-08-29T10:00:00Z", status: "delayed" },
        ...inactiveSignals.slice(1),
      ],
    });

    expect(progress).toEqual(
      expect.objectContaining({
        completedCount: 3,
        connectionState: "connected",
        exporterStatus: "complete",
        hasHealthySignal: false,
        isConnected: true,
        nextStep: null,
        signalStatus: "complete",
      }),
    );
  });

  it("marks setup ready as soon as any signal is healthy", () => {
    const progress = deriveConnectionProgress({
      activeKeyCount: 1,
      signalHealth: [
        { firstSeenAt: "2026-08-29T10:00:00Z", status: "healthy" },
        ...inactiveSignals.slice(1),
      ],
    });

    expect(progress).toEqual(
      expect.objectContaining({
        completedCount: 3,
        connectionState: "connected",
        hasHealthySignal: true,
        isConnected: true,
        nextStep: null,
        signalStatus: "complete",
      }),
    );
  });

  it("preserves previous data without claiming a revoked project is connected", () => {
    const progress = deriveConnectionProgress({
      activeKeyCount: 0,
      signalHealth: [
        { firstSeenAt: "2026-08-29T10:00:00Z", status: "delayed" },
        ...inactiveSignals.slice(1),
      ],
    });

    expect(progress).toEqual(
      expect.objectContaining({
        completedCount: 0,
        connectionState: "previously-received-data",
        exporterStatus: "upcoming",
        hasObservedSignal: true,
        isConnected: false,
        keyStatus: "current",
        nextStep: "create an ingest key",
        signalStatus: "upcoming",
      }),
    );
  });

  it("does not report a fresh historical signal as connected without an active key", () => {
    const progress = deriveConnectionProgress({
      activeKeyCount: 0,
      signalHealth: [
        { firstSeenAt: "2026-08-29T10:00:00Z", status: "healthy" },
        ...inactiveSignals.slice(1),
      ],
    });

    expect(progress.connectionState).toBe("previously-received-data");
    expect(progress.hasHealthySignal).toBe(true);
    expect(progress.isConnected).toBe(false);
  });
});
