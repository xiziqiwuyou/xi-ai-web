CREATE TABLE kb_accounts (
  id uuid PRIMARY KEY,
  username text NOT NULL CHECK (char_length(username) BETWEEN 3 AND 64),
  normalized_username text NOT NULL UNIQUE CHECK (char_length(normalized_username) BETWEEN 3 AND 128),
  password_hash text NOT NULL,
  recovery_code_hash text,
  password_reset_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'deleting')),
  session_generation bigint NOT NULL DEFAULT 1 CHECK (session_generation > 0),
  quota_bytes bigint NOT NULL DEFAULT 5368709120 CHECK (quota_bytes >= 0),
  used_bytes bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  limit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limit_overrides) = 'object'),
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kb_sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES kb_accounts(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  csrf_token_hash bytea NOT NULL,
  session_generation bigint NOT NULL CHECK (session_generation > 0),
  ip_prefix_hash bytea,
  user_agent text NOT NULL DEFAULT '' CHECK (octet_length(user_agent) <= 1024),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX kb_sessions_account_active_idx
  ON kb_sessions (account_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE kb_invites (
  id uuid PRIMARY KEY,
  code_hash bytea NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'revoked', 'expired')),
  initial_limit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(initial_limit_overrides) = 'object'),
  expires_at timestamptz,
  consumed_by_account_id uuid REFERENCES kb_accounts(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX kb_invites_status_expiry_idx ON kb_invites (status, expires_at);

CREATE TABLE kb_admin_resets (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES kb_accounts(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'revoked', 'expired')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 128),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX kb_admin_resets_one_active_per_account_idx
  ON kb_admin_resets (account_id)
  WHERE status = 'active';

CREATE TABLE kb_runtime_settings (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  registration_mode text NOT NULL DEFAULT 'invite_only'
    CHECK (registration_mode IN ('disabled', 'invite_only', 'open')),
  default_quota_bytes bigint NOT NULL DEFAULT 5368709120 CHECK (default_quota_bytes >= 0),
  max_knowledge_bases_per_account integer NOT NULL DEFAULT 20 CHECK (max_knowledge_bases_per_account > 0),
  max_documents_per_account integer NOT NULL DEFAULT 1000 CHECK (max_documents_per_account > 0),
  max_documents_per_knowledge_base integer NOT NULL DEFAULT 500 CHECK (max_documents_per_knowledge_base > 0),
  max_file_bytes bigint NOT NULL DEFAULT 104857600 CHECK (max_file_bytes > 0),
  max_chunks_per_account integer NOT NULL DEFAULT 100000 CHECK (max_chunks_per_account > 0),
  max_concurrent_uploads_per_account integer NOT NULL DEFAULT 3 CHECK (max_concurrent_uploads_per_account > 0),
  max_concurrent_ingestions_per_account integer NOT NULL DEFAULT 2 CHECK (max_concurrent_ingestions_per_account > 0),
  retrieval_requests_per_minute_per_account integer NOT NULL DEFAULT 60
    CHECK (retrieval_requests_per_minute_per_account > 0),
  max_retrieval_top_k integer NOT NULL DEFAULT 20 CHECK (max_retrieval_top_k BETWEEN 1 AND 20),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  updated_by text NOT NULL DEFAULT 'migration',
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO kb_runtime_settings (singleton_id) VALUES (1) ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE kb_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id text NOT NULL CHECK (char_length(request_id) BETWEEN 8 AND 128),
  admin_actor text NOT NULL CHECK (char_length(admin_actor) BETWEEN 1 AND 128),
  operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 128),
  target_type text NOT NULL CHECK (char_length(target_type) BETWEEN 1 AND 64),
  target_id text,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  result text NOT NULL CHECK (result IN ('succeeded', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX kb_admin_audit_target_idx ON kb_admin_audit (target_type, target_id, created_at DESC);

CREATE TABLE kb_knowledge_bases (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES kb_accounts(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleting')),
  embedding_vendor text CHECK (embedding_vendor IN ('openai', 'qwen')),
  embedding_catalog_model_id text,
  embedding_actual_model text,
  embedding_dimensions integer CHECK (embedding_dimensions BETWEEN 1 AND 4096),
  embedding_profile_fingerprint char(64),
  chunk_version integer NOT NULL DEFAULT 1 CHECK (chunk_version > 0),
  active_index_version integer,
  pending_index_version integer,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  CHECK (
    (embedding_vendor IS NULL
      AND embedding_catalog_model_id IS NULL
      AND embedding_actual_model IS NULL
      AND embedding_dimensions IS NULL
      AND embedding_profile_fingerprint IS NULL)
    OR
    (embedding_vendor IS NOT NULL
      AND embedding_catalog_model_id IS NOT NULL
      AND embedding_actual_model IS NOT NULL
      AND embedding_dimensions IS NOT NULL
      AND embedding_profile_fingerprint IS NOT NULL)
  ),
  CHECK (active_index_version IS NULL OR active_index_version > 0),
  CHECK (pending_index_version IS NULL OR pending_index_version > 0),
  UNIQUE (id, account_id)
);

CREATE INDEX kb_knowledge_bases_account_status_idx ON kb_knowledge_bases (account_id, status, updated_at DESC);

CREATE TABLE kb_index_versions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'active', 'retired', 'failed', 'deleting')),
  embedding_vendor text NOT NULL CHECK (embedding_vendor IN ('openai', 'qwen')),
  embedding_catalog_model_id text NOT NULL,
  embedding_actual_model text NOT NULL,
  embedding_dimensions integer NOT NULL CHECK (embedding_dimensions BETWEEN 1 AND 4096),
  embedding_profile_fingerprint char(64) NOT NULL,
  chunk_version integer NOT NULL CHECK (chunk_version > 0),
  logical_bytes bigint NOT NULL DEFAULT 0 CHECK (logical_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at timestamptz,
  retired_at timestamptz,
  FOREIGN KEY (knowledge_base_id, account_id)
    REFERENCES kb_knowledge_bases(id, account_id) ON DELETE CASCADE,
  UNIQUE (knowledge_base_id, version),
  UNIQUE (id, account_id, knowledge_base_id)
);

CREATE INDEX kb_index_versions_active_idx ON kb_index_versions (account_id, knowledge_base_id, status);

CREATE TABLE kb_documents (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 512),
  declared_mime_type text NOT NULL DEFAULT '',
  verified_mime_type text,
  checksum_sha256 char(64),
  object_key text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 1 AND 1024),
  object_version_id text,
  verified_bytes bigint CHECK (verified_bytes >= 0),
  normalized_object_key text,
  normalized_bytes bigint CHECK (normalized_bytes >= 0),
  status text NOT NULL DEFAULT 'pending_upload'
    CHECK (status IN ('pending_upload', 'uploaded', 'parsing', 'awaiting_embedding', 'embedding', 'ready', 'needs_ocr', 'failed', 'deleting')),
  parser_version text,
  error_code text,
  error_detail text CHECK (error_detail IS NULL OR octet_length(error_detail) <= 4000),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (knowledge_base_id, account_id)
    REFERENCES kb_knowledge_bases(id, account_id) ON DELETE CASCADE,
  UNIQUE (id, account_id, knowledge_base_id)
);

CREATE INDEX kb_documents_base_status_idx ON kb_documents (account_id, knowledge_base_id, status, updated_at DESC);

CREATE TABLE kb_chunks (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  document_id uuid NOT NULL,
  index_version_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  text_content text NOT NULL CHECK (octet_length(text_content) > 0),
  text_bytes integer NOT NULL CHECK (text_bytes > 0),
  token_estimate integer NOT NULL DEFAULT 0 CHECK (token_estimate >= 0),
  source_locator jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_locator) = 'object'),
  content_hash char(64) NOT NULL,
  embedding_state text NOT NULL DEFAULT 'pending'
    CHECK (embedding_state IN ('pending', 'leased', 'ready', 'failed')),
  embedding_lease_id uuid,
  embedding_lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id, account_id, knowledge_base_id)
    REFERENCES kb_documents(id, account_id, knowledge_base_id) ON DELETE CASCADE,
  FOREIGN KEY (index_version_id, account_id, knowledge_base_id)
    REFERENCES kb_index_versions(id, account_id, knowledge_base_id) ON DELETE CASCADE,
  UNIQUE (document_id, index_version_id, ordinal),
  UNIQUE (id, account_id, knowledge_base_id, index_version_id)
);

CREATE INDEX kb_chunks_retrieval_scope_idx
  ON kb_chunks (account_id, knowledge_base_id, index_version_id, embedding_state);
CREATE INDEX kb_chunks_embedding_queue_idx
  ON kb_chunks (account_id, knowledge_base_id, index_version_id, ordinal)
  WHERE embedding_state IN ('pending', 'failed');

CREATE TABLE kb_jobs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES kb_accounts(id) ON DELETE CASCADE,
  knowledge_base_id uuid,
  document_id uuid,
  dedupe_key text CHECK (dedupe_key IS NULL OR char_length(dedupe_key) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('parse', 'cleanup', 'reconcile', 'reindex')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'retry', 'succeeded', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  lease_owner text,
  lease_expires_at timestamptz,
  progress_current integer NOT NULL DEFAULT 0 CHECK (progress_current >= 0),
  progress_total integer NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
  error_code text,
  error_detail text CHECK (error_detail IS NULL OR octet_length(error_detail) <= 4000),
  run_after timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (knowledge_base_id, account_id)
    REFERENCES kb_knowledge_bases(id, account_id) ON DELETE CASCADE,
  FOREIGN KEY (document_id, account_id, knowledge_base_id)
    REFERENCES kb_documents(id, account_id, knowledge_base_id) ON DELETE CASCADE,
  CHECK (document_id IS NULL OR knowledge_base_id IS NOT NULL)
);

CREATE INDEX kb_jobs_claim_idx ON kb_jobs (kind, status, run_after, created_at)
  WHERE status IN ('queued', 'retry');
CREATE INDEX kb_jobs_account_idx ON kb_jobs (account_id, status, updated_at DESC);
CREATE UNIQUE INDEX kb_jobs_dedupe_idx ON kb_jobs (account_id, kind, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running', 'retry');

CREATE TABLE kb_embedding_batches (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  document_id uuid NOT NULL,
  index_version_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 200),
  status text NOT NULL DEFAULT 'leased' CHECK (status IN ('leased', 'completed', 'released', 'failed')),
  lease_owner_session_id uuid REFERENCES kb_sessions(id) ON DELETE SET NULL,
  lease_expires_at timestamptz NOT NULL,
  chunk_count integer NOT NULL CHECK (chunk_count > 0),
  provider_usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_usage) = 'object'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  FOREIGN KEY (document_id, account_id, knowledge_base_id)
    REFERENCES kb_documents(id, account_id, knowledge_base_id) ON DELETE CASCADE,
  FOREIGN KEY (index_version_id, account_id, knowledge_base_id)
    REFERENCES kb_index_versions(id, account_id, knowledge_base_id) ON DELETE CASCADE,
  UNIQUE (account_id, idempotency_key),
  UNIQUE (id, account_id, knowledge_base_id, index_version_id)
);

CREATE INDEX kb_embedding_batches_lease_idx
  ON kb_embedding_batches (account_id, knowledge_base_id, status, lease_expires_at);

ALTER TABLE kb_chunks
  ADD CONSTRAINT kb_chunks_embedding_batch_fk
  FOREIGN KEY (embedding_lease_id, account_id, knowledge_base_id, index_version_id)
  REFERENCES kb_embedding_batches(id, account_id, knowledge_base_id, index_version_id)
  ON DELETE SET NULL (embedding_lease_id);

CREATE TABLE kb_usage_ledger (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES kb_accounts(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('reserve', 'settle', 'release', 'reconcile')),
  component text NOT NULL CHECK (component IN ('original', 'normalized', 'chunk_text', 'vector')),
  reserved_delta_bytes bigint NOT NULL DEFAULT 0,
  used_delta_bytes bigint NOT NULL DEFAULT 0,
  reservation_key text,
  knowledge_base_id uuid,
  document_id uuid,
  index_version_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (reserved_delta_bytes <> 0 OR used_delta_bytes <> 0),
  CHECK (document_id IS NULL OR knowledge_base_id IS NOT NULL),
  CHECK (index_version_id IS NULL OR knowledge_base_id IS NOT NULL)
);

CREATE INDEX kb_usage_ledger_account_idx ON kb_usage_ledger (account_id, created_at DESC);
CREATE INDEX kb_usage_ledger_reservation_idx ON kb_usage_ledger (account_id, reservation_key)
  WHERE reservation_key IS NOT NULL;

CREATE OR REPLACE FUNCTION kb_reject_immutable_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER kb_admin_audit_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON kb_admin_audit
  FOR EACH STATEMENT
  EXECUTE FUNCTION kb_reject_immutable_record_mutation();

CREATE TRIGGER kb_usage_ledger_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON kb_usage_ledger
  FOR EACH STATEMENT
  EXECUTE FUNCTION kb_reject_immutable_record_mutation();
