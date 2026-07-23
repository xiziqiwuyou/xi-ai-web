function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asInteger(value) {
  const number = asNumber(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function asByteString(value) {
  const text = String(value ?? "0");
  return /^\d+$/.test(text) ? text : "0";
}

function asIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSettings(row) {
  if (!row) return null;
  return {
    version: asInteger(row.version),
    registrationMode: row.registration_mode,
    defaultQuotaBytes: asInteger(row.default_quota_bytes),
    maxKnowledgeBasesPerAccount: asInteger(row.max_knowledge_bases_per_account),
    maxDocumentsPerAccount: asInteger(row.max_documents_per_account),
    maxDocumentsPerKnowledgeBase: asInteger(row.max_documents_per_knowledge_base),
    maxFileBytes: asInteger(row.max_file_bytes),
    maxChunksPerAccount: asInteger(row.max_chunks_per_account),
    maxConcurrentUploadsPerAccount: asInteger(row.max_concurrent_uploads_per_account),
    maxConcurrentIngestionsPerAccount: asInteger(row.max_concurrent_ingestions_per_account),
    maxConcurrentEmbeddingsPerAccount: asInteger(row.max_concurrent_embeddings_per_account),
    retrievalRequestsPerMinutePerAccount: asInteger(row.retrieval_requests_per_minute_per_account),
    maxRetrievalTopK: asInteger(row.max_retrieval_top_k),
    updatedBy: row.updated_by,
    updatedAt: asIso(row.updated_at)
  };
}

function normalizeAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalized_username,
    status: row.status,
    version: asInteger(row.version),
    quotaBytes: asByteString(row.quota_bytes),
    usedBytes: asByteString(row.used_bytes),
    reservedBytes: asByteString(row.reserved_bytes),
    limitOverrides: row.limit_overrides || {},
    failedLoginCount: asInteger(row.failed_login_count),
    lockedUntil: asIso(row.locked_until),
    lastLoginAt: asIso(row.last_login_at),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    activeSessionCount: asInteger(row.active_session_count),
    knowledgeBaseCount: asInteger(row.knowledge_base_count),
    documentCount: asInteger(row.document_count),
    chunkCount: asInteger(row.chunk_count)
  };
}

function normalizeInvite(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.effective_status || row.status,
    initialLimitOverrides: row.initial_limit_overrides || {},
    expiresAt: asIso(row.expires_at),
    consumedByAccountId: row.consumed_by_account_id || null,
    consumedAt: asIso(row.consumed_at),
    revokedAt: asIso(row.revoked_at),
    createdBy: row.created_by,
    createdAt: asIso(row.created_at)
  };
}

function normalizeJob(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    knowledgeBaseId: row.knowledge_base_id || null,
    documentId: row.document_id || null,
    kind: row.kind,
    status: row.status,
    attempts: asInteger(row.attempts),
    maxAttempts: asInteger(row.max_attempts),
    progressCurrent: asInteger(row.progress_current),
    progressTotal: asInteger(row.progress_total),
    errorCode: row.error_code || null,
    leaseActive: Boolean(row.lease_active),
    runAfter: asIso(row.run_after),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function normalizeAudit(row) {
  return {
    id: String(row.id),
    requestId: row.request_id,
    adminActor: row.admin_actor,
    operation: row.operation,
    targetType: row.target_type,
    targetId: row.target_id || null,
    reason: row.reason,
    result: row.result,
    metadata: row.metadata || {},
    createdAt: asIso(row.created_at)
  };
}

function settingsSelect({ forUpdate = false } = {}) {
  return `SELECT version, registration_mode, default_quota_bytes,
                 max_knowledge_bases_per_account, max_documents_per_account,
                 max_documents_per_knowledge_base, max_file_bytes,
                 max_chunks_per_account, max_concurrent_uploads_per_account,
                 max_concurrent_ingestions_per_account,
                 max_concurrent_embeddings_per_account,
                 retrieval_requests_per_minute_per_account, max_retrieval_top_k,
                 updated_by, updated_at
          FROM kb_runtime_settings
          WHERE singleton_id = 1${forUpdate ? " FOR UPDATE" : ""}`;
}

const ACCOUNT_SELECT = `SELECT a.id, a.username, a.normalized_username, a.status, a.version,
                               a.quota_bytes, a.used_bytes, a.reserved_bytes, a.limit_overrides,
                               a.failed_login_count, a.locked_until, a.last_login_at,
                               a.created_at, a.updated_at,
                               (SELECT COUNT(*)::integer FROM kb_sessions s
                                 WHERE s.account_id = a.id AND s.revoked_at IS NULL
                                   AND s.expires_at > CURRENT_TIMESTAMP
                                   AND s.session_generation = a.session_generation) AS active_session_count,
                               (SELECT COUNT(*)::integer FROM kb_knowledge_bases b
                                 WHERE b.account_id = a.id AND b.status <> 'deleting') AS knowledge_base_count,
                               (SELECT COUNT(*)::integer FROM kb_documents d
                                 WHERE d.account_id = a.id AND d.status <> 'deleting') AS document_count,
                               (SELECT COUNT(*)::integer FROM kb_chunks c
                                 WHERE c.account_id = a.id) AS chunk_count
                        FROM kb_accounts a`;

function buildListWhere(filters, params) {
  const where = [];
  if (filters.status) {
    params.push(filters.status);
    where.push(`a.status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`${filters.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    where.push(`a.normalized_username LIKE $${params.length} ESCAPE '\\'`);
  }
  if (filters.cursor) {
    params.push(filters.cursor.createdAt, filters.cursor.id);
    where.push(`(a.created_at, a.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  return where.length ? ` WHERE ${where.join(" AND ")}` : "";
}

export function createKnowledgeAdminRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge Admin repository requires a queryable database client");
  }

  return Object.freeze({
    async getRuntimeSettings(options = {}) {
      const result = await queryable.query(settingsSelect(options));
      return normalizeSettings(result.rows?.[0]);
    },

    async updateRuntimeSettings(settings, expectedVersion, actor) {
      const result = await queryable.query(
        `UPDATE kb_runtime_settings
         SET registration_mode = $1,
             default_quota_bytes = $2,
             max_knowledge_bases_per_account = $3,
             max_documents_per_account = $4,
             max_documents_per_knowledge_base = $5,
             max_file_bytes = $6,
             max_chunks_per_account = $7,
             max_concurrent_uploads_per_account = $8,
             max_concurrent_ingestions_per_account = $9,
             max_concurrent_embeddings_per_account = $10,
             retrieval_requests_per_minute_per_account = $11,
             max_retrieval_top_k = $12,
             updated_by = $13,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE singleton_id = 1 AND version = $14
         RETURNING version, registration_mode, default_quota_bytes,
                   max_knowledge_bases_per_account, max_documents_per_account,
                   max_documents_per_knowledge_base, max_file_bytes,
                   max_chunks_per_account, max_concurrent_uploads_per_account,
                   max_concurrent_ingestions_per_account,
                   max_concurrent_embeddings_per_account,
                   retrieval_requests_per_minute_per_account, max_retrieval_top_k,
                   updated_by, updated_at`,
        [
          settings.registrationMode,
          settings.defaultQuotaBytes,
          settings.maxKnowledgeBasesPerAccount,
          settings.maxDocumentsPerAccount,
          settings.maxDocumentsPerKnowledgeBase,
          settings.maxFileBytes,
          settings.maxChunksPerAccount,
          settings.maxConcurrentUploadsPerAccount,
          settings.maxConcurrentIngestionsPerAccount,
          settings.maxConcurrentEmbeddingsPerAccount,
          settings.retrievalRequestsPerMinutePerAccount,
          settings.maxRetrievalTopK,
          actor,
          expectedVersion
        ]
      );
      return normalizeSettings(result.rows?.[0]);
    },

    async applyInheritedQuota(defaultQuotaBytes) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET quota_bytes = $1, updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE NOT (limit_overrides ? 'quotaBytes')`,
        [defaultQuotaBytes]
      );
      return result.rowCount || 0;
    },

    async getOverview() {
      const result = await queryable.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM kb_accounts) AS accounts_total,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE status = 'active') AS accounts_active,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE status = 'frozen') AS accounts_frozen,
           (SELECT COUNT(*)::integer FROM kb_sessions s
             JOIN kb_accounts a ON a.id = s.account_id
             WHERE s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
               AND s.session_generation = a.session_generation) AS active_sessions,
           (SELECT COUNT(*)::integer FROM kb_knowledge_bases WHERE status <> 'deleting') AS knowledge_bases,
           (SELECT COUNT(*)::integer FROM kb_documents WHERE status <> 'deleting') AS documents,
           (SELECT COUNT(*)::integer FROM kb_chunks) AS chunks,
           (SELECT COUNT(*)::integer FROM kb_jobs WHERE status IN ('queued', 'retry')) AS jobs_queued,
           (SELECT COUNT(*)::integer FROM kb_jobs WHERE status = 'running') AS jobs_running,
           (SELECT COUNT(*)::integer FROM kb_jobs WHERE status = 'failed') AS jobs_failed,
           (SELECT COALESCE(SUM(quota_bytes), 0)::text FROM kb_accounts) AS quota_bytes,
           (SELECT COALESCE(SUM(used_bytes), 0)::text FROM kb_accounts) AS used_bytes,
           (SELECT COALESCE(SUM(reserved_bytes), 0)::text FROM kb_accounts) AS reserved_bytes`
      );
      const row = result.rows?.[0] || {};
      return {
        accounts: {
          total: asInteger(row.accounts_total),
          active: asInteger(row.accounts_active),
          frozen: asInteger(row.accounts_frozen)
        },
        activeSessions: asInteger(row.active_sessions),
        knowledgeBases: asInteger(row.knowledge_bases),
        documents: asInteger(row.documents),
        chunks: asInteger(row.chunks),
        jobs: {
          queued: asInteger(row.jobs_queued),
          running: asInteger(row.jobs_running),
          failed: asInteger(row.jobs_failed)
        },
        storage: {
          quotaBytes: asByteString(row.quota_bytes),
          usedBytes: asByteString(row.used_bytes),
          reservedBytes: asByteString(row.reserved_bytes)
        }
      };
    },

    async listAccounts(filters) {
      const params = [];
      const where = buildListWhere(filters, params);
      params.push(filters.limit + 1);
      const result = await queryable.query(
        `${ACCOUNT_SELECT}${where}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT $${params.length}`,
        params
      );
      return (result.rows || []).map(normalizeAccount);
    },

    async findAccountById(accountId, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `${ACCOUNT_SELECT} WHERE a.id = $1${forUpdate ? " FOR UPDATE OF a" : ""}`,
        [accountId]
      );
      return normalizeAccount(result.rows?.[0]);
    },

    async setAccountStatus(accountId, status) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET status = $2,
             session_generation = session_generation + CASE WHEN $2 = 'frozen' THEN 1 ELSE 0 END,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $1
         RETURNING version`,
        [accountId, status]
      );
      return result.rows?.[0] ? { version: asInteger(result.rows[0].version) } : null;
    },

    async setAccountLimitOverrides(accountId, limitOverrides, quotaBytes) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET limit_overrides = $2::jsonb,
             quota_bytes = $3,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $1
         RETURNING version`,
        [accountId, JSON.stringify(limitOverrides), quotaBytes]
      );
      return result.rows?.[0] ? { version: asInteger(result.rows[0].version) } : null;
    },

    async advanceSessionGeneration(accountId) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET session_generation = session_generation + 1,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $1
         RETURNING version`,
        [accountId]
      );
      return result.rows?.[0] ? { version: asInteger(result.rows[0].version) } : null;
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

    async retireActiveAdminResets(accountId, { expiredOnly = false } = {}) {
      const result = await queryable.query(
        `UPDATE kb_admin_resets
         SET status = CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE 'revoked' END,
             revoked_at = CASE WHEN expires_at > CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP ELSE revoked_at END
         WHERE account_id = $1 AND status = 'active'
           ${expiredOnly ? "AND expires_at <= CURRENT_TIMESTAMP" : ""}`,
        [accountId]
      );
      return result.rowCount || 0;
    },

    async insertAdminReset(reset) {
      const result = await queryable.query(
        `INSERT INTO kb_admin_resets (
           id, account_id, code_hash, reason, created_by, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, account_id, status, reason, created_by, expires_at, created_at`,
        [reset.id, reset.accountId, reset.codeHash, reset.reason, reset.createdBy, reset.expiresAt]
      );
      const row = result.rows?.[0];
      return row
        ? {
            id: row.id,
            accountId: row.account_id,
            status: row.status,
            reason: row.reason,
            createdBy: row.created_by,
            expiresAt: asIso(row.expires_at),
            createdAt: asIso(row.created_at)
          }
        : null;
    },

    async markAccountResetRequired(accountId) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET recovery_code_hash = NULL,
             password_reset_required = true,
             session_generation = session_generation + 1,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $1
         RETURNING version`,
        [accountId]
      );
      return result.rows?.[0] ? { version: asInteger(result.rows[0].version) } : null;
    },

    async findAdminResetByCodeHash(codeHash, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `SELECT id, account_id, status, reason, created_by, expires_at, consumed_at,
                revoked_at, created_at
         FROM kb_admin_resets
         WHERE code_hash = $1${forUpdate ? " FOR UPDATE" : ""}`,
        [codeHash]
      );
      const row = result.rows?.[0];
      return row
        ? {
            id: row.id,
            accountId: row.account_id,
            status: row.status,
            reason: row.reason,
            createdBy: row.created_by,
            expiresAt: asIso(row.expires_at),
            consumedAt: asIso(row.consumed_at),
            revokedAt: asIso(row.revoked_at),
            createdAt: asIso(row.created_at)
          }
        : null;
    },

    async consumeAdminReset(resetId) {
      const result = await queryable.query(
        `UPDATE kb_admin_resets
         SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'active' AND expires_at > CURRENT_TIMESTAMP
         RETURNING id`,
        [resetId]
      );
      return Boolean(result.rowCount);
    },

    async listInvites(filters) {
      const params = [];
      const where = [];
      const effectiveStatus = `CASE
        WHEN status = 'active' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
          THEN 'expired'
        ELSE status
      END`;
      if (filters.status) {
        params.push(filters.status);
        where.push(`${effectiveStatus} = $${params.length}`);
      }
      if (filters.cursor) {
        params.push(filters.cursor.createdAt, filters.cursor.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }
      params.push(filters.limit + 1);
      const result = await queryable.query(
        `SELECT id, status, ${effectiveStatus} AS effective_status,
                initial_limit_overrides, expires_at, consumed_by_account_id,
                consumed_at, revoked_at, created_by, created_at
         FROM kb_invites
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY created_at DESC, id DESC
         LIMIT $${params.length}`,
        params
      );
      return (result.rows || []).map(normalizeInvite);
    },

    async findInviteById(inviteId, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `SELECT id, status,
                CASE WHEN status = 'active' AND expires_at IS NOT NULL
                           AND expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE status END
                  AS effective_status,
                initial_limit_overrides, expires_at, consumed_by_account_id,
                consumed_at, revoked_at, created_by, created_at
         FROM kb_invites WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`,
        [inviteId]
      );
      return normalizeInvite(result.rows?.[0]);
    },

    async insertInvite(invite) {
      const result = await queryable.query(
        `INSERT INTO kb_invites (
           id, code_hash, initial_limit_overrides, expires_at, created_by
         ) VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING id, status, initial_limit_overrides, expires_at,
                   consumed_by_account_id, consumed_at, revoked_at, created_by, created_at`,
        [
          invite.id,
          invite.codeHash,
          JSON.stringify(invite.initialLimitOverrides || {}),
          invite.expiresAt,
          invite.createdBy
        ]
      );
      return normalizeInvite(result.rows?.[0]);
    },

    async revokeInvite(inviteId) {
      const result = await queryable.query(
        `UPDATE kb_invites
         SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'active'
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         RETURNING id, status, initial_limit_overrides, expires_at,
                   consumed_by_account_id, consumed_at, revoked_at, created_by, created_at`,
        [inviteId]
      );
      return normalizeInvite(result.rows?.[0]);
    },

    async listJobs(filters) {
      const params = [];
      const where = [];
      if (filters.status) {
        params.push(filters.status);
        where.push(`status = $${params.length}`);
      }
      if (filters.kind) {
        params.push(filters.kind);
        where.push(`kind = $${params.length}`);
      }
      if (filters.cursor) {
        params.push(filters.cursor.createdAt, filters.cursor.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }
      params.push(filters.limit + 1);
      const result = await queryable.query(
        `SELECT id, account_id, knowledge_base_id, document_id, kind, status,
                attempts, max_attempts, progress_current, progress_total, error_code,
                lease_expires_at > CURRENT_TIMESTAMP AS lease_active,
                run_after, created_at, updated_at
         FROM kb_jobs
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY created_at DESC, id DESC
         LIMIT $${params.length}`,
        params
      );
      return (result.rows || []).map(normalizeJob);
    },

    async listAudit(filters) {
      const params = [];
      const where = [];
      for (const [field, column] of [
        ["operation", "operation"],
        ["targetType", "target_type"],
        ["result", "result"]
      ]) {
        if (!filters[field]) continue;
        params.push(filters[field]);
        where.push(`${column} = $${params.length}`);
      }
      if (filters.cursor) {
        params.push(filters.cursor.createdAt, filters.cursor.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`);
      }
      params.push(filters.limit + 1);
      const result = await queryable.query(
        `SELECT id, request_id, admin_actor, operation, target_type, target_id,
                reason, result, metadata, created_at
         FROM kb_admin_audit
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY created_at DESC, id DESC
         LIMIT $${params.length}`,
        params
      );
      return (result.rows || []).map(normalizeAudit);
    },

    async insertAudit(entry) {
      const result = await queryable.query(
        `INSERT INTO kb_admin_audit (
           request_id, admin_actor, operation, target_type, target_id,
           reason, result, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING id, request_id, admin_actor, operation, target_type,
                   target_id, reason, result, metadata, created_at`,
        [
          entry.requestId,
          entry.adminActor,
          entry.operation,
          entry.targetType,
          entry.targetId || null,
          entry.reason,
          entry.result,
          JSON.stringify(entry.metadata || {})
        ]
      );
      return normalizeAudit(result.rows?.[0]);
    }
  });
}

export const normalizeKnowledgeAdminAccountRow = normalizeAccount;
export const normalizeKnowledgeRuntimeSettingsRow = normalizeSettings;
