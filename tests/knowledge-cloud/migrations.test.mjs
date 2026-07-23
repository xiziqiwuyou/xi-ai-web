import assert from "node:assert/strict";
import test from "node:test";
import {
  checksumMigrationSource,
  loadKnowledgeMigrationManifest
} from "../../server/knowledge-cloud/migrations/manifest.mjs";
import {
  applyKnowledgeMigrations,
  compareKnowledgeMigrations,
  verifyKnowledgeMigrations
} from "../../server/knowledge-cloud/migrations/runner.mjs";
import { KNOWLEDGE_ERROR_CODES } from "../../server/knowledge-cloud/errors.mjs";

function createFakeMigrationPool(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const queries = [];
  let released = 0;
  const client = {
    async query(sql, params = []) {
      const text = String(sql).trim();
      queries.push({ text, params });
      if (text.startsWith("SELECT version, name, checksum")) return { rows: rows.map((row) => ({ ...row })) };
      if (text.startsWith("INSERT INTO kb_schema_migrations")) {
        rows.push({
          version: params[0],
          name: params[1],
          checksum: params[2],
          execution_ms: params[3],
          applied_at: new Date().toISOString()
        });
      }
      return { rows: [] };
    },
    release() {
      released += 1;
    }
  };
  return {
    pool: { async connect() { return client; } },
    queries,
    rows,
    released: () => released
  };
}

test("migration checksums are stable across LF and CRLF checkouts", () => {
  assert.equal(checksumMigrationSource("SELECT 1;\n"), checksumMigrationSource("SELECT 1;\r\n"));
});

test("migration manifest is ordered, contiguous, and includes vector foundation", async () => {
  const manifest = await loadKnowledgeMigrationManifest();
  assert.deepEqual(manifest.map((migration) => migration.version), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(manifest[0].source, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.match(manifest[1].source, /CREATE TABLE kb_accounts/);
  assert.match(manifest[1].source, /CREATE TABLE kb_chunks/);
  assert.match(manifest[1].source, /DEFAULT 'pending_upload'/);
  assert.match(manifest[1].source, /reserved_delta_bytes/);
  assert.match(manifest[1].source, /kb_usage_ledger_append_only/);
  assert.doesNotMatch(manifest[1].source, /vector\s*\(/i);
  assert.match(manifest[2].source, /CREATE TABLE kb_auth_rate_limits/);
  assert.match(manifest[2].source, /kb_sessions_token_hash_size/);
  assert.match(manifest[3].source, /ADD COLUMN version bigint/);
  assert.match(manifest[3].source, /kb_accounts_normalized_username_prefix_idx/);
  assert.match(manifest[4].source, /upload_reservation_key/);
  assert.match(manifest[4].source, /kb_usage_ledger_unique_reserve_idx/);
  assert.match(manifest[5].source, /kb_jobs_expired_lease_idx/);
  assert.match(manifest[5].source, /kb_chunks_document_index_idx/);
  assert.match(manifest[6].source, /CREATE TABLE kb_vectors_1024/);
  assert.match(manifest[6].source, /embedding vector\(1536\)/);
  assert.match(manifest[6].source, /embedding halfvec\(3072\)/);
  assert.match(manifest[6].source, /embedding halfvec_cosine_ops/);
  assert.match(manifest[6].source, /USING hnsw \(embedding vector_cosine_ops\)/);
  assert.match(manifest[6].source, /max_concurrent_embeddings_per_account/);
  assert.match(manifest[7].source, /DROP INDEX IF EXISTS kb_usage_ledger_unique_reserve_idx/);
  assert.match(manifest[7].source, /kb_usage_ledger_document_capacity_idx/);
  assert.match(manifest[7].source, /kb_usage_ledger_index_capacity_idx/);
});

test("migration comparison rejects changed and future migrations", async () => {
  const manifest = await loadKnowledgeMigrationManifest();
  assert.throws(
    () =>
      compareKnowledgeMigrations(manifest, [
        { version: 1, name: manifest[0].name, checksum: "0".repeat(64) }
      ]),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.MIGRATION_CHECKSUM_MISMATCH
  );
  assert.throws(
    () => compareKnowledgeMigrations(manifest, [{ version: 99, name: "future", checksum: "x" }]),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.SCHEMA_AHEAD
  );
  assert.throws(
    () =>
      compareKnowledgeMigrations(manifest, [
        {
          version: 2,
          name: manifest[1].name,
          checksum: manifest[1].checksum
        }
      ]),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.MIGRATION_HISTORY_INVALID
  );
});

test("migration runner holds one lock and commits each pending migration", async () => {
  const manifest = await loadKnowledgeMigrationManifest();
  const fake = createFakeMigrationPool();
  const result = await applyKnowledgeMigrations(fake.pool, {
    manifest,
    logger: { info() {} }
  });
  assert.deepEqual(result.applied, manifest.map((migration) => migration.fileName));
  assert.equal(fake.queries.filter((query) => query.text === "BEGIN").length, manifest.length);
  assert.equal(fake.queries.filter((query) => query.text === "COMMIT").length, manifest.length);
  assert.equal(fake.queries.filter((query) => query.text.startsWith("SELECT pg_advisory_lock")).length, 1);
  assert.equal(fake.queries.filter((query) => query.text.startsWith("SELECT pg_advisory_unlock")).length, 1);
  assert(fake.queries.some((query) => query.text.includes("kb_schema_migrations_append_only")));
  assert.equal(fake.released(), 1);

  const second = await applyKnowledgeMigrations(fake.pool, { manifest, logger: { info() {} } });
  assert.deepEqual(second.applied, []);
});

test("migration verification fails closed when the ledger is absent", async () => {
  const manifest = await loadKnowledgeMigrationManifest();
  const queryable = {
    async query(sql) {
      if (String(sql).includes("to_regclass")) return { rows: [{ ledger: null }] };
      throw new Error("unexpected query");
    }
  };
  await assert.rejects(
    verifyKnowledgeMigrations(queryable, { manifest }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.MIGRATIONS_REQUIRED
  );
});
