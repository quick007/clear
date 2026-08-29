package ingestauthextension

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"go.opentelemetry.io/collector/config/confighttp"
	"go.opentelemetry.io/collector/config/configopaque"

	"github.com/quick007/clear/apps/collector/internal/backendclient"
)

const (
	defaultCacheTTL       = time.Minute // 1 minute
	defaultCacheEntries   = 4096
	defaultRequestTimeout = 2 * time.Second // 2 seconds
)

type Config struct {
	ClientConfig confighttp.ClientConfig `mapstructure:",squash"`
	ServiceToken configopaque.String     `mapstructure:"service_token"`
	CacheTTL     time.Duration           `mapstructure:"cache_ttl"`
	CacheEntries int                     `mapstructure:"cache_entries"`
}

func (cfg *Config) Validate() error {
	var validationError error
	if _, err := backendclient.NormalizeEndpoint(cfg.ClientConfig.Endpoint); err != nil {
		validationError = errors.Join(validationError, fmt.Errorf("endpoint: %w", err))
	}
	if strings.TrimSpace(string(cfg.ServiceToken)) == "" {
		validationError = errors.Join(validationError, errors.New("service_token must not be empty"))
	}
	if cfg.CacheTTL <= 0 {
		validationError = errors.Join(validationError, errors.New("cache_ttl must be positive"))
	}
	if cfg.CacheEntries <= 0 {
		validationError = errors.Join(validationError, errors.New("cache_entries must be positive"))
	}
	if err := cfg.ClientConfig.Validate(); err != nil {
		validationError = errors.Join(validationError, fmt.Errorf("HTTP client: %w", err))
	}
	return validationError
}

func defaultConfig() *Config {
	clientConfig := confighttp.NewDefaultClientConfig()
	clientConfig.Timeout = defaultRequestTimeout
	return &Config{
		ClientConfig: clientConfig,
		CacheTTL:     defaultCacheTTL,
		CacheEntries: defaultCacheEntries,
	}
}
