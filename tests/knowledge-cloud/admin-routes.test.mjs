import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createKnowledgeAdminRouter } from "../../server/knowledge-cloud/admin/routes.mjs";
import { KNOWLEDGE_ERROR_CODES, KnowledgeError } from "../../server/knowledge-cloud/errors.mjs";

function adminFixture(overrides = {}) {
  return {
    async settings() {
      return {
        version: 1,
        registrationMode: "invite_only",
        limits: {},
        updatedBy: "migration",
        updatedAt: "2026-01-01T00:00:00.000Z"
      };
    },
    async updateSettings() {
      return { version: 2, registrationMode: "open", limits: {} };
    },
    async overview() {
      return { accounts: { total: 0, active: 0, frozen: 0 } };
    },
    async listAccounts() {
      return { items: [], nextCursor: null };
    },
    async updateAccount() {
      return { id: "11111111-1111-4111-8111-111111111111", username: "Alice" };
    },
    async revokeSessions() {
      return { accountId: "11111111-1111-4111-8111-111111111111", revokedSessions: 2 };
    },
    async issueReset() {
      return {
        accountId: "11111111-1111-4111-8111-111111111111",
        resetId: "22222222-2222-4222-8222-222222222222",
        resetCode: "XI-KB-RESET-SECRET-ONCE",
        expiresAt: "2026-01-01T00:15:00.000Z",
        revokedSessions: 2
      };
    },
    async listInvites() {
      return { items: [], nextCursor: null };
    },
    async createInvite() {
      return {
        invite: { id: "33333333-3333-4333-8333-333333333333", status: "active" },
        inviteCode: "XI-KB-INV-SECRET-ONCE"
      };
    },
    async revokeInvite() {
      return { id: "33333333-3333-4333-8333-333333333333", status: "revoked" };
    },
    async listJobs() {
      return { items: [], nextCursor: null };
    },
    async retryJob(jobId) {
      return { id: jobId, kind: "parse", status: "queued" };
    },
    async cancelJob(jobId) {
      return { id: jobId, kind: "parse", status: "cancelled" };
    },
    async listAudit() {
      return { items: [], nextCursor: null };
    },
    ...overrides
  };
}

function operationsFixture(overrides = {}) {
  return {
    async readiness() {
      return {
        generatedAt: "2026-01-01T00:00:00.000Z",
        status: "ready",
        checks: {
          database: "ok",
          migrations: "ok",
          vectorExtension: "ok",
          objectStore: "configured"
        },
        runtime: {
          enabled: true,
          available: true,
          schemaVersion: 10,
          vectorVersion: "pgvector",
          worker: { concurrency: 2, leaseSeconds: 60 },
          objectStore: { state: "configured" }
        },
        metrics: {
          accounts: { total: 1, active: 1, frozen: 0, deleting: 0, locked: 0, overQuota: 0, failedLoginCount: 0 },
          auth: { activeSessions: 1, expiredSessions: 0, activeInvites: 0, expiredInvites: 0, activeAdminResets: 0, expiredAdminResets: 0 },
          storage: { quotaBytes: "5368709120", usedBytes: "1024", reservedBytes: "0", staleReservationCount: 0, staleReservationBytes: "0", expiredPendingUploads: 0 },
          queue: { queued: 0, running: 0, retry: 0, failed: 0, cancelled: 0, oldestReadyAgeSeconds: 0 },
          vectors: { incompleteChunks: 0, leasedChunks: 0, failedChunks: 0 },
          cleanup: { deletingAccounts: 0, deletingKnowledgeBases: 0, deletingDocuments: 0 }
        }
      };
    },
    async deleteAccount(accountId) {
      return {
        accepted: true,
        accountId,
        status: "deleting",
        version: 2,
        knowledgeBasesMarked: 1,
        documentsMarked: 2,
        job: { id: "55555555-5555-4555-8555-555555555555", kind: "cleanup", status: "queued" }
      };
    },
    async scheduleReconciliation() {
      return { queuedJobs: 1, jobs: [{ id: "66666666-6666-4666-8666-666666666666", kind: "reconcile", status: "queued" }] };
    },
    async runMaintenance() {
      return {
        expiredUploads: { inspected: 1, cleaned: 1, failed: 0 },
        expiredReservations: { inspected: 1, released: 1 },
        expiredSessions: 1,
        expiredAdminResets: 0,
        expiredInvites: 0,
        finalizedAccountIds: []
      };
    },
    ...overrides
  };
}

async function withServer(admin, work, { operations = operationsFixture() } = {}) {
  const runtime = {
    enabled: true,
    available: true,
    state: "ready",
    reasonCode: null,
    config: {
      publicOrigin: "https://ai.example.com",
      auth: { tokenSecret: "knowledge-admin-route-secret-0123456789" },
      database: {},
      cos: {}
    },
    admin,
    operations
  };
  const authorize = (req, _res, next) => {
    if (req.headers["x-admin"] === "yes") return next();
    return next(new KnowledgeError(KNOWLEDGE_ERROR_CODES.ADMIN_AUTH_REQUIRED, "需要管理员登录", {
      status: 401
    }));
  };
  const app = express();
  app.use("/api/admin/knowledge", createKnowledgeAdminRouter(runtime, { authorize }));
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

test("knowledge Admin routes use an isolated Admin authorization wall", async () => {
  let calls = 0;
  await withServer(adminFixture({ async settings() { calls += 1; return {}; } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/knowledge/settings`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.ADMIN_AUTH_REQUIRED);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-request-id"), body.error.requestId);
    assert.equal(calls, 0);
  });
});

test("knowledge Admin job retry and cancel routes require Admin auth and exact Origin", async () => {
  const calls = [];
  const jobId = "11111111-1111-4111-8111-111111111111";
  await withServer(adminFixture({
    async retryJob(id, payload, context) {
      calls.push({ action: "retry", id, payload, context });
      return { id, kind: "parse", status: "queued" };
    },
    async cancelJob(id, payload, context) {
      calls.push({ action: "cancel", id, payload, context });
      return { id, kind: "parse", status: "cancelled" };
    }
  }), async (baseUrl) => {
    const wrongOrigin = await fetch(`${baseUrl}/api/admin/knowledge/jobs/${jobId}/retry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example.com",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ reason: "retry" })
    });
    assert.equal(wrongOrigin.status, 403);

    const retry = await fetch(`${baseUrl}/api/admin/knowledge/jobs/${jobId}/retry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ reason: "parser upgraded" })
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).job.status, "queued");

    const cancel = await fetch(`${baseUrl}/api/admin/knowledge/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ reason: "operator cancelled" })
    });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).job.status, "cancelled");
  });
  assert.deepEqual(calls.map((call) => call.action), ["retry", "cancel"]);
  assert.equal(calls[0].context.actor, "admin");
  assert.match(calls[0].context.requestId, /^[0-9a-f-]{36}$/);
});

test("knowledge Admin operations routes are Admin-only and secret-free", async () => {
  let readinessCalls = 0;
  await withServer(adminFixture(), async (baseUrl) => {
    const rejected = await fetch(`${baseUrl}/api/admin/knowledge/readiness`);
    assert.equal(rejected.status, 401);
    assert.equal(readinessCalls, 0);

    const response = await fetch(`${baseUrl}/api/admin/knowledge/readiness`, {
      headers: { "X-Admin": "yes" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    assert.equal(body.status, "ready");
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    assert(!serialized.includes("apiKey"));
    assert(!serialized.includes("password"));
    assert(!serialized.includes("objectKey"));
  }, {
    operations: operationsFixture({
      async readiness() {
        readinessCalls += 1;
        return operationsFixture().readiness();
      }
    })
  });
});

test("knowledge Admin maintenance routes enforce exact Origin and call operations service", async () => {
  const calls = [];
  const accountId = "11111111-1111-4111-8111-111111111111";
  await withServer(adminFixture(), async (baseUrl) => {
    const wrongOrigin = await fetch(`${baseUrl}/api/admin/knowledge/maintenance/reconcile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ reason: "bad origin" })
    });
    assert.equal(wrongOrigin.status, 403);

    const reconcile = await fetch(`${baseUrl}/api/admin/knowledge/maintenance/reconcile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ accountId, limit: 5, reason: "reconcile account" })
    });
    assert.equal(reconcile.status, 200);
    assert.equal((await reconcile.json()).queuedJobs, 1);

    const cleanup = await fetch(`${baseUrl}/api/admin/knowledge/maintenance/cleanup-stale`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ limit: 5, reason: "cleanup stale state" })
    });
    assert.equal(cleanup.status, 200);
    assert.equal((await cleanup.json()).expiredUploads.cleaned, 1);
  }, {
    operations: operationsFixture({
      async scheduleReconciliation(payload, context) {
        calls.push({ action: "reconcile", payload, context });
        return operationsFixture().scheduleReconciliation();
      },
      async runMaintenance(payload, context) {
        calls.push({ action: "cleanup", payload, context });
        return operationsFixture().runMaintenance();
      }
    })
  });
  assert.deepEqual(calls.map((call) => call.action), ["reconcile", "cleanup"]);
  assert.equal(calls[0].payload.accountId, accountId);
  assert.equal(calls[0].context.actor, "admin");
});

test("knowledge Admin account deletion route is origin-gated and response-only", async () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  await withServer(adminFixture(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/knowledge/accounts/${accountId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ expectedVersion: 3, reason: "owner requested deletion" })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    assert.equal(body.status, "deleting");
    assert.equal(body.knowledgeBasesMarked, 1);
    assert(!serialized.includes("password"));
    assert(!serialized.includes("objectKey"));
    assert(!serialized.includes("apiKey"));
  }, {
    operations: operationsFixture({
      async deleteAccount(id, payload, context) {
        calls.push({ id, payload, context });
        return operationsFixture().deleteAccount(id);
      }
    })
  });
  assert.equal(calls[0].id, accountId);
  assert.equal(calls[0].payload.expectedVersion, 3);
  assert.equal(calls[0].context.actor, "admin");
});

test("knowledge Admin mutations enforce exact Origin and keep one-time codes response-only", async () => {
  await withServer(adminFixture(), async (baseUrl) => {
    const rejected = await fetch(`${baseUrl}/api/admin/knowledge/invites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ reason: "test" })
    });
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).error.code, KNOWLEDGE_ERROR_CODES.ORIGIN_INVALID);

    const created = await fetch(`${baseUrl}/api/admin/knowledge/invites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ reason: "test" })
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).inviteCode, "XI-KB-INV-SECRET-ONCE");

    const list = await fetch(`${baseUrl}/api/admin/knowledge/invites`, {
      headers: { "X-Admin": "yes" }
    });
    assert(!JSON.stringify(await list.json()).includes("XI-KB-INV-SECRET-ONCE"));
  });
});

test("knowledge Admin JSON is capped at 64 KiB before handler execution", async () => {
  let calls = 0;
  await withServer(adminFixture({ async createInvite() { calls += 1; return {}; } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/knowledge/invites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        "X-Admin": "yes"
      },
      body: JSON.stringify({ reason: "x".repeat(70 * 1024) })
    });
    const body = await response.json();
    assert.equal(response.status, 413);
    assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.REQUEST_TOO_LARGE);
    assert.equal(calls, 0);
  });
});
