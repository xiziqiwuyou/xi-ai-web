ALTER TABLE kb_runtime_settings
  ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE INDEX kb_accounts_admin_list_idx
  ON kb_accounts (status, created_at DESC, id DESC);

CREATE INDEX kb_accounts_normalized_username_prefix_idx
  ON kb_accounts (normalized_username text_pattern_ops);

CREATE INDEX kb_sessions_admin_active_idx
  ON kb_sessions (account_id, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX kb_admin_resets_expiry_idx
  ON kb_admin_resets (status, expires_at, account_id);

CREATE INDEX kb_jobs_admin_list_idx
  ON kb_jobs (status, kind, created_at DESC, id DESC);

CREATE INDEX kb_admin_audit_admin_list_idx
  ON kb_admin_audit (created_at DESC, id DESC);
