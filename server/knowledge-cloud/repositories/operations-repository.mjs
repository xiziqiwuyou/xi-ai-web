function asInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function asByteString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return /^-?\d+$/.test(String(value ?? "")) ? String(value) : "0";
}

function asIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    knowledgeBaseId: row.knowledge_base_id || null,
    documentId: row.document_id || null,
    dedupeKey: row.dedupe_key || null,
    kind: row.kind,
    status: row.status,
    attempts: asInteger(row.attempts),
    maxAttempts: asInteger(row.max_attempts),
    progressCurrent: asInteger(row.progress_current),
    progressTotal: asInteger(row.progress_total),
    errorCode: row.error_code || null,
    runAfter: asIso(row.run_after),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function normalizeMetrics(row = {}) {
  return {
    accounts: {
      total: asInteger(row.accounts_total),
      active: asInteger(row.accounts_active),
      frozen: asInteger(row.accounts_frozen),
      deleting: asInteger(row.accounts_deleting),
      locked: asInteger(row.accounts_locked),
      overQuota: asInteger(row.accounts_over_quota),
      failedLoginCount: asInteger(row.failed_login_count)
    },
    auth: {
      activeSessions: asInteger(row.active_sessions),
      expiredSessions: asInteger(row.expired_sessions),
      activeInvites: asInteger(row.active_invites),
      expiredInvites: asInteger(row.expired_invites),
      activeAdminResets: asInteger(row.active_admin_resets),
      expiredAdminResets: asInteger(row.expired_admin_resets)
    },
    storage: {
      quotaBytes: asByteString(row.quota_bytes),
      usedBytes: asByteString(row.used_bytes),
      reservedBytes: asByteString(row.reserved_bytes),
      staleReservationCount: asInteger(row.stale_reservation_count),
      staleReservationBytes: asByteString(row.stale_reservation_bytes),
      expiredPendingUploads: asInteger(row.expired_pending_uploads)
    },
    queue: {
      queued: asInteger(row.jobs_queued),
      running: asInteger(row.jobs_running),
      retry: asInteger(row.jobs_retry),
      failed: asInteger(row.jobs_failed),
      cancelled: asInteger(row.jobs_cancelled),
      oldestReadyAgeSeconds: asInteger(row.oldest_ready_age_seconds)
    },
    vectors: {
      incompleteChunks: asInteger(row.incomplete_vector_chunks),
      leasedChunks: asInteger(row.leased_vector_chunks),
      failedChunks: asInteger(row.failed_vector_chunks)
    },
    cleanup: {
      deletingAccounts: asInteger(row.deleting_accounts),
      deletingKnowledgeBases: asInteger(row.deleting_bases),
      deletingDocuments: asInteger(row.deleting_documents)
    }
  };
}

export function createKnowledgeOperationsRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge operations repository requires a queryable database client");
  }

  return Object.freeze({
    async healthMetrics() {
      const result = await queryable.query(
        `WITH stale_reservations AS (
           SELECT account_id, reservation_key, component,
                  SUM(reserved_delta_bytes) AS reserved_bytes,
                  MIN(expires_at) FILTER (WHERE entry_type = 'reserve') AS expires_at
           FROM kb_usage_ledger
           WHERE reservation_key IS NOT NULL
           GROUP BY account_id, reservation_key, component
           HAVING SUM(reserved_delta_bytes) > 0
              AND MIN(expires_at) FILTER (WHERE entry_type = 'reserve') <= CURRENT_TIMESTAMP
         ),
         ready_queue AS (
           SELECT MIN(run_after) AS oldest_run_after
           FROM kb_jobs
           WHERE status IN ('queued', 'retry') AND run_after <= CURRENT_TIMESTAMP
         )
         SELECT
           (SELECT COUNT(*)::integer FROM kb_accounts) AS accounts_total,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE status = 'active') AS accounts_active,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE status = 'frozen') AS accounts_frozen,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE status = 'deleting') AS accounts_deleting,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE locked_until > CURRENT_TIMESTAMP) AS accounts_locked,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE used_bytes + reserved_bytes > quota_bytes) AS accounts_over_quota,
           (SELECT COALESCE(SUM(failed_login_count), 0)::integer FROM kb_accounts) AS failed_login_count,
           (SELECT COUNT(*)::integer FROM kb_sessions s
             JOIN kb_accounts a ON a.id = s.account_id
             WHERE s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
               AND s.session_generation = a.session_generation) AS active_sessions,
           (SELECT COUNT(*)::integer FROM kb_sessions
             WHERE revoked_at IS NULL AND expires_at <= CURRENT_TIMESTAMP) AS expired_sessions,
           (SELECT COUNT(*)::integer FROM kb_invites
             WHERE status = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)) AS active_invites,
           (SELECT COUNT(*)::integer FROM kb_invites
             WHERE status = 'active' AND expires_at <= CURRENT_TIMESTAMP) AS expired_invites,
           (SELECT COUNT(*)::integer FROM kb_admin_resets
             WHERE status = 'active' AND expires_at > CURRENT_TIMESTAMP) AS active_admin_resets,
           (SELECT COUNT(*)::integer FROM kb_admin_resets
             WHERE status = 'active' AND expires_at <= CURRENT_TIMESTAMP) AS expired_admin_resets,
           (SELECT COALESCE(SUM(quota_bytes), 0)::text FROM kb_accounts) AS quota_bytes,
           (SELECT COALESCE(SUM(used_bytes), 0)::text FROM kb_accounts) AS used_bytes,
           (SELECT COALESCE(SUM(reserved_bytes), 0)::text FROM kb_accounts) AS reserved_bytes,
           (SELECT COUNT(*)::integer FROM stale_reservations) AS stale_reservation_count,
           (SELECT COALESCE(SUM(reserved_bytes), 0)::text FROM stale_reservations) AS stale_reservation_bytes,
           (SELECT COUNT(*)::integer FROM kb_documents
             WHERE status = 'pending_upload' AND upload_expires_at <= CURRENT_TIMESTAMP) AS expired_pending_uploads,
           (SELECT COUNT(*)::integer FROM kb_jobs WHERE status = 'queued') AS jobs_queued,
           (SELECT COUNT(*)::integer FROM kb_jobs WHERE status = 'running') AS jobs_running,
           (SELECT COUNT(*)::integer FROM kb_jobs WHERE status = 'retry') AS jobs_retry,
           (SELECT COUNT(*)::integer FROM kb_jobs WHERE status = 'failed') AS jobs_failed,
           (SELECT COUNT(*)::integer FROM kb_jobs WHERE status = 'cancelled') AS jobs_cancelled,
           (SELECT COALESCE(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - oldest_run_after), 0)::integer
              FROM ready_queue) AS oldest_ready_age_seconds,
           (SELECT COUNT(*)::integer FROM kb_chunks c
             JOIN kb_documents d ON d.id = c.document_id AND d.account_id = c.account_id
             WHERE c.embedding_state <> 'ready'
               AND d.status IN ('awaiting_embedding', 'embedding', 'ready')) AS incomplete_vector_chunks,
           (SELECT COUNT(*)::integer FROM kb_chunks WHERE embedding_state = 'leased') AS leased_vector_chunks,
           (SELECT COUNT(*)::integer FROM kb_chunks WHERE embedding_state = 'failed') AS failed_vector_chunks,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE status = 'deleting') AS deleting_accounts,
           (SELECT COUNT(*)::integer FROM kb_knowledge_bases WHERE status = 'deleting') AS deleting_bases,
           (SELECT COUNT(*)::integer FROM kb_documents WHERE status = 'deleting') AS deleting_documents`
      );
      return normalizeMetrics(result.rows?.[0]);
    },

    async listAccountIds({ status = null, limit = 1000 } = {}) {
      const params = [];
      const where = [];
      if (status) {
        params.push(status);
        where.push(`status = $${params.length}`);
      }
      params.push(Math.min(1000, Math.max(1, Number(limit) || 1000)));
      const result = await queryable.query(
        `SELECT id
         FROM kb_accounts
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY created_at ASC, id ASC
         LIMIT $${params.length}`,
        params
      );
      return (result.rows || []).map((row) => row.id);
    },

    async listDeletingBaseIds(accountId, limit = 100) {
      const result = await queryable.query(
        `SELECT id
         FROM kb_knowledge_bases
         WHERE account_id = $1 AND status = 'deleting'
         ORDER BY updated_at ASC, id ASC
         LIMIT $2`,
        [accountId, Math.min(100, Math.max(1, Number(limit) || 100))]
      );
      return (result.rows || []).map((row) => row.id);
    },

    async enqueueJob(job) {
      const result = await queryable.query(
        `INSERT INTO kb_jobs (
           id, account_id, knowledge_base_id, document_id, dedupe_key, kind, status, run_after
         ) VALUES ($1, $2, $3, $4, $5, $6, 'queued', COALESCE($7, CURRENT_TIMESTAMP))
         ON CONFLICT (account_id, kind, dedupe_key)
           WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running', 'retry')
         DO UPDATE SET run_after = LEAST(kb_jobs.run_after, EXCLUDED.run_after),
                       updated_at = CURRENT_TIMESTAMP
         RETURNING id, account_id, knowledge_base_id, document_id, dedupe_key,
                   kind, status, attempts, max_attempts, progress_current,
                   progress_total, error_code, run_after, created_at, updated_at`,
        [
          job.id,
          job.accountId,
          job.knowledgeBaseId || null,
          job.documentId || null,
          job.dedupeKey || null,
          job.kind,
          job.runAfter || null
        ]
      );
      return normalizeJob(result.rows?.[0]);
    },

    async markAccountDeleting(accountId, expectedVersion) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET status = 'deleting',
             session_generation = session_generation + 1,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $1 AND version = $2 AND status <> 'deleting'
         RETURNING id, status, version`,
        [accountId, expectedVersion]
      );
      return result.rows?.[0]
        ? {
            id: result.rows[0].id,
            status: result.rows[0].status,
            version: asInteger(result.rows[0].version)
          }
        : null;
    },

    async markAccountResourcesDeleting(accountId) {
      const baseResult = await queryable.query(
        `UPDATE kb_knowledge_bases
         SET status = 'deleting', updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND status <> 'deleting'`,
        [accountId]
      );
      const documentResult = await queryable.query(
        `UPDATE kb_documents
         SET status = 'deleting', updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND status <> 'deleting'`,
        [accountId]
      );
      return {
        knowledgeBasesMarked: baseResult.rowCount || 0,
        documentsMarked: documentResult.rowCount || 0
      };
    },

    async revokeExpiredSessions(limit = 500) {
      const result = await queryable.query(
        `WITH expired AS (
           SELECT id
           FROM kb_sessions
           WHERE revoked_at IS NULL AND expires_at <= CURRENT_TIMESTAMP
           ORDER BY expires_at ASC, id ASC
           LIMIT $1
         )
         UPDATE kb_sessions s
         SET revoked_at = CURRENT_TIMESTAMP
         FROM expired
         WHERE s.id = expired.id`,
        [Math.min(1000, Math.max(1, Number(limit) || 500))]
      );
      return result.rowCount || 0;
    },

    async expireAdminResets() {
      const result = await queryable.query(
        `UPDATE kb_admin_resets
         SET status = 'expired'
         WHERE status = 'active' AND expires_at <= CURRENT_TIMESTAMP`
      );
      return result.rowCount || 0;
    },

    async expireInvites() {
      const result = await queryable.query(
        `UPDATE kb_invites
         SET status = 'expired'
         WHERE status = 'active' AND expires_at <= CURRENT_TIMESTAMP`
      );
      return result.rowCount || 0;
    },

    async deleteAccountsReadyForFinalization(limit = 50) {
      const result = await queryable.query(
        `WITH candidates AS (
           SELECT a.id
           FROM kb_accounts a
           WHERE a.status = 'deleting'
             AND NOT EXISTS (
               SELECT 1 FROM kb_knowledge_bases b WHERE b.account_id = a.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM kb_documents d WHERE d.account_id = a.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM kb_jobs j
               WHERE j.account_id = a.id AND j.status IN ('queued', 'running', 'retry')
             )
           ORDER BY a.updated_at ASC, a.id ASC
           LIMIT $1
         )
         DELETE FROM kb_accounts a
         USING candidates
         WHERE a.id = candidates.id
         RETURNING a.id`,
        [Math.min(100, Math.max(1, Number(limit) || 50))]
      );
      return (result.rows || []).map((row) => row.id);
    }
  });
}
