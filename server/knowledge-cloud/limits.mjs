const GIB = 1024 ** 3;
const TIB = 1024 ** 4;

export const KNOWLEDGE_RUNTIME_LIMIT_BOUNDS = Object.freeze({
  defaultQuotaBytes: Object.freeze({ min: 0, max: 10 * TIB }),
  maxKnowledgeBasesPerAccount: Object.freeze({ min: 1, max: 1000 }),
  maxDocumentsPerAccount: Object.freeze({ min: 1, max: 1_000_000 }),
  maxDocumentsPerKnowledgeBase: Object.freeze({ min: 1, max: 100_000 }),
  maxFileBytes: Object.freeze({ min: 1024, max: 5 * GIB }),
  maxChunksPerAccount: Object.freeze({ min: 1, max: 10_000_000 }),
  maxConcurrentUploadsPerAccount: Object.freeze({ min: 1, max: 100 }),
  maxConcurrentIngestionsPerAccount: Object.freeze({ min: 1, max: 100 }),
  maxConcurrentEmbeddingsPerAccount: Object.freeze({ min: 1, max: 100 }),
  retrievalRequestsPerMinutePerAccount: Object.freeze({ min: 1, max: 10_000 }),
  maxRetrievalTopK: Object.freeze({ min: 1, max: 20 })
});

export const KNOWLEDGE_ACCOUNT_OVERRIDE_BOUNDS = Object.freeze({
  quotaBytes: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.defaultQuotaBytes,
  maxKnowledgeBasesPerAccount: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxKnowledgeBasesPerAccount,
  maxDocumentsPerAccount: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxDocumentsPerAccount,
  maxDocumentsPerKnowledgeBase: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxDocumentsPerKnowledgeBase,
  maxFileBytes: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxFileBytes,
  maxChunksPerAccount: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxChunksPerAccount,
  maxConcurrentUploadsPerAccount: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxConcurrentUploadsPerAccount,
  maxConcurrentIngestionsPerAccount: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxConcurrentIngestionsPerAccount,
  maxConcurrentEmbeddingsPerAccount: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxConcurrentEmbeddingsPerAccount,
  retrievalRequestsPerMinutePerAccount: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.retrievalRequestsPerMinutePerAccount,
  maxRetrievalTopK: KNOWLEDGE_RUNTIME_LIMIT_BOUNDS.maxRetrievalTopK
});

export function inheritedKnowledgeLimits(settings) {
  return {
    quotaBytes: settings.defaultQuotaBytes,
    maxKnowledgeBasesPerAccount: settings.maxKnowledgeBasesPerAccount,
    maxDocumentsPerAccount: settings.maxDocumentsPerAccount,
    maxDocumentsPerKnowledgeBase: settings.maxDocumentsPerKnowledgeBase,
    maxFileBytes: settings.maxFileBytes,
    maxChunksPerAccount: settings.maxChunksPerAccount,
    maxConcurrentUploadsPerAccount: settings.maxConcurrentUploadsPerAccount,
    maxConcurrentIngestionsPerAccount: settings.maxConcurrentIngestionsPerAccount,
    maxConcurrentEmbeddingsPerAccount: settings.maxConcurrentEmbeddingsPerAccount,
    retrievalRequestsPerMinutePerAccount: settings.retrievalRequestsPerMinutePerAccount,
    maxRetrievalTopK: settings.maxRetrievalTopK
  };
}

export function canonicalKnowledgeLimitOverrides(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [key, bounds] of Object.entries(KNOWLEDGE_ACCOUNT_OVERRIDE_BOUNDS)) {
    if (!(key in source)) continue;
    const number = Number(source[key]);
    if (Number.isSafeInteger(number) && number >= bounds.min && number <= bounds.max) {
      result[key] = number;
    }
  }
  return result;
}

export function resolveKnowledgeEffectiveLimits(settings, account) {
  return {
    ...inheritedKnowledgeLimits(settings),
    ...canonicalKnowledgeLimitOverrides(account?.limitOverrides)
  };
}
