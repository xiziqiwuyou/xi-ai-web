import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVED_KNOWLEDGE_EMBEDDING_PROFILES,
  requireKnowledgeEmbeddingProfile
} from "../../server/knowledge-cloud/embedding-profiles.mjs";
import {
  buildKnowledgeEmbeddingRequest,
  createKnowledgeEmbeddingProvider
} from "../../server/knowledge-cloud/embeddings/provider.mjs";
import { KNOWLEDGE_ERROR_CODES } from "../../server/knowledge-cloud/errors.mjs";

function responseFor(profile, count = 1) {
  return new Response(JSON.stringify({
    object: "list",
    data: Array.from({ length: count }, (_, index) => ({
      object: "embedding",
      index,
      embedding: Array.from({ length: profile.dimensions }, () => 0.125)
    })),
    model: profile.actualModel,
    usage: { prompt_tokens: 7, total_tokens: 7, ignored: "secret-shaped metadata" }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

test("approved OpenAI and Qwen profiles lock protocol, dimensions and safe batch metadata", () => {
  assert.deepEqual(
    APPROVED_KNOWLEDGE_EMBEDDING_PROFILES.map((profile) => [
      profile.id,
      profile.dimensions,
      profile.maxBatchInputs,
      profile.bytesPerComponent
    ]),
    [
      ["openai-text-embedding-3-small", 1536, 32, 4],
      ["openai-text-embedding-3-large", 3072, 32, 2],
      ["qwen-text-embedding-v4", 1024, 10, 4]
    ]
  );
  assert.equal(requireKnowledgeEmbeddingProfile("qwen-text-embedding-v4").maxInputTokens, 8192);
});

test("OpenAI embeddings use the documented endpoint, float encoding and fixed dimensions", async () => {
  const profile = requireKnowledgeEmbeddingProfile("openai-text-embedding-3-small");
  const calls = [];
  const provider = createKnowledgeEmbeddingProvider({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responseFor(profile);
    },
    requestTimeoutMs: 5000
  });
  const result = await provider.embed({
    profile,
    connection: { baseUrl: "https://api.openai.com/v1/", apiKey: "sk-test-openai-value" },
    input: ["hello"]
  });
  assert.equal(calls[0].url, "https://api.openai.com/v1/embeddings");
  assert.equal(calls[0].options.headers.Authorization, "Bearer sk-test-openai-value");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    model: "text-embedding-3-small",
    input: ["hello"],
    dimensions: 1536,
    encoding_format: "float"
  });
  assert.equal(result.embeddings[0].length, 1536);
  assert.deepEqual(result.usage, { prompt_tokens: 7, total_tokens: 7 });
});

test("Qwen uses its OpenAI-compatible request shape without OpenAI-only encoding metadata", async () => {
  const profile = requireKnowledgeEmbeddingProfile("qwen-text-embedding-v4");
  assert.deepEqual(buildKnowledgeEmbeddingRequest(profile, ["文档"]), {
    model: "text-embedding-v4",
    input: ["文档"],
    dimensions: 1024
  });
  let body;
  const provider = createKnowledgeEmbeddingProvider({
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return responseFor(profile);
    }
  });
  await provider.embed({
    profile,
    connection: {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "qwen-session-only-key"
    },
    input: ["文档"]
  });
  assert.equal("encoding_format" in body, false);
  assert.equal(body.dimensions, 1024);
});

test("provider failures and invalid dimensions redact transient connection secrets", async () => {
  const profile = requireKnowledgeEmbeddingProfile("openai-text-embedding-3-small");
  const apiKey = "sk-super-private-session-key";
  const baseUrl = "https://proxy.example.test/v1";
  const provider = createKnowledgeEmbeddingProvider({
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        code: "invalid_api_key",
        message: `Rejected ${apiKey} at ${baseUrl}`
      }
    }), { status: 401, headers: { "Content-Type": "application/json" } })
  });
  await assert.rejects(
    provider.embed({ profile, connection: { baseUrl, apiKey }, input: ["hello"] }),
    (error) => {
      assert.equal(error.code, KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR);
      const serialized = JSON.stringify({ message: error.message, details: error.details });
      assert.equal(serialized.includes(apiKey), false);
      assert.equal(serialized.includes(baseUrl), false);
      assert.match(serialized, /invalid_api_key/);
      return true;
    }
  );

  const wrongDimensionProvider = createKnowledgeEmbeddingProvider({
    fetchImpl: async () => new Response(JSON.stringify({
      data: [{ index: 0, embedding: [0.1, 0.2] }]
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  });
  await assert.rejects(
    wrongDimensionProvider.embed({ profile, connection: { baseUrl, apiKey }, input: ["hello"] }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR &&
      error.details.expectedDimensions === 1536
  );
});

test("provider-controlled error codes are reduced to a fixed non-secret classification", async () => {
  const profile = requireKnowledgeEmbeddingProfile("openai-text-embedding-3-small");
  const apiKey = "sk-code-injection-secret";
  const provider = createKnowledgeEmbeddingProvider({
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: `upstream-${apiKey}`, message: "rejected" }
    }), { status: 401, headers: { "Content-Type": "application/json" } })
  });
  await assert.rejects(
    provider.embed({
      profile,
      connection: { baseUrl: "https://proxy.example.test/v1", apiKey },
      input: ["hello"]
    }),
    (error) => {
      assert.equal(error.details.upstreamCode, "authentication_error");
      assert.equal(JSON.stringify(error.details).includes(apiKey), false);
      return true;
    }
  );
});
