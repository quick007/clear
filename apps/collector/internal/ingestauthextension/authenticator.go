package ingestauthextension

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/collector/client"
	"go.opentelemetry.io/collector/component"
	"go.opentelemetry.io/collector/extension/extensionauth"

	"github.com/quick007/clear/apps/collector/internal/backendclient"
	"github.com/quick007/clear/apps/collector/internal/ingestidentity"
)

const (
	authorizePath        = "/internal/v1/ingest/authorize"
	publicKeyHeader      = ingestidentity.PublicIngestKeyHeader
	legacyKeyHeader      = ingestidentity.LegacyIngestKeyHeader
	projectMetadataKey   = ingestidentity.ProjectMetadataKey
	ingestKeyMetadataKey = ingestidentity.IngestKeyMetadataKey
	projectAuthAttribute = "project.id"
	minIngestKeyBytes    = ingestidentity.MinIngestKeyBytes
	maxIngestKeyBytes    = ingestidentity.MaxIngestKeyBytes
)

var (
	errMissingCredential     = errors.New("missing ingest key")
	errInvalidCredential     = errors.New("invalid ingest key")
	errAuthorizationService  = errors.New("ingest authorization unavailable")
	errConflictingCredential = errors.New("conflicting ingest credentials")
)

type authenticator struct {
	backend  *backendclient.Client
	cache    *projectCache
	cacheTTL time.Duration
	now      func() time.Time
}

var _ extensionauth.Server = (*authenticator)(nil)

type authorizeRequest struct {
	IngestKey string `json:"ingestKey"`
}

type authorizeResponse struct {
	ProjectID string `json:"projectId"`
}

func newAuthenticator(cfg *Config, httpClient *http.Client) (*authenticator, error) {
	backend, err := backendclient.New(cfg.ClientConfig.Endpoint, string(cfg.ServiceToken), httpClient)
	if err != nil {
		return nil, err
	}
	return &authenticator{
		backend:  backend,
		cache:    newProjectCache(cfg.CacheEntries),
		cacheTTL: cfg.CacheTTL,
		now:      time.Now,
	}, nil
}

func (a *authenticator) Start(context.Context, component.Host) error {
	return nil
}

func (a *authenticator) Shutdown(context.Context) error {
	a.backend.CloseIdleConnections()
	return nil
}

func (a *authenticator) Authenticate(ctx context.Context, sources map[string][]string) (context.Context, error) {
	ingestKey, err := extractIngestKey(sources)
	if err != nil {
		return ctx, err
	}

	now := a.now()
	if projectID, ok := a.cache.get(ingestKey, now); ok {
		return contextWithIdentity(ctx, projectID, ingestKey), nil
	}

	projectID, err := a.authorize(ctx, ingestKey)
	if err != nil {
		return ctx, err
	}
	a.cache.put(ingestKey, projectID, now.Add(a.cacheTTL), now)
	return contextWithIdentity(ctx, projectID, ingestKey), nil
}

func (a *authenticator) authorize(ctx context.Context, ingestKey string) (string, error) {
	body, err := json.Marshal(authorizeRequest{IngestKey: ingestKey})
	if err != nil {
		return "", fmt.Errorf("encode authorization request: %w", err)
	}

	response, err := a.backend.PostJSON(ctx, authorizePath, body, nil)
	if err != nil {
		return "", errAuthorizationService
	}
	switch response.StatusCode {
	case http.StatusOK:
		var payload authorizeResponse
		if err := json.Unmarshal(response.Body, &payload); err != nil {
			return "", errAuthorizationService
		}
		projectID, err := uuid.Parse(payload.ProjectID)
		if err != nil || projectID.Version() != 7 {
			return "", errAuthorizationService
		}
		return projectID.String(), nil
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound:
		return "", errInvalidCredential
	default:
		return "", errAuthorizationService
	}
}

func extractIngestKey(sources map[string][]string) (string, error) {
	public, err := singleHeaderValue(sources, publicKeyHeader)
	if err != nil {
		return "", err
	}
	legacy, err := singleHeaderValue(sources, legacyKeyHeader)
	if err != nil {
		return "", err
	}
	if public != "" && legacy != "" && !credentialsEqual(public, legacy) {
		return "", errConflictingCredential
	}

	authorization, err := singleHeaderValue(sources, "authorization")
	if err != nil {
		return "", err
	}
	bearer := ""
	if authorization != "" {
		parts := strings.Fields(authorization)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return "", errInvalidCredential
		}
		bearer = parts[1]
	}

	explicit := public
	if explicit == "" {
		explicit = legacy
	}
	if explicit != "" && bearer != "" && !credentialsEqual(explicit, bearer) {
		return "", errConflictingCredential
	}
	key := explicit
	if key == "" {
		key = bearer
	}
	if key == "" {
		return "", errMissingCredential
	}
	if len(key) < minIngestKeyBytes || len(key) > maxIngestKeyBytes {
		return "", errInvalidCredential
	}
	return key, nil
}

func singleHeaderValue(sources map[string][]string, name string) (string, error) {
	var values []string
	for key, candidates := range sources {
		if strings.EqualFold(key, name) {
			for _, candidate := range candidates {
				if value := strings.TrimSpace(candidate); value != "" {
					values = append(values, value)
				}
			}
		}
	}
	if len(values) > 1 {
		return "", errInvalidCredential
	}
	if len(values) == 0 {
		return "", nil
	}
	return values[0], nil
}

func credentialsEqual(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func contextWithIdentity(ctx context.Context, projectID, ingestKey string) context.Context {
	info := client.FromContext(ctx)
	metadata := make(map[string][]string)
	for key := range info.Metadata.Keys() {
		if strings.EqualFold(key, "authorization") ||
			strings.EqualFold(key, publicKeyHeader) ||
			strings.EqualFold(key, legacyKeyHeader) {
			continue
		}
		metadata[key] = info.Metadata.Get(key)
	}
	metadata[projectMetadataKey] = []string{projectID}
	metadata[ingestKeyMetadataKey] = []string{ingestKey}
	info.Metadata = client.NewMetadata(metadata)
	info.Auth = projectAuth{projectID: projectID}
	return client.NewContext(ctx, info)
}

type projectAuth struct {
	projectID string
}

func (a projectAuth) GetAttribute(name string) any {
	if name == projectAuthAttribute {
		return a.projectID
	}
	return nil
}

func (projectAuth) GetAttributeNames() []string {
	return []string{projectAuthAttribute}
}

type cacheEntry struct {
	projectID string
	expiresAt time.Time
}

type projectCache struct {
	mu         sync.Mutex
	entries    map[[sha256.Size]byte]cacheEntry
	maxEntries int
}

func newProjectCache(maxEntries int) *projectCache {
	return &projectCache{
		entries:    make(map[[sha256.Size]byte]cacheEntry),
		maxEntries: maxEntries,
	}
}

func (c *projectCache) get(key string, now time.Time) (string, bool) {
	fingerprint := sha256.Sum256([]byte(key))
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[fingerprint]
	if !ok {
		return "", false
	}
	if !now.Before(entry.expiresAt) {
		delete(c.entries, fingerprint)
		return "", false
	}
	return entry.projectID, true
}

func (c *projectCache) put(key, projectID string, expiresAt, now time.Time) {
	fingerprint := sha256.Sum256([]byte(key))
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= c.maxEntries {
		c.prune(now)
	}
	if len(c.entries) >= c.maxEntries {
		c.evictEarliest()
	}
	c.entries[fingerprint] = cacheEntry{projectID: projectID, expiresAt: expiresAt}
}

func (c *projectCache) prune(now time.Time) {
	for key, entry := range c.entries {
		if !now.Before(entry.expiresAt) {
			delete(c.entries, key)
		}
	}
}

func (c *projectCache) evictEarliest() {
	var earliestKey [sha256.Size]byte
	var earliestTime time.Time
	for key, entry := range c.entries {
		if earliestTime.IsZero() || entry.expiresAt.Before(earliestTime) {
			earliestKey = key
			earliestTime = entry.expiresAt
		}
	}
	delete(c.entries, earliestKey)
}
