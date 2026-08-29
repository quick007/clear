package ingestauthextension

import (
	"context"

	"go.opentelemetry.io/collector/component"
	"go.opentelemetry.io/collector/extension"
)

var componentType = component.MustNewType("groundtruth_auth")

func NewFactory() extension.Factory {
	return extension.NewFactory(
		componentType,
		func() component.Config { return defaultConfig() },
		createExtension,
		component.StabilityLevelBeta,
	)
}

func createExtension(ctx context.Context, set extension.Settings, rawConfig component.Config) (extension.Extension, error) {
	cfg := rawConfig.(*Config)
	httpClient, err := cfg.ClientConfig.ToClient(ctx, nil, set.TelemetrySettings)
	if err != nil {
		return nil, err
	}
	return newAuthenticator(cfg, httpClient)
}
