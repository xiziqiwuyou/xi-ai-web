CREATE TABLE kb_auth_rate_limits (
  bucket text NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 64),
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  window_started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bucket, subject_hash)
);

CREATE INDEX kb_auth_rate_limits_cleanup_idx
  ON kb_auth_rate_limits (updated_at, blocked_until);

ALTER TABLE kb_sessions
  ADD CONSTRAINT kb_sessions_token_hash_size CHECK (octet_length(token_hash) = 32),
  ADD CONSTRAINT kb_sessions_csrf_hash_size CHECK (octet_length(csrf_token_hash) = 32);

ALTER TABLE kb_invites
  ADD CONSTRAINT kb_invites_code_hash_size CHECK (octet_length(code_hash) = 32);

ALTER TABLE kb_admin_resets
  ADD CONSTRAINT kb_admin_resets_code_hash_size CHECK (octet_length(code_hash) = 32);

ALTER TABLE kb_accounts
  ADD CONSTRAINT kb_accounts_recovery_hash_size
  CHECK (recovery_code_hash IS NULL OR char_length(recovery_code_hash) = 43);
