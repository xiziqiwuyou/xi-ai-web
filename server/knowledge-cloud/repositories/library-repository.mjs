function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asByteString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return /^-?\d+$/.test(String(value ?? "")) ? String(value) : "0";
}

function normalizeEmbedding(row) {
  if (!row?.embedding_vendor) return null;
  return {
    vendor: row.embedding_vendor,
    catalogModelId: row.embedding_catalog_model_id,
    actualModel: row.embedding_actual_model,
    dimensions: asNumber(row.embedding_dimensions),
    fingerprint: row.embedding_profile_fingerprint
  };
}

function normalizeBase(row) {
  if (!row) return null;
  const totalEmbeddingChunks = asNumber(row.embedding_total_chunks);
  const readyEmbeddingChunks = asNumber(row.embedding_ready_chunks);
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    description: row.description || "",
    status: row.status,
    embedding: normalizeEmbedding(row),
    chunkVersion: asNumber(row.chunk_version),
    activeIndexVersion: row.active_index_version === null ? null : asNumber(row.active_index_version),
    pendingIndexVersion: row.pending_index_version === null ? null : asNumber(row.pending_index_version),
    version: asNumber(row.version),
    documentCount: asNumber(row.document_count),
    readyDocumentCount: asNumber(row.ready_document_count),
    logicalBytes: asByteString(row.logical_bytes),
    embeddingProgress: {
      totalChunks: totalEmbeddingChunks,
      readyChunks: readyEmbeddingChunks,
      pendingChunks: Math.max(0, totalEmbeddingChunks - readyEmbeddingChunks),
      leasedChunks: asNumber(row.embedding_leased_chunks),
      failedChunks: asNumber(row.embedding_failed_chunks),
      lastErrorCode: row.embedding_error_code || null
    },
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    archivedAt: row.archived_at || null
  };
}

function normalizeDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    knowledgeBaseId: row.knowledge_base_id,
    displayName: row.display_name,
    declaredMimeType: row.declared_mime_type || "",
    verifiedMimeType: row.verified_mime_type || null,
    declaredBytes: row.declared_bytes === null ? null : asByteString(row.declared_bytes),
    verifiedBytes: row.verified_bytes === null ? null : asByteString(row.verified_bytes),
    declaredChecksumSha256: row.declared_checksum_sha256 || null,
    checksumSha256: row.checksum_sha256 || null,
    objectKey: row.object_key,
    objectVersionId: row.object_version_id || null,
    objectEtag: row.object_etag || null,
    uploadReservationKey: row.upload_reservation_key || null,
    uploadGrantIssuedAt: row.upload_grant_issued_at || null,
    uploadExpiresAt: row.upload_expires_at || null,
    normalizedObjectKey: row.normalized_object_key || null,
    normalizedBytes: row.normalized_bytes === null ? null : asByteString(row.normalized_bytes),
    status: row.status,
    parserVersion: row.parser_version || null,
    errorCode: row.error_code || null,
    version: asNumber(row.version),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function normalizeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    knowledgeBaseId: row.knowledge_base_id || null,
    documentId: row.document_id || null,
    kind: row.kind,
    status: row.status,
    dedupeKey: row.dedupe_key || null,
    runAfter: row.run_after || null
  };
}

const BASE_SELECT = `SELECT b.id, b.account_id, b.name, b.description, b.status,
                            b.embedding_vendor, b.embedding_catalog_model_id,
                            b.embedding_actual_model, b.embedding_dimensions,
                            b.embedding_profile_fingerprint, b.chunk_version,
                            b.active_index_version, b.pending_index_version, b.version,
                            b.created_at, b.updated_at, b.archived_at,
                            (SELECT COUNT(*)::integer FROM kb_documents d
                             WHERE d.account_id = b.account_id AND d.knowledge_base_id = b.id) AS document_count,
                            (SELECT COUNT(*)::integer FROM kb_documents d
                             WHERE d.account_id = b.account_id AND d.knowledge_base_id = b.id
                               AND d.status = 'ready') AS ready_document_count,
                            (SELECT COALESCE(SUM(l.used_delta_bytes), 0)::text
                             FROM kb_usage_ledger l
                             WHERE l.account_id = b.account_id AND l.knowledge_base_id = b.id) AS logical_bytes
                            ,(SELECT COUNT(*)::integer FROM kb_chunks c
                              WHERE c.account_id = b.account_id AND c.knowledge_base_id = b.id
                                AND c.index_version_id = target_index.id) AS embedding_total_chunks
                            ,(SELECT COUNT(*)::integer FROM kb_chunks c
                              WHERE c.account_id = b.account_id AND c.knowledge_base_id = b.id
                                AND c.index_version_id = target_index.id
                                AND c.embedding_state = 'ready') AS embedding_ready_chunks
                            ,(SELECT COUNT(*)::integer FROM kb_chunks c
                              WHERE c.account_id = b.account_id AND c.knowledge_base_id = b.id
                                AND c.index_version_id = target_index.id
                                AND c.embedding_state = 'leased') AS embedding_leased_chunks
                            ,(SELECT COUNT(*)::integer FROM kb_chunks c
                              WHERE c.account_id = b.account_id AND c.knowledge_base_id = b.id
                                AND c.index_version_id = target_index.id
                                AND c.embedding_state = 'failed') AS embedding_failed_chunks
                            ,(SELECT eb.error_code FROM kb_embedding_batches eb
                              WHERE eb.account_id = b.account_id AND eb.knowledge_base_id = b.id
                                AND eb.index_version_id = target_index.id
                              ORDER BY eb.updated_at DESC, eb.id DESC LIMIT 1) AS embedding_error_code
                     FROM kb_knowledge_bases b
                     LEFT JOIN LATERAL (
                       SELECT i.id
                       FROM kb_index_versions i
                       WHERE i.account_id = b.account_id AND i.knowledge_base_id = b.id
                         AND i.version = COALESCE(b.pending_index_version, b.active_index_version)
                       LIMIT 1
                     ) target_index ON TRUE`;

const DOCUMENT_SELECT = `SELECT id, account_id, knowledge_base_id, display_name,
                                declared_mime_type, verified_mime_type, declared_bytes,
                                verified_bytes, declared_checksum_sha256, checksum_sha256,
                                object_key, object_version_id, object_etag,
                                upload_reservation_key, upload_grant_issued_at, upload_expires_at,
                                normalized_object_key, normalized_bytes, status, parser_version,
                                error_code, version, created_at, updated_at
                         FROM kb_documents`;

export function createKnowledgeLibraryRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge library repository requires a queryable database client");
  }

  return Object.freeze({
    async listBases(accountId) {
      const result = await queryable.query(
        `${BASE_SELECT}
         WHERE b.account_id = $1
         ORDER BY b.updated_at DESC, b.id DESC`,
        [accountId]
      );
      return (result.rows || []).map(normalizeBase);
    },

    async findBase(accountId, baseId, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `${BASE_SELECT}
         WHERE b.account_id = $1 AND b.id = $2${forUpdate ? " FOR UPDATE OF b" : ""}`,
        [accountId, baseId]
      );
      return normalizeBase(result.rows?.[0]);
    },

    async insertBase(base) {
      const result = await queryable.query(
        `INSERT INTO kb_knowledge_bases (
           id, account_id, name, description, status, embedding_vendor,
           embedding_catalog_model_id, embedding_actual_model, embedding_dimensions,
           embedding_profile_fingerprint, chunk_version, pending_index_version
         ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, 1, 1)
         RETURNING id, account_id, name, description, status, embedding_vendor,
                   embedding_catalog_model_id, embedding_actual_model, embedding_dimensions,
                   embedding_profile_fingerprint, chunk_version, active_index_version,
                   pending_index_version, version, created_at, updated_at, archived_at,
                   0::integer AS document_count, 0::integer AS ready_document_count,
                   '0'::text AS logical_bytes`,
        [
          base.id,
          base.accountId,
          base.name,
          base.description,
          base.embedding.vendor,
          base.embedding.catalogModelId,
          base.embedding.actualModel,
          base.embedding.dimensions,
          base.embedding.fingerprint
        ]
      );
      return normalizeBase(result.rows?.[0]);
    },

    async insertIndexVersion(index) {
      const result = await queryable.query(
        `INSERT INTO kb_index_versions (
           id, account_id, knowledge_base_id, version, status, embedding_vendor,
           embedding_catalog_model_id, embedding_actual_model, embedding_dimensions,
           embedding_profile_fingerprint, chunk_version
         ) VALUES ($1, $2, $3, $4, 'building', $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          index.id,
          index.accountId,
          index.knowledgeBaseId,
          index.version,
          index.embedding.vendor,
          index.embedding.catalogModelId,
          index.embedding.actualModel,
          index.embedding.dimensions,
          index.embedding.fingerprint,
          index.chunkVersion
        ]
      );
      return result.rows?.[0]?.id || null;
    },

    async updateBase(accountId, baseId, expectedVersion, next) {
      const result = await queryable.query(
        `UPDATE kb_knowledge_bases
         SET name = $4, description = $5, status = $6,
             embedding_vendor = $7, embedding_catalog_model_id = $8,
             embedding_actual_model = $9, embedding_dimensions = $10,
             embedding_profile_fingerprint = $11, pending_index_version = $12,
             active_index_version = $13,
             archived_at = CASE WHEN $6 = 'archived' THEN COALESCE(archived_at, CURRENT_TIMESTAMP) ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND version = $3 AND status <> 'deleting'
         RETURNING id`,
        [
          accountId,
          baseId,
          expectedVersion,
          next.name,
          next.description,
          next.status,
          next.embedding.vendor,
          next.embedding.catalogModelId,
          next.embedding.actualModel,
          next.embedding.dimensions,
          next.embedding.fingerprint,
          next.pendingIndexVersion,
          next.activeIndexVersion
        ]
      );
      return result.rows?.[0]?.id || null;
    },

    async retireReplaceableIndexVersions(accountId, baseId) {
      const result = await queryable.query(
        `UPDATE kb_index_versions
         SET status = 'retired', retired_at = CURRENT_TIMESTAMP
         WHERE account_id = $1 AND knowledge_base_id = $2
           AND status IN ('building', 'active')`,
        [accountId, baseId]
      );
      return result.rowCount || 0;
    },

    async markBaseDeleting(accountId, baseId, expectedVersion) {
      const result = await queryable.query(
        `UPDATE kb_knowledge_bases
         SET status = 'deleting', updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND version = $3 AND status <> 'deleting'
         RETURNING id`,
        [accountId, baseId, expectedVersion]
      );
      return result.rows?.[0]?.id || null;
    },

    async markBaseDocumentsDeleting(accountId, baseId) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'deleting', updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND knowledge_base_id = $2 AND status <> 'deleting'`,
        [accountId, baseId]
      );
      return result.rowCount || 0;
    },

    async listDocuments(accountId, baseId) {
      const result = await queryable.query(
        `${DOCUMENT_SELECT}
         WHERE account_id = $1 AND knowledge_base_id = $2
         ORDER BY updated_at DESC, id DESC`,
        [accountId, baseId]
      );
      return (result.rows || []).map(normalizeDocument);
    },

    async findDocument(accountId, documentId, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `${DOCUMENT_SELECT}
         WHERE account_id = $1 AND id = $2${forUpdate ? " FOR UPDATE" : ""}`,
        [accountId, documentId]
      );
      return normalizeDocument(result.rows?.[0]);
    },

    async insertPendingDocument(document) {
      const result = await queryable.query(
        `INSERT INTO kb_documents (
           id, account_id, knowledge_base_id, display_name, declared_mime_type,
           declared_bytes, declared_checksum_sha256, object_key, upload_reservation_key,
           upload_grant_issued_at, upload_expires_at, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, 'pending_upload')
         RETURNING id, account_id, knowledge_base_id, display_name, declared_mime_type,
                   verified_mime_type, declared_bytes, verified_bytes,
                   declared_checksum_sha256, checksum_sha256, object_key,
                   object_version_id, object_etag, upload_reservation_key,
                   upload_grant_issued_at, upload_expires_at, normalized_object_key,
                   normalized_bytes, status, parser_version, error_code, version,
                   created_at, updated_at`,
        [
          document.id,
          document.accountId,
          document.knowledgeBaseId,
          document.displayName,
          document.declaredMimeType,
          document.declaredBytes,
          document.declaredChecksumSha256,
          document.objectKey,
          document.uploadReservationKey,
          document.uploadExpiresAt
        ]
      );
      return normalizeDocument(result.rows?.[0]);
    },

    async markDocumentUploaded(accountId, documentId, expectedVersion, object) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'uploaded', verified_mime_type = $4, verified_bytes = $5,
             checksum_sha256 = $6, object_version_id = $7, object_etag = $8,
             error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND version = $3 AND status = 'pending_upload'
         RETURNING id, account_id, knowledge_base_id, display_name, declared_mime_type,
                   verified_mime_type, declared_bytes, verified_bytes,
                   declared_checksum_sha256, checksum_sha256, object_key,
                   object_version_id, object_etag, upload_reservation_key,
                   upload_grant_issued_at, upload_expires_at, normalized_object_key,
                   normalized_bytes, status, parser_version, error_code, version,
                   created_at, updated_at`,
        [
          accountId,
          documentId,
          expectedVersion,
          object.contentType,
          object.bytes,
          object.checksumSha256,
          object.versionId,
          object.etag
        ]
      );
      return normalizeDocument(result.rows?.[0]);
    },

    async markDocumentFailed(accountId, documentId, errorCode) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'failed', error_code = $3, updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND status = 'pending_upload'
         RETURNING id`,
        [accountId, documentId, errorCode]
      );
      return Boolean(result.rowCount);
    },

    async markDocumentDeleting(accountId, documentId, expectedVersion) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'deleting', updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND version = $3 AND status <> 'deleting'
         RETURNING id`,
        [accountId, documentId, expectedVersion]
      );
      return result.rows?.[0]?.id || null;
    },

    async deletePendingDocument(accountId, documentId) {
      const result = await queryable.query(
        `DELETE FROM kb_documents
         WHERE account_id = $1 AND id = $2
           AND status IN ('pending_upload', 'failed') AND verified_bytes IS NULL`,
        [accountId, documentId]
      );
      return result.rowCount || 0;
    },

    async deleteDocument(accountId, documentId) {
      const result = await queryable.query(
        `DELETE FROM kb_documents
         WHERE account_id = $1 AND id = $2 AND status = 'deleting'`,
        [accountId, documentId]
      );
      return result.rowCount || 0;
    },

    async deleteBase(accountId, baseId) {
      const result = await queryable.query(
        `DELETE FROM kb_knowledge_bases
         WHERE account_id = $1 AND id = $2 AND status = 'deleting'`,
        [accountId, baseId]
      );
      return result.rowCount || 0;
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
                   kind, status, run_after`,
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

    async findExpiredPendingUploads(limit = 50) {
      const result = await queryable.query(
        `${DOCUMENT_SELECT}
         WHERE status = 'pending_upload' AND upload_expires_at <= CURRENT_TIMESTAMP
         ORDER BY upload_expires_at ASC, id ASC
         LIMIT $1`,
        [limit]
      );
      return (result.rows || []).map(normalizeDocument);
    }
  });
}
