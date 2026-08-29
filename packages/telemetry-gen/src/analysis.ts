import { Schema } from "effect";

import type { TelemetryBatch } from "./domain/telemetry.ts";

export class RequestMeasurements extends Schema.Class<RequestMeasurements>("RequestMeasurements")({
  incomingRequests: Schema.Natural,
  upstreamRequests: Schema.Natural,
  uniqueUsers: Schema.Natural,
  upstreamRetries: Schema.Natural,
  upstreamRetryShare: Schema.Finite,
  upstreamRequestsPerSecond: Schema.Finite,
}) {}

export class AcceptanceReport extends Schema.Class<AcceptanceReport>("AcceptanceReport")({
  baseline: RequestMeasurements,
  amplification: RequestMeasurements,
  upstreamRequestRatio: Schema.Finite,
  uniqueUserRatio: Schema.Finite,
  upstreamRetryShare: Schema.Finite,
  upstreamRequestsTripled: Schema.Boolean,
  usersStayedFlat: Schema.Boolean,
  retriesDominate: Schema.Boolean,
  passed: Schema.Boolean,
}) {}

export const measureRequests = (batches: ReadonlyArray<TelemetryBatch>) => {
  const users = new Set<string>();
  let incomingRequests = 0;
  let upstreamRequests = 0;
  let upstreamRetries = 0;

  for (const batch of batches) {
    for (const point of batch.metrics) {
      if (point._tag !== "Sum") continue;
      if (point.metric === "http.server.requests") {
        incomingRequests += point.value;
        const user = point.attributes["user.id"];
        if (typeof user === "string") users.add(user);
      }
      if (point.metric !== "upstream.client.requests") continue;
      upstreamRequests += point.value;
      if (point.attributes.retry === true || point.attributes.retry === "true") {
        upstreamRetries += point.value;
      }
    }
  }

  const durationSeconds =
    batches.reduce((total, batch) => total + batch.bucketEnd - batch.bucketStart, 0) / 1_000;

  return new RequestMeasurements({
    incomingRequests,
    upstreamRequests,
    uniqueUsers: users.size,
    upstreamRetries,
    upstreamRetryShare: upstreamRequests === 0 ? 0 : upstreamRetries / upstreamRequests,
    upstreamRequestsPerSecond: durationSeconds === 0 ? 0 : upstreamRequests / durationSeconds,
  });
};

export const evaluateAcceptance = (
  baselineBatches: ReadonlyArray<TelemetryBatch>,
  amplificationBatches: ReadonlyArray<TelemetryBatch>,
) => {
  const baseline = measureRequests(baselineBatches);
  const amplification = measureRequests(amplificationBatches);
  const upstreamRequestRatio = amplification.upstreamRequests / baseline.upstreamRequests;
  const uniqueUserRatio = amplification.uniqueUsers / baseline.uniqueUsers;
  const upstreamRequestsTripled = upstreamRequestRatio >= 2.9 && upstreamRequestRatio <= 3.1;
  const usersStayedFlat = uniqueUserRatio >= 0.9 && uniqueUserRatio <= 1.1;
  const retriesDominate = amplification.upstreamRetryShare > 0.55;

  return new AcceptanceReport({
    baseline,
    amplification,
    upstreamRequestRatio,
    uniqueUserRatio,
    upstreamRetryShare: amplification.upstreamRetryShare,
    upstreamRequestsTripled,
    usersStayedFlat,
    retriesDominate,
    passed: upstreamRequestsTripled && usersStayedFlat && retriesDominate,
  });
};
