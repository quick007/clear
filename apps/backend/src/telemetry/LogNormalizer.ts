import type { OtlpLogsRequest } from "@groundtruth/api-contract";
import { LogRecord, type LogSeverity } from "@groundtruth/telemetry";
import { Effect } from "effect";
import { optionalSpanId, optionalTraceId } from "./OtlpIds.js";
import { otelFlags, unixNano, unsignedInt64 } from "./OtlpNumber.js";
import {
  anyValue,
  attributes,
  instrumentationScope,
  resourceContext,
  serviceName,
} from "./OtlpValue.js";

const severity = (value: number): LogSeverity => {
  if (value <= 0) return "unspecified";
  if (value <= 4) return "trace";
  if (value <= 8) return "debug";
  if (value <= 12) return "info";
  if (value <= 16) return "warn";
  if (value <= 20) return "error";
  return "fatal";
};

export const normalizeLogs = (request: OtlpLogsRequest) =>
  Effect.gen(function* () {
    const normalized: Array<LogRecord> = [];
    for (const [resourceIndex, resourceLogs] of (request.resourceLogs ?? []).entries()) {
      const resourcePath = `resourceLogs[${resourceIndex}].resource`;
      const resource = yield* resourceContext(
        resourceLogs.resource,
        resourceLogs.schemaUrl,
        resourcePath,
      );
      const service = serviceName(resource);
      for (const [scopeIndex, scopeLogs] of (resourceLogs.scopeLogs ?? []).entries()) {
        const scopePath = `resourceLogs[${resourceIndex}].scopeLogs[${scopeIndex}].scope`;
        const scope = yield* instrumentationScope(scopeLogs.scope, scopeLogs.schemaUrl, scopePath);
        for (const [recordIndex, record] of (scopeLogs.logRecords ?? []).entries()) {
          const path = `resourceLogs[${resourceIndex}].scopeLogs[${scopeIndex}].logRecords[${recordIndex}]`;
          const severityNumber = record.severityNumber ?? 0;
          normalized.push(
            new LogRecord({
              timeUnixNano: yield* unixNano(record.timeUnixNano, `${path}.timeUnixNano`),
              observedTimeUnixNano: yield* unixNano(
                record.observedTimeUnixNano ?? record.timeUnixNano,
                `${path}.observedTimeUnixNano`,
              ),
              traceId: yield* optionalTraceId(record.traceId, `${path}.traceId`),
              spanId: yield* optionalSpanId(record.spanId, `${path}.spanId`),
              flags: yield* otelFlags(record.flags, `${path}.flags`),
              severity: severity(severityNumber),
              severityNumber,
              severityText: record.severityText ?? null,
              body: yield* anyValue(record.body, `${path}.body`),
              eventName: record.eventName ?? null,
              attributes: yield* attributes(record.attributes, `${path}.attributes`),
              droppedAttributesCount: yield* unsignedInt64(
                record.droppedAttributesCount,
                `${path}.droppedAttributesCount`,
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
