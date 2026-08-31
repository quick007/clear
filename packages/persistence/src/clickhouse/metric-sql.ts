export const numericMetricValue = `multiIf(
  value_type = 'int', toFloat64(int_value),
  value_type = 'double', double_value,
  count > 0 AND has_sum, sum / count,
  0
)`;

export const metricTotal = `if(value_type = 'none' AND has_sum, sum, ${numericMetricValue})`;

export const metricCount = "if(value_type = 'none', count, 1)";

export const rateContribution = `multiIf(
  metric_type = 'sum' AND aggregation_temporality = 'cumulative' AND stream_position = 1, 0,
  metric_type = 'sum' AND aggregation_temporality = 'cumulative'
    AND (start_time_unix_nano != previous_start_time_unix_nano
      OR (is_monotonic AND metric_value < previous_metric_value)), metric_value,
  metric_type = 'sum' AND aggregation_temporality = 'cumulative',
    metric_value - previous_metric_value,
  value_type = 'none' AND has_sum, sum,
  metric_value
)`;

export const rateWindow = `row_number() OVER metric_stream AS stream_position,
  lag(metric_value, 1, 0) OVER metric_stream AS previous_metric_value,
  lag(start_time_unix_nano, 1, 0) OVER metric_stream AS previous_start_time_unix_nano`;

export const rateWindowDefinition = `WINDOW metric_stream AS (
  PARTITION BY service_name, resource_attributes_json, scope_name, scope_version,
    scope_attributes_json, attributes_json
  ORDER BY time_unix_nano
)`;

export const isInitialCumulativePoint = `(
  metric_type = 'sum' AND aggregation_temporality = 'cumulative' AND stream_position = 1
)`;
