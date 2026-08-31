import { assert, describe, it } from "@effect/vitest";
import {
  isInternalTelemetryPath,
  isTraceSuppressedPath,
  redactedHeaderNames,
  requestPathname,
  requestRouteFamily,
} from "../src/telemetry/HttpTelemetryPolicy.js";

describe("HTTP telemetry policy", () => {
  describe("requestPathname", () => {
    it("extracts pathnames without query strings or fragments", () => {
      assert.strictEqual(
        requestPathname("https://clear.seufert.sh/v1/projects/project-1?window=15m#chart"),
        "/v1/projects/project-1",
      );
      assert.strictEqual(requestPathname("/health?probe=render"), "/health");
    });
  });

  describe("isInternalTelemetryPath", () => {
    it("recognizes collector authorization and telemetry callbacks", () => {
      assert.isTrue(isInternalTelemetryPath("/internal/v1/ingest/authorize"));
      assert.isTrue(isInternalTelemetryPath("/internal/v1/telemetry/metrics"));
      assert.isTrue(isInternalTelemetryPath("/internal/v1/telemetry/traces/batch"));
    });

    it("does not suppress similarly named public paths", () => {
      assert.isFalse(isInternalTelemetryPath("/internal/v1/ingest/authorize/extra"));
      assert.isFalse(isInternalTelemetryPath("/internal/v1/telemetry"));
      assert.isFalse(isInternalTelemetryPath("/v1/telemetry/metrics"));
    });
  });

  describe("isTraceSuppressedPath", () => {
    it("suppresses recursive, health, and authentication traffic", () => {
      assert.isTrue(isTraceSuppressedPath("/internal/v1/telemetry/logs"));
      assert.isTrue(isTraceSuppressedPath("/health"));
      assert.isTrue(isTraceSuppressedPath("/v1/auth"));
      assert.isTrue(isTraceSuppressedPath("/v1/auth/callback"));
    });

    it("keeps product traffic observable", () => {
      assert.isFalse(isTraceSuppressedPath("/v1/authentication"));
      assert.isFalse(isTraceSuppressedPath("/v1/projects/project-1/metrics"));
      assert.isFalse(isTraceSuppressedPath("/v1/public/status"));
    });
  });

  describe("requestRouteFamily", () => {
    it("maps requests to bounded route families", () => {
      assert.strictEqual(requestRouteFamily("/health"), "/health");
      assert.strictEqual(requestRouteFamily("/v1/public/status"), "/v1/public/status");
      assert.strictEqual(requestRouteFamily("/internal/v1/telemetry/activity"), "/internal/v1/*");
      assert.strictEqual(requestRouteFamily("/v1/auth/callback"), "/v1/auth/*");
      assert.strictEqual(
        requestRouteFamily("/v1/projects/project-1/incidents/incident-1"),
        "/v1/projects/:projectId/*",
      );
      assert.strictEqual(requestRouteFamily("/v1/sandbox/session-1"), "/v1/sandbox/*");
      assert.strictEqual(requestRouteFamily("/v1/unknown/project-1"), "other");
    });
  });

  it("redacts every credential-bearing request header", () => {
    assert.sameMembers(
      [...redactedHeaderNames],
      [
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-clear-ingest-key",
        "x-groundtruth-ingest-key",
        "x-groundtruth-project-id",
        "x-groundtruth-sandbox-session",
      ],
    );
  });
});
