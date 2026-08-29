CREATE TABLE IF NOT EXISTS groundtruth.logs
(
    project_id UUID,
    ingested_at DateTime64(9, 'UTC') CODEC(Delta, ZSTD(1)),
    expires_at DateTime('UTC') CODEC(Delta, ZSTD(1)),
    time_unix_nano UInt64 CODEC(Delta, ZSTD(1)),
    observed_time_unix_nano UInt64 CODEC(Delta, ZSTD(1)),
    trace_id String,
    span_id String,
    flags UInt32,
    severity_number UInt8,
    severity_text LowCardinality(String),
    event_name LowCardinality(String),
    body String CODEC(ZSTD(3)),
    body_json String CODEC(ZSTD(3)),
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
    INDEX logs_trace_idx trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX logs_body_idx body TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4,
    INDEX logs_resource_keys_idx mapKeys(resource_attributes) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX logs_attribute_keys_idx mapKeys(attributes) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX logs_attribute_values_idx mapValues(attributes) TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(fromUnixTimestamp64Nano(toInt64(time_unix_nano)))
ORDER BY (project_id, service_name, toStartOfMinute(fromUnixTimestamp64Nano(toInt64(time_unix_nano))), severity_number, time_unix_nano, trace_id)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS groundtruth.spans
(
    project_id UUID,
    ingested_at DateTime64(9, 'UTC') CODEC(Delta, ZSTD(1)),
    expires_at DateTime('UTC') CODEC(Delta, ZSTD(1)),
    trace_id String,
    span_id String,
    parent_span_id String,
    trace_state String CODEC(ZSTD(3)),
    flags UInt32,
    span_name LowCardinality(String),
    span_kind Enum8('unspecified' = 0, 'internal' = 1, 'server' = 2, 'client' = 3, 'producer' = 4, 'consumer' = 5),
    start_time_unix_nano UInt64 CODEC(Delta, ZSTD(1)),
    end_time_unix_nano UInt64 CODEC(Delta, ZSTD(1)),
    duration_nano UInt64 MATERIALIZED end_time_unix_nano - start_time_unix_nano,
    status_code Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
    status_message String CODEC(ZSTD(3)),
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
    dropped_events_count UInt32,
    dropped_links_count UInt32,
    INDEX spans_trace_idx trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX spans_parent_idx parent_span_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX spans_resource_keys_idx mapKeys(resource_attributes) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX spans_attribute_keys_idx mapKeys(attributes) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX spans_attribute_values_idx mapValues(attributes) TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(fromUnixTimestamp64Nano(toInt64(start_time_unix_nano)))
ORDER BY (project_id, service_name, toStartOfMinute(fromUnixTimestamp64Nano(toInt64(start_time_unix_nano))), start_time_unix_nano, trace_id, span_id)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS groundtruth.span_events
(
    project_id UUID,
    expires_at DateTime('UTC') CODEC(Delta, ZSTD(1)),
    trace_id String,
    span_id String,
    event_index UInt32,
    event_name LowCardinality(String),
    time_unix_nano UInt64 CODEC(Delta, ZSTD(1)),
    attributes Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    attributes_json String CODEC(ZSTD(3)),
    dropped_attributes_count UInt32,
    INDEX span_events_trace_idx trace_id TYPE bloom_filter(0.001) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(fromUnixTimestamp64Nano(toInt64(time_unix_nano)))
ORDER BY (project_id, trace_id, span_id, event_index)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS groundtruth.span_links
(
    project_id UUID,
    expires_at DateTime('UTC') CODEC(Delta, ZSTD(1)),
    trace_id String,
    span_id String,
    link_index UInt32,
    linked_trace_id String,
    linked_span_id String,
    trace_state String CODEC(ZSTD(3)),
    flags UInt32,
    attributes Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    attributes_json String CODEC(ZSTD(3)),
    dropped_attributes_count UInt32,
    INDEX span_links_trace_idx trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX span_links_linked_trace_idx linked_trace_id TYPE bloom_filter(0.001) GRANULARITY 1
)
ENGINE = MergeTree
ORDER BY (project_id, trace_id, span_id, link_index)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;
