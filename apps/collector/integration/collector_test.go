package integration

import (
	"context"
	"net/http"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/pmetric/pmetricotlp"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"
)

const (
	ingestKey    = "test-project-ingest-key"
	serviceToken = "test-service-token"
)

func TestCollectorAcceptsEveryStableSignalOverHTTPAndGRPC(t *testing.T) {
	binary := os.Getenv("GROUNDTRUTH_COLLECTOR_BINARY")
	if binary == "" {
		t.Skip("set GROUNDTRUTH_COLLECTOR_BINARY to run the generated distribution integration test")
	}

	projectID := uuid.Must(uuid.NewV7()).String()
	backend := newFakeBackend(t, projectID)
	t.Cleanup(backend.Close)

	grpcAddress := freeAddress(t)
	httpAddress := freeAddress(t)
	healthAddress := freeAddress(t)
	process := startCollector(t, binary, grpcAddress, httpAddress, healthAddress, backend.URL)
	t.Cleanup(process.stop)
	waitForHealth(t, process, "http://"+healthAddress+"/healthz")

	metricsRequest := pmetricotlp.NewExportRequestFromMetrics(sampleMetrics())
	logsRequest := plogotlp.NewExportRequestFromLogs(sampleLogs())
	tracesRequest := ptraceotlp.NewExportRequestFromTraces(sampleTraces())

	postJSON(t, "http://"+httpAddress+"/v1/metrics", withUnknownField(t, mustJSON(t, metricsRequest)))
	postJSON(t, "http://"+httpAddress+"/v1/logs", withUnknownField(t, mustJSON(t, logsRequest)))
	postJSON(t, "http://"+httpAddress+"/v1/traces", withUnknownField(t, mustJSON(t, tracesRequest)))

	postProtobuf(t, "http://"+httpAddress+"/v1/metrics", mustProto(t, metricsRequest))
	postProtobuf(t, "http://"+httpAddress+"/v1/logs", mustProto(t, logsRequest))
	postProtobuf(t, "http://"+httpAddress+"/v1/traces", mustProto(t, tracesRequest))

	connection, err := grpc.NewClient(grpcAddress, grpc.WithTransportCredentials(insecure.NewCredentials()))
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, connection.Close()) })
	ctx := metadata.AppendToOutgoingContext(context.Background(), "x-clear-ingest-key", ingestKey)
	_, err = pmetricotlp.NewGRPCClient(connection).Export(ctx, metricsRequest)
	require.NoError(t, err)
	_, err = plogotlp.NewGRPCClient(connection).Export(ctx, logsRequest)
	require.NoError(t, err)
	_, err = ptraceotlp.NewGRPCClient(connection).Export(ctx, tracesRequest)
	require.NoError(t, err)

	waitForSignals(t, backend, map[string]int{"metrics": 3, "logs": 3, "traces": 3})
	assert.Equal(t, int32(1), backend.authorizationCount.Load())

	response := postRaw(t, "http://"+httpAddress+"/v1/metrics", "application/json", "", []byte(`{"resourceMetrics":[]}`), "wrong-key")
	assert.Equal(t, http.StatusUnauthorized, response.StatusCode)
	require.NoError(t, response.Body.Close())
}
