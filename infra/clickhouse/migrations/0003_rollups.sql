CREATE TABLE IF NOT EXISTS groundtruth.metric_numeric_rollups_10s
(
    project_id UUID,
    bucket DateTime('UTC'),
    metric_name LowCardinality(String),
    service_name LowCardinality(String),
    series_hash UInt64,
    aggregation_temporality Enum8('unspecified' = 0, 'delta' = 1, 'cumulative' = 2),
    is_monotonic Bool,
    expires_at SimpleAggregateFunction(max, DateTime('UTC')),
    point_count SimpleAggregateFunction(sum, UInt64),
    value_sum AggregateFunction(sum, Float64),
    value_min AggregateFunction(min, Float64),
    value_max AggregateFunction(max, Float64),
    value_avg AggregateFunction(avg, Float64),
    value_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), Float64),
    value_last AggregateFunction(argMax, Float64, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (project_id, metric_name, service_name, bucket, series_hash, aggregation_temporality, is_monotonic)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS groundtruth.metric_numeric_rollups_10s_mv
TO groundtruth.metric_numeric_rollups_10s
AS
SELECT
    project_id,
    toStartOfInterval(fromUnixTimestamp64Nano(toInt64(time_unix_nano)), INTERVAL 10 SECOND) AS bucket,
    metric_name,
    service_name,
    series_hash,
    aggregation_temporality,
    is_monotonic,
    maxSimpleState(expires_at) AS expires_at,
    toUInt64(count()) AS point_count,
    sumState(if(value_type = 'int', toFloat64(int_value), double_value)) AS value_sum,
    minState(if(value_type = 'int', toFloat64(int_value), double_value)) AS value_min,
    maxState(if(value_type = 'int', toFloat64(int_value), double_value)) AS value_max,
    avgState(if(value_type = 'int', toFloat64(int_value), double_value)) AS value_avg,
    quantilesTDigestState(0.5, 0.95, 0.99)(if(value_type = 'int', toFloat64(int_value), double_value)) AS value_quantiles,
    argMaxState(if(value_type = 'int', toFloat64(int_value), double_value), time_unix_nano) AS value_last
FROM groundtruth.metric_points
WHERE metric_type IN ('gauge', 'sum') AND value_type != 'none'
GROUP BY project_id, bucket, metric_name, service_name, series_hash, aggregation_temporality, is_monotonic;

CREATE TABLE IF NOT EXISTS groundtruth.trace_rollups_10s
(
    project_id UUID,
    bucket DateTime('UTC'),
    service_name LowCardinality(String),
    span_name LowCardinality(String),
    span_kind Enum8('unspecified' = 0, 'internal' = 1, 'server' = 2, 'client' = 3, 'producer' = 4, 'consumer' = 5),
    status_code Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
    expires_at SimpleAggregateFunction(max, DateTime('UTC')),
    span_count SimpleAggregateFunction(sum, UInt64),
    duration_avg AggregateFunction(avg, UInt64),
    duration_max AggregateFunction(max, UInt64),
    duration_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (project_id, service_name, bucket, span_name, span_kind, status_code)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS groundtruth.trace_rollups_10s_mv
TO groundtruth.trace_rollups_10s
AS
SELECT
    project_id,
    toStartOfInterval(fromUnixTimestamp64Nano(toInt64(start_time_unix_nano)), INTERVAL 10 SECOND) AS bucket,
    service_name,
    span_name,
    span_kind,
    status_code,
    maxSimpleState(expires_at) AS expires_at,
    toUInt64(count()) AS span_count,
    avgState(duration_nano) AS duration_avg,
    maxState(duration_nano) AS duration_max,
    quantilesTDigestState(0.5, 0.95, 0.99)(duration_nano) AS duration_quantiles
FROM groundtruth.spans
GROUP BY project_id, bucket, service_name, span_name, span_kind, status_code;

CREATE TABLE IF NOT EXISTS groundtruth.log_rollups_10s
(
    project_id UUID,
    bucket DateTime('UTC'),
    service_name LowCardinality(String),
    severity_number UInt8,
    severity_text LowCardinality(String),
    expires_at SimpleAggregateFunction(max, DateTime('UTC')),
    log_count SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (project_id, service_name, bucket, severity_number, severity_text)
TTL expires_at DELETE
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS groundtruth.log_rollups_10s_mv
TO groundtruth.log_rollups_10s
AS
SELECT
    project_id,
    toStartOfInterval(fromUnixTimestamp64Nano(toInt64(time_unix_nano)), INTERVAL 10 SECOND) AS bucket,
    service_name,
    severity_number,
    severity_text,
    maxSimpleState(expires_at) AS expires_at,
    toUInt64(count()) AS log_count
FROM groundtruth.logs
GROUP BY project_id, bucket, service_name, severity_number, severity_text;
