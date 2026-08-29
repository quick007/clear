import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { evaluateAcceptance, measureRequests } from "./analysis.ts";
import { TelemetryBatch } from "./domain/telemetry.ts";
import { makeTelemetryGenerator, makeTelemetryGeneratorFixture } from "./engine.ts";
import { makeBucketProfile } from "./profile.ts";

const scenario = {
  seed: "acceptance-seed",
  startedAt: 1_788_000_000_000,
  tracesPerBucket: 4,
};

describe("telemetry generator", () => {
  it.effect("makes the retry amplification reveal a measurable invariant", () =>
    Effect.gen(function* () {
      const generator = yield* makeTelemetryGenerator(scenario);
      const baseline = yield* generator.advance(30); // 5 minutes

      yield* generator.triggerIncident;
      const blip = yield* generator.advance(6); // 1 minute
      expect(blip.every((batch) => batch.phase === "P1")).toBe(true);

      const incidentState = yield* generator.state;
      expect(incidentState.phase).toBe("P2");

      const amplification = yield* generator.advance(30); // 5 minutes
      const report = evaluateAcceptance(baseline, amplification);

      expect(report.upstreamRequestRatio).toBeCloseTo(3, 8);
      expect(report.amplification.incomingRequests / report.baseline.incomingRequests).toBeCloseTo(
        1,
        8,
      );
      expect(report.uniqueUserRatio).toBeGreaterThanOrEqual(0.9);
      expect(report.uniqueUserRatio).toBeLessThanOrEqual(1.1);
      expect(report.upstreamRetryShare).toBeGreaterThan(0.55);
      expect(report).toMatchObject({
        upstreamRequestsTripled: true,
        usersStayedFlat: true,
        retriesDominate: true,
        passed: true,
      });
    }),
  );

  it.effect("replays byte-equivalent telemetry for the same seed and clock", () =>
    Effect.gen(function* () {
      const left = yield* makeTelemetryGenerator(scenario);
      const right = yield* makeTelemetryGenerator(scenario);

      yield* left.triggerIncident;
      yield* right.triggerIncident;
      const leftBatches = yield* left.advance(8);
      const rightBatches = yield* right.advance(8);
      const encode = Schema.encodeUnknownSync(Schema.Array(TelemetryBatch));

      expect(encode(leftBatches)).toStrictEqual(encode(rightBatches));
    }),
  );

  it.effect("emits coherent metrics, logs, and trace retry attempts", () =>
    Effect.gen(function* () {
      const generator = yield* makeTelemetryGenerator(scenario);
      yield* generator.triggerIncident;
      yield* generator.advance(6);
      const batch = yield* generator.next;

      expect(batch.phase).toBe("P2");
      expect(batch.logs.some((log) => log.severity === "error")).toBe(true);
      expect(batch.traces).toHaveLength(scenario.tracesPerBucket);
      expect(batch.traces.every((trace) => trace.spans.length === 8)).toBe(true);
      expect(
        batch.traces.every((trace) => new Set(trace.spans.map((span) => span.service)).size === 3),
      ).toBe(true);
      expect(
        batch.metrics.some(
          (point) =>
            point._tag === "Sum" &&
            point.metric === "upstream.client.requests" &&
            point.attributes.retry === "true",
        ),
      ).toBe(true);
      expect(
        batch.metrics.some(
          (point) =>
            point._tag === "Sum" &&
            point.metric === "http.server.requests" &&
            point.attributes.retry === "true",
        ),
      ).toBe(false);
      expect(
        batch.alerts.find(({ alertId }) => alertId === "checkout-upstream-request-rate"),
      ).toMatchObject({
        metric: "upstream.client.requests",
        name: "Payment request rate",
      });

      const decoded = yield* Schema.decodeUnknownEffect(TelemetryBatch)(batch);
      expect(decoded.sequence).toBe(batch.sequence);
    }),
  );

  it.effect("annotates a deploy, resolves alerts, and returns toward baseline", () =>
    Effect.gen(function* () {
      const generator = yield* makeTelemetryGeneratorFixture(scenario);
      const baseline = yield* generator.advance(12); // 2 minutes
      yield* generator.triggerIncident;
      yield* generator.advance(6);
      yield* generator.advance(4);

      yield* generator.simulateFixDeploy({
        sha: "a1b2c3d4e5f6",
        description: "Ship bounded retries",
        url: "https://example.test/deploy/a1b2c3d4e5f6",
      });
      const landing = yield* generator.next;

      expect(landing.phase).toBe("P4");
      expect(landing.annotations).toHaveLength(1);
      expect(landing.annotations[0]).toMatchObject({
        service: "checkout-api",
        sha: "a1b2c3d4e5f6",
        description: "Ship bounded retries",
      });
      expect(landing.alerts).toHaveLength(0);

      const recovery = yield* generator.advance(12); // 2 minutes
      const resolvedAlerts = recovery.flatMap((batch) => batch.alerts);
      expect(new Set(resolvedAlerts.map((alert) => alert.alertId))).toStrictEqual(
        new Set([
          "checkout-upstream-errors",
          "checkout-upstream-request-rate",
          "checkout-latency-p95",
        ]),
      );
      expect(resolvedAlerts.every((alert) => alert._tag === "AlertResolved")).toBe(true);
      expect(resolvedAlerts.every((alert) => alert.observed <= alert.threshold)).toBe(true);
      const baselineRate = measureRequests(baseline).upstreamRequestsPerSecond;
      const recoveredRate = measureRequests(recovery.slice(-3)).upstreamRequestsPerSecond;
      expect(recoveredRate / baselineRate).toBeLessThan(1.15);
      expect(recovery.every((batch) => batch.annotations.length === 0)).toBe(true);
    }),
  );

  it.effect("rejects transitions that do not match the incident lifecycle", () =>
    Effect.gen(function* () {
      const generator = yield* makeTelemetryGeneratorFixture(scenario);
      const deployError = yield* Effect.flip(generator.simulateFixDeploy());
      expect(deployError).toMatchObject({
        _tag: "InvalidScenarioTransition",
        action: "simulateFixDeploy",
        phase: "P0",
      });

      yield* generator.triggerIncident;
      const triggerError = yield* Effect.flip(generator.triggerIncident);
      expect(triggerError).toMatchObject({
        _tag: "InvalidScenarioTransition",
        action: "triggerIncident",
        phase: "P1",
      });
    }),
  );

  it.effect("keeps upstream attempts causal and error observations truthful", () =>
    Effect.gen(function* () {
      const generator = yield* makeTelemetryGenerator(scenario);
      yield* generator.triggerIncident;
      const p1 = yield* generator.next;
      yield* generator.advance(5);
      const p2 = yield* generator.next;

      for (const batch of [p1, p2]) {
        const profile = makeBucketProfile(generator.config, batch.phase, 0);
        let upstreamAttempts = 0;
        let upstreamErrors = 0;
        let retryAttempts = 0;
        let requestWork = 0;
        let requestRetries = 0;
        let requestDurationCount = 0;
        let upstreamDurationCount = 0;

        for (const point of batch.metrics) {
          if (point._tag === "Histogram" && point.metric === "http.server.duration") {
            requestDurationCount += point.count;
          }
          if (point._tag === "Histogram" && point.metric === "upstream.client.duration") {
            upstreamDurationCount += point.count;
          }
          if (point._tag === "Sum" && point.metric === "upstream.client.requests") {
            upstreamAttempts += point.value;
            if (point.attributes["http.response.status_code"] === 503) {
              upstreamErrors += point.value;
            }
            if (Number(point.attributes.attempt) > 1) {
              retryAttempts += point.value;
            }
          }
          if (point._tag === "Sum" && point.metric === "http.server.requests") {
            requestWork += point.value;
            if (point.attributes.retry === "true") requestRetries += point.value;
          }
        }

        expect(requestWork).toBe(profile.initialRequests);
        expect(requestRetries).toBe(0);
        expect(upstreamAttempts).toBe(requestWork + retryAttempts);
        expect(retryAttempts).toBe(profile.retryRequests);
        expect(requestDurationCount).toBe(requestWork);
        expect(upstreamDurationCount).toBe(upstreamAttempts);
        expect(upstreamErrors / upstreamAttempts).toBeCloseTo(profile.upstreamErrorRate, 2);
      }

      const upstreamAlert = p1.alerts.find((alert) => alert.alertId === "checkout-upstream-errors");
      expect(upstreamAlert?.observed).toBeCloseTo(
        makeBucketProfile(generator.config, "P1", 0).upstreamErrorRate,
        8,
      );
    }),
  );

  it.effect("supports the smallest valid bucket without a zero-user defect", () =>
    Effect.gen(function* () {
      const generator = yield* makeTelemetryGenerator({
        seed: "small-valid-bucket",
        startedAt: 1_788_000_000_000,
        bucketDurationMs: 1_000,
        baselineRequestsPerSecond: 1,
        uniqueUsersPerFiveMinutes: 100,
        tracesPerBucket: 1,
      });
      const batch = yield* generator.next;
      expect(measureRequests([batch])).toMatchObject({
        incomingRequests: 1,
        upstreamRequests: 1,
        uniqueUsers: 1,
      });
    }),
  );
});
