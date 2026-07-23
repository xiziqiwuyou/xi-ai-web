import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeAuthRepository } from "../../server/knowledge-cloud/repositories/auth-repository.mjs";

test("identity lookups can acquire row locks for register and recovery transactions", async () => {
  const queries = [];
  const repository = createKnowledgeAuthRepository({
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      return { rows: [] };
    }
  });
  await repository.findAccountByNormalizedUsername("alice", { forUpdate: true });
  await repository.findInviteByCodeHash(Buffer.alloc(32), { forUpdate: true });
  assert.match(queries[0].sql, /WHERE normalized_username = \$1 FOR UPDATE/);
  assert.match(queries[1].sql, /WHERE code_hash = \$1 FOR UPDATE/);
});

test("shared rate limits use one atomic upsert", async () => {
  let captured;
  const repository = createKnowledgeAuthRepository({
    async query(sql, params) {
      captured = { sql: String(sql), params };
      return { rows: [{ attempts: 2, blocked: false, retry_after_seconds: 0 }] };
    }
  });
  const result = await repository.consumeRateLimit({
    bucket: "login",
    subjectHash: Buffer.alloc(32, 1),
    windowSeconds: 600,
    maxAttempts: 5,
    blockSeconds: 900
  });
  assert.deepEqual(result, { attempts: 2, blocked: false, retryAfterSeconds: 0 });
  assert.match(captured.sql, /ON CONFLICT \(bucket, subject_hash\) DO UPDATE/);
  assert.match(captured.sql, /make_interval\(secs => \$3\)/);
  assert.equal(captured.params[3], 5);
});
