package ingestidentity

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"go.opentelemetry.io/collector/client"
)

const (
	ProjectMetadataKey    = "groundtruth-project-id"
	IngestKeyMetadataKey  = "groundtruth-ingest-key"
	ProjectHeader         = "X-Groundtruth-Project-Id"
	PublicIngestKeyHeader = "X-Clear-Ingest-Key"
	LegacyIngestKeyHeader = "X-Groundtruth-Ingest-Key"
	IngestKeyHeader       = LegacyIngestKeyHeader
	MinIngestKeyBytes     = 16
	MaxIngestKeyBytes     = 512
)

var errInvalidIdentity = errors.New("authenticated ingest identity is incomplete")

func InternalHeadersFromContext(ctx context.Context) (http.Header, error) {
	metadata := client.FromContext(ctx).Metadata
	projectIDValue, err := singleValue(metadata.Get(ProjectMetadataKey))
	if err != nil {
		return nil, errInvalidIdentity
	}
	projectID, err := uuid.Parse(projectIDValue)
	if err != nil || projectID.Version() != 7 {
		return nil, errInvalidIdentity
	}

	ingestKey, err := singleValue(metadata.Get(IngestKeyMetadataKey))
	if err != nil || len(ingestKey) < MinIngestKeyBytes || len(ingestKey) > MaxIngestKeyBytes {
		return nil, errInvalidIdentity
	}

	headers := make(http.Header)
	headers.Set(ProjectHeader, projectID.String())
	headers.Set(IngestKeyHeader, ingestKey)
	return headers, nil
}

func singleValue(values []string) (string, error) {
	if len(values) != 1 || values[0] == "" {
		return "", errInvalidIdentity
	}
	return values[0], nil
}
