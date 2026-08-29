import type { Timestamp } from "../domain/primitives.ts";
import { MetricPoint } from "../domain/telemetry.ts";
import type { ScenarioConfig } from "../domain/scenario.ts";
import type { BucketProfile } from "../profile.ts";
import { allocateAcrossUsers, selectUsers, splitErrors } from "./users.ts";

const serviceAttributes = {
  "service.name": "checkout-api",
  "service.version": "1.0.0",
};

const attemptDistribution = (profile: BucketProfile) => {
  const secondAttempts = Math.min(profile.initialRequests, profile.retryRequests);
  const thirdAttempts = profile.retryRequests - secondAttempts;
  const desiredErrors = Math.min(
    profile.totalUpstreamRequests,
    Math.max(
      profile.retryRequests,
      Math.round(profile.totalUpstreamRequests * profile.upstreamErrorRate),
    ),
  );
  const firstAttemptErrors = secondAttempts;
  const errorsAfterFirstAttempt = desiredErrors - firstAttemptErrors;
  const secondAttemptErrors = Math.min(secondAttempts, errorsAfterFirstAttempt);
  const thirdAttemptErrors = Math.min(thirdAttempts, errorsAfterFirstAttempt - secondAttemptErrors);

  return [
    { attempts: profile.initialRequests, errors: firstAttemptErrors },
    { attempts: secondAttempts, errors: secondAttemptErrors },
    { attempts: thirdAttempts, errors: thirdAttemptErrors },
  ] as const;
};

const completedRequestErrors = (profile: BucketProfile) => {
  const attempted = attemptDistribution(profile).filter(({ attempts }) => attempts > 0);
  return attempted.at(-1)?.errors ?? 0;
};

const makeRequestPoints = (
  config: ScenarioConfig,
  phaseBucket: number,
  timestamp: Timestamp,
  profile: BucketProfile,
) => {
  const users = selectUsers(config, phaseBucket, profile.activeUsers);
  const initial = allocateAcrossUsers(
    profile.initialRequests,
    users,
    config,
    phaseBucket,
    "initial",
  );
  const initialByStatus = splitErrors(
    initial,
    completedRequestErrors(profile),
    config,
    phaseBucket,
    "initial",
  );

  return initialByStatus.map((allocation) =>
    MetricPoint.cases.Sum.make({
      metric: "http.server.requests",
      timestamp,
      value: allocation.count,
      attributes: {
        ...serviceAttributes,
        "http.route": "/checkout",
        "http.response.status_code": allocation.statusCode,
        retry: "false",
        "user.id": allocation.userId,
      },
    }),
  );
};

const makeUpstreamPoints = (timestamp: Timestamp, profile: BucketProfile) => {
  const attempt = (number: number, count: number, statusCode: number) =>
    MetricPoint.cases.Sum.make({
      metric: "upstream.client.requests",
      timestamp,
      value: count,
      attributes: {
        ...serviceAttributes,
        target: "payments-stub",
        attempt: String(number),
        retry: String(number > 1),
        "http.response.status_code": statusCode,
      },
    });

  const points = (attemptNumber: number, attempts: number, errors: number) => [
    ...(attempts - errors > 0 ? [attempt(attemptNumber, attempts - errors, 200)] : []),
    ...(errors > 0 ? [attempt(attemptNumber, errors, 503)] : []),
  ];

  return attemptDistribution(profile).flatMap(({ attempts, errors }, index) =>
    points(index + 1, attempts, errors),
  );
};

export const generateMetrics = (
  config: ScenarioConfig,
  phaseBucket: number,
  timestamp: Timestamp,
  profile: BucketProfile,
) => [
  ...makeRequestPoints(config, phaseBucket, timestamp, profile),
  ...makeUpstreamPoints(timestamp, profile),
  MetricPoint.cases.Histogram.make({
    metric: "http.server.duration",
    timestamp,
    count: profile.initialRequests,
    sum: profile.initialRequests * profile.latencyP50Ms,
    min: Math.max(8, profile.latencyP50Ms * 0.2),
    max: profile.latencyP99Ms * 1.4,
    p50: profile.latencyP50Ms,
    p95: profile.latencyP95Ms,
    p99: profile.latencyP99Ms,
    attributes: {
      ...serviceAttributes,
      "http.route": "/checkout",
    },
  }),
  MetricPoint.cases.Histogram.make({
    metric: "upstream.client.duration",
    timestamp,
    count: profile.totalUpstreamRequests,
    sum: profile.totalUpstreamRequests * profile.latencyP50Ms * 0.72,
    min: Math.max(5, profile.latencyP50Ms * 0.12),
    max: profile.latencyP99Ms,
    p50: profile.latencyP50Ms * 0.72,
    p95: profile.latencyP95Ms * 0.86,
    p99: profile.latencyP99Ms * 0.9,
    attributes: {
      ...serviceAttributes,
      target: "payments-stub",
    },
  }),
  MetricPoint.cases.Gauge.make({
    metric: "service.replicas",
    timestamp,
    value: profile.replicas,
    attributes: serviceAttributes,
  }),
];
