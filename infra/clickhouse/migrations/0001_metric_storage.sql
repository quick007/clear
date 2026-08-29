CREATE DATABASE IF NOT EXISTS groundtruth;

CREATE TABLE IF NOT EXISTS groundtruth.metric_points
(
    project_id UUID,
    ingested_at DateTime64(9, 'UTC') CODEC(Delta, ZSTD(1)),
    expires_at DateTime('UTC') CODEC(Delta, ZSTD(1)),
    time_unix_nano UInt64 CODEC(Delta, ZSTD(1)),
    start_time_unix_nano UInt64 CODEC(Delta, ZSTD(1)),
    metric_name LowCardinality(String),
    metric_description String CODEC(ZSTD(3)),
    metric_unit LowCardinality(String),
    metric_type Enum8('gauge' = 1, 'sum' = 2, 'histogram' = 3, 'exponential_histogram' = 4, 'summary' = 5),
    aggregation_temporality Enum8('unspecified' = 0, 'delta' = 1, 'cumulative' = 2),
    is_monotonic Bool,
    flags UInt32,
    value_type Enum8('none' = 0, 'int' = 1, 'double' = 2),
    int_value Int64,
    double_value Float64,
    count UInt64,
    has_sum Bool,
    sum Float64,
    has_min Bool,
    min Float64,
    has_max Bool,
    max Float64,
    explicit_bounds Array(Float64) CODEC(ZSTD(3)),
    bucket_counts Array(UInt64) CODEC(ZSTD(3)),
    exponential_scale Int32,
    exponential_zero_count UInt64,
    exponential_zero_threshold Float64,
    positive_offset Int32,
    positive_bucket_counts Array(UInt64) CODEC(ZSTD(3)),
    negative_offset Int32,
    negative_bucket_counts Array(UInt64) CODEC(ZSTD(3)),
    summary_quantiles Array(Float64) CODEC(ZSTD(3)),
    summary_values Array(Float64) CODEC(ZSTD(3)),
    service_name LowCardinality(String),
    resource_schema_url LowCardinality(String),
    resource_attributes Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    resource_attributes_json String CODEC(ZSTD(3)),
    scope_name LowCardinality(String),
    scope_version LowCardinality(String),
    scope_schema_url LowCardinality(String),
    scope_attributes Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    scope_attributes_json String CODEC(ZSTD(3)),
    attributes Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    attributes_json String CODEC(ZSTD(3)),
    dropped_attributes_count UInt32,
    series_hash UInt64 MATERIALIZED cityHash64(metric_name, resource_attributes_json, scope_name, attributes_json),
    INDEX metric_resource_keys_idx mapKeys(resource_attributes) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX metric_attribute_keys_idx mapKeys(attributes) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX metric_attribute_values_idx mapValues(attributes) TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(fromUnixTimestamp64Nano(toInt64(time_unix_nano)))
ORDER BY (project_id, metric_name, service_name, toStartOfMinute(fromUnixTimestamp64Nano(toInt64(time_unix_nano))), series_hash, time_unix_nano)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS groundtruth.metric_exemplars
(
    project_id UUID,
    ingested_at DateTime64(9, 'UTC') CODEC(Delta, ZSTD(1)),
    expires_at DateTime('UTC') CODEC(Delta, ZSTD(1)),
    time_unix_nano UInt64 CODEC(Delta, ZSTD(1)),
    metric_name LowCardinality(String),
    series_hash UInt64,
    trace_id String,
    span_id String,
    value_type Enum8('int' = 1, 'double' = 2),
    int_value Int64,
    double_value Float64,
    filtered_attributes Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    filtered_attributes_json String CODEC(ZSTD(3)),
    INDEX exemplar_trace_idx trace_id TYPE bloom_filter(0.001) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(fromUnixTimestamp64Nano(toInt64(time_unix_nano)))
ORDER BY (project_id, metric_name, series_hash, time_unix_nano, trace_id, span_id)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;
