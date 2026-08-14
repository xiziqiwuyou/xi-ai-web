function asInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function asByteString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return /^-?\d+$/.test(String(value ?? "")) ? String(value) : "0";
}

function asRate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : 0;
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
      oldestReadyAgeSeconds: asInteger(row.oldest_ready_age_seconds),
      windowSeconds: 86_400,
      attempted: asInteger(row.jobs_attempted_window),
      retried: asInteger(row.jobs_retried_window),
      terminal: asInteger(row.jobs_terminal_window),
      deadLetter: asInteger(row.jobs_dead_letter_window),
      retryRate: asRate(row.jobs_retry_rate),
      deadLetterRate: asRate(row.jobs_dead_letter_rate)
    },
    vectors: {
      incompleteChunks: asInteger(row.incomplete_vector_chunks),
      leasedChunks: asInteger(row.leased_vector_chunks),
      failedChunks: asInteger(row.failed_vector_chunks)
    },
    embeddings: {
      completedBatches: asInteger(row.embedding_completed_batches),
      averageLatencyMs: asInteger(row.embedding_average_latency_ms),
      p95LatencyMs: asInteger(row.embedding_p95_latency_ms)
    },
    indexes: {
      pending: asInteger(row.pending_indexes),
      oldestPendingAgeSeconds: asInteger(row.oldest_pending_index_age_seconds)
    },
    quota: {
      driftAccounts: asInteger(row.quota_drift_accounts),
      usedDriftBytes: asByteString(row.quota_used_drift_bytes),
      reservedDriftBytes: asByteString(row.quota_reserved_drift_bytes)
    },
    reconciliation: {
      state: asInteger(row.reconciliation_running) > 0
        ? "running"
        : asInteger(row.reconciliation_queued) > 0
          ? "queued"
          : asInteger(row.reconciliation_failed) > 0
            ? "failed"
            : asInteger(row.reconciliation_drift_detected) > 0 ||
                asInteger(row.quota_drift_accounts) > 0 ||
                asInteger(row.reconciliation_missing_objects) > 0
              ? "drift_detected"
              : asInteger(row.reconciliation_partial) > 0
                ? "partial"
                : asInteger(row.reconciliation_total) > 0
                  ? "ready"
                  : "not_run",
      accounts: asInteger(row.reconciliation_total),
      running: asInteger(row.reconciliation_running),
      queued: asInteger(row.reconciliation_queued),
      failed: asInteger(row.reconciliation_failed),
      driftDetected: asInteger(row.reconciliation_drift_detected),
      partial: asInteger(row.reconciliation_partial),
      databaseObjects: asInteger(row.reconciliation_database_objects),
      checkedObjects: asInteger(row.reconciliation_checked_objects),
      missingObjects: asInteger(row.reconciliation_missing_objects),
      lastCompletedAt: asIso(row.reconciliation_last_completed_at)
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
    async recordWorkerHeartbeat({ workerId, concurrency, leaseSeconds }) {
      const result = await queryable.query(
        `INSERT INTO kb_worker_heartbeats (
           worker_id, concurrency, lease_seconds, started_at, heartbeat_at
         ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (worker_id) DO UPDATE
         SET concurrency = EXCLUDED.concurrency,
             lease_seconds = EXCLUDED.lease_seconds,
             heartbeat_at = CURRENT_TIMESTAMP
         RETURNING heartbeat_at`,
        [workerId, concurrency, leaseSeconds]
      );
      return asIso(result.rows?.[0]?.heartbeat_at);
    },

    async removeWorkerHeartbeat(workerId) {
      const result = await queryable.query(
        "DELETE FROM kb_worker_heartbeats WHERE worker_id = $1",
        [workerId]
      );
      return (result.rowCount || 0) > 0;
    },

    async workerFreshness(staleAfterSeconds) {
      const result = await queryable.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE heartbeat_at >= CURRENT_TIMESTAMP - make_interval(secs => $1)
           )::integer AS fresh_workers,
           COUNT(*) FILTER (
             WHERE heartbeat_at < CURRENT_TIMESTAMP - make_interval(secs => $1)
           )::integer AS stale_workers,
           MAX(heartbeat_at) AS last_heartbeat_at
         FROM kb_worker_heartbeats`,
        [staleAfterSeconds]
      );
      const row = result.rows?.[0] || {};
      return {
        state: asInteger(row.fresh_workers) > 0 ? "fresh" : "stale",
        freshWorkers: asInteger(row.fresh_workers),
        staleWorkers: asInteger(row.stale_workers),
        lastHeartbeatAt: asIso(row.last_heartbeat_at),
        staleAfterSeconds
      };
    },

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
         ),
         job_window AS (
           SELECT
             COUNT(*) FILTER (
               WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
             )::integer AS attempted,
             COUNT(*) FILTER (
               WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' AND attempts > 1
             )::integer AS retried,
             COUNT(*) FILTER (
               WHERE completed_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
                 AND status IN ('succeeded', 'failed', 'cancelled')
             )::integer AS terminal,
             COUNT(*) FILTER (
               WHERE completed_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' AND status = 'failed'
             )::integer AS dead_letter
           FROM kb_jobs
         ),
         ledger_totals AS (
           SELECT account_id,
                  COALESCE(SUM(used_delta_bytes), 0) AS used_bytes,
                  COALESCE(SUM(reserved_delta_bytes), 0) AS reserved_bytes
           FROM kb_usage_ledger
           GROUP BY account_id
         ),
         quota_drift AS (
           SELECT
             COUNT(*) FILTER (
               WHERE a.used_bytes <> COALESCE(l.used_bytes, 0)
                  OR a.reserved_bytes <> COALESCE(l.reserved_bytes, 0)
             )::integer AS accounts,
             COALESCE(SUM(COALESCE(l.used_bytes, 0) - a.used_bytes), 0) AS used_bytes,
             COALESCE(SUM(COALESCE(l.reserved_bytes, 0) - a.reserved_bytes), 0) AS reserved_bytes
           FROM kb_accounts a
           LEFT JOIN ledger_totals l ON l.account_id = a.id
         ),
         embedding_latency AS (
           SELECT COUNT(*)::integer AS completed_batches,
                  COALESCE(AVG(EXTRACT(EPOCH FROM completed_at - created_at) * 1000), 0)::integer
                    AS average_latency_ms,
                  COALESCE(
                    percentile_cont(0.95) WITHIN GROUP (
                      ORDER BY EXTRACT(EPOCH FROM completed_at - created_at) * 1000
                    ),
                    0
                  )::integer AS p95_latency_ms
           FROM kb_embedding_batches
           WHERE status = 'completed'
             AND completed_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
         ),
         pending_indexes AS (
           SELECT COUNT(*)::integer AS pending,
                  COALESCE(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - MIN(created_at)), 0)::integer
                    AS oldest_age_seconds
           FROM kb_index_versions
           WHERE status = 'building'
         ),
         reconciliation_summary AS (
           SELECT COUNT(*)::integer AS total,
                  COUNT(*) FILTER (WHERE state = 'running')::integer AS running,
                  COUNT(*) FILTER (WHERE state = 'queued')::integer AS queued,
                  COUNT(*) FILTER (WHERE state = 'failed')::integer AS failed,
                  COUNT(*) FILTER (WHERE state = 'drift_detected')::integer AS drift_detected,
                  COUNT(*) FILTER (WHERE state = 'partial')::integer AS partial,
                  COALESCE(SUM(database_object_count), 0)::integer AS database_objects,
                  COALESCE(SUM(checked_object_count), 0)::integer AS checked_objects,
                  COALESCE(SUM(missing_object_count), 0)::integer AS missing_objects,
                  MAX(completed_at) AS last_completed_at
           FROM kb_reconciliation_runs
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
           (SELECT attempted FROM job_window) AS jobs_attempted_window,
           (SELECT retried FROM job_window) AS jobs_retried_window,
           (SELECT terminal FROM job_window) AS jobs_terminal_window,
           (SELECT dead_letter FROM job_window) AS jobs_dead_letter_window,
           (SELECT CASE WHEN attempted = 0 THEN 0 ELSE retried::numeric / attempted END
              FROM job_window) AS jobs_retry_rate,
           (SELECT CASE WHEN terminal = 0 THEN 0 ELSE dead_letter::numeric / terminal END
              FROM job_window) AS jobs_dead_letter_rate,
           (SELECT COUNT(*)::integer FROM kb_chunks c
             JOIN kb_documents d ON d.id = c.document_id AND d.account_id = c.account_id
             WHERE c.embedding_state <> 'ready'
               AND d.status IN ('awaiting_embedding', 'embedding', 'ready')) AS incomplete_vector_chunks,
           (SELECT COUNT(*)::integer FROM kb_chunks WHERE embedding_state = 'leased') AS leased_vector_chunks,
           (SELECT COUNT(*)::integer FROM kb_chunks WHERE embedding_state = 'failed') AS failed_vector_chunks,
           (SELECT completed_batches FROM embedding_latency) AS embedding_completed_batches,
           (SELECT average_latency_ms FROM embedding_latency) AS embedding_average_latency_ms,
           (SELECT p95_latency_ms FROM embedding_latency) AS embedding_p95_latency_ms,
           (SELECT pending FROM pending_indexes) AS pending_indexes,
           (SELECT oldest_age_seconds FROM pending_indexes) AS oldest_pending_index_age_seconds,
           (SELECT accounts FROM quota_drift) AS quota_drift_accounts,
           (SELECT used_bytes::text FROM quota_drift) AS quota_used_drift_bytes,
           (SELECT reserved_bytes::text FROM quota_drift) AS quota_reserved_drift_bytes,
           (SELECT total FROM reconciliation_summary) AS reconciliation_total,
           (SELECT running FROM reconciliation_summary) AS reconciliation_running,
           (SELECT queued FROM reconciliation_summary) AS reconciliation_queued,
           (SELECT failed FROM reconciliation_summary) AS reconciliation_failed,
           (SELECT drift_detected FROM reconciliation_summary) AS reconciliation_drift_detected,
           (SELECT partial FROM reconciliation_summary) AS reconciliation_partial,
           (SELECT database_objects FROM reconciliation_summary) AS reconciliation_database_objects,
           (SELECT checked_objects FROM reconciliation_summary) AS reconciliation_checked_objects,
           (SELECT missing_objects FROM reconciliation_summary) AS reconciliation_missing_objects,
           (SELECT last_completed_at FROM reconciliation_summary) AS reconciliation_last_completed_at,
           (SELECT COUNT(*)::integer FROM kb_accounts WHERE status = 'deleting') AS deleting_accounts,
           (SELECT COUNT(*)::integer FROM kb_knowledge_bases WHERE status = 'deleting') AS deleting_bases,
           (SELECT COUNT(*)::integer FROM kb_documents WHERE status = 'deleting') AS deleting_documents`
      );
      return normalizeMetrics(result.rows?.[0]);
    },

    async markReconciliationQueued(accountId) {
      const result = await queryable.query(
        `INSERT INTO kb_reconciliation_runs (account_id, state, updated_at)
         VALUES ($1, 'queued', CURRENT_TIMESTAMP)
         ON CONFLICT (account_id) DO UPDATE
         SET state = 'queued', error_code = NULL, started_at = NULL,
             completed_at = NULL, database_object_count = 0,
             checked_object_count = 0, missing_object_count = 0,
             quota_changed = false, updated_at = CURRENT_TIMESTAMP
         RETURNING account_id`,
        [accountId]
      );
      return result.rows?.[0]?.account_id || null;
    },

    async beginReconciliation(accountId) {
      const result = await queryable.query(
        `INSERT INTO kb_reconciliation_runs (
           account_id, state, started_at, completed_at, updated_at
         ) VALUES ($1, 'running', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (account_id) DO UPDATE
         SET state = 'running', error_code = NULL, started_at = CURRENT_TIMESTAMP,
             completed_at = NULL, updated_at = CURRENT_TIMESTAMP
         RETURNING account_id`,
        [accountId]
      );
      return result.rows?.[0]?.account_id || null;
    },

    async listAccountObjectReferences(accountId, limit = 200) {
      const boundedLimit = Math.min(500, Math.max(1, Number(limit) || 200));
      const result = await queryable.query(
        `WITH object_references AS (
           SELECT object_key, object_version_id AS version_id
           FROM kb_documents
           WHERE account_id = $1 AND status <> 'deleting'
           UNION ALL
           SELECT normalized_object_key AS object_key, NULL::text AS version_id
           FROM kb_documents
           WHERE account_id = $1 AND status <> 'deleting' AND normalized_object_key IS NOT NULL
           UNION ALL
           SELECT ocr_object_key AS object_key, NULL::text AS version_id
           FROM kb_documents
           WHERE account_id = $1 AND status <> 'deleting' AND ocr_object_key IS NOT NULL
         )
         SELECT object_key, version_id, COUNT(*) OVER ()::integer AS total_count
         FROM object_references
         ORDER BY object_key, version_id NULLS FIRST
         LIMIT $2`,
        [accountId, boundedLimit + 1]
      );
      const rows = result.rows || [];
      return {
        items: rows.slice(0, boundedLimit).map((row) => ({
          objectKey: row.object_key,
          versionId: row.version_id || null
        })),
        total: asInteger(rows[0]?.total_count),
        truncated: rows.length > boundedLimit
      };
    },

    async completeReconciliation({
      accountId,
      databaseObjectCount,
      checkedObjectCount,
      missingObjectCount,
      quotaChanged,
      truncated
    }) {
      const state = missingObjectCount > 0 || quotaChanged
        ? "drift_detected"
        : truncated
          ? "partial"
          : "ready";
      const result = await queryable.query(
        `UPDATE kb_reconciliation_runs
         SET state = $2, database_object_count = $3, checked_object_count = $4,
             missing_object_count = $5, quota_changed = $6, error_code = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE account_id = $1
         RETURNING state`,
        [accountId, state, databaseObjectCount, checkedObjectCount, missingObjectCount, quotaChanged]
      );
      return result.rows?.[0]?.state || null;
    },

    async failReconciliation(accountId, errorCode) {
      const result = await queryable.query(
        `UPDATE kb_reconciliation_runs
         SET state = 'failed', error_code = $2, completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE account_id = $1
         RETURNING state`,
        [accountId, errorCode]
      );
      return result.rows?.[0]?.state || null;
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

    async listNeededOcrDocuments(limit = 50) {
      const result = await queryable.query(
        `SELECT d.id, d.account_id, d.knowledge_base_id
         FROM kb_documents d
         JOIN kb_accounts a ON a.id = d.account_id AND a.status = 'active'
         JOIN kb_knowledge_bases b
           ON b.id = d.knowledge_base_id AND b.account_id = d.account_id AND b.status = 'active'
         WHERE d.status = 'needs_ocr' AND d.ocr_status = 'needed'
         ORDER BY d.updated_at ASC, d.id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [Math.min(100, Math.max(1, Number(limit) || 50))]
      );
      return (result.rows || []).map((row) => ({
        id: row.id,
        accountId: row.account_id,
        knowledgeBaseId: row.knowledge_base_id
      }));
    },

    async markDocumentOcrQueued(accountId, documentId) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET ocr_status = 'queued', error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND status = 'needs_ocr'
           AND ocr_status = 'needed'
         RETURNING id`,
        [accountId, documentId]
      );
      return result.rows?.[0]?.id || null;
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
