import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeLibraryRepository } from "../../server/knowledge-cloud/repositories/library-repository.mjs";
import { createKnowledgeQuotaRepository } from "../../server/knowledge-cloud/repositories/quota-repository.mjs";

test("library repository scopes base and document reads to the authenticated account", async () => {
  const queries = [];
  const queryable = {
    async query(text, params) {
      queries.push({ text: String(text), params });
      return { rows: [] };
    }
  };
  const repository = createKnowledgeLibraryRepository(queryable);
  await repository.findBase("account-a", "base-a", { forUpdate: true });
  await repository.findDocument("account-a", "document-a", { forUpdate: true });

  assert.match(queries[0].text, /b\.account_id = \$1 AND b\.id = \$2/);
  assert.match(queries[0].text, /FOR UPDATE OF b/);
  assert.deepEqual(queries[0].params, ["account-a", "base-a"]);
  assert.match(queries[1].text, /account_id = \$1 AND id = \$2/);
  assert.match(queries[1].text, /FOR UPDATE/);
  assert.deepEqual(queries[1].params, ["account-a", "document-a"]);
});

test("quota repository locks the account row and usage ledger stays append-only", async () => {
  const queries = [];
  const queryable = {
    async query(text, params) {
      const sql = String(text);
      queries.push({ text: sql, params });
      if (sql.includes("FROM kb_accounts")) {
        return {
          rows: [{
            id: "account-a",
            status: "active",
            quota_bytes: "1000",
            used_bytes: "0",
            reserved_bytes: "0",
            limit_overrides: {}
          }]
        };
      }
      if (sql.includes("FROM kb_knowledge_bases")) {
        return {
          rows: [{
            knowledge_base_count: 0,
            document_count: 0,
            chunk_count: 0,
            active_upload_count: 0
          }]
        };
      }
      return { rows: [] };
    }
  };
  const repository = createKnowledgeQuotaRepository(queryable);
  await repository.lockAccountCapacity("account-a");
  await repository.insertLedgerEntry({
    id: "ledger-a",
    accountId: "account-a",
    entryType: "reserve",
    component: "original",
    reservedDeltaBytes: "100",
    usedDeltaBytes: "0",
    reservationKey: "document-upload:document-a"
  });

  assert.match(queries[0].text, /FROM kb_accounts/);
  assert.match(queries[0].text, /FOR UPDATE/);
  assert.match(queries[1].text, /FROM kb_knowledge_bases/);
  assert.match(queries[2].text, /INSERT INTO kb_usage_ledger/);
  assert.doesNotMatch(queries[2].text, /UPDATE kb_usage_ledger|DELETE FROM kb_usage_ledger/);
});

test("quota cleanup queries preserve document and index attribution inside the account boundary", async () => {
  const queries = [];
  const repository = createKnowledgeQuotaRepository({
    async query(text, params) {
      queries.push({ text: String(text), params });
      return { rows: [] };
    }
  });
  await repository.documentCapacity("account-a", "document-a");
  await repository.indexUsage("account-a", "index-a");
  await repository.baseCapacity("account-a", "base-a");

  assert.match(queries[0].text, /account_id = \$1 AND document_id = \$2/);
  assert.match(queries[0].text, /GROUP BY component, index_version_id/);
  assert.match(queries[1].text, /account_id = \$1 AND index_version_id = \$2/);
  assert.match(queries[1].text, /GROUP BY component, document_id/);
  assert.match(queries[2].text, /account_id = \$1 AND knowledge_base_id = \$2/);
  assert.match(queries[2].text, /GROUP BY component, document_id, index_version_id/);
});
