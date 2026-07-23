import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  applyKnowledgeMigrations,
  verifyKnowledgeMigrations
} from "../../server/knowledge-cloud/migrations/runner.mjs";
import { createKnowledgeSchemaRepository } from "../../server/knowledge-cloud/repositories/schema-repository.mjs";

const { Pool } = pg;
const connectionString = process.env.KNOWLEDGE_TEST_DATABASE_URL;

test(
  "knowledge migrations apply cleanly and rerun idempotently on PostgreSQL + pgvector",
  { skip: !connectionString, timeout: 120000 },
  async () => {
    const schemaName = `kb_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    const pool = new Pool({
      connectionString,
      options: `-c search_path=${schemaName},public`
    });
    try {
      const first = await applyKnowledgeMigrations(pool, { logger: { info() {} } });
      assert.deepEqual(first.applied, [
        "0001_vector_extension.sql",
        "0002_foundation_schema.sql",
        "0003_auth_security.sql",
        "0004_admin_control_plane.sql",
        "0005_library_upload_lifecycle.sql",
        "0006_durable_parsing_worker.sql",
        "0007_resumable_embeddings_pgvector.sql",
        "0008_embedding_retry_quota_attribution.sql"
      ]);
      const second = await applyKnowledgeMigrations(pool, { logger: { info() {} } });
      assert.deepEqual(second.applied, []);
      const state = await verifyKnowledgeMigrations(pool);
      assert.equal(state.pending.length, 0);
      const schema = createKnowledgeSchemaRepository(pool);
      assert(await schema.vectorExtensionVersion());
      const tables = await pool.query(
        `SELECT to_regclass('kb_accounts') AS accounts,
                to_regclass('kb_chunks') AS chunks,
                to_regclass('kb_vectors_1024') AS vectors_1024,
                to_regclass('kb_vectors_1536') AS vectors_1536,
                to_regclass('kb_vectors_3072') AS vectors_3072,
                to_regclass('kb_vectors_3072_embedding_hnsw_idx') AS vectors_3072_hnsw`
      );
      assert(tables.rows[0].accounts);
      assert(tables.rows[0].chunks);
      assert(tables.rows[0].vectors_1024);
      assert(tables.rows[0].vectors_1536);
      assert(tables.rows[0].vectors_3072);
      assert(tables.rows[0].vectors_3072_hnsw);
      const storageTypes = await pool.query(
        `SELECT c.relname, format_type(a.atttypid, a.atttypmod) AS storage_type
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = current_schema()
           AND c.relname IN ('kb_vectors_1024', 'kb_vectors_1536', 'kb_vectors_3072')
           AND a.attname = 'embedding'
         ORDER BY c.relname`
      );
      assert.deepEqual(storageTypes.rows, [
        { relname: "kb_vectors_1024", storage_type: "vector(1024)" },
        { relname: "kb_vectors_1536", storage_type: "vector(1536)" },
        { relname: "kb_vectors_3072", storage_type: "halfvec(3072)" }
      ]);
    } finally {
      await pool.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  }
);
