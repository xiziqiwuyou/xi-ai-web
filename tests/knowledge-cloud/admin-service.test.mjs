import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createKnowledgeAdminService } from "../../server/knowledge-cloud/admin/service.mjs";

const tokenSecret = "knowledge-admin-test-token-secret-0123456789";
const accountId = "11111111-1111-4111-8111-111111111111";

function runtimeSettings(overrides = {}) {
  return {
    version: 1,
    registrationMode: "invite_only",
    defaultQuotaBytes: 5 * 1024 ** 3,
    maxKnowledgeBasesPerAccount: 20,
    maxDocumentsPerAccount: 1000,
    maxDocumentsPerKnowledgeBase: 500,
    maxFileBytes: 100 * 1024 ** 2,
    maxChunksPerAccount: 100000,
    maxConcurrentUploadsPerAccount: 3,
    maxConcurrentIngestionsPerAccount: 2,
    maxConcurrentEmbeddingsPerAccount: 2,
    retrievalRequestsPerMinutePerAccount: 60,
    maxRetrievalTopK: 20,
    updatedBy: "migration",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function serviceHarness() {
  const state = {
    settings: runtimeSettings(),
    audits: [],
    calls: [],
    storedReset: null,
    account: {
      id: accountId,
      username: "Alice",
      status: "active",
      version: 1,
      quotaBytes: String(5 * 1024 ** 3),
      usedBytes: "100",
      reservedBytes: "25",
      limitOverrides: {},
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      activeSessionCount: 2,
      knowledgeBaseCount: 3,
      documentCount: 4,
      chunkCount: 5,
      passwordHash: "must-not-project",
      recoveryCodeHash: "must-not-project"
    }
  };

  const admin = {
    async getRuntimeSettings() {
      return { ...state.settings };
    },
    async updateRuntimeSettings(next, expectedVersion, actor) {
      state.calls.push("updateRuntimeSettings");
      if (expectedVersion !== state.settings.version) return null;
      state.settings = {
        ...state.settings,
        ...next,
        version: state.settings.version + 1,
        updatedBy: actor,
        updatedAt: "2026-01-01T00:01:00.000Z"
      };
      return { ...state.settings };
    },
    async applyInheritedQuota(value) {
      state.calls.push("applyInheritedQuota");
      state.account.quotaBytes = String(value);
      return 1;
    },
    async listAccounts() {
      return [{ ...state.account }];
    },
    async findAccountById() {
      return { ...state.account };
    },
    async retireActiveAdminResets() {
      state.calls.push("retireActiveAdminResets");
      return 1;
    },
    async insertAdminReset(reset) {
      state.calls.push("insertAdminReset");
      state.storedReset = { ...reset };
      return {
        id: reset.id,
        accountId: reset.accountId,
        status: "active",
        reason: reset.reason,
        createdBy: reset.createdBy,
        expiresAt: reset.expiresAt.toISOString(),
        createdAt: "2026-01-01T00:00:00.000Z"
      };
    },
    async markAccountResetRequired() {
      state.calls.push("markAccountResetRequired");
      state.account.version += 1;
      return { version: state.account.version };
    },
    async revokeAllSessions() {
      state.calls.push("revokeAllSessions");
      return 2;
    },
    async insertAudit(entry) {
      state.calls.push(`audit:${entry.result}`);
      state.audits.push(structuredClone(entry));
      return entry;
    }
  };
  const repositories = {
    admin,
    async transaction(work) {
      return work({ admin });
    }
  };
  const service = createKnowledgeAdminService({
    repositories,
    tokenSecret,
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
    cryptoModule: crypto,
    objectStoreConfigured: true
  });
  return { service, state };
}

test("lowering runtime limits updates inherited quota without touching usage or jobs", async () => {
  const { service, state } = serviceHarness();
  const originalUsage = { usedBytes: state.account.usedBytes, reservedBytes: state.account.reservedBytes };
  const limits = Object.fromEntries(
    Object.entries(runtimeSettings()).filter(([key]) => key.startsWith("max") || key === "defaultQuotaBytes" || key === "retrievalRequestsPerMinutePerAccount")
  );
  limits.defaultQuotaBytes = 1024 ** 3;
  const result = await service.updateSettings({
    expectedVersion: 1,
    registrationMode: "invite_only",
    limits,
    reason: "调整内测账号默认容量"
  }, { actor: "admin", requestId: "request-settings-1" });

  assert.equal(result.version, 2);
  assert.deepEqual(
    { usedBytes: state.account.usedBytes, reservedBytes: state.account.reservedBytes },
    originalUsage
  );
  assert.deepEqual(state.calls, ["updateRuntimeSettings", "applyInheritedQuota", "audit:succeeded"]);
  assert.equal(state.audits[0].operation, "settings.update");
});

test("account list is a safe projection with effective limits", async () => {
  const { service } = serviceHarness();
  const page = await service.listAccounts({ limit: 20 });
  const serialized = JSON.stringify(page);
  assert.equal(page.items[0].effectiveLimits.maxRetrievalTopK, 20);
  assert(!serialized.includes("passwordHash"));
  assert(!serialized.includes("recoveryCodeHash"));
});

test("Admin reset code is returned once while only its hash enters storage and audit", async () => {
  const { service, state } = serviceHarness();
  const result = await service.issueReset(accountId, { reason: "用户遗失密码与恢复码" }, {
    actor: "admin",
    requestId: "request-reset-1"
  });
  assert.match(result.resetCode, /^XI-KB-RESET-/);
  assert(Buffer.isBuffer(state.storedReset.codeHash));
  assert(!JSON.stringify(state.storedReset).includes(result.resetCode));
  assert(!JSON.stringify(state.audits).includes(result.resetCode));
  assert.deepEqual(state.calls, [
    "retireActiveAdminResets",
    "insertAdminReset",
    "markAccountResetRequired",
    "revokeAllSessions",
    "audit:succeeded"
  ]);
});

test("privileged mutations require a bounded reason before opening a transaction", async () => {
  const { service, state } = serviceHarness();
  await assert.rejects(
    service.issueReset(accountId, { reason: "" }, { actor: "admin", requestId: "request-reset-2" }),
    (error) => error.code === "KB_ADMIN_REASON_REQUIRED" && error.status === 400
  );
  assert.deepEqual(state.calls, []);
  assert.equal(state.storedReset, null);
});

test("a stale privileged mutation appends a separate failed audit outcome", async () => {
  const { service, state } = serviceHarness();
  const limits = Object.fromEntries(
    Object.entries(runtimeSettings()).filter(([key]) =>
      key.startsWith("max") || key === "defaultQuotaBytes" || key === "retrievalRequestsPerMinutePerAccount"
    )
  );
  await assert.rejects(
    service.updateSettings({
      expectedVersion: 99,
      registrationMode: "invite_only",
      limits,
      reason: "验证并发版本冲突审计"
    }, { actor: "admin", requestId: "request-settings-stale" }),
    (error) => error.code === "KB_VERSION_CONFLICT" && error.status === 409
  );
  assert.equal(state.settings.version, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].result, "failed");
  assert.equal(state.audits[0].metadata.errorCode, "KB_VERSION_CONFLICT");
});
