package groundtruthexporter

import (
	"context"

	"go.opentelemetry.io/collector/component"
	"go.opentelemetry.io/collector/consumer"
	"go.opentelemetry.io/collector/exporter"
	"go.opentelemetry.io/collector/exporter/exporterhelper"
)

var componentType = component.MustNewType("groundtruth")

func NewFactory() exporter.Factory {
	return exporter.NewFactory(
		componentType,
		func() component.Config { return defaultConfig() },
		exporter.WithTraces(createTraces, component.StabilityLevelBeta),
		exporter.WithMetrics(createMetrics, component.StabilityLevelBeta),
		exporter.WithLogs(createLogs, component.StabilityLevelBeta),
	)
}

func createTraces(ctx context.Context, set exporter.Settings, rawConfig component.Config) (exporter.Traces, error) {
	exporterClient, cfg, err := createClient(ctx, set, rawConfig)
	if err != nil {
		return nil, err
	}
	return exporterhelper.NewTraces(ctx, set, cfg, exporterClient.pushTraces, exporterOptions(exporterClient, cfg)...)
}

func createMetrics(ctx context.Context, set exporter.Settings, rawConfig component.Config) (exporter.Metrics, error) {
	exporterClient, cfg, err := createClient(ctx, set, rawConfig)
	if err != nil {
		return nil, err
	}
	return exporterhelper.NewMetrics(ctx, set, cfg, exporterClient.pushMetrics, exporterOptions(exporterClient, cfg)...)
}

func createLogs(ctx context.Context, set exporter.Settings, rawConfig component.Config) (exporter.Logs, error) {
	exporterClient, cfg, err := createClient(ctx, set, rawConfig)
	if err != nil {
		return nil, err
	}
	return exporterhelper.NewLogs(ctx, set, cfg, exporterClient.pushLogs, exporterOptions(exporterClient, cfg)...)
}

func createClient(ctx context.Context, set exporter.Settings, rawConfig component.Config) (*groundtruthExporter, *Config, error) {
	cfg := rawConfig.(*Config)
	httpClient, err := cfg.ClientConfig.ToClient(ctx, nil, set.TelemetrySettings)
	if err != nil {
		return nil, nil, err
	}
	exporterClient, err := newGroundtruthExporter(cfg, httpClient)
	if err != nil {
		return nil, nil, err
	}
	return exporterClient, cfg, nil
}

func exporterOptions(exporterClient *groundtruthExporter, cfg *Config) []exporterhelper.Option {
	return []exporterhelper.Option{
		exporterhelper.WithCapabilities(consumer.Capabilities{MutatesData: false}),
		exporterhelper.WithShutdown(exporterClient.shutdown),
		exporterhelper.WithTimeout(exporterhelper.TimeoutConfig{Timeout: 0}),
		exporterhelper.WithRetry(cfg.RetryConfig),
		exporterhelper.WithQueue(cfg.QueueConfig),
	}
}
