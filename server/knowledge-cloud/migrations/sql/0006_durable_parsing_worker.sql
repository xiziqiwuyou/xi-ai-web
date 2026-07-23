CREATE INDEX kb_jobs_expired_lease_idx
  ON kb_jobs (lease_expires_at, created_at, id)
  WHERE status = 'running';

CREATE INDEX kb_chunks_document_index_idx
  ON kb_chunks (account_id, document_id, index_version_id, ordinal);
