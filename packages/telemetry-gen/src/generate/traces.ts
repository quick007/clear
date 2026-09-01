import { Array as EffectArray } from "effect";

import { spanId, timestamp, traceId } from "../domain/primitives.ts";
import type { ScenarioPhase, Timestamp } from "../domain/primitives.ts";
import { Span, SpanEvent, Trace } from "../domain/telemetry.ts";
import type { ScenarioConfig } from "../domain/scenario.ts";
import type { BucketProfile } from "../profile.ts";
import { deterministicHex, sample } from "../random.ts";
import { selectUsers } from "./users.ts";

const attemptsFor = (phase: ScenarioPhase, retryShare: number) => {
  if (phase === "P2" || retryShare > 0.5) return 3;
  if (phase === "P1" || retryShare > 0.08) return 2;
  return 1;
};

const makeTrace = (
  config: ScenarioConfig,
  phase: ScenarioPhase,
  phaseBucket: number,
  bucketStart: Timestamp,
  profile: BucketProfile,
  index: number,
) => {
  const users = selectUsers(config, phaseBucket, profile.activeUsers);
  const user = users[index % users.length];
  if (user === undefined) throw new Error("Trace user unexpectedly missing");

  const id = traceId(deterministicHex(config.seed, phaseBucket, `trace-${phase}`, 32, index));
  const loadId = spanId(deterministicHex(config.seed, phaseBucket, `load-${phase}`, 16, index));
  const checkoutId = spanId(
    deterministicHex(config.seed, phaseBucket, `checkout-${phase}`, 16, index),
  );
  const rootStart = timestamp(
    bucketStart +
      Math.floor(
        sample(config.seed, phaseBucket, `trace-offset-${phase}`, index) *
          Math.max(1, config.bucketDurationMs - profile.latencyP99Ms),
      ),
  );
  const duration = Math.round(
    profile.latencyP50Ms +
      (profile.latencyP95Ms - profile.latencyP50Ms) *
        sample(config.seed, phaseBucket, `trace-duration-${phase}`, index),
  );
  const attemptCount = attemptsFor(phase, profile.retryShare);
  const finalFailure =
    sample(config.seed, phaseBucket, `trace-status-${phase}`, index) < profile.upstreamErrorRate;
  const finalStatus = finalFailure ? 503 : 200;
  const attemptDuration = Math.max(12, Math.floor((duration - 16) / attemptCount));

  const paymentSpans = EffectArray.makeBy(attemptCount, (attemptIndex) => {
    const attempt = attemptIndex + 1;
    const isLast = attempt === attemptCount;
    const failed = !isLast || finalFailure;
    const childStart = timestamp(rootStart + 8 + attemptDuration * attemptIndex);
    const childDuration = attemptDuration;
    const clientId = spanId(
      deterministicHex(config.seed, phaseBucket, `payment-${phase}-${index}`, 16, attemptIndex),
    );
    const serverId = spanId(
      deterministicHex(
        config.seed,
        phaseBucket,
        `payment-server-${phase}-${index}`,
        16,
        attemptIndex,
      ),
    );
    const retryDelay = phase === "P4" ? 50 * 2 ** attemptIndex : 0;

    const errorEvents = failed
      ? [
          new SpanEvent({
            name: "upstream.response.error",
            timestamp: timestamp(childStart + childDuration - 3),
            attributes: {
              "exception.type": "UpstreamUnavailable",
              "http.response.status_code": 503,
            },
          }),
        ]
      : [];

    return [
      new Span({
        traceId: id,
        spanId: clientId,
        parentSpanId: checkoutId,
        service: "checkout-api",
        name: "POST payments-stub/authorize",
        kind: "client",
        status: failed ? "error" : "ok",
        startTime: childStart,
        endTime: timestamp(childStart + childDuration),
        attributes: {
          "server.address": "payments-stub",
          "http.request.method": "POST",
          "http.response.status_code": failed ? 503 : 200,
          attempt,
          "retry.delay_ms": retryDelay,
        },
        events: errorEvents,
      }),
      new Span({
        traceId: id,
        spanId: serverId,
        parentSpanId: clientId,
        service: "payments-stub",
        name: "POST /authorize",
        kind: "server",
        status: failed ? "error" : "ok",
        startTime: timestamp(childStart + 2),
        endTime: timestamp(childStart + childDuration - 2),
        attributes: {
          "http.request.method": "POST",
          "http.route": "/authorize",
          "http.response.status_code": failed ? 503 : 200,
          attempt,
        },
        events: errorEvents,
      }),
    ];
  });

  const checkout = new Span({
    traceId: id,
    spanId: checkoutId,
    parentSpanId: loadId,
    service: "checkout-api",
    name: "POST /checkout",
    kind: "server",
    status: finalFailure ? "error" : "ok",
    startTime: rootStart,
    endTime: timestamp(rootStart + duration),
    attributes: {
      "http.request.method": "POST",
      "http.route": "/checkout",
      "http.response.status_code": finalStatus,
      "user.id": user,
      "retry.count": attemptCount - 1,
    },
    events:
      attemptCount > 1
        ? [
            new SpanEvent({
              name: "retry.loop.completed",
              timestamp: timestamp(rootStart + duration - 2),
              attributes: {
                attempts: attemptCount,
                outcome: finalFailure ? "failed" : "recovered",
              },
            }),
          ]
        : [],
  });

  const load = new Span({
    traceId: id,
    spanId: loadId,
    parentSpanId: null,
    service: "load-generator",
    name: "POST checkout-api/checkout",
    kind: "client",
    status: finalFailure ? "error" : "ok",
    startTime: rootStart,
    endTime: timestamp(rootStart + duration + 1),
    attributes: {
      "server.address": "checkout-api",
      "http.request.method": "POST",
      "http.response.status_code": finalStatus,
      "user.id": user,
    },
    events: [],
  });

  return new Trace({
    traceId: id,
    rootSpanId: loadId,
    spans: [load, checkout, ...paymentSpans.flat()],
  });
};

export const generateTraces = (
  config: ScenarioConfig,
  phase: ScenarioPhase,
  phaseBucket: number,
  bucketStart: Timestamp,
  profile: BucketProfile,
) =>
  EffectArray.makeBy(config.tracesPerBucket, (index) =>
    makeTrace(config, phase, phaseBucket, bucketStart, profile, index),
  );
