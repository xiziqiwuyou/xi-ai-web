import assert from "node:assert/strict";
import test from "node:test";
import {
  KNOWLEDGE_VECTOR_TABLES,
  createKnowledgeEmbeddingRepository
} from "../../server/knowledge-cloud/repositories/embedding-repository.mjs";
import { KNOWLEDGE_ERROR_CODES } from "../../server/knowledge-cloud/errors.mjs";

function captureRepository(resultFactory = () => ({ rows: [], rowCount: 0 })) {
  const calls = [];
  return {
    calls,
    repository: createKnowledgeEmbeddingRepository({
      async query(sql, params = []) {
        const call = { sql: String(sql), params };
        calls.push(call);
        return resultFactory(call, calls.length - 1);
      }
    })
  };
}

test("embedding repository leases chunks with skip-locked selection before assignment", async () => {
  const { calls, repository } = captureRepository((call, index) => index === 0
    ? { rows: [{ id: "00000000-0000-4000-8000-000000000001", ordinal: 0, text_content: "hello", content_hash: "a".repeat(64) }] }
    : { rows: [], rowCount: 1 });
  const chunks = await repository.selectChunksForLease({
    accountId: "account",
    knowledgeBaseId: "base",
    documentId: "document",
    indexVersionId: "index",
    limit: 10
  });
  assert.equal(chunks[0].text, "hello");
  assert.match(calls[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].sql, /embedding_state IN \('pending', 'failed'\)/);

  await repository.leaseChunks({
    accountId: "account",
    batchId: "batch",
    leaseExpiresAt: new Date(),
    chunkIds: [chunks[0].id]
  });
  assert.match(calls[1].sql, /embedding_lease_id = \$2/);
  assert.match(calls[1].sql, /ANY\(\$4::uuid\[\]\)/);
});

test("vector inserts route only to migration-provisioned fixed-dimension tables", async () => {
  const { calls, repository } = captureRepository(() => ({ rows: [], rowCount: 1 }));
  await repository.insertVectors({
    dimensions: 1024,
    accountId: "account",
    knowledgeBaseId: "base",
    indexVersionId: "index",
    vectors: [{
      chunkId: "00000000-0000-4000-8000-000000000001",
      embedding: Array.from({ length: 1024 }, () => 0.25)
    }]
  });
  assert.deepEqual(KNOWLEDGE_VECTOR_TABLES, {
    1024: { table: "kb_vectors_1024", type: "vector" },
    1536: { table: "kb_vectors_1536", type: "vector" },
    3072: { table: "kb_vectors_3072", type: "halfvec" }
  });
  assert.match(calls[0].sql, /INSERT INTO kb_vectors_1024/);
  assert.match(calls[0].sql, /row\.embedding::vector\(1024\)/);

  await repository.insertVectors({
    dimensions: 3072,
    accountId: "account",
    knowledgeBaseId: "base",
    indexVersionId: "index",
    vectors: [{
      chunkId: "00000000-0000-4000-8000-000000000002",
      embedding: Array.from({ length: 3072 }, () => 0.25)
    }]
  });
  assert.match(calls[1].sql, /INSERT INTO kb_vectors_3072/);
  assert.match(calls[1].sql, /row\.embedding::halfvec\(3072\)/);

  await assert.rejects(
    repository.insertVectors({
      dimensions: 2048,
      accountId: "account",
      knowledgeBaseId: "base",
      indexVersionId: "index",
      vectors: []
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.EMBEDDING_PROFILE_INVALID
  );
  assert.equal(calls.length, 2);
});

test("batch completion and shadow cloning keep exact account/index predicates", async () => {
  const { calls, repository } = captureRepository(() => ({ rows: [{ id: "batch" }], rowCount: 1 }));
  await repository.completeBatch("batch", { prompt_tokens: 4 }, "4096");
  assert.match(calls[0].sql, /WHERE id = \$1 AND status = 'leased'/);
  assert.equal(JSON.parse(calls[0].params[1]).prompt_tokens, 4);

  await repository.cloneIndexChunks({
    accountId: "account",
    knowledgeBaseId: "base",
    sourceIndexVersionId: "old-index",
    targetIndexVersionId: "new-index"
  });
  assert.match(calls[1].sql, /md5\(c\.id::text \|\| ':' \|\| \$4::text\)::uuid/);
  assert.match(calls[1].sql, /c\.embedding_state = 'ready'/);
  assert.deepEqual(calls[1].params, ["account", "base", "old-index", "new-index"]);
});

test("shadow attribution footprints remain scoped to one account, base and index", async () => {
  const { calls, repository } = captureRepository(() => ({
    rows: [{
      document_id: "document-1",
      chunk_count: 2,
      chunk_bytes: "48",
      vector_bytes: "8192"
    }]
  }));
  const footprints = await repository.indexDocumentFootprints("account", "base", "index");
  assert.deepEqual(footprints, [{
    documentId: "document-1",
    chunkCount: 2,
    chunkBytes: "48",
    vectorBytes: "8192"
  }]);
  assert.match(calls[0].sql, /c\.account_id = \$1 AND c\.knowledge_base_id = \$2/);
  assert.match(calls[0].sql, /c\.index_version_id = \$3/);
  assert.match(calls[0].sql, /GROUP BY c\.document_id/);
});
