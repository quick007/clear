import { writeFile } from "node:fs/promises";

const clearOrigin = process.env.CLEAR_BENCHMARK_ORIGIN ?? "http://127.0.0.1:3300";
const grafanaOrigin = process.env.GRAFANA_BENCHMARK_ORIGIN ?? "http://127.0.0.1:3310";
const iterations = Number.parseInt(process.env.BENCHMARK_ITERATIONS ?? "100", 10);
const warmups = 5;
const outputPath = process.env.BENCHMARK_OUTPUT;

const encode = (value) => JSON.stringify(value);
const byteLength = (value) => Buffer.byteLength(encode(value));

const request = async (url, options = {}) => {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} returned ${response.status}: ${text}`);
  }
  return { data: text.length === 0 ? null : JSON.parse(text), bytes: Buffer.byteLength(text) };
};

const jsonOptions = (method, body, headers = {}) => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: encode(body),
});

const percentile = (samples, proportion) => {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * proportion) - 1);
  return sorted[index];
};

const summarize = (samples) => ({
  iterations: samples.length,
  medianMs: Number(percentile(samples, 0.5).toFixed(2)),
  p95Ms: Number(percentile(samples, 0.95).toFixed(2)),
  meanMs: Number(
    (samples.reduce((total, sample) => total + sample, 0) / samples.length).toFixed(2),
  ),
  minMs: Number(Math.min(...samples).toFixed(2)),
  maxMs: Number(Math.max(...samples).toFixed(2)),
});

const benchmark = async (operation) => {
  for (let index = 0; index < warmups; index += 1) await operation(index);
  const samples = [];
  let lastResult;
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    lastResult = await operation(index + warmups);
    samples.push(performance.now() - startedAt);
  }
  return { latency: summarize(samples), lastResult };
};

const setupClear = async () => {
  const { data: sandbox } = await request(`${clearOrigin}/v1/sandbox/session`, { method: "POST" });
  const headers = { "x-groundtruth-sandbox-session": sandbox.session.id };
  const { data: session } = await request(`${clearOrigin}/v1/auth/session`, { headers });
  const projectId = session.activeProjectId;
  const { data: board } = await request(`${clearOrigin}/v1/projects/${projectId}/board`, {
    headers,
  });
  const panel = board.panels[0];
  if (panel === undefined) throw new Error("Clear sandbox has no panel to update");
  return { headers, panel, projectId };
};

const clearQueryPayload = {
  metric: "upstream.client.requests",
  aggregation: "rate",
  range: { _tag: "relative", window: "15m" },
  step: "10s",
  maxSeries: 12,
  maxPoints: 90,
};

const benchmarkClear = async () => {
  const state = await setupClear();
  const queryUrl = `${clearOrigin}/v1/projects/${state.projectId}/metrics/query`;
  const query = await benchmark(async () => {
    const response = await request(queryUrl, jsonOptions("POST", clearQueryPayload, state.headers));
    return {
      responseBytes: response.bytes,
      pointCount: response.data.series.reduce((total, series) => total + series.points.length, 0),
    };
  });

  let panel = state.panel;
  let updateRequestBytes = 0;
  const update = await benchmark(async (index) => {
    const payload = {
      spec: {
        ...panel.spec,
        title: index % 2 === 0 ? "Payment request rate" : "Payment request volume",
      },
      position: panel.metadata.position,
      expectedRevision: panel.metadata.revision,
    };
    updateRequestBytes = byteLength(payload);
    const response = await request(
      `${clearOrigin}/v1/projects/${state.projectId}/panels/${panel.metadata.id}`,
      jsonOptions("PATCH", payload, state.headers),
    );
    panel = response.data;
    return { responseBytes: response.bytes };
  });

  return {
    version: "Clear local stack",
    query: {
      ...query.latency,
      requestBytes: byteLength(clearQueryPayload),
      responseBytes: query.lastResult.responseBytes,
      returnedPoints: query.lastResult.pointCount,
    },
    persistedPanelUpdate: {
      ...update.latency,
      requestBytes: updateRequestBytes,
      responseBytes: update.lastResult.responseBytes,
    },
  };
};

const ensureGrafanaDataSource = async () => {
  const existing = await fetch(`${grafanaOrigin}/api/datasources/name/Benchmark`);
  if (existing.ok) return (await existing.json()).uid;
  const { data } = await request(
    `${grafanaOrigin}/api/datasources`,
    jsonOptions("POST", {
      name: "Benchmark",
      type: "grafana-testdata-datasource",
      access: "proxy",
      isDefault: true,
    }),
  );
  return data.datasource.uid;
};

const grafanaValues = Array.from({ length: 90 }, (_, index) => 50 + (index % 5) - 2).join(",");

const grafanaQueryPayload = (dataSourceUid) => ({
  queries: [
    {
      refId: "A",
      scenarioId: "csv_metric_values",
      datasource: { uid: dataSourceUid },
      format: "time_series",
      maxDataPoints: 90,
      intervalMs: 10_000, // 10 seconds
      stringInput: grafanaValues,
    },
  ],
  from: "now-15m",
  to: "now",
});

const grafanaPanel = (dataSourceUid) => ({
  id: 1,
  type: "timeseries",
  title: "Payment request rate",
  datasource: { type: "grafana-testdata-datasource", uid: dataSourceUid },
  targets: [
    {
      refId: "A",
      scenarioId: "csv_metric_values",
      datasource: { type: "grafana-testdata-datasource", uid: dataSourceUid },
      format: "time_series",
      maxDataPoints: 90,
      intervalMs: 10_000, // 10 seconds
      stringInput: grafanaValues,
    },
  ],
  gridPos: { h: 8, w: 12, x: 0, y: 0 },
});

const benchmarkGrafana = async () => {
  const { data: health } = await request(`${grafanaOrigin}/api/health`);
  const dataSourceUid = await ensureGrafanaDataSource();
  const dashboardUid = "clear-webmcp-benchmark";
  let dashboard = {
    id: null,
    uid: dashboardUid,
    title: "WebMCP benchmark",
    tags: [],
    timezone: "browser",
    schemaVersion: 42,
    version: 0,
    panels: [grafanaPanel(dataSourceUid)],
  };
  const createPayload = { dashboard, overwrite: true, message: "benchmark setup" };
  const { data: created } = await request(
    `${grafanaOrigin}/api/dashboards/db`,
    jsonOptions("POST", createPayload),
  );
  dashboard = { ...dashboard, id: created.id, version: created.version };

  const queryPayload = grafanaQueryPayload(dataSourceUid);
  const query = await benchmark(async () => {
    const response = await request(
      `${grafanaOrigin}/api/ds/query`,
      jsonOptions("POST", queryPayload),
    );
    return {
      responseBytes: response.bytes,
      pointCount: response.data.results.A.frames[0].data.values[0].length,
    };
  });

  let updateRequestBytes = 0;
  const update = await benchmark(async (index) => {
    dashboard = {
      ...dashboard,
      panels: [
        {
          ...dashboard.panels[0],
          title: index % 2 === 0 ? "Payment request rate" : "Payment request volume",
        },
      ],
    };
    const payload = { dashboard, overwrite: true, message: "benchmark update" };
    updateRequestBytes = byteLength(payload);
    const response = await request(
      `${grafanaOrigin}/api/dashboards/db`,
      jsonOptions("POST", payload),
    );
    dashboard = { ...dashboard, version: response.data.version };
    return { responseBytes: response.bytes };
  });

  await request(`${grafanaOrigin}/api/dashboards/uid/${dashboardUid}`, { method: "DELETE" });
  return {
    version: `Grafana ${health.version}`,
    query: {
      ...query.latency,
      requestBytes: byteLength(queryPayload),
      responseBytes: query.lastResult.responseBytes,
      returnedPoints: query.lastResult.pointCount,
    },
    persistedPanelUpdate: {
      ...update.latency,
      requestBytes: updateRequestBytes,
      responseBytes: update.lastResult.responseBytes,
    },
  };
};

const startedAt = new Date();
const [clear, grafana] = await Promise.all([benchmarkClear(), benchmarkGrafana()]);
const result = {
  generatedAt: startedAt.toISOString(),
  environment: {
    machine: `${process.platform}/${process.arch}`,
    node: process.version,
    transport: "localhost HTTP",
    iterations,
    warmups,
  },
  workflow: {
    clearPanelCreation: { naturalLanguageRequests: 1, webMcpCalls: 1 },
    grafanaPanelCreation: { documentedSteps: 18 },
  },
  caveat:
    "The latency samples exercise different storage and query implementations. Use them as a local smoke comparison, not a universal vendor performance claim.",
  clear,
  grafana,
  sources: [
    "https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard/",
    "https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/api-legacy/data_source/",
  ],
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath !== undefined) await writeFile(outputPath, serialized);
process.stdout.write(serialized);
