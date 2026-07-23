ALTER TABLE kb_documents
  ADD COLUMN declared_bytes bigint CHECK (declared_bytes IS NULL OR declared_bytes >= 0),
  ADD COLUMN declared_checksum_sha256 char(64),
  ADD COLUMN upload_reservation_key text
    CHECK (upload_reservation_key IS NULL OR char_length(upload_reservation_key) BETWEEN 16 AND 200),
  ADD COLUMN upload_grant_issued_at timestamptz,
  ADD COLUMN upload_expires_at timestamptz,
  ADD COLUMN object_etag text CHECK (object_etag IS NULL OR char_length(object_etag) <= 512);

CREATE UNIQUE INDEX kb_documents_upload_reservation_idx
  ON kb_documents (account_id, upload_reservation_key)
  WHERE upload_reservation_key IS NOT NULL;

CREATE INDEX kb_documents_stale_upload_idx
  ON kb_documents (upload_expires_at, account_id, id)
  WHERE status = 'pending_upload';

ALTER TABLE kb_usage_ledger
  ADD COLUMN expires_at timestamptz;

CREATE UNIQUE INDEX kb_usage_ledger_unique_reserve_idx
  ON kb_usage_ledger (account_id, reservation_key, component)
  WHERE entry_type = 'reserve' AND reservation_key IS NOT NULL;

CREATE INDEX kb_usage_ledger_expiring_reservation_idx
  ON kb_usage_ledger (expires_at, account_id, reservation_key)
  WHERE entry_type = 'reserve' AND reservation_key IS NOT NULL;
