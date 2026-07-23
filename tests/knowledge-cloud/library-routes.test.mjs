import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../../server/knowledge-cloud/errors.mjs";
import { createKnowledgeRouter } from "../../server/knowledge-cloud/routes.mjs";

async function withServer({ auth, library, embeddings }, work) {
  const runtime = {
    enabled: true,
    available: true,
    state: "ready",
    reasonCode: null,
    schemaVersion: 5,
    vectorVersion: "0.8.1",
    config: {
      publicOrigin: "https://ai.example.com",
      auth: { tokenSecret: "server-only-token-secret" },
      database: {},
      cos: { secretId: "server-secret-id", secretKey: "server-secret-key" }
    },
    auth,
    library,
    embeddings
  };
  const app = express();
  app.use("/api/kb", createKnowledgeRouter(runtime));
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function fixtures() {
  const calls = [];
  const auth = {
    cookieName: "xi_kb_session",
    async requireSession(token) {
      if (token !== "session-token") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "需要登录知识库账号", {
          status: 401
        });
      }
      return { id: "session-1", account: { id: "account-1", status: "active" } };
    },
    verifyCsrf(_session, csrfToken) {
      if (csrfToken !== "csrf-token") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.CSRF_INVALID, "会话校验失败", {
          status: 403
        });
      }
    }
  };
  const library = {
    embeddingProfiles() {
      return { items: [{ id: "qwen-text-embedding-v4", vendor: "qwen", dimensions: 1024 }] };
    },
    async listBases(accountId) {
      calls.push({ operation: "list", accountId });
      return { items: [{ id: "base-1", name: "产品资料" }] };
    },
    async createBase(accountId, input) {
      calls.push({ operation: "create", accountId, input });
      return { base: { id: "base-1", name: input.name } };
    },
    async createUploadGrant(accountId, baseId, input) {
      calls.push({ operation: "grant", accountId, baseId, input });
      return {
        document: { id: "document-1", knowledgeBaseId: baseId, status: "pending_upload" },
        upload: {
          provider: "tencent-cos",
          bucket: "bucket-1250000000",
          region: "ap-guangzhou",
          objectKey: "knowledge/account-1/base-1/document-1/source/opaque",
          uploadUrl: "https://bucket-1250000000.cos.ap-guangzhou.myqcloud.com/knowledge/account-1/base-1/document-1/source/opaque?q-signature=test",
          credentials: {
            tmpSecretId: "temporary-id",
            tmpSecretKey: "temporary-key",
            sessionToken: "temporary-token"
          },
          constraints: { contentLength: input.declaredBytes, contentType: input.declaredMimeType },
          requiredHeaders: { "Content-Type": input.declaredMimeType }
        }
      };
    }
  };
  const embeddings = {
    async nextBatch(accountId, sessionId, documentId, input) {
      calls.push({ operation: "embedding", accountId, sessionId, documentId, input });
      return {
        done: true,
        batch: { id: "batch-1", status: "completed", chunkCount: 1, vectorBytes: "4096", completedAt: null, idempotent: false },
        progress: { totalChunks: 1, readyChunks: 1, pendingChunks: 0, leasedChunks: 0, failedChunks: 0, lastErrorCode: null },
        providerCall: true
      };
    },
    async reindex(accountId, baseId, input) {
      calls.push({ operation: "reindex", accountId, baseId, input });
      return {
        accepted: true,
        reindex: { knowledgeBaseId: baseId, sourceIndexVersion: 1, pendingIndexVersion: 2 }
      };
    }
  };
  return { auth, library, embeddings, calls };
}

test("library reads require the opaque knowledge session", async () => {
  const fixture = fixtures();
  await withServer(fixture, async (baseUrl) => {
    const rejected = await fetch(`${baseUrl}/api/kb/bases`);
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).error.code, KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED);

    const accepted = await fetch(`${baseUrl}/api/kb/bases`, {
      headers: { Cookie: "xi_kb_session=session-token" }
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).items[0].id, "base-1");
    assert.equal(fixture.calls[0].accountId, "account-1");
  });
});

test("library mutations enforce exact Origin and knowledge CSRF", async () => {
  const fixture = fixtures();
  await withServer(fixture, async (baseUrl) => {
    const crossOrigin = await fetch(`${baseUrl}/api/kb/bases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({ name: "产品资料", embeddingProfileId: "qwen-text-embedding-v4" })
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await crossOrigin.json()).error.code, KNOWLEDGE_ERROR_CODES.ORIGIN_INVALID);

    const missingCsrf = await fetch(`${baseUrl}/api/kb/bases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token"
      },
      body: JSON.stringify({ name: "产品资料", embeddingProfileId: "qwen-text-embedding-v4" })
    });
    assert.equal(missingCsrf.status, 403);
    assert.equal((await missingCsrf.json()).error.code, KNOWLEDGE_ERROR_CODES.CSRF_INVALID);

    const accepted = await fetch(`${baseUrl}/api/kb/bases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({ name: "产品资料", embeddingProfileId: "qwen-text-embedding-v4" })
    });
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).base.id, "base-1");
  });
});

test("upload grant returns only temporary COS credentials for the server-generated path", async () => {
  const fixture = fixtures();
  await withServer(fixture, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/kb/bases/base-1/documents/upload-grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({
        displayName: "guide.txt",
        declaredMimeType: "text/plain",
        declaredBytes: 128
      })
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.upload.credentials.tmpSecretKey, "temporary-key");
    assert.match(body.upload.objectKey, /^knowledge\/account-1\/base-1\//);
    assert.match(body.upload.uploadUrl, /^https:\/\/bucket-1250000000\.cos\.ap-guangzhou\.myqcloud\.com\//);
    assert.equal(JSON.stringify(body).includes("server-secret-key"), false);
    assert.equal(fixture.calls.at(-1).accountId, "account-1");
  });
});

test("embedding batches require the knowledge session, CSRF and request-only connection", async () => {
  const fixture = fixtures();
  await withServer(fixture, async (baseUrl) => {
    const apiKey = "embedding-session-only-key";
    const response = await fetch(`${baseUrl}/api/kb/documents/document-1/embedding-batches/next`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({
        embeddingProfileId: "qwen-text-embedding-v4",
        idempotencyKey: "embedding-route-batch-01",
        connection: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey }
      })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.done, true);
    assert.equal(JSON.stringify(body).includes(apiKey), false);
    const call = fixture.calls.at(-1);
    assert.equal(call.accountId, "account-1");
    assert.equal(call.sessionId, "session-1");
    assert.equal(call.documentId, "document-1");

    const reindex = await fetch(`${baseUrl}/api/kb/bases/base-1/reindex`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=session-token",
        "X-Knowledge-CSRF": "csrf-token"
      },
      body: JSON.stringify({ expectedVersion: 1, embeddingProfileId: "qwen-text-embedding-v4" })
    });
    assert.equal(reindex.status, 202);
    assert.equal((await reindex.json()).reindex.pendingIndexVersion, 2);
  });
});
