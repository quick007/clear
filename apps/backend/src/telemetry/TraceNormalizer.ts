import type { OtlpTracesRequest } from "@groundtruth/api-contract";
import {
  SpanEvent,
  type SpanKind,
  SpanLink,
  SpanRecord,
  SpanStatus,
  type SpanStatusCode,
} from "@groundtruth/telemetry";
import { Effect } from "effect";
import { InvalidOtlpPayload } from "./InvalidOtlpPayload.js";
import { optionalSpanId, requiredSpanId, requiredTraceId } from "./OtlpIds.js";
import { otelFlags, unixNano, unsignedInt64 } from "./OtlpNumber.js";
import { attributes, instrumentationScope, resourceContext, serviceName } from "./OtlpValue.js";

const kind = (value: 0 | 1 | 2 | 3 | 4 | 5 | undefined): SpanKind => {
  if (value === 1) return "internal";
  if (value === 2) return "server";
  if (value === 3) return "client";
  if (value === 4) return "producer";
  if (value === 5) return "consumer";
  return "unspecified";
};

const status = (value: 0 | 1 | 2 | undefined): SpanStatusCode => {
  if (value === 1) return "ok";
  if (value === 2) return "error";
  return "unset";
};

export const normalizeTraces = (request: OtlpTracesRequest) =>
  Effect.gen(function* () {
    const normalized: Array<SpanRecord> = [];
    for (const [resourceIndex, resourceSpans] of (request.resourceSpans ?? []).entries()) {
      const resourcePath = `resourceSpans[${resourceIndex}].resource`;
      const resource = yield* resourceContext(
        resourceSpans.resource,
        resourceSpans.schemaUrl,
        resourcePath,
      );
      const service = serviceName(resource);
      for (const [scopeIndex, scopeSpans] of (resourceSpans.scopeSpans ?? []).entries()) {
        const scopePath = `resourceSpans[${resourceIndex}].scopeSpans[${scopeIndex}].scope`;
        const scope = yield* instrumentationScope(
          scopeSpans.scope,
          scopeSpans.schemaUrl,
          scopePath,
        );
        for (const [spanIndex, span] of (scopeSpans.spans ?? []).entries()) {
          const path = `resourceSpans[${resourceIndex}].scopeSpans[${scopeIndex}].spans[${spanIndex}]`;
          const name = span.name?.trim() ?? "";
          if (name.length === 0 || name.length > 1_000) {
            return yield* new InvalidOtlpPayload({
              path: `${path}.name`,
              message: "Span name must contain between 1 and 1000 characters",
            });
          }
          const start = yield* unixNano(span.startTimeUnixNano, `${path}.startTimeUnixNano`);
          const end = yield* unixNano(span.endTimeUnixNano, `${path}.endTimeUnixNano`);
          if (end < start) {
            return yield* new InvalidOtlpPayload({
              path: `${path}.endTimeUnixNano`,
              message: "Span end time must not be before its start time",
            });
          }
          const events = yield* Effect.forEach(span.events ?? [], (event, eventIndex) => {
            const eventPath = `${path}.events[${eventIndex}]`;
            return Effect.gen(function* () {
              return new SpanEvent({
                name: event.name ?? "",
                timeUnixNano: yield* unixNano(event.timeUnixNano, `${eventPath}.timeUnixNano`),
                attributes: yield* attributes(event.attributes, `${eventPath}.attributes`),
                droppedAttributesCount: yield* unsignedInt64(
                  event.droppedAttributesCount,
                  `${eventPath}.droppedAttributesCount`,
                ),
              });
            });
          });
          const links = yield* Effect.forEach(span.links ?? [], (link, linkIndex) =>
            Effect.gen(function* () {
              const linkPath = `${path}.links[${linkIndex}]`;
              return new SpanLink({
                traceId: yield* requiredTraceId(link.traceId, `${linkPath}.traceId`),
                spanId: yield* requiredSpanId(link.spanId, `${linkPath}.spanId`),
                traceState: link.traceState ?? "",
                attributes: yield* attributes(link.attributes, `${linkPath}.attributes`),
                droppedAttributesCount: yield* unsignedInt64(
                  link.droppedAttributesCount,
                  `${linkPath}.droppedAttributesCount`,
                ),
                flags: yield* otelFlags(link.flags, `${linkPath}.flags`),
              });
            }),
          );
          normalized.push(
            new SpanRecord({
              traceId: yield* requiredTraceId(span.traceId, `${path}.traceId`),
              spanId: yield* requiredSpanId(span.spanId, `${path}.spanId`),
              parentSpanId: yield* optionalSpanId(span.parentSpanId, `${path}.parentSpanId`),
              traceState: span.traceState ?? "",
              flags: yield* otelFlags(span.flags, `${path}.flags`),
              name,
              kind: kind(span.kind),
              startTimeUnixNano: start,
              endTimeUnixNano: end,
              durationNanos: end - start,
              status: new SpanStatus({
                code: status(span.status?.code),
                message: span.status?.message ?? "",
              }),
              attributes: yield* attributes(span.attributes, `${path}.attributes`),
              droppedAttributesCount: yield* unsignedInt64(
                span.droppedAttributesCount,
                `${path}.droppedAttributesCount`,
              ),
              events,
              droppedEventsCount: yield* unsignedInt64(
                span.droppedEventsCount,
                `${path}.droppedEventsCount`,
              ),
              links,
              droppedLinksCount: yield* unsignedInt64(
                span.droppedLinksCount,
                `${path}.droppedLinksCount`,
              ),
              resource,
              scope,
              serviceName: service,
            }),
          );
        }
      }
    }
    return normalized;
  });
