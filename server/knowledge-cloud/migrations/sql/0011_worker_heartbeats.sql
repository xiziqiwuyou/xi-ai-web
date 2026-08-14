CREATE TABLE kb_worker_heartbeats (
  worker_id text PRIMARY KEY CHECK (char_length(worker_id) BETWEEN 1 AND 255),
  concurrency integer NOT NULL CHECK (concurrency BETWEEN 1 AND 32),
  lease_seconds integer NOT NULL CHECK (lease_seconds BETWEEN 15 AND 3600),
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  heartbeat_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX kb_worker_heartbeats_freshness_idx
  ON kb_worker_heartbeats (heartbeat_at DESC);
