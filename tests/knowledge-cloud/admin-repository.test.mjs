import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeAdminRepository } from "../../server/knowledge-cloud/repositories/admin-repository.mjs";
import { createKnowledgeAuthRepository } from "../../server/knowledge-cloud/repositories/auth-repository.mjs";

const settingsRow = {
  version: "1",
  registration_mode: "invite_only",
  default_quota_bytes: "0",
  max_knowledge_bases_per_account: 20,
  max_documents_per_account: 1000,
  max_documents_per_knowledge_base: 500,
  max_file_bytes: 104857600,
  max_chunks_per_account: 100000,
  max_concurrent_uploads_per_account: 3,
  max_concurrent_ingestions_per_account: 2,
  max_concurrent_embeddings_per_account: 2,
  retrieval_requests_per_minute_per_account: 60,
  max_retrieval_top_k: 20,
  updated_by: "migration",
  updated_at: "2026-01-01T00:00:00.000Z"
};

test("Admin account projections never select secret or document-body columns", async () => {
  const queries = [];
  const repository = createKnowledgeAdminRepository({
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      return {
        rows: [{
          id: "11111111-1111-4111-8111-111111111111",
          username: "Alice",
          normalized_username: "alice",
          status: "active",
          version: 1,
          quota_bytes: "5368709120",
          used_bytes: "10",
          reserved_bytes: "2",
          limit_overrides: {},
          failed_login_count: 0,
          locked_until: null,
          last_login_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          active_session_count: 1,
          knowledge_base_count: 2,
          document_count: 3,
          chunk_count: 4
        }]
      };
    }
  });

  const accounts = await repository.listAccounts({ limit: 20, status: null, search: "ali", cursor: null });
  assert.equal(accounts[0].quotaBytes, "5368709120");
  assert.equal(accounts[0].chunkCount, 4);
  const sql = queries[0].sql.toLowerCase();
  for (const forbidden of [
    "password_hash",
    "recovery_code_hash",
    "token_hash",
    "csrf_token_hash",
    "text_content",
    "object_key",
    "error_detail"
  ]) {
    assert(!sql.includes(forbidden), `Admin account query selected ${forbidden}`);
  }
  assert.match(sql, /session_generation = a\.session_generation/);
  assert.match(sql, /normalized_username like/);
});

test("Admin settings preserve a valid zero-byte default quota", async () => {
  const repository = createKnowledgeAdminRepository({
    async query() {
      return { rows: [settingsRow] };
    }
  });
  const settings = await repository.getRuntimeSettings();
  assert.equal(settings.defaultQuotaBytes, 0);
  assert.equal(settings.version, 1);
});

test("invite consumption keeps the expiry and revocation guard in the final UPDATE", async () => {
  let captured = "";
  const repository = createKnowledgeAuthRepository({
    async query(sql) {
      captured = String(sql);
      return { rowCount: 1, rows: [{ id: "invite-1" }] };
    }
  });
  assert.equal(await repository.consumeInvite("invite-1", "account-1"), true);
  assert.match(captured, /revoked_at IS NULL/);
  assert.match(captured, /expires_at > CURRENT_TIMESTAMP/);
});
