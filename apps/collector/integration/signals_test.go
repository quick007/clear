package integration

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/pmetric"
	"go.opentelemetry.io/collector/pdata/ptrace"
)

func postJSON(t *testing.T, endpoint string, body []byte) {
	t.Helper()
	response := postRaw(t, endpoint, "application/json", "", body, ingestKey)
	assert.Equal(t, http.StatusOK, response.StatusCode)
	require.NoError(t, response.Body.Close())
}

func postProtobuf(t *testing.T, endpoint string, body []byte) {
	t.Helper()
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	_, err := writer.Write(body)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	response := postRaw(t, endpoint, "application/x-protobuf", "gzip", compressed.Bytes(), ingestKey)
	assert.Equal(t, http.StatusOK, response.StatusCode)
	require.NoError(t, response.Body.Close())
}

func postRaw(t *testing.T, endpoint, contentType, contentEncoding string, body []byte, key string) *http.Response {
	t.Helper()
	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, endpoint, bytes.NewReader(body))
	require.NoError(t, err)
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("X-Clear-Ingest-Key", key)
	if contentEncoding != "" {
		request.Header.Set("Content-Encoding", contentEncoding)
	}
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)
	return response
}

type marshaler interface {
	MarshalJSON() ([]byte, error)
	MarshalProto() ([]byte, error)
}

func mustJSON(t *testing.T, request marshaler) []byte {
	t.Helper()
	body, err := request.MarshalJSON()
	require.NoError(t, err)
	return body
}

func mustProto(t *testing.T, request marshaler) []byte {
	t.Helper()
	body, err := request.MarshalProto()
	require.NoError(t, err)
	return body
}

func withUnknownField(t *testing.T, body []byte) []byte {
	t.Helper()
	var payload map[string]any
	require.NoError(t, json.Unmarshal(body, &payload))
	payload["futureField"] = map[string]any{"ignored": true}
	result, err := json.Marshal(payload)
	require.NoError(t, err)
	return result
}

func sampleMetrics() pmetric.Metrics {
	metrics := pmetric.NewMetrics()
	resourceMetrics := metrics.ResourceMetrics().AppendEmpty()
	setResource(resourceMetrics.Resource())
	metric := resourceMetrics.ScopeMetrics().AppendEmpty().Metrics().AppendEmpty()
	metric.SetName("http.server.duration")
	metric.SetEmptyHistogram().DataPoints().AppendEmpty().SetCount(1)
	return metrics
}

func sampleLogs() plog.Logs {
	logs := plog.NewLogs()
	resourceLogs := logs.ResourceLogs().AppendEmpty()
	setResource(resourceLogs.Resource())
	record := resourceLogs.ScopeLogs().AppendEmpty().LogRecords().AppendEmpty()
	record.Body().SetStr("checkout failed")
	record.SetTraceID(pcommon.TraceID{1})
	record.SetSpanID(pcommon.SpanID{2})
	return logs
}

func sampleTraces() ptrace.Traces {
	traces := ptrace.NewTraces()
	resourceSpans := traces.ResourceSpans().AppendEmpty()
	setResource(resourceSpans.Resource())
	span := resourceSpans.ScopeSpans().AppendEmpty().Spans().AppendEmpty()
	span.SetName("POST /checkout")
	span.SetTraceID(pcommon.TraceID{1})
	span.SetSpanID(pcommon.SpanID{2})
	return traces
}

func setResource(resource pcommon.Resource) {
	resource.Attributes().PutStr("service.name", "checkout-api")
	resource.Attributes().PutStr("groundtruth.project.id", "spoofed-project")
}
