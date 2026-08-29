import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { LiveEvent } from "../src/model/events.ts";
import { IngestKeySecret } from "../src/model/ingest-keys.ts";
import { OtlpLogsPayload, OtlpLogsRequest } from "../src/otlp/logs.ts";
import { OtlpMetricsPayload, OtlpMetricsRequest } from "../src/otlp/metrics.ts";
import { OtlpTracesPayload, OtlpTracesRequest } from "../src/otlp/traces.ts";
import { OtlpAnyValueLimits } from "../src/otlp/common.ts";
import { inspectOtlpStructure, OtlpStructuralLimits } from "../src/otlp/complexity.ts";

const projectId = "01890f6e-7c00-7000-8000-000000000001";
const dashboardId = "01890f6e-7c00-7000-8000-000000000002";
const eventId = "01890f6e-7c00-7000-8000-000000000003";

describe("LiveEvent", () => {
  it.effect("decodes durable events with replay metadata", () =>
    Effect.gen(function* () {
      const event = yield* Schema.decodeUnknownEffect(LiveEvent)({
        _tag: "BoardChanged",
        eventId,
        projectId,
        dashboardId,
        occurredAt: "2026-08-28T06:00:00.000Z",
        revision: 4,
      });
      expect(event._tag).toBe("BoardChanged");
      if (event._tag === "BoardChanged") {
        expect(event.revision).toBe(4);
      }
    }),
  );

  it("rejects durable events without an event id", () => {
    expect(() =>
      Schema.decodeUnknownSync(LiveEvent)({
        _tag: "BoardChanged",
        projectId,
        dashboardId,
        occurredAt: "2026-08-28T06:00:00.000Z",
        revision: 4,
      }),
    ).toThrow();
  });

  it("supports heartbeat and resync control events", () => {
    const heartbeat = Schema.decodeUnknownSync(LiveEvent)({
      _tag: "Heartbeat",
      occurredAt: "2026-08-28T06:00:00.000Z",
      cursor: null,
    });
    const resync = Schema.decodeUnknownSync(LiveEvent)({
      _tag: "ResyncRequired",
      occurredAt: "2026-08-28T06:00:01.000Z",
      reason: "cursor-expired",
      earliestCursor: "41",
      latestCursor: "57",
    });
    expect(heartbeat._tag).toBe("Heartbeat");
    expect(resync._tag).toBe("ResyncRequired");
  });

  it("decodes outbox-backed product events with sequence cursors", () => {
    const event = Schema.decodeUnknownSync(LiveEvent)({
      _tag: "ProductStateChanged",
      cursor: "42",
      projectId,
      occurredAt: "2026-08-28T06:00:00.000Z",
      kind: "panel.updated",
      schemaVersion: 1,
      payload: { panelId: dashboardId, position: 2 },
    });
    expect(event._tag).toBe("ProductStateChanged");
    if (event._tag === "ProductStateChanged") expect(event.cursor).toBe("42");
  });
});

describe("IngestKeySecret", () => {
  it("accepts the opaque one-time key format", () => {
    const key = "gtik_abcdefghijkl_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    expect(Schema.decodeUnknownSync(IngestKeySecret)(key)).toBe(key);
  });

  it("rejects prefixes without the full secret", () => {
    expect(() => Schema.decodeUnknownSync(IngestKeySecret)("gtik_abcdefghijkl")).toThrow();
  });
});

describe("canonical OTLP JSON", () => {
  const nestedAnyValue = (depth: number): object => {
    let value: object = { stringValue: "leaf" };
    for (let level = 1; level < depth; level += 1) {
      value = { arrayValue: { values: [value] } };
    }
    return value;
  };

  const payloadsWith = (value: object) =>
    [
      {
        schema: OtlpMetricsRequest,
        payload: {
          resourceMetrics: [{ resource: { attributes: [{ key: "nested", value }] } }],
        },
      },
      {
        schema: OtlpLogsRequest,
        payload: {
          resourceLogs: [{ scopeLogs: [{ logRecords: [{ body: value }] }] }],
        },
      },
      {
        schema: OtlpTracesRequest,
        payload: {
          resourceSpans: [
            { scopeSpans: [{ spans: [{ attributes: [{ key: "nested", value }] }] }] },
          ],
        },
      },
    ] as const;

  it("bounds recursive AnyValue decoding for every OTLP signal", () => {
    const accepted = nestedAnyValue(OtlpAnyValueLimits.maxDepth);
    const rejected = nestedAnyValue(OtlpAnyValueLimits.maxDepth + 2);

    for (const fixture of payloadsWith(accepted)) {
      expect(() => Schema.decodeUnknownSync(fixture.schema)(fixture.payload)).not.toThrow();
    }
    for (const fixture of payloadsWith(rejected)) {
      expect(() => Schema.decodeUnknownSync(fixture.schema)(fixture.payload)).toThrow();
    }
  });

  it("rejects high-cardinality envelopes before their signal schemas decode", () => {
    const entries = Array.from(
      { length: OtlpStructuralLimits.maxContainerEntries + 1 },
      () => ({}),
    );
    const fixtures = [
      { schema: OtlpMetricsPayload, payload: { resourceMetrics: entries } },
      { schema: OtlpLogsPayload, payload: { resourceLogs: entries } },
      { schema: OtlpTracesPayload, payload: { resourceSpans: entries } },
    ] as const;

    for (const fixture of fixtures) {
      expect(() => Schema.decodeUnknownSync(fixture.schema)(fixture.payload)).toThrow();
    }

    expect(() =>
      Schema.decodeUnknownSync(OtlpMetricsPayload)({ resourceMetrics: [{}] }),
    ).not.toThrow();
  });

  it("rejects oversized raw objects before unknown fields are discarded", () => {
    const unknown = Object.fromEntries(
      Array.from({ length: OtlpStructuralLimits.maxContainerEntries + 1 }, (_, index) => [
        `field-${index}`,
        true,
      ]),
    );
    expect(() =>
      Schema.decodeUnknownSync(OtlpMetricsPayload)({ resourceMetrics: [{ unknown }] }),
    ).toThrow();
  });

  it("bounds total raw container entries before OTLP decoding", () => {
    const payload = {
      groups: Array.from({ length: 50 }, () =>
        Array.from({ length: OtlpStructuralLimits.maxContainerEntries }, () => 0),
      ),
    };
    const violation = inspectOtlpStructure(payload);
    expect(violation?.message).toContain("total entries");
  });

  it.effect("decodes metrics with 64 bit decimal strings", () =>
    Effect.gen(function* () {
      const request = yield* Schema.decodeUnknownEffect(OtlpMetricsRequest)({
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: "service.name", value: { stringValue: "checkout-api" } }],
              futureResourceField: true,
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: "http.server.duration",
                    histogram: {
                      aggregationTemporality: 2,
                      dataPoints: [
                        {
                          timeUnixNano: "1787896800000000000",
                          count: "2",
                          sum: 240,
                          bucketCounts: ["1", "1"],
                          explicitBounds: [100],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
        futureEnvelopeField: "ignored",
      });
      expect(request.resourceMetrics).toHaveLength(1);
      expect("futureEnvelopeField" in request).toBe(false);
    }),
  );

  it("decodes nested log AnyValue data", () => {
    const request = Schema.decodeUnknownSync(OtlpLogsRequest)({
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: "1787896800000000000",
                  severityNumber: 17,
                  body: {
                    kvlistValue: {
                      values: [
                        {
                          key: "attempts",
                          value: {
                            arrayValue: {
                              values: [{ intValue: "1" }, { intValue: 2 }],
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(request.resourceLogs?.[0]?.scopeLogs?.[0]?.logRecords).toHaveLength(1);
  });

  it("accepts OTLP hex ids and integer enums", () => {
    const request = Schema.decodeUnknownSync(OtlpTracesRequest)({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "5B8EFFF798038103D269B633813FC60C",
                  spanId: "EEE19B7EC3C1B174",
                  name: "checkout",
                  kind: 2,
                  startTimeUnixNano: "1544712660000000000",
                  endTimeUnixNano: "1544712661000000000",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(request.resourceSpans).toHaveLength(1);
  });

  it("rejects symbolic enum names prohibited by OTLP JSON", () => {
    expect(() =>
      Schema.decodeUnknownSync(OtlpTracesRequest)({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [{ kind: "SPAN_KIND_SERVER" }],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
