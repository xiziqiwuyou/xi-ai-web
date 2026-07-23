function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asByteString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return /^-?\d+$/.test(String(value ?? "")) ? String(value) : "0";
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
    attempts: asNumber(row.attempts),
    maxAttempts: asNumber(row.max_attempts),
    leaseOwner: row.lease_owner || null,
    leaseExpiresAt: row.lease_expires_at || null,
    progressCurrent: asNumber(row.progress_current),
    progressTotal: asNumber(row.progress_total),
    errorCode: row.error_code || null,
    errorDetail: row.error_detail || null,
    runAfter: row.run_after || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function normalizeParseContext(row) {
  if (!row) return null;
  return {
    accountId: row.account_id,
    knowledgeBaseId: row.knowledge_base_id,
    documentId: row.id,
    displayName: row.display_name,
    declaredMimeType: row.declared_mime_type || "",
    verifiedMimeType: row.verified_mime_type || null,
    verifiedBytes: asByteString(row.verified_bytes),
    checksumSha256: row.checksum_sha256 || null,
    objectKey: row.object_key,
    objectVersionId: row.object_version_id || null,
    documentStatus: row.status,
    documentVersion: asNumber(row.version),
    baseStatus: row.base_status,
    indexVersionId: row.index_version_id,
    indexVersion: asNumber(row.index_version),
    chunkVersion: asNumber(row.chunk_version)
  };
}

const JOB_SELECT = `SELECT id, account_id, knowledge_base_id, document_id,
                           dedupe_key, kind, status, attempts, max_attempts,
                           lease_owner, lease_expires_at, progress_current,
                           progress_total, error_code, error_detail, run_after,
                           created_at, updated_at
                    FROM kb_jobs`;

export function createKnowledgeJobRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge job repository requires a queryable database client");
  }

  return Object.freeze({
    async claimNext({ workerId, leaseSeconds, kinds }) {
      const result = await queryable.query(
        `WITH candidate AS (
           SELECT j.id
           FROM kb_jobs j
           JOIN kb_accounts a ON a.id = j.account_id
           CROSS JOIN kb_runtime_settings s
           WHERE (
             (j.status IN ('queued', 'retry') AND j.run_after <= CURRENT_TIMESTAMP)
             OR (j.status = 'running' AND j.lease_expires_at <= CURRENT_TIMESTAMP)
           )
             AND j.attempts < j.max_attempts
             AND j.kind = ANY($1::text[])
             AND (j.kind <> 'parse' OR a.status = 'active')
             AND (
               j.kind <> 'parse'
               OR (
                 SELECT COUNT(*)::integer
                 FROM kb_jobs active
                 WHERE active.account_id = j.account_id
                   AND active.kind = 'parse'
                   AND active.status = 'running'
                   AND active.lease_expires_at > CURRENT_TIMESTAMP
                   AND active.id <> j.id
               ) < COALESCE(
                 NULLIF(a.limit_overrides ->> 'maxConcurrentIngestionsPerAccount', '')::integer,
                 s.max_concurrent_ingestions_per_account
               )
             )
           ORDER BY j.run_after ASC, j.created_at ASC, j.id ASC
           FOR UPDATE OF j SKIP LOCKED
           LIMIT 1
         )
         UPDATE kb_jobs j
         SET status = 'running', attempts = j.attempts + 1,
             lease_owner = $2,
             lease_expires_at = CURRENT_TIMESTAMP + make_interval(secs => $3::integer),
             error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP
         FROM candidate
         WHERE j.id = candidate.id
         RETURNING j.id, j.account_id, j.knowledge_base_id, j.document_id,
                   j.dedupe_key, j.kind, j.status, j.attempts, j.max_attempts,
                   j.lease_owner, j.lease_expires_at, j.progress_current,
                   j.progress_total, j.error_code, j.error_detail, j.run_after,
                   j.created_at, j.updated_at`,
        [kinds, workerId, leaseSeconds]
      );
      return normalizeJob(result.rows?.[0]);
    },

    async expireExhaustedLeases(limit = 100) {
      const result = await queryable.query(
        `WITH exhausted AS (
           SELECT id
           FROM kb_jobs
           WHERE attempts >= max_attempts
             AND (
               status IN ('queued', 'retry')
               OR (status = 'running' AND lease_expires_at <= CURRENT_TIMESTAMP)
             )
           ORDER BY updated_at ASC, id ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE kb_jobs j
         SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
             error_code = COALESCE(j.error_code, 'KB_JOB_LEASE_EXHAUSTED'),
             error_detail = NULL, updated_at = CURRENT_TIMESTAMP
         FROM exhausted
         WHERE j.id = exhausted.id
         RETURNING j.id, j.account_id, j.knowledge_base_id, j.document_id,
                   j.dedupe_key, j.kind, j.status, j.attempts, j.max_attempts,
                   j.lease_owner, j.lease_expires_at, j.progress_current,
                   j.progress_total, j.error_code, j.error_detail, j.run_after,
                   j.created_at, j.updated_at`,
        [limit]
      );
      return (result.rows || []).map(normalizeJob);
    },

    async heartbeat(jobId, workerId, leaseSeconds, progress = {}) {
      const result = await queryable.query(
        `UPDATE kb_jobs
         SET lease_expires_at = CURRENT_TIMESTAMP + make_interval(secs => $3::integer),
             progress_current = COALESCE($4, progress_current),
             progress_total = COALESCE($5, progress_total),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'running' AND lease_owner = $2
         RETURNING id, account_id, knowledge_base_id, document_id, dedupe_key,
                   kind, status, attempts, max_attempts, lease_owner,
                   lease_expires_at, progress_current, progress_total,
                   error_code, error_detail, run_after, created_at, updated_at`,
        [jobId, workerId, leaseSeconds, progress.current ?? null, progress.total ?? null]
      );
      return normalizeJob(result.rows?.[0]);
    },

    async completeOwnedJob(jobId, workerId, progress = {}) {
      const result = await queryable.query(
        `UPDATE kb_jobs
         SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL,
             progress_current = COALESCE($3, progress_current),
             progress_total = COALESCE($4, progress_total),
             error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'running' AND lease_owner = $2
         RETURNING id, account_id, knowledge_base_id, document_id, dedupe_key,
                   kind, status, attempts, max_attempts, lease_owner,
                   lease_expires_at, progress_current, progress_total,
                   error_code, error_detail, run_after, created_at, updated_at`,
        [jobId, workerId, progress.current ?? null, progress.total ?? null]
      );
      return normalizeJob(result.rows?.[0]);
    },

    async failOwnedJob({
      jobId,
      workerId,
      errorCode,
      errorDetail,
      retryable,
      retryDelaySeconds
    }) {
      const result = await queryable.query(
        `UPDATE kb_jobs
         SET status = CASE
               WHEN $5::boolean AND attempts < max_attempts THEN 'retry'
               ELSE 'failed'
             END,
             lease_owner = NULL, lease_expires_at = NULL,
             error_code = $3, error_detail = $4,
             run_after = CASE
               WHEN $5::boolean AND attempts < max_attempts
                 THEN CURRENT_TIMESTAMP + make_interval(secs => $6::integer)
               ELSE run_after
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'running' AND lease_owner = $2
         RETURNING id, account_id, knowledge_base_id, document_id, dedupe_key,
                   kind, status, attempts, max_attempts, lease_owner,
                   lease_expires_at, progress_current, progress_total,
                   error_code, error_detail, run_after, created_at, updated_at`,
        [jobId, workerId, errorCode, errorDetail || null, retryable, retryDelaySeconds]
      );
      return normalizeJob(result.rows?.[0]);
    },

    async findJob(jobId, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `${JOB_SELECT} WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`,
        [jobId]
      );
      return normalizeJob(result.rows?.[0]);
    },

    async cancelJob(jobId) {
      const result = await queryable.query(
        `UPDATE kb_jobs
         SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
             error_code = 'KB_JOB_CANCELLED', error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status IN ('queued', 'running', 'retry')
         RETURNING id, account_id, knowledge_base_id, document_id, dedupe_key,
                   kind, status, attempts, max_attempts, lease_owner,
                   lease_expires_at, progress_current, progress_total,
                   error_code, error_detail, run_after, created_at, updated_at`,
        [jobId]
      );
      return normalizeJob(result.rows?.[0]);
    },

    async retryJob(jobId) {
      const result = await queryable.query(
        `UPDATE kb_jobs
         SET status = 'queued', attempts = 0, lease_owner = NULL,
             lease_expires_at = NULL, progress_current = 0,
             error_code = NULL, error_detail = NULL,
             run_after = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status IN ('failed', 'cancelled')
         RETURNING id, account_id, knowledge_base_id, document_id, dedupe_key,
                   kind, status, attempts, max_attempts, lease_owner,
                   lease_expires_at, progress_current, progress_total,
                   error_code, error_detail, run_after, created_at, updated_at`,
        [jobId]
      );
      return normalizeJob(result.rows?.[0]);
    },

    async findParseContext(job) {
      const result = await queryable.query(
        `SELECT d.id, d.account_id, d.knowledge_base_id, d.display_name,
                d.declared_mime_type, d.verified_mime_type, d.verified_bytes,
                d.checksum_sha256,
                d.object_key, d.object_version_id, d.status, d.version,
                b.status AS base_status, b.chunk_version,
                i.id AS index_version_id, i.version AS index_version
         FROM kb_documents d
         JOIN kb_knowledge_bases b
           ON b.id = d.knowledge_base_id AND b.account_id = d.account_id
         JOIN kb_index_versions i
           ON i.knowledge_base_id = b.id AND i.account_id = b.account_id
          AND i.version = COALESCE(b.pending_index_version, b.active_index_version)
         WHERE d.id = $1 AND d.account_id = $2 AND d.knowledge_base_id = $3`,
        [job.documentId, job.accountId, job.knowledgeBaseId]
      );
      return normalizeParseContext(result.rows?.[0]);
    },

    async markDocumentParsing(accountId, documentId) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'parsing', error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND status IN ('uploaded', 'parsing')
         RETURNING id`,
        [accountId, documentId]
      );
      return result.rows?.[0]?.id || null;
    },

    async resetParseDocumentForRetry(accountId, documentId) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'uploaded', error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND status = 'failed'
         RETURNING id`,
        [accountId, documentId]
      );
      return result.rows?.[0]?.id || null;
    },

    async markParseDocumentCancelled(accountId, documentId) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'failed', error_code = 'KB_JOB_CANCELLED', error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND status IN ('uploaded', 'parsing')
         RETURNING id`,
        [accountId, documentId]
      );
      return result.rows?.[0]?.id || null;
    },

    async markDocumentParseFailed(accountId, documentId, parserVersion, errorCode, errorDetail) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'failed', parser_version = $3, error_code = $4,
             error_detail = $5, updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE account_id = $1 AND id = $2 AND status IN ('uploaded', 'parsing')
         RETURNING id`,
        [accountId, documentId, parserVersion, errorCode, errorDetail || null]
      );
      return result.rows?.[0]?.id || null;
    },

    async markDocumentNeedsOcr(accountId, documentId, parserVersion, verifiedMimeType) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'needs_ocr', parser_version = $3,
             verified_mime_type = $4, normalized_object_key = NULL,
             normalized_bytes = NULL, error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND status = 'parsing'
         RETURNING id`,
        [accountId, documentId, parserVersion, verifiedMimeType]
      );
      return result.rows?.[0]?.id || null;
    },

    async deleteDocumentChunks(accountId, documentId, indexVersionId) {
      const result = await queryable.query(
        `DELETE FROM kb_chunks
         WHERE account_id = $1 AND document_id = $2 AND index_version_id = $3`,
        [accountId, documentId, indexVersionId]
      );
      return result.rowCount || 0;
    },

    async countDocumentChunks(accountId, documentId, indexVersionId) {
      const result = await queryable.query(
        `SELECT COUNT(*)::integer AS count
         FROM kb_chunks
         WHERE account_id = $1 AND document_id = $2 AND index_version_id = $3`,
        [accountId, documentId, indexVersionId]
      );
      return asNumber(result.rows?.[0]?.count);
    },

    async insertChunks({ accountId, knowledgeBaseId, documentId, indexVersionId, chunks }) {
      let inserted = 0;
      for (let offset = 0; offset < chunks.length; offset += 500) {
        const batch = chunks.slice(offset, offset + 500);
        const result = await queryable.query(
          `INSERT INTO kb_chunks (
             id, account_id, knowledge_base_id, document_id, index_version_id,
             ordinal, text_content, text_bytes, token_estimate, source_locator,
             content_hash, embedding_state
           )
           SELECT row.id::uuid, $1, $2, $3, $4, row.ordinal,
                  row.text_content, row.text_bytes, row.token_estimate,
                  row.source_locator, row.content_hash, 'pending'
           FROM jsonb_to_recordset($5::jsonb) AS row(
             id text, ordinal integer, text_content text, text_bytes integer,
             token_estimate integer, source_locator jsonb, content_hash text
           )`,
          [accountId, knowledgeBaseId, documentId, indexVersionId, JSON.stringify(batch)]
        );
        inserted += result.rowCount || 0;
      }
      return inserted;
    },

    async completeParsedDocument({
      accountId,
      documentId,
      parserVersion,
      verifiedMimeType,
      normalizedObjectKey,
      normalizedBytes
    }) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'awaiting_embedding', parser_version = $3,
             verified_mime_type = $4, normalized_object_key = $5,
             normalized_bytes = $6, error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND status = 'parsing'
         RETURNING id`,
        [
          accountId,
          documentId,
          parserVersion,
          verifiedMimeType,
          normalizedObjectKey,
          normalizedBytes
        ]
      );
      return result.rows?.[0]?.id || null;
    },

    async refreshIndexLogicalBytes(accountId, knowledgeBaseId, indexVersionId) {
      const result = await queryable.query(
        `UPDATE kb_index_versions i
         SET logical_bytes = (
           SELECT COALESCE(SUM(c.text_bytes), 0)
           FROM kb_chunks c
           WHERE c.account_id = $1 AND c.knowledge_base_id = $2
             AND c.index_version_id = $3
         )
         WHERE i.account_id = $1 AND i.knowledge_base_id = $2 AND i.id = $3
         RETURNING logical_bytes::text`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      return asByteString(result.rows?.[0]?.logical_bytes);
    }
  });
}
