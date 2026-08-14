import assert from "node:assert/strict";
import test from "node:test";
import { KNOWLEDGE_ERROR_CODES } from "../../server/knowledge-cloud/errors.mjs";
import {
  createKnowledgeRetrievalEnhancementProvider,
  normalizeKnowledgeEnhancementConnection
} from "../../server/knowledge-cloud/retrieval/enhancement-provider.mjs";

const catalog = [{
  id: "knowledge-chat-model",
  label: "Knowledge Chat",
  model: "provider/knowledge-chat",
  vendor: "openai",
  endpointProtocol: "openai-responses",
  capabilities: ["chat"],
  enabled: true
}];

test("enhancement connections accept only a transient key and catalog model id", () => {
  assert.deepEqual(
    normalizeKnowledgeEnhancementConnection({ apiKey: "sk-session-only", modelId: "knowledge-chat-model" }),
    { apiKey: "sk-session-only", modelId: "knowledge-chat-model" }
  );
  assert.throws(
    () => normalizeKnowledgeEnhancementConnection({
      apiKey: "sk-session-only",
      modelId: "knowledge-chat-model",
      baseUrl: "https://attacker.example"
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.INVALID_REQUEST
  );
});

test("rewrite and rerank use the managed upstream and bounded catalog model", async () => {
  const providerCalls = [];
  const completionCalls = [];
  const outputs = [
    '{"query":"rewritten deployment instructions"}',
    '{"order":["chunk-b","chunk-a"]}'
  ];
  const provider = createKnowledgeRetrievalEnhancementProvider({
    upstreamRef: { current: "https://api.xi-ai.cn" },
    modelCatalogRef: { current: catalog },
    adapterFactory(runtimeProvider) {
      providerCalls.push(runtimeProvider);
      return {
        async completeText(input) {
          completionCalls.push(input);
          return outputs.shift();
        }
      };
    }
  });
  const connection = normalizeKnowledgeEnhancementConnection({
    apiKey: "sk-session-only",
    modelId: "knowledge-chat-model"
  });

  const rewritten = await provider.rewrite({
    query: "how do I deploy it",
    queryContext: "The product is Xi AI.",
    connection
  });
  const reranked = await provider.rerank({
    query: rewritten,
    connection,
    candidates: [
      { chunkId: "chunk-a", text: "first" },
      { chunkId: "chunk-b", text: "second" },
      { chunkId: "chunk-c", text: "third" }
    ]
  });

  assert.equal(rewritten, "rewritten deployment instructions");
  assert.deepEqual(reranked.map((candidate) => candidate.chunkId), ["chunk-b", "chunk-a", "chunk-c"]);
  assert.deepEqual(reranked.map((candidate) => candidate.rerankRank), [1, 2, 3]);
  assert.equal(providerCalls.length, 2);
  assert(providerCalls.every((entry) => entry.baseUrl === "https://api.xi-ai.cn"));
  assert(providerCalls.every((entry) => entry.apiKey === "sk-session-only"));
  assert(providerCalls.every((entry) => entry.defaultModel === "provider/knowledge-chat"));
  assert(completionCalls.every((entry) => entry.model === "provider/knowledge-chat"));
});

test("disabled or non-chat catalog entries are rejected before adapter creation", async () => {
  let adapters = 0;
  const provider = createKnowledgeRetrievalEnhancementProvider({
    upstreamRef: { current: "https://api.xi-ai.cn" },
    modelCatalogRef: { current: [{ ...catalog[0], capabilities: ["image"] }] },
    adapterFactory() {
      adapters += 1;
      return { completeText: async () => "unused" };
    }
  });
  await assert.rejects(
    provider.rewrite({
      query: "query",
      connection: { apiKey: "sk-session-only", modelId: "knowledge-chat-model" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.RETRIEVAL_ENHANCEMENT_MODEL_INVALID
  );
  assert.equal(adapters, 0);
});
