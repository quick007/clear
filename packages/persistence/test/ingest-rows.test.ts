import { ProjectId } from "@groundtruth/domain";
import { CanonicalTelemetryBatch } from "@groundtruth/telemetry";
import { DateTime, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { metricInsertRows } from "../src/clickhouse/ingest-rows.ts";

const projectId = Schema.decodeUnknownSync(ProjectId)("0198f1a2-3b4c-7def-8123-456789abcdef");

describe("ClickHouse ingest row trust boundary", () => {
  it("derives ingestion and expiry timestamps from persistence acceptance time", () => {
    const acceptedAt = DateTime.makeUnsafe(Date.parse("2026-08-28T08:00:00.000Z"));
    const batch = Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
      id: "550e8400-e29b-41d4-a716-446655440000",
      receivedAt: "2099-01-01T00:00:00.000Z",
      metrics: [
        {
          _tag: "gauge",
          name: "requests",
          description: "Requests",
          unit: "{request}",
          metadata: {},
          resource: {
            attributes: { "service.name": "checkout-api" },
            droppedAttributesCount: "0",
            entityRefs: [],
            schemaUrl: null,
          },
          scope: {
            name: "groundtruth.test",
            version: null,
            attributes: {},
            droppedAttributesCount: "0",
            schemaUrl: null,
          },
          serviceName: "checkout-api",
          startTimeUnixNano: null,
          timeUnixNano: "1787904000000000000",
          attributes: {},
          exemplars: [],
          flags: 0,
          value: { _tag: "int", value: "1" },
        },
      ],
      logs: [],
      spans: [],
    });

    const [row] = metricInsertRows(projectId, 7, batch, acceptedAt);
    expect(row?.ingested_at).toBe("2026-08-28 08:00:00.000000000");
    expect(row?.expires_at).toBe("2026-09-04 08:00:00");
  });
});
