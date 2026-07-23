import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeRetrievalRepository } from "../../server/knowledge-cloud/repositories/retrieval-repository.mjs";

function captureRepository(resultFactory = () => ({ rows: [] })) {
  const calls = [];
  return {
    calls,
    repository: createKnowledgeRetrievalRepository({
      async query(sql, params = []) {
        const call = { sql: String(sql), params };
        calls.push(call);
        return resultFactory(call, calls.length - 1);
      }
    })
  };
}

test("retrieval limits use a read-only account/settings projection", async () => {
  const { calls, repository } = captureRepository(() => ({ rows: [{
    account_id: "account-1",
    account_status: "active",
    limit_overrides: { maxRetrievalTopK: 4 },
    retrieval_requests_per_minute_per_account: 60,
    max_retrieval_top_k: 20
  }] }));
  const context = await repository.findRetrievalContext("account-1");
  assert.equal(context.account.status, "active");
  assert.equal(context.settings.maxRetrievalTopK, 20);
  assert.match(calls[0].sql, /FROM kb_accounts a/);
  assert.match(calls[0].sql, /JOIN kb_runtime_settings s/);
  assert.doesNotMatch(calls[0].sql, /FOR UPDATE/);
});

test("retrieval preflight selects only authenticated bases and their active index snapshots", async () => {
  const { calls, repository } = captureRepository(() => ({ rows: [{
    id: "base-1",
    account_id: "account-1",
    name: "产品资料",
    status: "active",
    active_index_version: 2,
    pending_index_version: 3,
    embedding_vendor: "qwen",
    embedding_catalog_model_id: "qwen-text-embedding-v4",
    embedding_actual_model: "text-embedding-v4",
    embedding_dimensions: 1024,
    embedding_profile_fingerprint: "a".repeat(64),
    index_version_id: "index-2",
    index_version: 2,
    index_status: "active",
    index_chunk_version: 1,
    index_embedding_vendor: "qwen",
    index_embedding_catalog_model_id: "qwen-text-embedding-v4",
    index_embedding_actual_model: "text-embedding-v4",
    index_embedding_dimensions: 1024,
    index_embedding_profile_fingerprint: "a".repeat(64),
    document_count: 3,
    ready_document_count: 2
  }] }));
  const result = await repository.findBasesForRetrieval("account-1", ["base-1"]);
  assert.equal(result[0].activeIndex.id, "index-2");
  assert.equal(result[0].readyDocumentCount, 2);
  assert.match(calls[0].sql, /WHERE b\.account_id = \$1/);
  assert.match(calls[0].sql, /b\.id = ANY\(\$2::uuid\[\]\)/);
  assert.match(calls[0].sql, /i\.version = b\.active_index_version/);
  assert.match(calls[0].sql, /d\.status = 'ready'/);
  assert.deepEqual(calls[0].params, ["account-1", ["base-1"]]);
});

test("pgvector search carries mandatory account, base, active-index and ready-document predicates", async () => {
  const { calls, repository } = captureRepository(() => ({ rows: [{
    chunk_id: "chunk-1",
    document_id: "document-1",
    knowledge_base_id: "base-1",
    knowledge_base_name: "产品资料",
    document_name: "guide.txt",
    ordinal: 4,
    text_content: "bounded source",
    source_locator: { kind: "text", startLine: 12, endLine: 16 },
    index_version_id: "index-1",
    index_version: 1,
    similarity: 0.82
  }] }));
  const hits = await repository.searchSimilar({
    accountId: "account-1",
    knowledgeBaseId: "base-1",
    indexVersionId: "index-1",
    dimensions: 1024,
    queryEmbedding: Array.from({ length: 1024 }, () => 0.25),
    limit: 20
  });
  assert.equal(hits[0].chunkId, "chunk-1");
  assert.equal("objectKey" in hits[0], false);
  assert.match(calls[0].sql, /FROM kb_vectors_1024 v/);
  assert.match(calls[0].sql, /v\.account_id = \$1/);
  assert.match(calls[0].sql, /v\.knowledge_base_id = \$2/);
  assert.match(calls[0].sql, /v\.index_version_id = \$3/);
  assert.match(calls[0].sql, /b\.active_index_version = i\.version/);
  assert.match(calls[0].sql, /i\.status = 'active'/);
  assert.match(calls[0].sql, /d\.status = 'ready'/);
  assert.match(calls[0].sql, /c\.embedding_state = 'ready'/);
  assert.equal(calls[0].params[4], 20);
});

test("source lookup reauthorizes the document and citation chunk without a client object key", async () => {
  const { calls, repository } = captureRepository(() => ({ rows: [] }));
  await repository.findAuthorizedSource("account-1", "document-1", "chunk-1");
  assert.match(calls[0].sql, /d\.account_id = \$1/);
  assert.match(calls[0].sql, /d\.id = \$2/);
  assert.match(calls[0].sql, /c\.id = \$3/);
  assert.match(calls[0].sql, /d\.status = 'ready'/);
  assert.match(calls[0].sql, /c\.embedding_state = 'ready'/);
  assert.match(calls[0].sql, /b\.status = 'active'/);
  assert.match(calls[0].sql, /b\.active_index_version = i\.version/);
  assert.match(calls[0].sql, /i\.status = 'active'/);
  assert.deepEqual(calls[0].params, ["account-1", "document-1", "chunk-1"]);
});
