import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgePool } from "../../server/knowledge-cloud/db.mjs";

test("knowledge pool verifies certificates for every TLS-enabled mode", () => {
  let options;
  class FakePool {
    constructor(value) { options = value; }
  }
  createKnowledgePool({
    connectionString: "postgresql://runtime:secret@db.example.com/knowledge",
    sslMode: "require",
    sslCa: "test-ca",
    connectionTimeoutMs: 5000,
    poolMax: 4
  }, { PoolClass: FakePool });
  assert.deepEqual(options.ssl, { rejectUnauthorized: true, ca: "test-ca" });
});
