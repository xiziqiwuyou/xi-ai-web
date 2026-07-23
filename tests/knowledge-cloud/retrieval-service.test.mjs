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

function createHarness({ bases = [base(baseOneId), base(baseTwoId)], providerFailure } = {}) {
  const state = { providerCalls: [], searchCalls: [], rateCalls: [] };
  const retrievalRepository = {
    async findRetrievalContext(ownerId) {
      return {
        account: { id: ownerId, status: "active", limitOverrides: {} },
        settings: {
          maxRetrievalTopK: 2,
          retrievalRequestsPerMinutePerAccount: 7
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
  return {
    state,
    service: createKnowledgeRetrievalService({
      repositories,
      rateLimiter,
      provider,
      maximumContextBytes: 4096
    })
  };
}

test("retrieval embeds once per exact profile group, enforces server limits and emits one citation per context chunk", async () => {
  const { service, state } = createHarness();
  const result = await service.retrieve(accountId, {
    query: "How do I configure the product?",
    knowledgeBaseIds: [baseOneId, baseTwoId],
    topK: 999,
    connections: {
      openai: { baseUrl: openai.defaultBaseUrl, apiKey: "request-only-openai-key" }
    }
  });
  assert.equal(state.providerCalls.length, 1);
  assert.deepEqual(state.providerCalls[0].input, ["How do I configure the product?"]);
  assert.equal(state.searchCalls.length, 2);
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

test("duplicate selections and partially indexed bases fail before provider access", async () => {
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
  await assert.rejects(
    partial.service.retrieve(accountId, {
      query: "query",
      knowledgeBaseIds: [baseOneId],
      connection: { baseUrl: openai.defaultBaseUrl, apiKey: "key" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.INDEX_NOT_READY
  );
  assert.equal(partial.state.providerCalls.length, 0);
  assert.equal(partial.state.searchCalls.length, 0);
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
