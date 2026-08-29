-- Keep recent insert block identities on local disk so a Collector retry with
-- the same canonical batch id is idempotent on this single-node deployment.
ALTER TABLE groundtruth.metric_points
    MODIFY SETTING non_replicated_deduplication_window = 10000;

ALTER TABLE groundtruth.metric_exemplars
    MODIFY SETTING non_replicated_deduplication_window = 10000;

ALTER TABLE groundtruth.logs
    MODIFY SETTING non_replicated_deduplication_window = 10000;

ALTER TABLE groundtruth.spans
    MODIFY SETTING non_replicated_deduplication_window = 10000;

ALTER TABLE groundtruth.span_events
    MODIFY SETTING non_replicated_deduplication_window = 10000;

ALTER TABLE groundtruth.span_links
    MODIFY SETTING non_replicated_deduplication_window = 10000;

ALTER TABLE groundtruth.metric_numeric_rollups_10s
    MODIFY SETTING non_replicated_deduplication_window = 10000;

ALTER TABLE groundtruth.trace_rollups_10s
    MODIFY SETTING non_replicated_deduplication_window = 10000;

ALTER TABLE groundtruth.log_rollups_10s
    MODIFY SETTING non_replicated_deduplication_window = 10000;
