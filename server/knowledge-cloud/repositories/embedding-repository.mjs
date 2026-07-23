import pgvector from "pgvector";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../errors.mjs";

const VECTOR_TABLES = Object.freeze({
  1024: Object.freeze({ table: "kb_vectors_1024", type: "vector" }),
  1536: Object.freeze({ table: "kb_vectors_1536", type: "vector" }),
  3072: Object.freeze({ table: "kb_vectors_3072", type: "halfvec" })
});

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asByteString(value) {
  if (typeof value === "bigint") return value.toString();
  return /^-?\d+$/u.test(String(value ?? "")) ? String(value) : "0";
}

function normalizeProfile(row) {
  if (!row?.embedding_vendor) return null;
  return {
    vendor: row.embedding_vendor,
    catalogModelId: row.embedding_catalog_model_id,
    actualModel: row.embedding_actual_model,
    dimensions: asNumber(row.embedding_dimensions),
    fingerprint: row.embedding_profile_fingerprint
  };
}

function normalizeContext(row) {
  if (!row) return null;
  return {
    accountId: row.account_id,
    knowledgeBaseId: row.knowledge_base_id,
    documentId: row.document_id,
    documentStatus: row.document_status,
    documentVersion: asNumber(row.document_version),
    baseStatus: row.base_status,
    baseVersion: asNumber(row.base_version),
    activeIndexVersion: row.active_index_version === null ? null : asNumber(row.active_index_version),
    pendingIndexVersion: row.pending_index_version === null ? null : asNumber(row.pending_index_version),
    indexVersionId: row.index_version_id,
    indexVersion: asNumber(row.index_version),
    indexStatus: row.index_status,
    chunkVersion: asNumber(row.chunk_version),
    profile: normalizeProfile(row)
  };
}

function normalizeIndex(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    knowledgeBaseId: row.knowledge_base_id,
    version: asNumber(row.version),
    status: row.status,
    chunkVersion: asNumber(row.chunk_version),
    logicalBytes: asByteString(row.logical_bytes),
    profile: normalizeProfile(row)
  };
}

function normalizeBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    knowledgeBaseId: row.knowledge_base_id,
    documentId: row.document_id,
    indexVersionId: row.index_version_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    leaseOwnerSessionId: row.lease_owner_session_id || null,
    leaseExpiresAt: row.lease_expires_at || null,
    chunkCount: asNumber(row.chunk_count),
    providerUsage: row.provider_usage || {},
    errorCode: row.error_code || null,
    errorMetadata: row.error_metadata || {},
    vectorBytes: asByteString(row.vector_bytes),
    createdAt: row.created_at || null,
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at || null,
    releasedAt: row.released_at || null
  };
}

function normalizeChunk(row) {
  return {
    id: row.id,
    ordinal: asNumber(row.ordinal),
    text: row.text_content,
    contentHash: row.content_hash
  };
}

function normalizeProgress(row) {
  const totalChunks = asNumber(row?.total_chunks);
  const readyChunks = asNumber(row?.ready_chunks);
  return {
    totalChunks,
    readyChunks,
    pendingChunks: Math.max(0, totalChunks - readyChunks),
    leasedChunks: asNumber(row?.leased_chunks),
    failedChunks: asNumber(row?.failed_chunks),
    vectorBytes: asByteString(row?.vector_bytes),
    lastErrorCode: row?.last_error_code || null
  };
}

function vectorTable(dimensions) {
  const storage = VECTOR_TABLES[Number(dimensions)];
  if (!storage) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_PROFILE_INVALID,
      "当前向量维度未部署",
      { status: 409, details: { dimensions: Number(dimensions) || null } }
    );
  }
  return storage;
}

const BATCH_SELECT = `SELECT id, account_id, knowledge_base_id, document_id,
                             index_version_id, idempotency_key, status,
                             lease_owner_session_id, lease_expires_at, chunk_count,
                             provider_usage, error_code, error_metadata, vector_bytes,
                             created_at, completed_at, updated_at, released_at
                      FROM kb_embedding_batches`;

export function createKnowledgeEmbeddingRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge embedding repository requires a queryable database client");
  }

  return Object.freeze({
    async findDocumentContext(accountId, documentId, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `SELECT d.account_id, d.knowledge_base_id, d.id AS document_id,
                d.status AS document_status, d.version AS document_version,
                b.status AS base_status, b.version AS base_version,
                b.active_index_version, b.pending_index_version,
                i.id AS index_version_id, i.version AS index_version,
                i.status AS index_status, i.chunk_version,
                i.embedding_vendor, i.embedding_catalog_model_id,
                i.embedding_actual_model, i.embedding_dimensions,
                i.embedding_profile_fingerprint
         FROM kb_documents d
         JOIN kb_knowledge_bases b
           ON b.id = d.knowledge_base_id AND b.account_id = d.account_id
         JOIN kb_index_versions i
           ON i.knowledge_base_id = b.id AND i.account_id = b.account_id
          AND i.version = COALESCE(b.pending_index_version, b.active_index_version)
         WHERE d.account_id = $1 AND d.id = $2
         ${forUpdate ? "FOR UPDATE OF d, b, i" : ""}`,
        [accountId, documentId]
      );
      return normalizeContext(result.rows?.[0]);
    },

    async findIndex(accountId, knowledgeBaseId, version, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `SELECT id, account_id, knowledge_base_id, version, status,
                embedding_vendor, embedding_catalog_model_id,
                embedding_actual_model, embedding_dimensions,
                embedding_profile_fingerprint, chunk_version, logical_bytes
         FROM kb_index_versions
         WHERE account_id = $1 AND knowledge_base_id = $2 AND version = $3
         ${forUpdate ? "FOR UPDATE" : ""}`,
        [accountId, knowledgeBaseId, version]
      );
      return normalizeIndex(result.rows?.[0]);
    },

    async indexProgress(accountId, knowledgeBaseId, indexVersionId) {
      const result = await queryable.query(
        `SELECT COUNT(*)::integer AS total_chunks,
                COUNT(*) FILTER (WHERE c.embedding_state = 'ready')::integer AS ready_chunks,
                COUNT(*) FILTER (WHERE c.embedding_state = 'leased')::integer AS leased_chunks,
                COUNT(*) FILTER (WHERE c.embedding_state = 'failed')::integer AS failed_chunks,
                COALESCE(SUM(CASE WHEN c.embedding_state = 'ready'
                                  THEN i.embedding_dimensions
                                    * CASE i.embedding_dimensions WHEN 3072 THEN 2 ELSE 4 END
                                  ELSE 0 END), 0)::text AS vector_bytes,
                (SELECT eb.error_code
                 FROM kb_embedding_batches eb
                 WHERE eb.account_id = $1 AND eb.knowledge_base_id = $2
                   AND eb.index_version_id = $3
                 ORDER BY eb.updated_at DESC, eb.id DESC LIMIT 1) AS last_error_code
         FROM kb_chunks c
         JOIN kb_index_versions i
           ON i.id = c.index_version_id AND i.account_id = c.account_id
          AND i.knowledge_base_id = c.knowledge_base_id
         WHERE c.account_id = $1 AND c.knowledge_base_id = $2
           AND c.index_version_id = $3`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      return normalizeProgress(result.rows?.[0]);
    },

    async documentProgress(accountId, documentId, indexVersionId) {
      const result = await queryable.query(
        `SELECT COUNT(*)::integer AS total_chunks,
                COUNT(*) FILTER (WHERE embedding_state = 'ready')::integer AS ready_chunks,
                COUNT(*) FILTER (WHERE embedding_state = 'leased')::integer AS leased_chunks,
                COUNT(*) FILTER (WHERE embedding_state = 'failed')::integer AS failed_chunks,
                0::text AS vector_bytes,
                NULL::text AS last_error_code
         FROM kb_chunks
         WHERE account_id = $1 AND document_id = $2 AND index_version_id = $3`,
        [accountId, documentId, indexVersionId]
      );
      return normalizeProgress(result.rows?.[0]);
    },

    async findBatchByIdempotency(accountId, idempotencyKey, { forUpdate = false } = {}) {
      const result = await queryable.query(
        `${BATCH_SELECT}
         WHERE account_id = $1 AND idempotency_key = $2
         ${forUpdate ? "FOR UPDATE" : ""}`,
        [accountId, idempotencyKey]
      );
      return normalizeBatch(result.rows?.[0]);
    },

    async findExpiredBatches(accountId, limit = 50) {
      const result = await queryable.query(
        `${BATCH_SELECT}
         WHERE account_id = $1 AND status = 'leased'
           AND lease_expires_at <= CURRENT_TIMESTAMP
         ORDER BY lease_expires_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2`,
        [accountId, limit]
      );
      return (result.rows || []).map(normalizeBatch);
    },

    async countActiveBatches(accountId) {
      const result = await queryable.query(
        `SELECT COUNT(*)::integer AS count
         FROM kb_embedding_batches
         WHERE account_id = $1 AND status = 'leased'
           AND lease_expires_at > CURRENT_TIMESTAMP`,
        [accountId]
      );
      return asNumber(result.rows?.[0]?.count);
    },

    async selectChunksForLease({ accountId, knowledgeBaseId, documentId, indexVersionId, limit }) {
      const result = await queryable.query(
        `SELECT id, ordinal, text_content, content_hash
         FROM kb_chunks
         WHERE account_id = $1 AND knowledge_base_id = $2
           AND document_id = $3 AND index_version_id = $4
           AND embedding_state IN ('pending', 'failed')
         ORDER BY ordinal ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $5`,
        [accountId, knowledgeBaseId, documentId, indexVersionId, limit]
      );
      return (result.rows || []).map(normalizeChunk).sort((left, right) => left.ordinal - right.ordinal);
    },

    async leaseChunks({ accountId, batchId, leaseExpiresAt, chunkIds }) {
      const result = await queryable.query(
        `UPDATE kb_chunks
         SET embedding_state = 'leased', embedding_lease_id = $2,
             embedding_lease_expires_at = $3, updated_at = CURRENT_TIMESTAMP
         WHERE account_id = $1 AND id = ANY($4::uuid[])
           AND embedding_state IN ('pending', 'failed')`,
        [accountId, batchId, leaseExpiresAt, chunkIds]
      );
      return result.rowCount || 0;
    },

    async startBatch(batch) {
      const result = await queryable.query(
        `INSERT INTO kb_embedding_batches (
           id, account_id, knowledge_base_id, document_id, index_version_id,
           idempotency_key, status, lease_owner_session_id, lease_expires_at,
           chunk_count, provider_usage, error_code, error_metadata, vector_bytes,
           completed_at, released_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'leased', $7, $8, $9,
                   '{}'::jsonb, NULL, '{}'::jsonb, 0, NULL, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (account_id, idempotency_key)
         DO UPDATE SET knowledge_base_id = EXCLUDED.knowledge_base_id,
                       document_id = EXCLUDED.document_id,
                       index_version_id = EXCLUDED.index_version_id,
                       status = 'leased',
                       lease_owner_session_id = EXCLUDED.lease_owner_session_id,
                       lease_expires_at = EXCLUDED.lease_expires_at,
                       chunk_count = EXCLUDED.chunk_count,
                       provider_usage = '{}'::jsonb,
                       error_code = NULL,
                       error_metadata = '{}'::jsonb,
                       vector_bytes = 0,
                       completed_at = NULL,
                       released_at = NULL,
                       updated_at = CURRENT_TIMESTAMP
         WHERE kb_embedding_batches.status IN ('released', 'failed')
         RETURNING id, account_id, knowledge_base_id, document_id,
                   index_version_id, idempotency_key, status,
                   lease_owner_session_id, lease_expires_at, chunk_count,
                   provider_usage, error_code, error_metadata, vector_bytes,
                   created_at, completed_at, updated_at, released_at`,
        [
          batch.id,
          batch.accountId,
          batch.knowledgeBaseId,
          batch.documentId,
          batch.indexVersionId,
          batch.idempotencyKey,
          batch.leaseOwnerSessionId,
          batch.leaseExpiresAt,
          batch.chunkCount
        ]
      );
      return normalizeBatch(result.rows?.[0]);
    },

    async resetBatchChunks(batchId) {
      const result = await queryable.query(
        `UPDATE kb_chunks
         SET embedding_state = 'pending', embedding_lease_id = NULL,
             embedding_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE embedding_lease_id = $1 AND embedding_state = 'leased'`,
        [batchId]
      );
      return result.rowCount || 0;
    },

    async releaseBatch(batchId, status, errorCode, errorMetadata = {}) {
      const result = await queryable.query(
        `UPDATE kb_embedding_batches
         SET status = $2, lease_expires_at = CURRENT_TIMESTAMP,
             error_code = $3, error_metadata = $4::jsonb,
             released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'leased'
         RETURNING id`,
        [batchId, status, errorCode || null, JSON.stringify(errorMetadata || {})]
      );
      return result.rows?.[0]?.id || null;
    },

    async lockBatchForCompletion(accountId, batchId, sessionId) {
      const result = await queryable.query(
        `${BATCH_SELECT}
         WHERE account_id = $1 AND id = $2 AND status = 'leased'
           AND lease_owner_session_id = $3
           AND lease_expires_at > CURRENT_TIMESTAMP
         FOR UPDATE`,
        [accountId, batchId, sessionId]
      );
      return normalizeBatch(result.rows?.[0]);
    },

    async insertVectors({ dimensions, accountId, knowledgeBaseId, indexVersionId, vectors }) {
      const storage = vectorTable(dimensions);
      const rows = vectors.map((entry) => ({
        chunk_id: entry.chunkId,
        embedding: pgvector.toSql(entry.embedding)
      }));
      const result = await queryable.query(
        `INSERT INTO ${storage.table} (
           chunk_id, account_id, knowledge_base_id, index_version_id, embedding
         )
         SELECT row.chunk_id::uuid, $1, $2, $3, row.embedding::${storage.type}(${Number(dimensions)})
         FROM jsonb_to_recordset($4::jsonb) AS row(chunk_id text, embedding text)`,
        [accountId, knowledgeBaseId, indexVersionId, JSON.stringify(rows)]
      );
      return result.rowCount || 0;
    },

    async completeBatchChunks(batchId) {
      const result = await queryable.query(
        `UPDATE kb_chunks
         SET embedding_state = 'ready', embedding_lease_id = NULL,
             embedding_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE embedding_lease_id = $1 AND embedding_state = 'leased'`,
        [batchId]
      );
      return result.rowCount || 0;
    },

    async completeBatch(batchId, usage, vectorBytes) {
      const result = await queryable.query(
        `UPDATE kb_embedding_batches
         SET status = 'completed', provider_usage = $2::jsonb,
             vector_bytes = $3, error_code = NULL, error_metadata = '{}'::jsonb,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'leased'
         RETURNING id`,
        [batchId, JSON.stringify(usage || {}), vectorBytes]
      );
      return result.rows?.[0]?.id || null;
    },

    async markDocumentEmbedding(accountId, documentId) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'embedding', error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2 AND status = 'awaiting_embedding'
         RETURNING id`,
        [accountId, documentId]
      );
      return result.rows?.[0]?.id || null;
    },

    async markDocumentAwaitingError(accountId, documentId, errorCode, errorMetadata = {}) {
      const result = await queryable.query(
        `UPDATE kb_documents
         SET status = 'awaiting_embedding', error_code = $3,
             error_detail = $4, updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE account_id = $1 AND id = $2
           AND status IN ('awaiting_embedding', 'embedding')
         RETURNING id`,
        [accountId, documentId, errorCode, JSON.stringify(errorMetadata || {}).slice(0, 4000)]
      );
      return result.rows?.[0]?.id || null;
    },

    async markReadyDocuments(accountId, knowledgeBaseId, indexVersionId) {
      const result = await queryable.query(
        `UPDATE kb_documents d
         SET status = 'ready', error_code = NULL, error_detail = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE d.account_id = $1 AND d.knowledge_base_id = $2
           AND d.status IN ('awaiting_embedding', 'embedding')
           AND EXISTS (
             SELECT 1 FROM kb_chunks c
             WHERE c.account_id = d.account_id AND c.document_id = d.id
               AND c.index_version_id = $3
           )
           AND NOT EXISTS (
             SELECT 1 FROM kb_chunks c
             WHERE c.account_id = d.account_id AND c.document_id = d.id
               AND c.index_version_id = $3 AND c.embedding_state <> 'ready'
           )`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      return result.rowCount || 0;
    },

    async refreshIndexLogicalBytes(accountId, knowledgeBaseId, indexVersionId) {
      const result = await queryable.query(
        `UPDATE kb_index_versions i
         SET logical_bytes = (
           SELECT COALESCE(SUM(c.text_bytes), 0)
                + COALESCE(COUNT(*) FILTER (WHERE c.embedding_state = 'ready'), 0)
                  * i.embedding_dimensions
                  * CASE i.embedding_dimensions WHEN 3072 THEN 2 ELSE 4 END
           FROM kb_chunks c
           WHERE c.account_id = $1 AND c.knowledge_base_id = $2
             AND c.index_version_id = $3
         )
         WHERE i.account_id = $1 AND i.knowledge_base_id = $2 AND i.id = $3
         RETURNING logical_bytes::text`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      return asByteString(result.rows?.[0]?.logical_bytes);
    },

    async activateInitialIndex(accountId, knowledgeBaseId, indexVersionId, indexVersion) {
      await queryable.query(
        `UPDATE kb_index_versions
         SET status = 'active', activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP)
         WHERE account_id = $1 AND knowledge_base_id = $2 AND id = $3
           AND status IN ('building', 'active')`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      const result = await queryable.query(
        `UPDATE kb_knowledge_bases
         SET active_index_version = $3, pending_index_version = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2
           AND active_index_version IS NULL AND pending_index_version = $3
         RETURNING id`,
        [accountId, knowledgeBaseId, indexVersion]
      );
      return Boolean(result.rowCount);
    },

    async indexFootprint(accountId, knowledgeBaseId, indexVersionId) {
      const result = await queryable.query(
        `SELECT COUNT(*)::integer AS chunk_count,
                COALESCE(SUM(text_bytes), 0)::text AS chunk_bytes,
                COUNT(*) FILTER (WHERE embedding_state <> 'ready')::integer AS incomplete_chunks
         FROM kb_chunks
         WHERE account_id = $1 AND knowledge_base_id = $2 AND index_version_id = $3`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      const row = result.rows?.[0] || {};
      return {
        chunkCount: asNumber(row.chunk_count),
        chunkBytes: asByteString(row.chunk_bytes),
        incompleteChunks: asNumber(row.incomplete_chunks)
      };
    },

    async indexDocumentFootprints(accountId, knowledgeBaseId, indexVersionId) {
      const result = await queryable.query(
        `SELECT c.document_id,
                COUNT(*)::integer AS chunk_count,
                COALESCE(SUM(c.text_bytes), 0)::text AS chunk_bytes,
                (COUNT(*) FILTER (WHERE c.embedding_state = 'ready')
                  * i.embedding_dimensions
                  * CASE i.embedding_dimensions WHEN 3072 THEN 2 ELSE 4 END)::text AS vector_bytes
         FROM kb_chunks c
         JOIN kb_index_versions i
           ON i.id = c.index_version_id AND i.account_id = c.account_id
          AND i.knowledge_base_id = c.knowledge_base_id
         WHERE c.account_id = $1 AND c.knowledge_base_id = $2
           AND c.index_version_id = $3
         GROUP BY c.document_id, i.embedding_dimensions
         ORDER BY c.document_id`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      return (result.rows || []).map((row) => ({
        documentId: row.document_id,
        chunkCount: asNumber(row.chunk_count),
        chunkBytes: asByteString(row.chunk_bytes),
        vectorBytes: asByteString(row.vector_bytes)
      }));
    },

    async cloneIndexChunks({ accountId, knowledgeBaseId, sourceIndexVersionId, targetIndexVersionId }) {
      const result = await queryable.query(
        `INSERT INTO kb_chunks (
           id, account_id, knowledge_base_id, document_id, index_version_id,
           ordinal, text_content, text_bytes, token_estimate, source_locator,
           content_hash, embedding_state
         )
         SELECT md5(c.id::text || ':' || $4::text)::uuid,
                c.account_id, c.knowledge_base_id, c.document_id, $4,
                c.ordinal, c.text_content, c.text_bytes, c.token_estimate,
                c.source_locator, c.content_hash, 'pending'
         FROM kb_chunks c
         WHERE c.account_id = $1 AND c.knowledge_base_id = $2
           AND c.index_version_id = $3 AND c.embedding_state = 'ready'
         ORDER BY c.document_id, c.ordinal`,
        [accountId, knowledgeBaseId, sourceIndexVersionId, targetIndexVersionId]
      );
      return result.rowCount || 0;
    },

    async cutoverReindex({ accountId, knowledgeBaseId, oldIndex, nextIndex }) {
      await queryable.query(
        `UPDATE kb_index_versions
         SET status = 'active', activated_at = CURRENT_TIMESTAMP
         WHERE account_id = $1 AND knowledge_base_id = $2 AND id = $3
           AND status = 'building'`,
        [accountId, knowledgeBaseId, nextIndex.id]
      );
      await queryable.query(
        `UPDATE kb_index_versions
         SET status = 'retired', retired_at = CURRENT_TIMESTAMP
         WHERE account_id = $1 AND knowledge_base_id = $2 AND id = $3
           AND status = 'active'`,
        [accountId, knowledgeBaseId, oldIndex.id]
      );
      const result = await queryable.query(
        `UPDATE kb_knowledge_bases
         SET active_index_version = $4, pending_index_version = NULL,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE account_id = $1 AND id = $2
           AND active_index_version = $3 AND pending_index_version = $4
         RETURNING id`,
        [accountId, knowledgeBaseId, oldIndex.version, nextIndex.version]
      );
      return result.rows?.[0]?.id || null;
    },

    async deleteRetiredIndex(accountId, knowledgeBaseId, indexVersionId) {
      const chunks = await queryable.query(
        `DELETE FROM kb_chunks
         WHERE account_id = $1 AND knowledge_base_id = $2 AND index_version_id = $3`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      const index = await queryable.query(
        `DELETE FROM kb_index_versions
         WHERE account_id = $1 AND knowledge_base_id = $2 AND id = $3
           AND status = 'retired'`,
        [accountId, knowledgeBaseId, indexVersionId]
      );
      return { chunks: chunks.rowCount || 0, index: index.rowCount || 0 };
    }
  });
}

export const KNOWLEDGE_VECTOR_TABLES = VECTOR_TABLES;
