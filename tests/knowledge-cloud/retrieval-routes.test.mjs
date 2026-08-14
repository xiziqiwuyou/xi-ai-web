import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../../server/knowledge-cloud/errors.mjs";
import { createKnowledgeRouter } from "../../server/knowledge-cloud/routes.mjs";

async function withServer(runtime, work) {
  const app = express();
  app.use("/api/kb", createKnowledgeRouter(runtime));
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

function runtimeFixture() {
  const calls = [];
  const auth = {
    cookieName: "xi_kb_session",
    async requireSession(token) {
      if (token !== "session-token") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "需要登录知识库账号", { status: 401 });
      }
      return { id: "session-1", account: { id: "account-1", status: "active" } };
    },
    verifyCsrf(_session, csrfToken) {
      if (csrfToken !== "csrf-token") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.CSRF_INVALID, "会话校验失败", { status: 403 });
      }
    }
  };
  const retrieval = {
    async retrieve(ownerId, input, options = {}) {
      calls.push({ operation: "retrieve", ownerId, input, signal: options.signal });
      if (input.query === "fail") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR, "provider failed", {
          status: 502,
          details: { providerMessage: input.connections.openai.apiKey }
        });
      }
      return { mode: "vector", context: "bounded", contextBytes: 7, chunks: [], citations: [] };
    }
  };
  const citations = {
    async openSource(ownerId, documentId, input) {
      calls.push({ operation: "source", ownerId, documentId, input });
      return {
        source: {
          url: "https://bucket.example/source?q-signature=temporary",
          expiresAt: "2026-07-22T00:05:00.000Z",
          expiresInSeconds: 300,
          documentId
        }
      };
    }
  };
  return {
    calls,
    runtime: {
      enabled: true,
      available: true,
      state: "ready",
      schemaVersion: 8,
      vectorVersion: "0.8.1",
      config: {
        publicOrigin: "https://ai.example.com",
        auth: { tokenSecret: "server-only-token-secret" },
        database: {},
        cos: { secretId: "server-id", secretKey: "server-key" }
      },
      auth,
      retrieval,
      citations
    }
  };
}

test("retrieval route requires knowledge auth, exact Origin and CSRF", async () => {
  const fixture = runtimeFixture();
  await withServer(fixture.runtime, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/kb/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({ query: "query", knowledgeBaseIds: ["base-1"] })
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED);

    const crossOrigin = await fetch(`${baseUrl}/api/kb/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example.com",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({ query: "query", knowledgeBaseIds: ["base-1"] })
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await crossOrigin.json()).error.code, KNOWLEDGE_ERROR_CODES.ORIGIN_INVALID);
    assert.equal(fixture.calls.length, 0);

    const response = await fetch(`${baseUrl}/api/kb/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({
        query: "query",
        knowledgeBaseIds: ["base-1"],
        connections: { openai: { baseUrl: "https://api.example/v1", apiKey: "request-key" } }
      })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).context, "bounded");
    assert.equal(fixture.calls[0].ownerId, "account-1");
    assert(fixture.calls[0].signal instanceof AbortSignal);
    assert.equal(fixture.calls[0].signal.aborted, false);

    const missingCsrf = await fetch(`${baseUrl}/api/kb/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token"
      },
      body: JSON.stringify({ query: "query", knowledgeBaseIds: ["base-1"] })
    });
    assert.equal(missingCsrf.status, 403);
    assert.equal((await missingCsrf.json()).error.code, KNOWLEDGE_ERROR_CODES.CSRF_INVALID);
  });
});

test("retrieval route aborts provider work when the client disconnects", async () => {
  const fixture = runtimeFixture();
  let observedSignal;
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  let resolveAborted;
  const aborted = new Promise((resolve) => { resolveAborted = resolve; });
  fixture.runtime.retrieval.retrieve = async (_ownerId, _input, { signal } = {}) => {
    observedSignal = signal;
    resolveStarted();
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        resolveAborted();
        reject(signal.reason || new Error("aborted"));
      }, { once: true });
    });
  };

  await withServer(fixture.runtime, async (baseUrl) => {
    const controller = new AbortController();
    const request = fetch(`${baseUrl}/api/kb/retrieval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({ query: "cancel me", knowledgeBaseIds: ["base-1"] }),
      signal: controller.signal
    });
    await started;
    controller.abort();
    await assert.rejects(request, (error) => error.name === "AbortError");
    await aborted;
    assert(observedSignal instanceof AbortSignal);
    assert.equal(observedSignal.aborted, true);
  });
});

test("retrieval route redacts every request-only connection credential from failures", async () => {
  const fixture = runtimeFixture();
  await withServer(fixture.runtime, async (baseUrl) => {
    const apiKey = "route-secret-api-key";
    const response = await fetch(`${baseUrl}/api/kb/retrieval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({
        query: "fail",
        knowledgeBaseIds: ["base-1"],
        connections: { openai: { baseUrl: "https://private.example/v1", apiKey } }
      })
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR);
    assert.equal(JSON.stringify(body).includes(apiKey), false);
    assert.equal(JSON.stringify(body).includes("https://private.example/v1"), false);
  });
});

test("source URL route reauthorizes through the current knowledge session", async () => {
  const fixture = runtimeFixture();
  await withServer(fixture.runtime, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/kb/documents/document-1/source-url?chunkId=chunk-1&disposition=attachment`, {
      headers: { Cookie: "xi_kb_session=session-token" }
      }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source.expiresInSeconds, 300);
    assert.deepEqual(fixture.calls.at(-1), {
      operation: "source",
      ownerId: "account-1",
      documentId: "document-1",
      input: { chunkId: "chunk-1", disposition: "attachment" }
    });
  });
});
