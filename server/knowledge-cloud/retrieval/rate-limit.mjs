import { hashKnowledgeSecret } from "../auth/crypto.mjs";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../errors.mjs";

const RETRIEVAL_WINDOW_SECONDS = 60;
const RETRIEVAL_BUCKET = "retrieval";

export function createKnowledgeRetrievalRateLimiter({
  repository,
  tokenSecret,
  cryptoModule
} = {}) {
  if (!repository?.consumeRateLimit) {
    throw new TypeError("Knowledge retrieval rate limiter requires the auth rate-limit repository");
  }
  if (String(tokenSecret || "").length < 32) {
    throw new TypeError("Knowledge retrieval rate limiter requires a token secret");
  }

  return Object.freeze({
    async consume(accountId, limit) {
      const maximum = Number(limit);
      if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 10_000) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "检索频率限制无效", {
          status: 500
        });
      }
      const subjectHash = hashKnowledgeSecret(
        `account:${accountId}`,
        "rate-limit",
        tokenSecret,
        cryptoModule ? { cryptoModule } : undefined
      );
      const result = await repository.consumeRateLimit({
        bucket: RETRIEVAL_BUCKET,
        subjectHash,
        windowSeconds: RETRIEVAL_WINDOW_SECONDS,
        maxAttempts: maximum,
        blockSeconds: RETRIEVAL_WINDOW_SECONDS
      });
      if (result.blocked) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.RATE_LIMITED, "知识库检索请求过于频繁", {
          status: 429,
          details: {
            limit: maximum,
            retryAfterSeconds: Math.max(1, result.retryAfterSeconds || RETRIEVAL_WINDOW_SECONDS)
          }
        });
      }
      return result;
    }
  });
}

export const KNOWLEDGE_RETRIEVAL_RATE_LIMIT = Object.freeze({
  bucket: RETRIEVAL_BUCKET,
  windowSeconds: RETRIEVAL_WINDOW_SECONDS
});
