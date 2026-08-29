package ingestauthextension

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/client"
	"go.opentelemetry.io/collector/config/configopaque"
)

func TestExtractIngestKey(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		headers map[string][]string
		want    string
		err     error
	}{
		"clear header": {
			headers: map[string][]string{"X-Clear-Ingest-Key": {"project-ingest-secret"}},
			want:    "project-ingest-secret",
		},
		"legacy header": {
			headers: map[string][]string{"X-Groundtruth-Ingest-Key": {"project-ingest-secret"}},
			want:    "project-ingest-secret",
		},
		"bearer header": {
			headers: map[string][]string{"authorization": {"Bearer project-ingest-secret"}},
			want:    "project-ingest-secret",
		},
		"matching headers": {
			headers: map[string][]string{
				"authorization":            {"bearer project-ingest-secret"},
				"x-clear-ingest-key":       {"project-ingest-secret"},
				"x-groundtruth-ingest-key": {"project-ingest-secret"},
			},
			want: "project-ingest-secret",
		},
		"missing": {
			err: errMissingCredential,
		},
		"wrong scheme": {
			headers: map[string][]string{"authorization": {"Basic abc"}},
			err:     errInvalidCredential,
		},
		"too short": {
			headers: map[string][]string{"authorization": {"Bearer short-key"}},
			err:     errInvalidCredential,
		},
		"conflicting clear and legacy": {
			headers: map[string][]string{
				"x-clear-ingest-key":       {"first-project-secret"},
				"x-groundtruth-ingest-key": {"second-project-secret"},
			},
			err: errConflictingCredential,
		},
		"conflicting clear and bearer": {
			headers: map[string][]string{
				"authorization":      {"Bearer first-project-secret"},
				"x-clear-ingest-key": {"second-project-secret"},
			},
			err: errConflictingCredential,
		},
		"repeated": {
			headers: map[string][]string{
				"x-clear-ingest-key": {"first-project-secret", "second-project-secret"},
			},
			err: errInvalidCredential,
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			got, err := extractIngestKey(test.headers)
			if test.err != nil {
				require.ErrorIs(t, err, test.err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, test.want, got)
		})
	}
}

func TestAuthenticateAddsIdentityAndCaches(t *testing.T) {
	t.Parallel()

	projectID := uuid.Must(uuid.NewV7()).String()
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		assert.Equal(t, authorizePath, r.URL.Path)
		assert.Equal(t, "Bearer service-secret", r.Header.Get("Authorization"))
		var body authorizeRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		assert.Equal(t, "project-ingest-secret", body.IngestKey)
		assert.NotContains(t, r.Header, publicKeyHeader)
		assert.NotContains(t, r.Header, legacyKeyHeader)
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(authorizeResponse{ProjectID: projectID}))
	}))
	t.Cleanup(server.Close)

	cfg := defaultConfig()
	cfg.ClientConfig.Endpoint = server.URL
	cfg.ServiceToken = configopaque.String("service-secret")
	auth, err := newAuthenticator(cfg, server.Client())
	require.NoError(t, err)
	now := time.Date(2026, time.August, 27, 20, 0, 0, 0, time.UTC)
	auth.now = func() time.Time { return now }

	ctx := client.NewContext(context.Background(), client.Info{
		Metadata: client.NewMetadata(map[string][]string{
			"authorization":            {"Bearer project-ingest-secret"},
			"x-clear-ingest-key":       {"project-ingest-secret"},
			"x-groundtruth-ingest-key": {"project-ingest-secret"},
			"x-request-id":             {"request-1"},
		}),
	})

	for range 2 {
		result, authErr := auth.Authenticate(ctx, map[string][]string{
			publicKeyHeader: {"project-ingest-secret"},
		})
		require.NoError(t, authErr)
		info := client.FromContext(result)
		assert.Equal(t, []string{projectID}, info.Metadata.Get(projectMetadataKey))
		assert.Equal(t, []string{"project-ingest-secret"}, info.Metadata.Get(ingestKeyMetadataKey))
		assert.Equal(t, []string{"request-1"}, info.Metadata.Get("x-request-id"))
		assert.Empty(t, info.Metadata.Get("authorization"))
		assert.Empty(t, info.Metadata.Get(publicKeyHeader))
		assert.Empty(t, info.Metadata.Get(legacyKeyHeader))
		assert.Equal(t, projectID, info.Auth.GetAttribute(projectAuthAttribute))
		assert.Nil(t, info.Auth.GetAttribute("ingest.key"))
	}
	assert.Equal(t, int32(1), requests.Load())

	now = now.Add(cfg.CacheTTL)
	_, err = auth.Authenticate(ctx, map[string][]string{publicKeyHeader: {"project-ingest-secret"}})
	require.NoError(t, err)
	assert.Equal(t, int32(2), requests.Load())
}

func TestAuthenticateRejectsInvalidKey(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "invalid", http.StatusUnauthorized)
	}))
	t.Cleanup(server.Close)

	cfg := defaultConfig()
	cfg.ClientConfig.Endpoint = server.URL
	cfg.ServiceToken = configopaque.String("service-secret")
	auth, err := newAuthenticator(cfg, server.Client())
	require.NoError(t, err)

	_, err = auth.Authenticate(context.Background(), map[string][]string{
		publicKeyHeader: {"invalid-project-secret"},
	})
	require.ErrorIs(t, err, errInvalidCredential)
}

func TestAuthenticateRejectsShortKeyBeforeAuthorization(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		http.Error(w, "unexpected", http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	cfg := defaultConfig()
	cfg.ClientConfig.Endpoint = server.URL
	cfg.ServiceToken = configopaque.String("service-secret")
	auth, err := newAuthenticator(cfg, server.Client())
	require.NoError(t, err)

	_, err = auth.Authenticate(context.Background(), map[string][]string{
		publicKeyHeader: {"short-key"},
	})
	require.ErrorIs(t, err, errInvalidCredential)
	assert.Zero(t, requests.Load())
}

func TestAuthenticateRejectsConflictingPublicAndLegacyKeysBeforeAuthorization(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		http.Error(w, "unexpected", http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	cfg := defaultConfig()
	cfg.ClientConfig.Endpoint = server.URL
	cfg.ServiceToken = configopaque.String("service-secret")
	auth, err := newAuthenticator(cfg, server.Client())
	require.NoError(t, err)

	_, err = auth.Authenticate(context.Background(), map[string][]string{
		publicKeyHeader: {"first-project-secret"},
		legacyKeyHeader: {"second-project-secret"},
	})
	require.ErrorIs(t, err, errConflictingCredential)
	assert.Zero(t, requests.Load())
}

func TestConfigValidation(t *testing.T) {
	t.Parallel()

	cfg := defaultConfig()
	require.ErrorContains(t, cfg.Validate(), "endpoint")
	cfg.ClientConfig.Endpoint = "backend:4000"
	cfg.ServiceToken = configopaque.String("service-secret")
	require.NoError(t, cfg.Validate())
}
