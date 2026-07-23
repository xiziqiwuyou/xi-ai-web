import assert from "node:assert/strict";
import test from "node:test";
import { withKnowledgeTransaction } from "../../server/knowledge-cloud/db.mjs";
import { createKnowledgeRepositories } from "../../server/knowledge-cloud/repositories/index.mjs";
import {
  initializeKnowledgeRuntime,
  publicKnowledgeRuntimeStatus
} from "../../server/knowledge-cloud/runtime.mjs";
import { KNOWLEDGE_ERROR_CODES } from "../../server/knowledge-cloud/errors.mjs";

function transactionHarness() {
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(String(sql));
      return { rows: [] };
    },
    release() {
      released = true;
    }
  };
  return {
    pool: { async connect() { return client; } },
    queries,
    released: () => released
  };
}

test("transaction commits and releases on success", async () => {
  const harness = transactionHarness();
  const value = await withKnowledgeTransaction(harness.pool, async (client) => {
    await client.query("SELECT work");
    return 42;
  });
  assert.equal(value, 42);
  assert.deepEqual(harness.queries, ["BEGIN", "SELECT work", "COMMIT"]);
  assert.equal(harness.released(), true);
});

test("transaction rolls back, releases, and preserves the callback error", async () => {
  const harness = transactionHarness();
  const original = new Error("callback failed");
  await assert.rejects(
    withKnowledgeTransaction(harness.pool, async () => {
      throw original;
    }),
    (error) => error === original
  );
  assert.deepEqual(harness.queries, ["BEGIN", "ROLLBACK"]);
  assert.equal(harness.released(), true);
});

test("transaction destroys a client when rollback itself fails", async () => {
  const original = new Error("callback failed");
  const rollbackFailure = new Error("connection lost during rollback");
  let releasedWith;
  const pool = {
    async connect() {
      return {
        async query(sql) {
          if (sql === "ROLLBACK") throw rollbackFailure;
          return { rows: [] };
        },
        release(error) {
          releasedWith = error;
        }
      };
    }
  };
  await assert.rejects(
    withKnowledgeTransaction(pool, async () => {
      throw original;
    }),
    (error) => error === original && error.rollbackError === rollbackFailure
  );
  assert.equal(releasedWith, rollbackFailure);
});

test("repositories share one injectable query boundary inside transactions", async () => {
  const harness = transactionHarness();
  harness.pool.query = async (sql) => {
    if (String(sql).includes("SELECT 1")) return { rows: [{ ok: 1 }] };
    if (String(sql).includes("pg_extension")) return { rows: [{ extversion: "0.8.1" }] };
    return { rows: [] };
  };
  const repositories = createKnowledgeRepositories(harness.pool);
  assert.equal(await repositories.schema.ping(), true);
  assert.equal(await repositories.schema.vectorExtensionVersion(), "0.8.1");
  await repositories.transaction(async (transaction) => {
    assert.equal(typeof transaction.schema.ping, "function");
    assert.equal(typeof transaction.auth.findInviteByCodeHash, "function");
    assert.equal(typeof transaction.admin.insertAudit, "function");
    assert.equal(typeof transaction.retrieval.searchSimilar, "function");
  });
  assert.equal(harness.released(), true);
});

test("runtime leaves public service healthy when knowledge configuration is missing", async () => {
  const logs = [];
  const runtime = await initializeKnowledgeRuntime({
    env: { KNOWLEDGE_ENABLED: "true" },
    logger: { warn(value) { logs.push(value); } }
  });
  assert.equal(runtime.available, false);
  assert.equal(runtime.reasonCode, KNOWLEDGE_ERROR_CODES.CONFIG_MISSING);
  assert.equal(publicKnowledgeRuntimeStatus(runtime).state, "unavailable");
  assert.equal(logs.length, 1);
});

test("ready runtime verifies migrations and vector extension before exposure", async () => {
  let closed = 0;
  const pool = { async end() { closed += 1; } };
  const runtime = await initializeKnowledgeRuntime({
    env: {},
    logger: { info() {}, warn() {} },
    configLoader: () => ({
      enabled: true,
      database: { connectionString: "postgresql://redacted" },
      cos: { secretId: "id", secretKey: "secret" },
      auth: { tokenSecret: "x".repeat(32), sessionTtlSeconds: 1209600 },
      publicOrigin: "https://ai.example.com"
    }),
    poolFactory: () => pool,
    repositoryFactory: () => ({
      schema: {
        async ping() { return true; },
        async vectorExtensionVersion() { return "0.8.1"; }
      }
    }),
    migrationVerifier: async () => ({ applied: [{ version: 1 }, { version: 2 }], pending: [] })
  });
  assert.equal(runtime.available, true);
  assert.equal(runtime.schemaVersion, 2);
  assert.equal(publicKnowledgeRuntimeStatus(runtime).vectorVersion, "0.8.1");
  await runtime.close();
  assert.equal(closed, 1);
});
