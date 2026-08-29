package groundtruthexporter

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"go.opentelemetry.io/collector/client"
	"go.opentelemetry.io/collector/config/configopaque"
	"go.opentelemetry.io/collector/consumer/consumererror"
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/pmetric"
	"go.opentelemetry.io/collector/pdata/pmetric/pmetricotlp"
	"go.opentelemetry.io/collector/pdata/ptrace"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"
)

func TestExporterSendsCanonicalSignalPayloads(t *testing.T) {
	t.Parallel()

	projectID := uuid.Must(uuid.NewV7()).String()
	ingestKey := "project-secret-original-case"
	received := make(map[string]int)
	var mu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer service-secret", r.Header.Get("Authorization"))
		assert.Equal(t, projectID, r.Header.Get(projectHeader))
		assert.Equal(t, ingestKey, r.Header.Get(ingestKeyHeader))
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		signal := r.URL.Path[len(telemetryPath):]
		body := readBody(t, r)
		assert.NotContains(t, string(body), ingestKey)
		switch signal {
		case "metrics":
			request := pmetricotlp.NewExportRequest()
			require.NoError(t, request.UnmarshalJSON(body))
			assert.Equal(t, 1, request.Metrics().DataPointCount())
		case "logs":
			request := plogotlp.NewExportRequest()
			require.NoError(t, request.UnmarshalJSON(body))
			assert.Equal(t, 1, request.Logs().LogRecordCount())
		case "traces":
			request := ptraceotlp.NewExportRequest()
			require.NoError(t, request.UnmarshalJSON(body))
			assert.Equal(t, 1, request.Traces().SpanCount())
		default:
			t.Fatalf("unexpected signal path %q", r.URL.Path)
		}
		mu.Lock()
		received[signal]++
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	cfg := defaultConfig()
	cfg.ClientConfig.Endpoint = server.URL
	cfg.ClientConfig.Compression = ""
	cfg.ServiceToken = configopaque.String("service-secret")
	exporterClient, err := newGroundtruthExporter(cfg, server.Client())
	require.NoError(t, err)
	ctx := client.NewContext(context.Background(), client.Info{
		Metadata: client.NewMetadata(map[string][]string{
			projectMetadataKey:   {projectID},
			ingestKeyMetadataKey: {ingestKey},
		}),
	})

	require.NoError(t, exporterClient.pushMetrics(ctx, sampleMetrics()))
	require.NoError(t, exporterClient.pushLogs(ctx, sampleLogs()))
	require.NoError(t, exporterClient.pushTraces(ctx, sampleTraces()))
	assert.Equal(t, map[string]int{"metrics": 1, "logs": 1, "traces": 1}, received)
}

func TestClassifyBackendStatus(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		statusCode int
		code       codes.Code
		permanent  bool
	}{
		"throttled":       {statusCode: http.StatusTooManyRequests, code: codes.ResourceExhausted},
		"unavailable":     {statusCode: http.StatusServiceUnavailable, code: codes.Unavailable},
		"invalid payload": {statusCode: http.StatusBadRequest, code: codes.InvalidArgument, permanent: true},
		"stale project":   {statusCode: http.StatusNotFound, code: codes.Unauthenticated, permanent: true},
		"revoked key":     {statusCode: http.StatusUnauthorized, code: codes.Unauthenticated, permanent: true},
		"service auth":    {statusCode: http.StatusForbidden, code: codes.Internal, permanent: true},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			err := classifyBackendStatus(test.statusCode)
			assert.Equal(t, test.code, status.Code(err))
			assert.Equal(t, test.permanent, consumererror.IsPermanent(err))
		})
	}
}

func TestExporterRequiresAuthenticatedIdentityMetadata(t *testing.T) {
	t.Parallel()

	projectID := uuid.Must(uuid.NewV7()).String()
	cfg := defaultConfig()
	cfg.ClientConfig.Endpoint = "http://backend:4000"
	cfg.ServiceToken = configopaque.String("service-secret")
	exporterClient, err := newGroundtruthExporter(cfg, http.DefaultClient)
	require.NoError(t, err)
	tests := map[string]context.Context{
		"missing project": client.NewContext(context.Background(), client.Info{
			Metadata: client.NewMetadata(map[string][]string{ingestKeyMetadataKey: {"project-ingest-secret"}}),
		}),
		"missing ingest key": client.NewContext(context.Background(), client.Info{
			Metadata: client.NewMetadata(map[string][]string{projectMetadataKey: {projectID}}),
		}),
	}
	for name, ctx := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			err := exporterClient.pushMetrics(ctx, sampleMetrics())
			require.Error(t, err)
			assert.True(t, consumererror.IsPermanent(err))
			assert.Equal(t, codes.Internal, status.Code(err))
		})
	}
}

func TestExporterTreatsRevokedIngestKeyAsPermanent(t *testing.T) {
	t.Parallel()

	projectID := uuid.Must(uuid.NewV7()).String()
	ingestKey := "revoked-project-secret"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, projectID, r.Header.Get(projectHeader))
		assert.Equal(t, ingestKey, r.Header.Get(ingestKeyHeader))
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}))
	t.Cleanup(server.Close)

	cfg := defaultConfig()
	cfg.ClientConfig.Endpoint = server.URL
	cfg.ClientConfig.Compression = ""
	cfg.ServiceToken = configopaque.String("service-secret")
	exporterClient, err := newGroundtruthExporter(cfg, server.Client())
	require.NoError(t, err)
	ctx := client.NewContext(context.Background(), client.Info{
		Metadata: client.NewMetadata(map[string][]string{
			projectMetadataKey:   {projectID},
			ingestKeyMetadataKey: {ingestKey},
		}),
	})

	err = exporterClient.pushMetrics(ctx, sampleMetrics())
	require.Error(t, err)
	assert.True(t, consumererror.IsPermanent(err))
	assert.Equal(t, codes.Unauthenticated, status.Code(err))
}

func TestConfigRequiresSynchronousQueue(t *testing.T) {
	t.Parallel()

	cfg := defaultConfig()
	cfg.ClientConfig.Endpoint = "backend:4000"
	cfg.ServiceToken = configopaque.String("service-secret")
	require.NoError(t, cfg.Validate())
	cfg.QueueConfig.Get().WaitForResult = false
	require.ErrorContains(t, cfg.Validate(), "wait_for_result must remain true")
}

func sampleMetrics() pmetric.Metrics {
	metrics := pmetric.NewMetrics()
	resourceMetrics := metrics.ResourceMetrics().AppendEmpty()
	resourceMetrics.Resource().Attributes().PutStr("service.name", "checkout-api")
	scopeMetrics := resourceMetrics.ScopeMetrics().AppendEmpty()
	scopeMetrics.Scope().SetName("groundtruth.test")
	metric := scopeMetrics.Metrics().AppendEmpty()
	metric.SetName("http.server.duration")
	point := metric.SetEmptyGauge().DataPoints().AppendEmpty()
	point.SetDoubleValue(123.4)
	return metrics
}

func sampleLogs() plog.Logs {
	logs := plog.NewLogs()
	resourceLogs := logs.ResourceLogs().AppendEmpty()
	resourceLogs.Resource().Attributes().PutStr("service.name", "checkout-api")
	scopeLogs := resourceLogs.ScopeLogs().AppendEmpty()
	scopeLogs.Scope().SetName("groundtruth.test")
	record := scopeLogs.LogRecords().AppendEmpty()
	record.Body().SetStr("checkout failed")
	record.SetSeverityNumber(plog.SeverityNumberError)
	return logs
}

func sampleTraces() ptrace.Traces {
	traces := ptrace.NewTraces()
	resourceSpans := traces.ResourceSpans().AppendEmpty()
	resourceSpans.Resource().Attributes().PutStr("service.name", "checkout-api")
	scopeSpans := resourceSpans.ScopeSpans().AppendEmpty()
	scopeSpans.Scope().SetName("groundtruth.test")
	span := scopeSpans.Spans().AppendEmpty()
	span.SetName("POST /checkout")
	span.SetTraceID(pcommon.TraceID{1})
	span.SetSpanID(pcommon.SpanID{2})
	return traces
}

func readBody(t *testing.T, r *http.Request) []byte {
	t.Helper()
	body, err := io.ReadAll(r.Body)
	require.NoError(t, err)
	return body
}
