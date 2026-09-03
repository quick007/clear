# Clear WebMCP and Grafana benchmark

This is a small, reproducible workflow benchmark for submission copy. It measures the programmatic path an agent uses to query a metric and persist a dashboard change. It also compares the number of documented operator steps needed to create a panel.

## Snapshot

Measured September 3, 2026 on the same Apple Silicon machine over localhost HTTP, using 5 warmups and 100 measured iterations.

| Measurement                    |               Clear |      Grafana 13.2.0 |               Difference |
| ------------------------------ | ------------------: | ------------------: | -----------------------: |
| Persisted panel update, median |             2.89 ms |             8.55 ms |    Clear was 3.0x faster |
| Persisted panel update, p95    |             4.00 ms |            10.23 ms |    Clear was 2.6x faster |
| Metric query request body      |           144 bytes |           473 bytes |    Clear was 70% smaller |
| Metric query, median           |             2.78 ms |             2.96 ms |            Roughly equal |
| New panel workflow             | 1 typed WebMCP call | 18 documented steps | 18-to-1 interaction path |

Raw results are checked in at [`webmcp-vs-grafana-results.json`](./webmcp-vs-grafana-results.json).

## Suggested submission copy

> In a 100-run localhost benchmark, Clear persisted an agent-driven panel change in 2.89 ms median, compared with 8.55 ms for a Grafana 13.2 dashboard save. Clear's typed metric-query request was 70% smaller, and its WebMCP interface reduced a new panel from Grafana's documented 18-step workflow to one tool call.

Use "local benchmark" with the latency numbers. Do not present this as a universal Grafana performance result.

## Method

The script uses two isolated local systems:

- Clear's real sandbox stack, including PostgreSQL and ClickHouse.
- Grafana 13.2.0 with its built-in TestData data source and default SQLite database.

For each system it measures:

1. A metric query over a 15-minute range.
2. A persisted title change to an existing time-series panel.

The script records request and response sizes plus median, p95, mean, minimum, and maximum HTTP round-trip latency. Clear's measurement follows the API path used by its WebMCP operations. Grafana's measurement uses the HTTP endpoints used by its frontend.

The query latency comparison is only a smoke test because the systems use different storage and query implementations and return different point counts. The panel-update comparison is closer, but still measures persistence acknowledgement rather than browser paint time.

The 18-step count comes from Grafana's current official [Create dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard/) procedure. The Grafana query shape follows its official [Data source HTTP API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/api-legacy/data_source/) documentation.

## Run it again

Start the existing local Clear stack, then start an isolated Grafana container:

```sh
docker run --rm -d \
  --name clear-grafana-benchmark \
  -p 127.0.0.1:3310:3000 \
  -e GF_AUTH_ANONYMOUS_ENABLED=true \
  -e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
  -e GF_AUTH_DISABLE_LOGIN_FORM=true \
  grafana/grafana:13.2.0
```

Run the benchmark:

```sh
VITE_CHECKOUT_API_URL=http://127.0.0.1:4101 \
BENCHMARK_OUTPUT=video/benchmarks/webmcp-vs-grafana-results.json \
BENCHMARK_ITERATIONS=100 \
vp run benchmark:grafana
```

Stop the temporary Grafana container when finished:

```sh
docker stop clear-grafana-benchmark
```
