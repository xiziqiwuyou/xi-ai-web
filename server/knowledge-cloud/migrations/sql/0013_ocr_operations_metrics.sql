ALTER TABLE kb_jobs
  DROP CONSTRAINT IF EXISTS kb_jobs_kind_check;

ALTER TABLE kb_jobs
  ADD CONSTRAINT kb_jobs_kind_check
    CHECK (kind IN ('parse', 'cleanup', 'reconcile', 'reindex', 'ocr')),
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz;

UPDATE kb_jobs
SET started_at = CASE WHEN attempts > 0 THEN created_at ELSE NULL END,
    completed_at = CASE
      WHEN status IN ('succeeded', 'failed', 'cancelled') THEN updated_at
      ELSE NULL
    END;

CREATE INDEX kb_jobs_operations_window_idx
  ON kb_jobs (completed_at DESC, kind, status)
  WHERE completed_at IS NOT NULL;

ALTER TABLE kb_documents
  ADD COLUMN ocr_status text
    CHECK (ocr_status IN ('needed', 'queued', 'running', 'retry', 'ready', 'failed')),
  ADD COLUMN ocr_provider text
    CHECK (ocr_provider IS NULL OR char_length(ocr_provider) BETWEEN 1 AND 64),
  ADD COLUMN ocr_object_key text
    CHECK (ocr_object_key IS NULL OR char_length(ocr_object_key) BETWEEN 1 AND 1024),
  ADD COLUMN ocr_bytes bigint CHECK (ocr_bytes IS NULL OR ocr_bytes >= 0),
  ADD COLUMN ocr_checksum_sha256 char(64),
  ADD COLUMN ocr_duration_ms integer CHECK (ocr_duration_ms IS NULL OR ocr_duration_ms >= 0),
  ADD COLUMN ocr_started_at timestamptz,
  ADD COLUMN ocr_completed_at timestamptz;

UPDATE kb_documents
SET ocr_status = 'needed'
WHERE status = 'needs_ocr';

CREATE UNIQUE INDEX kb_documents_ocr_object_key_idx
  ON kb_documents (ocr_object_key)
  WHERE ocr_object_key IS NOT NULL;

CREATE INDEX kb_documents_ocr_queue_idx
  ON kb_documents (ocr_status, updated_at, account_id, id)
  WHERE status = 'needs_ocr';

CREATE TABLE kb_reconciliation_runs (
  account_id uuid PRIMARY KEY REFERENCES kb_accounts(id) ON DELETE CASCADE,
  state text NOT NULL
    CHECK (state IN ('queued', 'running', 'ready', 'partial', 'drift_detected', 'failed')),
  database_object_count integer NOT NULL DEFAULT 0 CHECK (database_object_count >= 0),
  checked_object_count integer NOT NULL DEFAULT 0 CHECK (checked_object_count >= 0),
  missing_object_count integer NOT NULL DEFAULT 0 CHECK (missing_object_count >= 0),
  quota_changed boolean NOT NULL DEFAULT false,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX kb_reconciliation_runs_state_idx
  ON kb_reconciliation_runs (state, updated_at DESC);
