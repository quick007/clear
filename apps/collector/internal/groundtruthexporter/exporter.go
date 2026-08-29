package groundtruthexporter

import (
	"context"
	"fmt"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"go.opentelemetry.io/collector/consumer/consumererror"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/pmetric"
	"go.opentelemetry.io/collector/pdata/pmetric/pmetricotlp"
	"go.opentelemetry.io/collector/pdata/ptrace"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"

	"github.com/quick007/clear/apps/collector/internal/backendclient"
	"github.com/quick007/clear/apps/collector/internal/ingestidentity"
)

const (
	projectMetadataKey   = ingestidentity.ProjectMetadataKey
	ingestKeyMetadataKey = ingestidentity.IngestKeyMetadataKey
	projectHeader        = ingestidentity.ProjectHeader
	ingestKeyHeader      = ingestidentity.IngestKeyHeader
	telemetryPath        = "/internal/v1/telemetry/"
)

type groundtruthExporter struct {
	backend        *backendclient.Client
	maxRequestSize int64
}

func newGroundtruthExporter(cfg *Config, httpClient *http.Client) (*groundtruthExporter, error) {
	backend, err := backendclient.New(cfg.ClientConfig.Endpoint, string(cfg.ServiceToken), httpClient)
	if err != nil {
		return nil, err
	}
	return &groundtruthExporter{backend: backend, maxRequestSize: cfg.MaxRequestSize}, nil
}

func (e *groundtruthExporter) shutdown(context.Context) error {
	e.backend.CloseIdleConnections()
	return nil
}

func (e *groundtruthExporter) pushTraces(ctx context.Context, traces ptrace.Traces) error {
	body, err := ptraceotlp.NewExportRequestFromTraces(traces).MarshalJSON()
	if err != nil {
		return permanentError(codes.InvalidArgument, "encode traces")
	}
	return e.push(ctx, "traces", body)
}

func (e *groundtruthExporter) pushMetrics(ctx context.Context, metrics pmetric.Metrics) error {
	body, err := pmetricotlp.NewExportRequestFromMetrics(metrics).MarshalJSON()
	if err != nil {
		return permanentError(codes.InvalidArgument, "encode metrics")
	}
	return e.push(ctx, "metrics", body)
}

func (e *groundtruthExporter) pushLogs(ctx context.Context, logs plog.Logs) error {
	body, err := plogotlp.NewExportRequestFromLogs(logs).MarshalJSON()
	if err != nil {
		return permanentError(codes.InvalidArgument, "encode logs")
	}
	return e.push(ctx, "logs", body)
}

func (e *groundtruthExporter) push(ctx context.Context, signal string, body []byte) error {
	headers, err := ingestidentity.InternalHeadersFromContext(ctx)
	if err != nil {
		return permanentError(codes.Internal, "missing authenticated ingest identity")
	}
	if int64(len(body)) > e.maxRequestSize {
		return permanentError(codes.InvalidArgument, fmt.Sprintf("%s batch exceeds the configured export size", signal))
	}

	response, err := e.backend.PostJSON(ctx, telemetryPath+signal, body, headers)
	if err != nil {
		return retryableError(codes.Unavailable, "telemetry backend unavailable")
	}
	if response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusMultipleChoices {
		return nil
	}
	return classifyBackendStatus(response.StatusCode)
}

func classifyBackendStatus(statusCode int) error {
	switch statusCode {
	case http.StatusTooManyRequests:
		return retryableError(codes.ResourceExhausted, "telemetry backend throttled the batch")
	case http.StatusRequestTimeout:
		return retryableError(codes.DeadlineExceeded, "telemetry backend timed out")
	case http.StatusUnauthorized:
		return permanentError(codes.Unauthenticated, "telemetry ingest is no longer authorized")
	case http.StatusForbidden:
		return permanentError(codes.Internal, "collector service authentication failed")
	case http.StatusNotFound:
		return permanentError(codes.Unauthenticated, "ingest project is no longer authorized")
	case http.StatusBadRequest, http.StatusRequestEntityTooLarge, http.StatusUnprocessableEntity:
		return permanentError(codes.InvalidArgument, "telemetry backend rejected the batch")
	default:
		if statusCode >= http.StatusInternalServerError {
			return retryableError(codes.Unavailable, "telemetry backend unavailable")
		}
		return permanentError(codes.InvalidArgument, "telemetry backend rejected the batch")
	}
}

func retryableError(code codes.Code, message string) error {
	return consumererror.NewRetryableError(status.Error(code, message))
}

func permanentError(code codes.Code, message string) error {
	return consumererror.NewPermanent(status.Error(code, message))
}
