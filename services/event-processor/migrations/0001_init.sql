CREATE DATABASE IF NOT EXISTS pam;

CREATE TABLE IF NOT EXISTS pam.events
(
    event_id       UUID,
    event_name     LowCardinality(String),
    schema_version UInt8,
    project_id     LowCardinality(String),
    user_id        String,
    session_id     String,
    timestamp      DateTime64(3, 'UTC'),
    received_at    DateTime64(3, 'UTC'),

    sdk_name       LowCardinality(String),
    sdk_version    String,
    platform       LowCardinality(String),
    os             LowCardinality(String),

    amount         Nullable(Float64),
    currency       LowCardinality(Nullable(String)),
    order_id       Nullable(String),

    properties     Map(String, String),

    insert_date    Date DEFAULT toDate(received_at)
)
ENGINE = ReplacingMergeTree(received_at)
PARTITION BY toYYYYMM(insert_date)
ORDER BY (project_id, event_name, user_id, timestamp, event_id)
TTL insert_date + INTERVAL 13 MONTH
SETTINGS index_granularity = 8192;
