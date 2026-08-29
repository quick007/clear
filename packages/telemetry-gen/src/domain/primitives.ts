import { Schema } from "effect";

export const ScenarioPhase = Schema.Literals(["P0", "P1", "P2", "P4"]);
export type ScenarioPhase = typeof ScenarioPhase.Type;

export const MetricName = Schema.Literals([
  "http.server.requests",
  "http.server.duration",
  "upstream.client.requests",
  "upstream.client.duration",
  "service.replicas",
]);
export type MetricName = typeof MetricName.Type;

export const LogSeverity = Schema.Literals(["debug", "info", "warn", "error"]);
export type LogSeverity = typeof LogSeverity.Type;

export const SpanKind = Schema.Literals(["server", "client", "internal"]);
export type SpanKind = typeof SpanKind.Type;

export const SpanStatus = Schema.Literals(["unset", "ok", "error"]);
export type SpanStatus = typeof SpanStatus.Type;

export const AlertSeverity = Schema.Literals(["warning", "critical"]);
export type AlertSeverity = typeof AlertSeverity.Type;

export const AttributeValue = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]);
export type AttributeValue = typeof AttributeValue.Type;

export const Attributes = Schema.Record(Schema.String, AttributeValue);
export type Attributes = typeof Attributes.Type;

export const Timestamp = Schema.Natural.pipe(Schema.brand("Timestamp"));
export type Timestamp = typeof Timestamp.Type;

export const Sequence = Schema.Natural.pipe(Schema.brand("Sequence"));
export type Sequence = typeof Sequence.Type;

export const TraceId = Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}$/)).pipe(
  Schema.brand("TraceId"),
);
export type TraceId = typeof TraceId.Type;

export const SpanId = Schema.String.check(Schema.isPattern(/^[0-9a-f]{16}$/)).pipe(
  Schema.brand("SpanId"),
);
export type SpanId = typeof SpanId.Type;

export const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{7,40}$/)).pipe(
  Schema.brand("Sha"),
);
export type Sha = typeof Sha.Type;

export const IncidentId = Schema.TemplateLiteral([
  "inc_",
  Schema.String.check(Schema.isPattern(/^[0-9a-f]{12}$/)),
]).pipe(Schema.brand("IncidentId"));
export type IncidentId = typeof IncidentId.Type;

export const UserId = Schema.TemplateLiteral([
  "user-",
  Schema.String.check(Schema.isPattern(/^\d{4}$/)),
]).pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const timestamp = Schema.decodeUnknownSync(Timestamp);
export const sequence = Schema.decodeUnknownSync(Sequence);
export const traceId = Schema.decodeUnknownSync(TraceId);
export const spanId = Schema.decodeUnknownSync(SpanId);
export const sha = Schema.decodeUnknownSync(Sha);
export const incidentId = Schema.decodeUnknownSync(IncidentId);
export const userId = Schema.decodeUnknownSync(UserId);
