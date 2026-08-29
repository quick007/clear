-- Raw rows expire through their per-project expires_at value. Hosted projects
-- set that value to 24 hours. Compact aggregate rows remain available for the
-- rest of the seven day query window.
ALTER TABLE groundtruth.metric_numeric_rollups_10s
    MODIFY TTL addDays(expires_at, 6) DELETE;

ALTER TABLE groundtruth.trace_rollups_10s
    MODIFY TTL addDays(expires_at, 6) DELETE;

ALTER TABLE groundtruth.log_rollups_10s
    MODIFY TTL addDays(expires_at, 6) DELETE;
