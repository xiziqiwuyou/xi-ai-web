import assert from "node:assert/strict";
import test from "node:test";
import { requireKnowledgeEmbeddingProfile } from "../../server/knowledge-cloud/embedding-profiles.mjs";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../../server/knowledge-cloud/errors.mjs";
import {
  KNOWLEDGE_RETRIEVAL_BOUNDS,
  deduplicateAdjacentChunks,
  fuseRetrievalResults
} from "../../server/knowledge-cloud/retrieval/fusion.mjs";
import { createKnowledgeRetrievalService } from "../../server/knowledge-cloud/retrieval/service.mjs";

const accountId = "00000000-0000-4000-8000-000000000001";
const otherAccountId = "00000000-0000-4000-8000-000000000002";
const baseOneId = "00000000-0000-4000-8000-000000000101";
const baseTwoId = "00000000-0000-4000-8000-000000000102";
const openai = requireKnowledgeEmbeddingProfile("openai-text-embedding-3-small");
const qwen = requireKnowledgeEmbeddingProfile("qwen-text-embedding-v4");

function base(id, profile = openai, overrides = {}) {
  return {
    id,
    accountId,
    name: id === baseOneId ? "产品资料" : "支持手册",
    status: "active",
    documentCount: 2,
    readyDocumentCount: 2,
    activeIndexVersion: 1,
    pendingIndexVersion: null,
    profile: {
      vendor: profile.vendor,
      catalogModelId: profile.id,
      actualModel: profile.actualModel,
      dimensions: profile.dimensions,
      fingerprint: profile.fingerprint
    },
    activeIndex: {
      id: id === baseOneId
        ? "00000000-0000-4000-8000-000000000201"
        : "00000000-0000-4000-8000-000000000202",
      version: 1,
      status: "active",
      chunkVersion: 1,
      profile: {
        vendor: profile.vendor,
        catalogModelId: profile.id,
        actualModel: profile.actualModel,
        dimensions: profile.dimensions,
        fingerprint: profile.fingerprint
      }
    },
    ...overrides
  };
}

function hit({ baseId, documentId, chunkId, ordinal, similarity, text = "source" }) {
  return {
    knowledgeBaseId: baseId,
    knowledgeBaseName: baseId === baseOneId ? "产品资料" : "支持手册",
    documentId,
    documentName: `${documentId}.txt`,
    chunkId,
    ordinal,
    text,
    locator: { kind: "text", startLine: ordinal * 10 + 1, endLine: ordinal * 10 + 5 },
    similarity,
    indexVersionId: baseId === baseOneId ? "index-1" : "index-2",
    indexVersion: 1
  };
}

function createHarness({
  bases = [base(baseOneId), base(baseTwoId)],
  providerFailure,
  enhancementFailure,
  settings = {}
} = {}) {
  const state = {
    providerCalls: [],
    enhancementCalls: [],
    searchCalls: [],
    fullTextCalls: [],
    rateCalls: []
  };
  const retrievalRepository = {
    async findRetrievalContext(ownerId) {
      return {
        account: { id: ownerId, status: "active", limitOverrides: {} },
        settings: {
          maxRetrievalTopK: 2,
          retrievalRequestsPerMinutePerAccount: 7,
          queryRewriteEnabled: false,
          rerankEnabled: false,
          ...settings
        }
      };
    },
    async findBasesForRetrieval(ownerId, ids) {
      if (ownerId !== accountId) return [];
      return bases.filter((entry) => ids.includes(entry.id));
    },
    async searchSimilar(input) {
      state.searchCalls.push(input);
      const documentId = input.knowledgeBaseId === baseOneId
        ? "00000000-0000-4000-8000-000000000301"
        : "00000000-0000-4000-8000-000000000302";
      return [
        hit({ baseId: input.knowledgeBaseId, documentId, chunkId: `${documentId.slice(0, -1)}1`, ordinal: 1, similarity: 0.9 }),
        hit({ baseId: input.knowledgeBaseId, documentId, chunkId: `${documentId.slice(0, -1)}2`, ordinal: 2, similarity: 0.89 }),
        hit({ baseId: input.knowledgeBaseId, documentId, chunkId: `${documentId.slice(0, -1)}3`, ordinal: 5, similarity: 0.7 })
      ];
    },
    async searchFullText(input) {
      state.fullTextCalls.push(input);
      const documentId = input.knowledgeBaseId === baseOneId
        ? "00000000-0000-4000-8000-000000000301"
        : "00000000-0000-4000-8000-000000000302";
      return [
        { ...hit({ baseId: input.knowledgeBaseId, documentId, chunkId: `${documentId.slice(0, -1)}1`, ordinal: 1, similarity: 0.1 }), fullTextRank: 0.8 },
        { ...hit({ baseId: input.knowledgeBaseId, documentId, chunkId: `${documentId.slice(0, -1)}3`, ordinal: 5, similarity: 0.1 }), fullTextRank: 0.6 }
      ];
    }
  };
  const repositories = {
    retrieval: retrievalRepository,
    transaction: async (work) => work({ retrieval: retrievalRepository })
  };
  const rateLimiter = {
    async consume(ownerId, limit) {
      state.rateCalls.push({ ownerId, limit });
    }
  };
  const provider = {
    async embed(input) {
      state.providerCalls.push(input);
      if (providerFailure && input.profile.id === providerFailure.profileId) {
        throw providerFailure.error;
      }
      return {
        embeddings: [Array.from({ length: input.profile.dimensions }, () => 0.25)],
        usage: {}
      };
    }
  };
  const enhancementProvider = {
    async rewrite(input) {
      state.enhancementCalls.push({ operation: "rewrite", input });
      if (enhancementFailure?.operation === "rewrite") throw enhancementFailure.error;
      return "rewritten product configuration";
    },
    async rerank(input) {
      state.enhancementCalls.push({ operation: "rerank", input });
      if (enhancementFailure?.operation === "rerank") throw enhancementFailure.error;
      return [...input.candidates].reverse().map((candidate, index) => ({
        ...candidate,
        rerankRank: index + 1
      }));
    }
  };
  return {
    state,
    service: createKnowledgeRetrievalService({
      repositories,
      rateLimiter,
      provider,
      enhancementProvider,
      maximumContextBytes: 4096
    })
  };
}

test("retrieval embeds once per exact profile group, enforces server limits and emits one citation per context chunk", async () => {
  const secondBase = base(baseTwoId, openai, {
    activeIndexVersion: 2,
    activeIndex: { ...base(baseTwoId).activeIndex, version: 2 }
  });
  const { service, state } = createHarness({ bases: [base(baseOneId), secondBase] });
  const result = await service.retrieve(accountId, {
    query: "How do I configure the product?",
    knowledgeBaseIds: [baseOneId, baseTwoId],
    topK: 999,
    trace: true,
    connections: {
      openai: { baseUrl: openai.defaultBaseUrl, apiKey: "request-only-openai-key" }
    }
  });
  assert.equal(state.providerCalls.length, 1);
  assert.deepEqual(state.providerCalls[0].input, ["How do I configure the product?"]);
  assert.equal(state.searchCalls.length, 2);
  assert.deepEqual(result.profileGroups[0].indexVersions, [1, 2]);
  assert.deepEqual(result.trace?.profiles[0].indexVersions, [1, 2]);
  assert.deepEqual(state.rateCalls, [{ ownerId: accountId, limit: 7 }]);
  assert.equal(result.topK, 2);
  assert.equal(result.maxTopK, 2);
  assert.equal(result.chunks.length, result.citations.length);
  assert(result.chunks.length <= 2);
  assert(result.chunks.every((chunk, index) => chunk.citationId === result.citations[index].id));
  assert(result.citations.every((citation) => citation.source.openPath.includes(citation.chunkId)));
  assert(result.contextBytes <= 4096);
  assert.match(result.context, /UNTRUSTED_KNOWLEDGE_CONTEXT/);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("request-only-openai-key"), false);
  assert.equal(serialized.includes(openai.defaultBaseUrl), false);
});

test("cross-account, stale-index and missing-key preflight failures occur before provider access", async () => {
  const crossAccount = createHarness();
  await assert.rejects(
    crossAccount.service.retrieve(otherAccountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId],
      connections: { openai: { baseUrl: openai.defaultBaseUrl, apiKey: "key" } }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND
  );
  assert.equal(crossAccount.state.providerCalls.length, 0);

  const stale = createHarness({ bases: [base(baseOneId, openai, {
    activeIndex: { ...base(baseOneId).activeIndex, status: "building" }
  })] });
  await assert.rejects(
    stale.service.retrieve(accountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId],
      connections: { openai: { baseUrl: openai.defaultBaseUrl, apiKey: "key" } }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.INDEX_NOT_READY
  );
  assert.equal(stale.state.providerCalls.length, 0);

  const missingKey = createHarness({ bases: [base(baseOneId)] });
  await assert.rejects(
    missingKey.service.retrieve(accountId, { query: "query", knowledgeBaseIds: [baseOneId] }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.EMBEDDING_CONNECTION_REQUIRED
  );
  assert.equal(missingKey.state.providerCalls.length, 0);
  assert.equal(missingKey.state.searchCalls.length, 0);
});

test("duplicate selections fail while partially indexed bases keep their active index readable", async () => {
  const duplicate = createHarness({ bases: [base(baseOneId)] });
  await assert.rejects(
    duplicate.service.retrieve(accountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId, baseOneId],
      connection: { baseUrl: openai.defaultBaseUrl, apiKey: "key" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.INVALID_REQUEST
  );
  assert.equal(duplicate.state.providerCalls.length, 0);

  const partial = createHarness({ bases: [base(baseOneId, openai, {
    documentCount: 2,
    readyDocumentCount: 1
  })] });
  const result = await partial.service.retrieve(accountId, {
    query: "query",
    knowledgeBaseIds: [baseOneId],
    connection: { baseUrl: openai.defaultBaseUrl, apiKey: "key" }
  });
  assert(result.chunks.length > 0);
  assert.equal(partial.state.providerCalls.length, 1);
  assert.equal(partial.state.searchCalls.length, 1);

  const empty = createHarness({ bases: [base(baseOneId, openai, {
    documentCount: 1,
    readyDocumentCount: 0
  })] });
  await assert.rejects(
    empty.service.retrieve(accountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId],
      connection: { apiKey: "key" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.INDEX_NOT_READY
  );
  assert.equal(empty.state.providerCalls.length, 0);
});

test("a partial embedding-provider failure aborts all searches and redacts request credentials", async () => {
  const apiKey = "provider-secret-that-must-not-leak";
  const baseUrl = "https://private.embedding.example/v1";
  const failure = knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR, apiKey, {
    status: 502,
    details: { upstreamStatus: 503, upstreamCode: apiKey, providerMessage: baseUrl }
  });
  const { service, state } = createHarness({
    bases: [base(baseOneId, openai), base(baseTwoId, qwen)],
    providerFailure: { profileId: qwen.id, error: failure }
  });
  await assert.rejects(
    service.retrieve(accountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId, baseTwoId],
      connections: {
        openai: { baseUrl, apiKey },
        qwen: { baseUrl: qwen.defaultBaseUrl, apiKey }
      }
    }),
    (error) => {
      const serialized = JSON.stringify({ message: error.message, details: error.details });
      assert.equal(error.code, KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR);
      assert.equal(serialized.includes(apiKey), false);
      assert.equal(serialized.includes(baseUrl), false);
      return true;
    }
  );
  assert.equal(state.providerCalls.length, 2);
  assert.equal(state.searchCalls.length, 0);
});

test("fusion and adjacent-chunk suppression are deterministic", () => {
  const documentId = "document-1";
  const candidates = [
    hit({ baseId: baseOneId, documentId, chunkId: "chunk-b", ordinal: 2, similarity: 0.8 }),
    hit({ baseId: baseOneId, documentId, chunkId: "chunk-a", ordinal: 1, similarity: 0.8 }),
    hit({ baseId: baseOneId, documentId, chunkId: "chunk-c", ordinal: 5, similarity: 0.7 })
  ];
  const first = deduplicateAdjacentChunks(fuseRetrievalResults([{ hits: candidates }]));
  const second = deduplicateAdjacentChunks(fuseRetrievalResults([{ hits: [...candidates].reverse() }]));
  assert.deepEqual(first.map((entry) => entry.chunkId), second.map((entry) => entry.chunkId));
  assert.equal(first.length, 2);
});

test("query and query-context bytes are bounded before repository or provider work", async () => {
  const { service, state } = createHarness({ bases: [base(baseOneId)] });
  await assert.rejects(
    service.retrieve(accountId, {
      query: "x".repeat(KNOWLEDGE_RETRIEVAL_BOUNDS.maxQueryBytes + 1),
      knowledgeBaseIds: [baseOneId]
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.REQUEST_TOO_LARGE
  );
  await assert.rejects(
    service.retrieve(accountId, {
      query: "query",
      context: "x".repeat(KNOWLEDGE_RETRIEVAL_BOUNDS.maxQueryContextBytes + 1),
      knowledgeBaseIds: [baseOneId]
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.REQUEST_TOO_LARGE
  );
  assert.equal(state.providerCalls.length, 0);
  assert.equal(state.searchCalls.length, 0);
});

test("fulltext mode skips embedding while hybrid mode applies standard RRF", async () => {
  const fulltext = createHarness({ bases: [base(baseOneId)] });
  const fulltextResult = await fulltext.service.retrieve(accountId, {
    query: "configure product",
    knowledgeBaseIds: [baseOneId],
    mode: "fulltext"
  });
  assert.equal(fulltextResult.mode, "fulltext");
  assert.equal(fulltext.state.providerCalls.length, 0);
  assert.equal(fulltext.state.searchCalls.length, 0);
  assert.equal(fulltext.state.fullTextCalls.length, 1);

  const hybrid = createHarness({ bases: [base(baseOneId)] });
  const hybridResult = await hybrid.service.retrieve(accountId, {
    query: "configure product",
    knowledgeBaseIds: [baseOneId],
    mode: "hybrid",
    trace: true,
    connection: { apiKey: "request-only-key" }
  });
  assert.equal(hybridResult.mode, "hybrid");
  assert.equal(hybrid.state.searchCalls.length, 1);
  assert.equal(hybrid.state.fullTextCalls.length, 1);
  assert.equal(hybridResult.trace.candidates[0].scores.rrf, Number((2 / 61).toFixed(8)));
});

test("minimum relevance, token budgets and disabled enhancements are request scoped", async () => {
  const { service, state } = createHarness({ bases: [base(baseOneId)] });
  const result = await service.retrieve(accountId, {
    query: "query",
    knowledgeBaseIds: [baseOneId],
    minimumRelevance: 0.99,
    contextTokenBudget: 64,
    trace: true,
    connection: { apiKey: "request-only-key" }
  });
  assert.equal(result.chunks.length, 0);
  assert(result.contextTokens <= result.contextTokenBudget);
  assert.equal(result.trace.stages.filter.belowMinimumRelevance, 3);
  await assert.rejects(
    service.retrieve(accountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId],
      queryRewrite: { enabled: true }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.RETRIEVAL_ENHANCEMENT_DISABLED
  );
  assert.equal(state.providerCalls.length, 1);
  assert.equal(state.enhancementCalls.length, 0);
});

test("query rewrite is admin gated, uses a transient connection and drives both recall paths", async () => {
  const { service, state } = createHarness({
    bases: [base(baseOneId)],
    settings: { queryRewriteEnabled: true }
  });
  const secret = "request-only-enhancement-secret";
  const result = await service.retrieve(accountId, {
    query: "configure it",
    queryContext: "The user means the product deployment guide.",
    knowledgeBaseIds: [baseOneId],
    mode: "hybrid",
    connection: { apiKey: "embedding-key" },
    queryRewrite: { enabled: true },
    enhancementConnection: { apiKey: secret, modelId: "rewrite-model" },
    trace: true
  });

  assert.equal(state.enhancementCalls.length, 1);
  assert.equal(state.enhancementCalls[0].operation, "rewrite");
  assert.equal(state.providerCalls[0].input[0], "rewritten product configuration\n\nThe user means the product deployment guide.");
  assert.equal(state.fullTextCalls[0].query, "rewritten product configuration");
  assert.equal(result.trace.effectiveQuery, "rewritten product configuration");
  assert.equal(result.trace.stages.rewrite.status, "applied");
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("missing embedding credentials fail before query enhancement incurs provider work", async () => {
  const { service, state } = createHarness({
    bases: [base(baseOneId)],
    settings: { queryRewriteEnabled: true }
  });
  await assert.rejects(
    service.retrieve(accountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId],
      queryRewrite: { enabled: true },
      enhancementConnection: { apiKey: "temporary-key", modelId: "rewrite-model" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.EMBEDDING_CONNECTION_REQUIRED
  );
  assert.equal(state.enhancementCalls.length, 0);
  assert.equal(state.providerCalls.length, 0);
});

test("rerank failure falls back only when explicitly requested", async () => {
  const failure = knowledgeError(
    KNOWLEDGE_ERROR_CODES.RETRIEVAL_ENHANCEMENT_PROVIDER_ERROR,
    "provider failed",
    { status: 502 }
  );
  const strict = createHarness({
    bases: [base(baseOneId)],
    settings: { rerankEnabled: true },
    enhancementFailure: { operation: "rerank", error: failure }
  });
  await assert.rejects(
    strict.service.retrieve(accountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId],
      mode: "fulltext",
      rerank: { enabled: true, allowFallback: false },
      enhancementConnection: { apiKey: "temporary-key", modelId: "rerank-model" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.RETRIEVAL_ENHANCEMENT_PROVIDER_ERROR
  );
  assert.equal(strict.state.enhancementCalls.length, 1);

  const fallback = createHarness({
    bases: [base(baseOneId)],
    settings: { rerankEnabled: true },
    enhancementFailure: { operation: "rerank", error: failure }
  });
  const result = await fallback.service.retrieve(accountId, {
    query: "query",
    knowledgeBaseIds: [baseOneId],
    mode: "fulltext",
    rerank: { enabled: true, allowFallback: true },
    enhancementConnection: { apiKey: "temporary-key", modelId: "rerank-model" },
    trace: true
  });
  assert.equal(result.trace.stages.rerank.status, "fallback");
  assert(result.chunks.length > 0);
});

test("cross-account enhancement requests fail before model, embedding or recall access", async () => {
  const { service, state } = createHarness({
    settings: { queryRewriteEnabled: true, rerankEnabled: true }
  });
  await assert.rejects(
    service.retrieve(otherAccountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId],
      queryRewrite: { enabled: true },
      rerank: { enabled: true, allowFallback: true },
      enhancementConnection: { apiKey: "temporary-key", modelId: "chat-model" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND
  );
  assert.equal(state.enhancementCalls.length, 0);
  assert.equal(state.providerCalls.length, 0);
  assert.equal(state.searchCalls.length, 0);
  assert.equal(state.fullTextCalls.length, 0);
});
