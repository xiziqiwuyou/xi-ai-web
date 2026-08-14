function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asByteString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return /^-?\d+$/.test(String(value ?? "")) ? String(value) : "0";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    ocrStatus: row.ocr_status || null,
    ocrProvider: row.ocr_provider || null,
    ocrObjectKey: row.ocr_object_key || null,
    ocrBytes: row.ocr_bytes == null ? null : asByteString(row.ocr_bytes),
    ocrChecksumSha256: row.ocr_checksum_sha256 || null,
    ocrDurationMs: row.ocr_duration_ms == null ? null : asNumber(row.ocr_duration_ms),
    ocrStartedAt: row.ocr_started_at || null,
    ocrCompletedAt: row.ocr_completed_at || null,
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

function normalizeChunk(row) {
  if (!row) return null;
  const draft = row.draft_revision !== null && row.draft_revision !== undefined;
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    documentId: row.document_id,
    sourceIndexVersionId: row.index_version_id,
    documentName: row.document_name,
    ordinal: asNumber(row.ordinal),
    text: draft ? row.draft_text_content : row.text_content,
    textBytes: asByteString(draft ? row.draft_text_bytes : row.text_bytes),
    tokenEstimate: asNumber(draft ? row.draft_token_estimate : row.token_estimate),
    locator: asObject(draft ? row.draft_source_locator : row.source_locator),
    enabled: draft ? Boolean(row.draft_enabled) : Boolean(row.enabled),
    revision: asNumber(draft ? row.draft_revision : row.revision),
    draft,
    embeddingStatus: row.embedding_state,
    strategyId: draft ? row.draft_strategy_id : row.chunk_strategy_id,
    pendingIndexVersion: row.pending_index_version === null || row.pending_index_version === undefined
      ? null
      : asNumber(row.pending_index_version),
    activeChunkBytes: asByteString(row.text_bytes),
    activeVectorBytes: asByteString(row.active_vector_bytes),
    draftChunkBytes: draft ? asByteString(row.draft_text_bytes) : "0",
    createdAt: draft ? row.draft_created_at : row.created_at,
    updatedAt: row.updated_at
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
                                normalized_object_key, normalized_bytes, ocr_status, ocr_provider,
                                ocr_object_key, ocr_bytes, ocr_checksum_sha256, ocr_duration_ms,
                                ocr_started_at, ocr_completed_at, status, parser_version,
                                error_code, version, created_at, updated_at
                          FROM kb_documents`;

const CHUNK_SELECT = `SELECT c.id, c.account_id, c.knowledge_base_id, c.document_id,
                             d.display_name AS document_name, c.index_version_id,
                             c.ordinal, c.text_content, c.text_bytes, c.token_estimate,
                             c.source_locator, c.embedding_state, c.enabled, c.revision,
                             c.chunk_strategy_id, c.created_at, c.updated_at,
                             b.pending_index_version,
                             CASE WHEN c.embedding_state = 'ready'
                               THEN i.embedding_dimensions *
                                 CASE i.embedding_dimensions WHEN 3072 THEN 2 ELSE 4 END
                               ELSE 0 END AS active_vector_bytes,
                             draft.revision AS draft_revision,
                             draft.text_content AS draft_text_content,
                             draft.text_bytes AS draft_text_bytes,
                             draft.token_estimate AS draft_token_estimate,
                             draft.source_locator AS draft_source_locator,
                             draft.enabled AS draft_enabled,
                             draft.chunk_strategy_id AS draft_strategy_id,
                             draft.created_at AS draft_created_at
                      FROM kb_chunks c
                      JOIN kb_documents d
                        ON d.id = c.document_id AND d.account_id = c.account_id
                       AND d.knowledge_base_id = c.knowledge_base_id
                      JOIN kb_knowledge_bases b
                        ON b.id = c.knowledge_base_id AND b.account_id = c.account_id
                      JOIN kb_index_versions i
                        ON i.id = c.index_version_id AND i.account_id = c.account_id
                       AND i.knowledge_base_id = c.knowledge_base_id
                       AND i.version = b.active_index_version AND i.status = 'active'
                      LEFT JOIN LATERAL (
                        SELECT r.revision, r.text_content, r.text_bytes, r.token_estimate,
                               r.source_locator, r.enabled, r.chunk_strategy_id, r.created_at
                        FROM kb_chunk_revisions r
                        WHERE r.account_id = c.account_id
                          AND r.knowledge_base_id = c.knowledge_base_id
                          AND r.document_id = c.document_id
                          AND r.source_chunk_id = c.id
                        ORDER BY r.revision DESC
                        LIMIT 1
                      ) draft ON TRUE`;

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

    async listDocumentChunks(accountId, documentId, { afterOrdinal = null, limit = 51 } = {}) {
      const result = await queryable.query(
        `${CHUNK_SELECT}
         WHERE c.account_id = $1 AND c.document_id = $2
           AND ($3::integer IS NULL OR c.ordinal > $3)
         ORDER BY c.ordinal, c.id
         LIMIT $4`,
        [accountId, documentId, afterOrdinal, limit]
      );
      return (result.rows || []).map(normalizeChunk);
    },

    async findActiveChunk(accountId, chunkId, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `${CHUNK_SELECT}
         WHERE c.account_id = $1 AND c.id = $2${forUpdate ? " FOR UPDATE OF c" : ""}`,
        [accountId, chunkId]
      );
      return normalizeChunk(result.rows?.[0]);
    },

    async insertChunkRevision(revision) {
      const result = await queryable.query(
        `INSERT INTO kb_chunk_revisions (
           id, account_id, knowledge_base_id, document_id, source_chunk_id,
           source_index_version_id, revision, text_content, text_bytes,
           token_estimate, source_locator, enabled, chunk_strategy_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          revision.id,
          revision.accountId,
          revision.knowledgeBaseId,
          revision.documentId,
          revision.sourceChunkId,
          revision.sourceIndexVersionId,
          revision.revision,
          revision.text,
          revision.textBytes,
          revision.tokenEstimate,
          revision.locator,
          revision.enabled,
          revision.strategyId
        ]
      );
      return result.rows?.[0]?.id || null;
    },

    async listActiveChunkText(accountId, documentId, limit = 501) {
      const result = await queryable.query(
        `${CHUNK_SELECT}
         WHERE c.account_id = $1 AND c.document_id = $2
         ORDER BY c.ordinal, c.id
         LIMIT $3`,
        [accountId, documentId, limit]
      );
      return (result.rows || []).map(normalizeChunk);
    },

    async documentChunkCapacity(accountId, documentId) {
      const result = await queryable.query(
        `SELECT COALESCE(d.verified_bytes, 0)::text AS source_bytes,
                COALESCE(d.normalized_bytes, 0)::text AS normalized_bytes,
                COALESCE(SUM(c.text_bytes), 0)::text AS active_chunk_bytes,
                COALESCE(SUM(CASE WHEN c.embedding_state = 'ready'
                  THEN i.embedding_dimensions *
                    CASE i.embedding_dimensions WHEN 3072 THEN 2 ELSE 4 END
                  ELSE 0 END), 0)::text AS active_vector_bytes,
                COALESCE(SUM(draft.text_bytes), 0)::text AS draft_chunk_bytes
         FROM kb_documents d
         JOIN kb_knowledge_bases b
           ON b.id = d.knowledge_base_id AND b.account_id = d.account_id
         LEFT JOIN kb_index_versions i
           ON i.account_id = b.account_id AND i.knowledge_base_id = b.id
          AND i.version = b.active_index_version AND i.status = 'active'
         LEFT JOIN kb_chunks c
           ON c.account_id = d.account_id AND c.knowledge_base_id = b.id
          AND c.document_id = d.id AND c.index_version_id = i.id
         LEFT JOIN LATERAL (
           SELECT r.text_bytes
           FROM kb_chunk_revisions r
           WHERE r.account_id = c.account_id AND r.knowledge_base_id = c.knowledge_base_id
             AND r.document_id = c.document_id AND r.source_chunk_id = c.id
           ORDER BY r.revision DESC LIMIT 1
         ) draft ON TRUE
         WHERE d.account_id = $1 AND d.id = $2
         GROUP BY d.verified_bytes, d.normalized_bytes`,
        [accountId, documentId]
      );
      const row = result.rows?.[0] || {};
      return {
        sourceBytes: asByteString(row.source_bytes),
        normalizedBytes: asByteString(row.normalized_bytes),
        activeChunkBytes: asByteString(row.active_chunk_bytes),
        activeVectorBytes: asByteString(row.active_vector_bytes),
        draftChunkBytes: asByteString(row.draft_chunk_bytes)
      };
    },

    async hasChunkDrafts(accountId, baseId) {
      const result = await queryable.query(
        `SELECT EXISTS (
           SELECT 1
           FROM kb_knowledge_bases b
           JOIN kb_index_versions i
             ON i.account_id = b.account_id AND i.knowledge_base_id = b.id
            AND i.version = b.active_index_version AND i.status = 'active'
           JOIN kb_chunks c
             ON c.account_id = i.account_id AND c.knowledge_base_id = i.knowledge_base_id
            AND c.index_version_id = i.id
           JOIN kb_chunk_revisions r
             ON r.account_id = c.account_id AND r.knowledge_base_id = c.knowledge_base_id
            AND r.document_id = c.document_id AND r.source_chunk_id = c.id
            AND r.source_index_version_id = c.index_version_id
           WHERE b.account_id = $1 AND b.id = $2
         ) AS present`,
        [accountId, baseId]
      );
      return Boolean(result.rows?.[0]?.present);
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
                   normalized_bytes, ocr_status, ocr_provider, ocr_object_key, ocr_bytes,
                   ocr_checksum_sha256, ocr_duration_ms, ocr_started_at, ocr_completed_at,
                   status, parser_version, error_code, version, created_at, updated_at`,
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
                   normalized_bytes, ocr_status, ocr_provider, ocr_object_key, ocr_bytes,
                   ocr_checksum_sha256, ocr_duration_ms, ocr_started_at, ocr_completed_at,
                   status, parser_version, error_code, version, created_at, updated_at`,
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
