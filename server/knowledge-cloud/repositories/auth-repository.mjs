function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalized_username,
    passwordHash: row.password_hash,
    recoveryCodeHash: row.recovery_code_hash,
    passwordResetRequired: Boolean(row.password_reset_required),
    status: row.status,
    sessionGeneration: asNumber(row.session_generation),
    quotaBytes: asNumber(row.quota_bytes),
    usedBytes: asNumber(row.used_bytes),
    reservedBytes: asNumber(row.reserved_bytes),
    limitOverrides: row.limit_overrides || {},
    failedLoginCount: asNumber(row.failed_login_count),
    lockedUntil: row.locked_until || null,
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSession(row) {
  if (!row) return null;
  return {
    id: row.session_id || row.id,
    accountId: row.account_id,
    tokenHash: row.token_hash,
    csrfTokenHash: row.csrf_token_hash,
    sessionGeneration: asNumber(row.session_generation),
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at || null,
    account: row.username
      ? normalizeAccount({
          id: row.account_id,
          username: row.username,
          normalized_username: row.normalized_username,
          password_hash: row.password_hash,
          recovery_code_hash: row.recovery_code_hash,
          password_reset_required: row.password_reset_required,
          status: row.account_status,
          session_generation: row.account_session_generation,
          quota_bytes: row.quota_bytes,
          used_bytes: row.used_bytes,
          reserved_bytes: row.reserved_bytes,
          failed_login_count: row.failed_login_count,
          locked_until: row.locked_until,
          last_login_at: row.last_login_at,
          created_at: row.account_created_at,
          updated_at: row.account_updated_at
        })
      : null
  };
}

function normalizeSettings(row) {
  return {
    registrationMode: row?.registration_mode || "invite_only",
    defaultQuotaBytes: asNumber(row?.default_quota_bytes ?? 5368709120)
  };
}

export function createKnowledgeAuthRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge auth repository requires a queryable database client");
  }

  return Object.freeze({
    async getRuntimeSettings({ forUpdate = false } = {}) {
      const result = await queryable.query(
        `SELECT registration_mode, default_quota_bytes
         FROM kb_runtime_settings
         WHERE singleton_id = 1${forUpdate ? " FOR UPDATE" : ""}`
      );
      return normalizeSettings(result.rows?.[0]);
    },

    async findAccountByNormalizedUsername(normalizedUsername, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `SELECT id, username, normalized_username, password_hash, recovery_code_hash,
                password_reset_required, status, session_generation, quota_bytes,
                used_bytes, reserved_bytes, failed_login_count, locked_until,
                last_login_at, created_at, updated_at
         FROM kb_accounts
         WHERE normalized_username = $1${forUpdate ? " FOR UPDATE" : ""}`,
        [normalizedUsername]
      );
      return normalizeAccount(result.rows?.[0]);
    },

    async insertAccount(account) {
      const result = await queryable.query(
        `INSERT INTO kb_accounts (
           id, username, normalized_username, password_hash, recovery_code_hash,
           quota_bytes, limit_overrides
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id, username, normalized_username, password_hash, recovery_code_hash,
                   password_reset_required, status, session_generation, quota_bytes,
                   used_bytes, reserved_bytes, failed_login_count, locked_until,
                   last_login_at, created_at, updated_at`,
        [
          account.id,
          account.username,
          account.normalizedUsername,
          account.passwordHash,
          account.recoveryCodeHash,
          account.quotaBytes,
          JSON.stringify(account.limitOverrides || {})
        ]
      );
      return normalizeAccount(result.rows?.[0]);
    },

    async findInviteByCodeHash(codeHash, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `SELECT id, status, initial_limit_overrides, expires_at, consumed_by_account_id,
                consumed_at, revoked_at, created_at
         FROM kb_invites
         WHERE code_hash = $1${forUpdate ? " FOR UPDATE" : ""}`,
        [codeHash]
      );
      const row = result.rows?.[0];
      return row
        ? {
            id: row.id,
            status: row.status,
            initialLimitOverrides: row.initial_limit_overrides || {},
            expiresAt: row.expires_at || null,
            consumedByAccountId: row.consumed_by_account_id || null,
            consumedAt: row.consumed_at || null,
            revokedAt: row.revoked_at || null,
            createdAt: row.created_at
          }
        : null;
    },

    async consumeInvite(inviteId, accountId) {
      const result = await queryable.query(
        `UPDATE kb_invites
         SET status = 'consumed', consumed_by_account_id = $2, consumed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'active' AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         RETURNING id`,
        [inviteId, accountId]
      );
      return Boolean(result.rowCount);
    },

    async createSession(session) {
      const result = await queryable.query(
        `INSERT INTO kb_sessions (
           id, account_id, token_hash, csrf_token_hash, session_generation,
           ip_prefix_hash, user_agent, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, account_id, token_hash, csrf_token_hash, session_generation,
                   expires_at, last_seen_at, revoked_at`,
        [
          session.id,
          session.accountId,
          session.tokenHash,
          session.csrfTokenHash,
          session.sessionGeneration,
          session.ipPrefixHash,
          session.userAgent,
          session.expiresAt
        ]
      );
      return normalizeSession(result.rows?.[0]);
    },

    async findSessionByTokenHash(tokenHash) {
      const result = await queryable.query(
        `SELECT s.id AS session_id, s.account_id, s.token_hash, s.csrf_token_hash,
                s.session_generation, s.expires_at, s.last_seen_at, s.revoked_at,
                a.username, a.normalized_username, a.password_hash, a.recovery_code_hash,
                a.password_reset_required, a.status AS account_status,
                a.session_generation AS account_session_generation, a.quota_bytes,
                a.used_bytes, a.reserved_bytes, a.failed_login_count, a.locked_until,
                a.last_login_at, a.created_at AS account_created_at,
                a.updated_at AS account_updated_at
         FROM kb_sessions s
         JOIN kb_accounts a ON a.id = s.account_id
         WHERE s.token_hash = $1
           AND s.revoked_at IS NULL
           AND s.expires_at > CURRENT_TIMESTAMP
           AND s.session_generation = a.session_generation
         LIMIT 1`,
        [tokenHash]
      );
      return normalizeSession(result.rows?.[0]);
    },

    async rotateSessionCsrf(sessionId, csrfTokenHash) {
      const result = await queryable.query(
        `UPDATE kb_sessions
         SET csrf_token_hash = $2, last_seen_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         RETURNING id`,
        [sessionId, csrfTokenHash]
      );
      return Boolean(result.rowCount);
    },

    async revokeSession(sessionId) {
      const result = await queryable.query(
        `UPDATE kb_sessions
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE id = $1
         RETURNING id`,
        [sessionId]
      );
      return Boolean(result.rowCount);
    },

    async revokeAllSessions(accountId) {
      const result = await queryable.query(
        `UPDATE kb_sessions
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE account_id = $1 AND revoked_at IS NULL`,
        [accountId]
      );
      return result.rowCount || 0;
    },

    async recordLoginFailure(accountId, { lockAfter, lockSeconds }) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET failed_login_count = failed_login_count + 1,
             locked_until = CASE
               WHEN failed_login_count + 1 >= $2
                 THEN CURRENT_TIMESTAMP + make_interval(secs => $3)
               ELSE locked_until
             END,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $1
         RETURNING failed_login_count, locked_until`,
        [accountId, lockAfter, lockSeconds]
      );
      const row = result.rows?.[0];
      return row
        ? { failedLoginCount: asNumber(row.failed_login_count), lockedUntil: row.locked_until || null }
        : null;
    },

    async markLoginSucceeded(accountId) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET failed_login_count = 0, locked_until = NULL,
             last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $1
         RETURNING id`,
        [accountId]
      );
      return Boolean(result.rowCount);
    },

    async resetCredentials(accountId, { passwordHash, recoveryCodeHash }) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET password_hash = $2, recovery_code_hash = $3,
             password_reset_required = false,
             session_generation = session_generation + 1,
             failed_login_count = 0, locked_until = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = $1
         RETURNING id, username, normalized_username, password_hash, recovery_code_hash,
                   password_reset_required, status, session_generation, quota_bytes,
                   used_bytes, reserved_bytes, failed_login_count, locked_until,
                   last_login_at, created_at, updated_at`,
        [accountId, passwordHash, recoveryCodeHash]
      );
      return normalizeAccount(result.rows?.[0]);
    },

    async replaceRecoveryCode(accountId, { expectedRecoveryCodeHash, recoveryCodeHash, sessionGeneration }) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET recovery_code_hash = $2, updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = $1 AND session_generation = $3 AND status = 'active'
           AND recovery_code_hash = $4
         RETURNING id, username, normalized_username, password_hash, recovery_code_hash,
                   password_reset_required, status, session_generation, quota_bytes,
                   used_bytes, reserved_bytes, failed_login_count, locked_until,
                   last_login_at, created_at, updated_at`,
        [accountId, recoveryCodeHash, sessionGeneration, expectedRecoveryCodeHash]
      );
      return normalizeAccount(result.rows?.[0]);
    },

    async consumeRateLimit({ bucket, subjectHash, windowSeconds, maxAttempts, blockSeconds }) {
      const result = await queryable.query(
        `INSERT INTO kb_auth_rate_limits (
           bucket, subject_hash, window_started_at, attempts, blocked_until, updated_at
         ) VALUES ($1, $2, CURRENT_TIMESTAMP, 1, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (bucket, subject_hash) DO UPDATE SET
           window_started_at = CASE
             WHEN kb_auth_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $3)
               THEN CURRENT_TIMESTAMP
             ELSE kb_auth_rate_limits.window_started_at
           END,
           attempts = CASE
             WHEN kb_auth_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $3)
               THEN 1
             ELSE kb_auth_rate_limits.attempts + 1
           END,
           blocked_until = CASE
             WHEN kb_auth_rate_limits.blocked_until > CURRENT_TIMESTAMP
               THEN kb_auth_rate_limits.blocked_until
             WHEN (CASE
               WHEN kb_auth_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $3)
                 THEN 1
               ELSE kb_auth_rate_limits.attempts + 1
             END) > $4
               THEN CURRENT_TIMESTAMP + make_interval(secs => $5)
             ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP
         RETURNING attempts,
                   blocked_until,
                   blocked_until IS NOT NULL AND blocked_until > CURRENT_TIMESTAMP AS blocked,
                   GREATEST(0, CEIL(EXTRACT(EPOCH FROM (blocked_until - CURRENT_TIMESTAMP))))::integer
                     AS retry_after_seconds`,
        [bucket, subjectHash, windowSeconds, maxAttempts, blockSeconds]
      );
      const row = result.rows?.[0] || {};
      return {
        attempts: asNumber(row.attempts),
        blocked: Boolean(row.blocked),
        retryAfterSeconds: asNumber(row.retry_after_seconds)
      };
    },

    async clearRateLimit(bucket, subjectHash) {
      await queryable.query(
        "DELETE FROM kb_auth_rate_limits WHERE bucket = $1 AND subject_hash = $2",
        [bucket, subjectHash]
      );
    }
  });
}

export const normalizeKnowledgeAccountRow = normalizeAccount;
