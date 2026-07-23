import pgvector from "pgvector";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../errors.mjs";
import { KNOWLEDGE_VECTOR_TABLES } from "./embedding-repository.mjs";

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeProfile(row, prefix = "") {
  const vendor = row?.[`${prefix}embedding_vendor`];
  if (!vendor) return null;
  return {
    vendor,
    catalogModelId: row[`${prefix}embedding_catalog_model_id`],
    actualModel: row[`${prefix}embedding_actual_model`],
    dimensions: asNumber(row[`${prefix}embedding_dimensions`]),
    fingerprint: row[`${prefix}embedding_profile_fingerprint`]
  };
}

function normalizeBase(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    status: row.status,
    documentCount: asNumber(row.document_count),
    readyDocumentCount: asNumber(row.ready_document_count),
    activeIndexVersion: row.active_index_version === null
      ? null
      : asNumber(row.active_index_version),
    pendingIndexVersion: row.pending_index_version === null
      ? null
      : asNumber(row.pending_index_version),
    profile: normalizeProfile(row),
    activeIndex: row.index_version_id
      ? {
          id: row.index_version_id,
          version: asNumber(row.index_version),
          status: row.index_status,
          chunkVersion: asNumber(row.index_chunk_version),
          profile: normalizeProfile(row, "index_")
        }
      : null
  };
}

function normalizeRetrievalContext(row) {
  if (!row) return null;
  return {
    account: {
      id: row.account_id,
      status: row.account_status,
      limitOverrides: asObject(row.limit_overrides)
    },
    settings: {
      retrievalRequestsPerMinutePerAccount: asNumber(
        row.retrieval_requests_per_minute_per_account
      ),
      maxRetrievalTopK: asNumber(row.max_retrieval_top_k)
    }
  };
}

function normalizeHit(row) {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    knowledgeBaseId: row.knowledge_base_id,
    knowledgeBaseName: row.knowledge_base_name,
    documentName: row.document_name,
    ordinal: asNumber(row.ordinal),
    text: String(row.text_content || ""),
    locator: asObject(row.source_locator),
    similarity: Number(row.similarity),
    indexVersionId: row.index_version_id,
    indexVersion: asNumber(row.index_version)
  };
}

function vectorStorage(dimensions) {
  const storage = KNOWLEDGE_VECTOR_TABLES[Number(dimensions)];
  if (!storage) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_PROFILE_INVALID,
      "当前向量维度未部署",
      { status: 409, details: { dimensions: Number(dimensions) || null } }
    );
  }
  return storage;
}

function boundedLimit(value) {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "检索数量无效", {
      status: 400,
      details: { field: "limit" }
    });
  }
  return limit;
}

export function createKnowledgeRetrievalRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge retrieval repository requires a queryable database client");
  }

  return Object.freeze({
    async findRetrievalContext(accountId) {
      const result = await queryable.query(
        `SELECT a.id AS account_id, a.status AS account_status, a.limit_overrides,
                s.retrieval_requests_per_minute_per_account,
                s.max_retrieval_top_k
           FROM kb_accounts a
           JOIN kb_runtime_settings s ON s.singleton_id = 1
          WHERE a.id = $1`,
        [accountId]
      );
      return normalizeRetrievalContext(result.rows?.[0]);
    },

    async findBasesForRetrieval(accountId, knowledgeBaseIds) {
      if (!Array.isArray(knowledgeBaseIds) || !knowledgeBaseIds.length) return [];
      const result = await queryable.query(
        `SELECT b.id, b.account_id, b.name, b.status,
                b.active_index_version, b.pending_index_version,
                b.embedding_vendor, b.embedding_catalog_model_id,
                b.embedding_actual_model, b.embedding_dimensions,
                b.embedding_profile_fingerprint,
                i.id AS index_version_id, i.version AS index_version,
                i.status AS index_status, i.chunk_version AS index_chunk_version,
                i.embedding_vendor AS index_embedding_vendor,
                i.embedding_catalog_model_id AS index_embedding_catalog_model_id,
                i.embedding_actual_model AS index_embedding_actual_model,
                i.embedding_dimensions AS index_embedding_dimensions,
                i.embedding_profile_fingerprint AS index_embedding_profile_fingerprint,
                (SELECT COUNT(*)::integer
                   FROM kb_documents d
                  WHERE d.account_id = b.account_id
                    AND d.knowledge_base_id = b.id
                    AND d.status <> 'deleting') AS document_count,
                (SELECT COUNT(*)::integer
                   FROM kb_documents d
                  WHERE d.account_id = b.account_id
                    AND d.knowledge_base_id = b.id
                    AND d.status = 'ready') AS ready_document_count
           FROM kb_knowledge_bases b
           LEFT JOIN kb_index_versions i
             ON i.account_id = b.account_id
            AND i.knowledge_base_id = b.id
            AND i.version = b.active_index_version
          WHERE b.account_id = $1
            AND b.id = ANY($2::uuid[])`,
        [accountId, knowledgeBaseIds]
      );
      return (result.rows || []).map(normalizeBase);
    },

    async searchSimilar({
      accountId,
      knowledgeBaseId,
      indexVersionId,
      dimensions,
      queryEmbedding,
      limit
    }) {
      const storage = vectorStorage(dimensions);
      const bounded = boundedLimit(limit);
      if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== Number(dimensions) ||
          queryEmbedding.some((value) => !Number.isFinite(Number(value)))) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "检索向量无效", {
          status: 400,
          details: { field: "queryEmbedding" }
        });
      }
      const vectorSql = pgvector.toSql(queryEmbedding.map(Number));
      const vectorType = `${storage.type}(${Number(dimensions)})`;
      const result = await queryable.query(
        `SELECT c.id AS chunk_id, c.document_id, c.knowledge_base_id,
                b.name AS knowledge_base_name, d.display_name AS document_name,
                c.ordinal, c.text_content, c.source_locator,
                i.id AS index_version_id, i.version AS index_version,
                1 - (v.embedding <=> $4::${vectorType}) AS similarity
           FROM ${storage.table} v
           JOIN kb_chunks c
             ON c.id = v.chunk_id
            AND c.account_id = v.account_id
            AND c.knowledge_base_id = v.knowledge_base_id
            AND c.index_version_id = v.index_version_id
           JOIN kb_documents d
             ON d.id = c.document_id
            AND d.account_id = c.account_id
            AND d.knowledge_base_id = c.knowledge_base_id
           JOIN kb_knowledge_bases b
             ON b.id = c.knowledge_base_id
            AND b.account_id = c.account_id
           JOIN kb_index_versions i
             ON i.id = c.index_version_id
            AND i.account_id = c.account_id
            AND i.knowledge_base_id = c.knowledge_base_id
          WHERE v.account_id = $1
            AND v.knowledge_base_id = $2
            AND v.index_version_id = $3
            AND b.account_id = $1
            AND b.id = $2
            AND b.active_index_version = i.version
            AND i.id = $3
            AND i.status = 'active'
            AND d.account_id = $1
            AND d.knowledge_base_id = $2
            AND d.status = 'ready'
            AND c.account_id = $1
            AND c.knowledge_base_id = $2
            AND c.index_version_id = $3
            AND c.embedding_state = 'ready'
          ORDER BY v.embedding <=> $4::${vectorType},
                   c.document_id ASC, c.ordinal ASC, c.id ASC
          LIMIT $5`,
        [accountId, knowledgeBaseId, indexVersionId, vectorSql, bounded]
      );
      return (result.rows || []).map(normalizeHit);
    },

    async findAuthorizedSource(accountId, documentId, chunkId) {
      if (!chunkId) return null;
      const result = await queryable.query(
        `SELECT d.id AS document_id, d.account_id, d.knowledge_base_id,
                d.display_name, d.status AS document_status,
                d.object_key, d.object_version_id,
                b.id AS base_id, b.name AS knowledge_base_name,
                b.status AS base_status,
                c.id AS chunk_id, c.ordinal, c.source_locator
           FROM kb_documents d
           JOIN kb_knowledge_bases b
             ON b.id = d.knowledge_base_id
            AND b.account_id = d.account_id
           JOIN kb_chunks c
             ON c.document_id = d.id
            AND c.account_id = d.account_id
            AND c.knowledge_base_id = d.knowledge_base_id
            AND c.id = $3
            AND c.embedding_state = 'ready'
           JOIN kb_index_versions i
             ON i.id = c.index_version_id
            AND i.account_id = c.account_id
            AND i.knowledge_base_id = c.knowledge_base_id
          WHERE d.account_id = $1
            AND d.id = $2
            AND d.status = 'ready'
            AND b.account_id = $1
            AND b.status = 'active'
            AND b.active_index_version = i.version
            AND i.status = 'active'`,
        [accountId, documentId, chunkId]
      );
      const row = result.rows?.[0];
      if (!row?.chunk_id) return null;
      return {
        documentId: row.document_id,
        accountId: row.account_id,
        knowledgeBaseId: row.knowledge_base_id,
        knowledgeBaseName: row.knowledge_base_name,
        documentName: row.display_name,
        documentStatus: row.document_status,
        baseId: row.base_id,
        baseStatus: row.base_status,
        objectKey: row.object_key,
        objectVersionId: row.object_version_id || null,
        chunkId: row.chunk_id || null,
        ordinal: row.chunk_id === null ? null : asNumber(row.ordinal),
        locator: asObject(row.source_locator)
      };
    }
  });
}
