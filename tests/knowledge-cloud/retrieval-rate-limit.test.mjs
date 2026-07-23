import assert from "node:assert/strict";
import test from "node:test";
import { KNOWLEDGE_ERROR_CODES } from "../../server/knowledge-cloud/errors.mjs";
import {
  KNOWLEDGE_RETRIEVAL_RATE_LIMIT,
  createKnowledgeRetrievalRateLimiter
} from "../../server/knowledge-cloud/retrieval/rate-limit.mjs";

test("retrieval rate limiting uses a secret-derived account bucket and returns Retry-After data", async () => {
  const calls = [];
  const repository = {
    async consumeRateLimit(input) {
      calls.push(input);
      return { attempts: 3, blocked: calls.length > 1, retryAfterSeconds: 17 };
    }
  };
  const limiter = createKnowledgeRetrievalRateLimiter({
    repository,
    tokenSecret: "knowledge-rate-limit-secret-0123456789"
  });

  await limiter.consume("00000000-0000-4000-8000-000000000001", 2);
  assert.equal(calls[0].bucket, KNOWLEDGE_RETRIEVAL_RATE_LIMIT.bucket);
  assert.equal(calls[0].windowSeconds, 60);
  assert.equal(calls[0].maxAttempts, 2);
  assert.equal(Buffer.isBuffer(calls[0].subjectHash), true);
  assert.equal(calls[0].subjectHash.byteLength, 32);

  await assert.rejects(
    limiter.consume("00000000-0000-4000-8000-000000000001", 2),
    (error) =>
      error.code === KNOWLEDGE_ERROR_CODES.RATE_LIMITED &&
      error.status === 429 &&
      error.details.retryAfterSeconds === 17
  );
});
