package groundtruthexporter

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"go.opentelemetry.io/collector/config/configcompression"
	"go.opentelemetry.io/collector/config/confighttp"
	"go.opentelemetry.io/collector/config/configopaque"
	"go.opentelemetry.io/collector/config/configoptional"
	"go.opentelemetry.io/collector/config/configretry"
	"go.opentelemetry.io/collector/exporter/exporterhelper"

	"github.com/quick007/clear/apps/collector/internal/backendclient"
)

const (
	defaultMaxRequestBytes = 16 * 1024 * 1024
	defaultRequestTimeout  = 5 * time.Second // 5 seconds
	defaultQueueSize       = 128
	defaultQueueConsumers  = 4
)

type Config struct {
	ClientConfig   confighttp.ClientConfig                                  `mapstructure:",squash"`
	ServiceToken   configopaque.String                                      `mapstructure:"service_token"`
	MaxRequestSize int64                                                    `mapstructure:"max_request_size"`
	QueueConfig    configoptional.Optional[exporterhelper.QueueBatchConfig] `mapstructure:"sending_queue"`
	RetryConfig    configretry.BackOffConfig                                `mapstructure:"retry_on_failure"`
}

func (cfg *Config) Validate() error {
	var validationError error
	if _, err := backendclient.NormalizeEndpoint(cfg.ClientConfig.Endpoint); err != nil {
		validationError = errors.Join(validationError, fmt.Errorf("endpoint: %w", err))
	}
	if strings.TrimSpace(string(cfg.ServiceToken)) == "" {
		validationError = errors.Join(validationError, errors.New("service_token must not be empty"))
	}
	if cfg.MaxRequestSize <= 0 {
		validationError = errors.Join(validationError, errors.New("max_request_size must be positive"))
	}
	if err := cfg.ClientConfig.Validate(); err != nil {
		validationError = errors.Join(validationError, fmt.Errorf("HTTP client: %w", err))
	}
	if err := cfg.RetryConfig.Validate(); err != nil {
		validationError = errors.Join(validationError, fmt.Errorf("retry_on_failure: %w", err))
	}
	if cfg.QueueConfig.HasValue() {
		queue := cfg.QueueConfig.Get()
		if err := queue.Validate(); err != nil {
			validationError = errors.Join(validationError, fmt.Errorf("sending_queue: %w", err))
		}
		if !queue.WaitForResult {
			validationError = errors.Join(validationError, errors.New("sending_queue.wait_for_result must remain true so OTLP callers receive export failures"))
		}
	}
	return validationError
}

func defaultConfig() *Config {
	clientConfig := confighttp.NewDefaultClientConfig()
	clientConfig.Timeout = defaultRequestTimeout
	clientConfig.Compression = configcompression.TypeGzip

	queueConfig := exporterhelper.NewDefaultQueueConfig()
	queueConfig.WaitForResult = true
	queueConfig.QueueSize = defaultQueueSize
	queueConfig.NumConsumers = defaultQueueConsumers
	queueConfig.Batch = configoptional.None[exporterhelper.BatchConfig]()

	retryConfig := configretry.NewDefaultBackOffConfig()
	retryConfig.InitialInterval = 250 * time.Millisecond // 250 milliseconds
	retryConfig.MaxInterval = 2 * time.Second            // 2 seconds
	retryConfig.MaxElapsedTime = 10 * time.Second        // 10 seconds

	return &Config{
		ClientConfig:   clientConfig,
		MaxRequestSize: defaultMaxRequestBytes,
		QueueConfig:    configoptional.Some(queueConfig),
		RetryConfig:    retryConfig,
	}
}
