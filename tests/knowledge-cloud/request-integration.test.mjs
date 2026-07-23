import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import {
  combineCloudKnowledgeSearchChunks,
  composeCloudKnowledgeSystemContext,
  createCloudKnowledgeRequestIntegration,
  isCloudKnowledgePublicRequest,
  withCloudKnowledgeCitations,
  withCloudKnowledgeResultRaw
} from "../../server/knowledge-cloud/retrieval/request-integration.mjs";
import { retrieveContext } from "../../server/knowledge/retrieval.mjs";
import {
  resolveRequestedTools,
  runTool as runRegisteredTool
} from "../../server/tools/registry.mjs";
import {
  KNOWLEDGE_ERROR_CODES,
  knowledgeError
} from "../../server/knowledge-cloud/errors.mjs";
import { knowledgeErrorMiddleware } from "../../server/knowledge-cloud/routes.mjs";

const publicOrigin = "https://app.example.test";
const sessionToken = "opaque-session-token";
const csrfToken = "request-csrf-token";
const accountId = "account-knowledge-1";
const baseIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222"
];

const citation = {
  id: "K01",
  knowledgeBaseId: baseIds[0],
  knowledgeBaseName: "Product docs",
  documentId: "document-1",
  documentName: "guide.txt",
  chunkId: "chunk-1",
  chunkOrdinal: 0,
  locator: { lines: { start: 1, end: 3 } },
  score: 0.91,
  mode: "vector",
  source: {
    method: "GET",
    openPath: "/api/kb/documents/document-1/source-url?chunkId=chunk-1&disposition=inline",
    downloadPath: "/api/kb/documents/document-1/source-url?chunkId=chunk-1&disposition=attachment"
  }
};

function runtimeFixture({ failRetrieval = false, retrievalResult } = {}) {
  const calls = {
    auth: [],
    csrf: [],
    retrieval: []
  };
  const auth = {
    cookieName: "xi_kb_session",
    async requireSession(token) {
      calls.auth.push(token);
      if (token !== sessionToken) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "需要登录知识库账号", {
          status: 401
        });
      }
      return {
        id: "knowledge-session-1",
        account: { id: accountId, status: "active" }
      };
    },
    verifyCsrf(session, token) {
      calls.csrf.push({ session, token });
      if (token !== csrfToken) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.CSRF_INVALID, "会话校验失败", {
          status: 403
        });
      }
    }
  };
  const retrieval = {
    async retrieve(ownerId, input, options) {
      calls.retrieval.push({ ownerId, input, options });
      if (failRetrieval) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR, "向量服务失败", {
          status: 502,
          details: {
            providerMessage: "embedding-request-secret",
            baseUrl: "https://private-embedding.example/v1"
          }
        });
      }
      return retrievalResult || {
        mode: "vector",
        topK: 6,
        context: "UNTRUSTED_KNOWLEDGE_CONTEXT\nsource text\nEND_UNTRUSTED_KNOWLEDGE_CONTEXT",
        contextTruncated: false,
        citations: [citation]
      };
    }
  };
  return {
    calls,
    runtime: {
      enabled: true,
      available: true,
      state: "ready",
      reasonCode: null,
      config: {
        publicOrigin,
        auth: { tokenSecret: "server-token-secret" },
        database: { connectionString: "postgres://server-only" },
        cos: { secretId: "server-cos-id", secretKey: "server-cos-key" }
      },
      auth,
      retrieval
    }
  };
}

function selectedRequest(overrides = {}) {
  return {
    headers: {
      origin: publicOrigin,
      cookie: `xi_kb_session=${sessionToken}`,
      "x-knowledge-csrf": csrfToken
    },
    body: {
      query: "body query must not be used",
      knowledgeBaseIds: baseIds,
      embeddingConnections: {
        openai: {
          profile: {
            nested: {
              baseUrl: "https://embedding.example/v1",
              apiKey: "embedding-secret"
            }
          }
        }
      },
      topK: 6,
      content: "main provider content",
      history: [{ role: "user", content: "private history" }],
      connection: { baseUrl: "https://main.example/v1", apiKey: "main-provider-secret" },
      searchService: { apiKey: "search-provider-secret" },
      contextChunks: [{ text: "legacy local chunk" }],
      ...overrides
    }
  };
}

async function withServer(runtime, providerCallback, work) {
  const integration = createCloudKnowledgeRequestIntegration(runtime);
  const app = express();
  app.use(express.json());

  for (const route of ["/api/chat/stream", "/api/agents/run"]) {
    app.post(route, async (req, res, next) => {
      try {
        const controller = new AbortController();
        req.on("aborted", () => controller.abort());
        const knowledge = await integration.preflight(req, {
          query: req.body.query,
          signal: controller.signal
        });
        const result = await providerCallback(route, knowledge);
        res.json(result || { ok: true });
      } catch (error) {
        next(error);
      }
    });
  }

  app.use((error, req, res, next) => {
    if (error?.code?.startsWith("KB_") && isCloudKnowledgePublicRequest(req)) {
      req.knowledgeRuntime = runtime;
      return knowledgeErrorMiddleware(error, req, res, next);
    }
    return next(error);
  });

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("omitted and empty cloud selections are a no-op for public requests", async () => {
  const fixture = runtimeFixture();
  const integration = createCloudKnowledgeRequestIntegration(fixture.runtime);
  const omitted = {
    headers: {},
    body: { content: "public chat", connection: { apiKey: "main-secret" } }
  };
  assert.equal(await integration.preflight(omitted, { query: "public chat" }), null);
  assert.equal(omitted.knowledgeSecrets, undefined);

  const empty = { headers: {}, body: { knowledgeBaseIds: [] } };
  assert.equal(await integration.preflight(empty, { query: "public chat" }), null);
  assert.deepEqual(fixture.calls.auth, []);
  assert.deepEqual(fixture.calls.retrieval, []);
});

test("cloud selection enforces exact Origin, opaque session and CSRF before retrieval", async () => {
  const fixture = runtimeFixture();
  const integration = createCloudKnowledgeRequestIntegration(fixture.runtime);

  const wrongOrigin = selectedRequest();
  wrongOrigin.headers.origin = "https://evil.example.test";
  await assert.rejects(
    integration.preflight(wrongOrigin, { query: "question" }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.ORIGIN_INVALID
  );
  assert.equal(fixture.calls.retrieval.length, 0);

  const missingSession = selectedRequest();
  missingSession.headers.cookie = "xi_kb_session=not-the-session";
  await assert.rejects(
    integration.preflight(missingSession, { query: "question" }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED
  );

  const missingCsrf = selectedRequest();
  delete missingCsrf.headers["x-knowledge-csrf"];
  await assert.rejects(
    integration.preflight(missingCsrf, { query: "question" }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CSRF_INVALID
  );
  assert.equal(fixture.calls.retrieval.length, 0);
});

test("shared preflight projects only retrieval fields and registers nested request secrets", async () => {
  const fixture = runtimeFixture({
    retrievalResult: {
      mode: "vector",
      topK: 4,
      context: "x".repeat(40 * 1024),
      contextTruncated: false,
      citations: [citation]
    }
  });
  const integration = createCloudKnowledgeRequestIntegration(fixture.runtime);
  const first = selectedRequest();
  const signal = new AbortController().signal;
  const result = await integration.preflight(first, { query: "projected query", signal });
  const call = fixture.calls.retrieval[0];

  assert.deepEqual(Object.keys(call.input).sort(), [
    "embeddingConnections",
    "knowledgeBaseIds",
    "query",
    "topK"
  ]);
  assert.equal(call.input.query, "projected query");
  assert.deepEqual(call.input.knowledgeBaseIds, baseIds);
  assert.equal(call.input.embeddingConnections, first.body.embeddingConnections);
  assert.equal(call.input.topK, 6);
  assert.equal(call.options.signal, signal);
  assert.equal(call.ownerId, accountId);
  assert.equal(result.metadata.mode, "vector");
  assert.deepEqual(result.metadata.knowledgeBaseIds, baseIds);
  assert.equal(result.metadata.topK, 4);
  assert.equal(result.metadata.contextTruncated, true);
  assert.deepEqual(result.knowledgeCitations, [citation]);

  for (const secret of [
    sessionToken,
    csrfToken,
    "https://embedding.example/v1",
    "embedding-secret"
  ]) {
    assert(first.knowledgeSecrets.includes(secret), `missing registered secret: ${secret}`);
  }
  assert(!first.knowledgeSecrets.includes("main-provider-secret"));
  assert(!first.knowledgeSecrets.includes("search-provider-secret"));
  assert.equal(JSON.stringify(result).includes("embedding-secret"), false);

  const second = selectedRequest({ topK: 3 });
  await integration.preflight(second, { query: "second route query" });
  assert.equal(fixture.calls.retrieval.length, 2, "both public routes must share the same retrieval service");
});

test("retrieval failure reaches knowledge middleware and never invokes the supplied provider callback", async () => {
  const fixture = runtimeFixture({ failRetrieval: true });
  let providerCalls = 0;
  await withServer(
    fixture.runtime,
    async () => {
      providerCalls += 1;
      return { shouldNotBeReturned: true };
    },
    async (baseUrl) => {
      for (const route of ["/api/chat/stream", "/api/agents/run"]) {
        const response = await fetch(`${baseUrl}${route}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: publicOrigin,
            Cookie: `xi_kb_session=${sessionToken}`,
            "X-Knowledge-CSRF": csrfToken
          },
          body: JSON.stringify({
            query: "provider must not run",
            knowledgeBaseIds: baseIds,
            embeddingConnections: {
              openai: { baseUrl: "https://private-embedding.example/v1", apiKey: "embedding-request-secret" }
            }
          })
        });
        const body = await response.json();
        assert.equal(response.status, 502);
        assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR);
        assert.equal(JSON.stringify(body).includes("embedding-request-secret"), false);
        assert.equal(JSON.stringify(body).includes("private-embedding.example"), false);
      }
    }
  );
  assert.equal(providerCalls, 0);
});

test("cloud-only knowledge makes knowledge_search available with safe request-scoped chunks", async () => {
  const fixture = runtimeFixture({
    retrievalResult: {
      mode: "vector",
      topK: 4,
      context: "UNTRUSTED_KNOWLEDGE_CONTEXT\ncloud-only fact\nEND_UNTRUSTED_KNOWLEDGE_CONTEXT",
      contextTruncated: false,
      citations: [citation],
      chunks: [{
        citationId: "K01",
        knowledgeBaseId: baseIds[0],
        documentId: citation.documentId,
        chunkId: citation.chunkId,
        ordinal: 0,
        text: "cloud-only searchable fact",
        objectKey: "knowledge/account/base/source/private-object",
        apiKey: "must-not-survive"
      }]
    }
  });
  const integration = createCloudKnowledgeRequestIntegration(fixture.runtime);
  const knowledge = await integration.preflight(selectedRequest(), { query: "cloud agent task" });
  const searchableChunks = combineCloudKnowledgeSearchChunks([], knowledge);
  const toolContext = {
    trace: [],
    searchKnowledge: async (query, topK) => (
      await retrieveContext({ query, chunks: searchableChunks, topK })
    ).chunks
  };
  const resolved = resolveRequestedTools({
    context: toolContext,
    settings: [],
    entry: { vendor: "openai", capabilities: ["toolCalling"] },
    requestedNames: ["knowledge_search"]
  });

  assert.deepEqual(resolved.unavailable, []);
  assert.deepEqual(resolved.localTools.map((tool) => tool.name), ["knowledge_search"]);
  assert.deepEqual(Object.keys(searchableChunks[0]).sort(), [
    "documentId",
    "documentName",
    "id",
    "index",
    "text"
  ]);
  assert.equal(JSON.stringify(searchableChunks).includes("private-object"), false);
  assert.equal(JSON.stringify(searchableChunks).includes("must-not-survive"), false);

  const matches = await runRegisteredTool({
    name: "knowledge_search",
    arguments: { query: "searchable fact", topK: 4 }
  }, toolContext, []);
  assert.equal(matches[0].id, "K01");
  assert.equal(matches[0].documentName, citation.documentName);
  const raw = withCloudKnowledgeResultRaw({ sourceModule: "agents" }, knowledge);
  assert.equal(Object.hasOwn(raw, "searchChunks"), false);
});

test("knowledge context and result projections stay bounded and credential-free", () => {
  const knowledge = {
    context: "UNTRUSTED_KNOWLEDGE_CONTEXT\ncloud facts\nEND_UNTRUSTED_KNOWLEDGE_CONTEXT",
    knowledgeCitations: [citation],
    metadata: {
      mode: "vector",
      knowledgeBaseIds: baseIds,
      topK: 6,
      contextTruncated: false
    }
  };
  const system = composeCloudKnowledgeSystemContext({
    trustedContext: "trusted instructions",
    knowledge,
    trailingContext: "web context"
  });
  assert.equal(system.indexOf("trusted instructions") < system.indexOf("UNTRUSTED_KNOWLEDGE_CONTEXT"), true);
  assert.equal(system.indexOf("UNTRUSTED_KNOWLEDGE_CONTEXT") < system.indexOf("web context"), true);
  assert.equal(system.includes("cloud facts"), true);

  const message = withCloudKnowledgeCitations({ role: "assistant", content: "answer" }, knowledge);
  assert.deepEqual(message.knowledgeCitations, [citation]);
  const raw = withCloudKnowledgeResultRaw({ toolTrace: [], sourceModule: "workflows" }, knowledge);
  assert.deepEqual(raw.knowledgeCitations, [citation]);
  assert.deepEqual(raw.knowledgeRetrieval, knowledge.metadata);
  assert.deepEqual(Object.keys(raw.knowledgeRetrieval).sort(), [
    "contextTruncated",
    "knowledgeBaseIds",
    "mode",
    "topK"
  ]);
  assert.equal(JSON.stringify(raw).includes("apiKey"), false);
});
