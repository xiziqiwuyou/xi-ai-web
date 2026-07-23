import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeOperationsService } from "../../server/knowledge-cloud/operations/service.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const baseId = "22222222-2222-4222-8222-222222222222";

function metrics(overrides = {}) {
  return {
    accounts: {
      total: 1,
      active: 1,
      frozen: 0,
      deleting: 0,
      locked: 0,
      overQuota: 0,
      failedLoginCount: 0,
      ...(overrides.accounts || {})
    },
    auth: {
      activeSessions: 1,
      expiredSessions: 0,
      activeInvites: 0,
      expiredInvites: 0,
      activeAdminResets: 0,
      expiredAdminResets: 0,
      ...(overrides.auth || {})
    },
    storage: {
      quotaBytes: "5368709120",
      usedBytes: "1024",
      reservedBytes: "0",
      staleReservationCount: 0,
      staleReservationBytes: "0",
      expiredPendingUploads: 0,
      ...(overrides.storage || {})
    },
    queue: {
      queued: 0,
      running: 0,
      retry: 0,
      failed: 0,
      cancelled: 0,
      oldestReadyAgeSeconds: 0,
      ...(overrides.queue || {})
    },
    vectors: {
      incompleteChunks: 0,
      leasedChunks: 0,
      failedChunks: 0,
      ...(overrides.vectors || {})
    },
    cleanup: {
      deletingAccounts: 0,
      deletingKnowledgeBases: 0,
      deletingDocuments: 0,
      ...(overrides.cleanup || {})
    }
  };
}

function job(input) {
  return {
    id: input.id,
    accountId: input.accountId,
    knowledgeBaseId: input.knowledgeBaseId || null,
    documentId: input.documentId || null,
    dedupeKey: input.dedupeKey || null,
    kind: input.kind,
    status: "queued",
    attempts: 0,
    maxAttempts: 5,
    progressCurrent: 0,
    progressTotal: 0,
    errorCode: null,
    runAfter: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function operationsHarness(overrides = {}) {
  const state = {
    account: {
      id: accountId,
      username: "alice",
      status: "active",
      version: 3
    },
    accountIds: [accountId],
    deletingBaseIds: [baseId],
    expiredReservations: [
      {
        accountId,
        reservationKey: "upload:stale",
        component: "source",
        knowledgeBaseId: baseId,
        documentId: null
      }
    ],
    calls: [],
    audits: [],
    jobs: []
  };

  let nextUuid = 0;
  const cryptoModule = {
    randomUUID() {
      nextUuid += 1;
      return `00000000-0000-4000-8000-${String(nextUuid).padStart(12, "0")}`;
    }
  };

  const operations = {
    async healthMetrics() {
      return overrides.metrics || metrics();
    },
    async listAccountIds({ limit }) {
      state.calls.push(`listAccountIds:${limit}`);
      return state.accountIds.slice(0, limit);
    },
    async listDeletingBaseIds(id, limit) {
      state.calls.push(`listDeletingBaseIds:${id}:${limit}`);
      return state.deletingBaseIds;
    },
    async enqueueJob(input) {
      state.calls.push(`enqueue:${input.kind}:${input.dedupeKey}`);
      const next = job(input);
      state.jobs.push(next);
      return next;
    },
    async markAccountDeleting(id, expectedVersion) {
      state.calls.push(`markAccountDeleting:${expectedVersion}`);
      if (id !== state.account.id || expectedVersion !== state.account.version) return null;
      state.account.status = "deleting";
      state.account.version += 1;
      return { id, status: "deleting", version: state.account.version };
    },
    async markAccountResourcesDeleting(id) {
      state.calls.push(`markAccountResourcesDeleting:${id}`);
      return { knowledgeBasesMarked: 2, documentsMarked: 5 };
    },
    async revokeExpiredSessions(limit) {
      state.calls.push(`revokeExpiredSessions:${limit}`);
      return 4;
    },
    async expireAdminResets() {
      state.calls.push("expireAdminResets");
      return 1;
    },
    async expireInvites() {
      state.calls.push("expireInvites");
      return 2;
    },
    async deleteAccountsReadyForFinalization(limit) {
      state.calls.push(`deleteAccountsReadyForFinalization:${limit}`);
      return ["99999999-9999-4999-8999-999999999999"];
    }
  };

  const admin = {
    async findAccountById(id) {
      state.calls.push(`findAccountById:${id}`);
      return id === state.account.id ? { ...state.account } : null;
    },
    async revokeAllSessions(id) {
      state.calls.push(`revokeAllSessions:${id}`);
      return 3;
    },
    async retireActiveAdminResets(id) {
      state.calls.push(`retireActiveAdminResets:${id}`);
      return 1;
    },
    async insertAudit(entry) {
      state.calls.push(`audit:${entry.operation}:${entry.result}`);
      state.audits.push(structuredClone(entry));
      return entry;
    }
  };

  const quota = {
    async findExpiredOutstandingReservations(limit) {
      state.calls.push(`findExpiredOutstandingReservations:${limit}`);
      return state.expiredReservations;
    }
  };

  const repositories = {
    admin,
    operations,
    quota,
    async transaction(work) {
      return work({ admin, operations, quota });
    }
  };

  const library = {
    async cleanupExpiredUploads({ limit }) {
      state.calls.push(`cleanupExpiredUploads:${limit}`);
      return { inspected: 2, cleaned: 1, failed: 0 };
    },
    async executeBaseCleanup(id, targetBaseId) {
      state.calls.push(`executeBaseCleanup:${id}:${targetBaseId}`);
      return { releasedBytes: "512" };
    }
  };

  const quotaService = {
    async release(_transaction, reservation) {
      state.calls.push(`release:${reservation.reservationKey}`);
      return { releasedBytes: "128" };
    }
  };

  const service = createKnowledgeOperationsService({
    repositories,
    library,
    config: { worker: { concurrency: 2, leaseSeconds: 60 } },
    schemaVersion: 10,
    vectorVersion: "pgvector",
    objectStoreConfigured: true,
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
    cryptoModule,
    quotaService,
    logger: { info() {} }
  });

  return { service, state };
}

test("readiness reports degraded and maintenance-required states from safe metrics", async () => {
  const degraded = operationsHarness({
    metrics: metrics({ queue: { failed: 2 } })
  });
  assert.equal((await degraded.service.readiness()).status, "degraded");

  const maintenanceRequired = operationsHarness({
    metrics: metrics({ storage: { expiredPendingUploads: 1 } })
  });
  const readiness = await maintenanceRequired.service.readiness();
  assert.equal(readiness.status, "maintenance_required");
  assert.equal(readiness.checks.objectStore, "configured");
  assert(!JSON.stringify(readiness).includes("apiKey"));
});

test("scheduleReconciliation queues deduplicated jobs and writes a bounded audit", async () => {
  const { service, state } = operationsHarness();
  const result = await service.scheduleReconciliation(
    { limit: 25, reason: "nightly reconciliation" },
    { actor: "root", requestId: "request-reconcile-1" }
  );
  assert.equal(result.queuedJobs, 1);
  assert.equal(result.jobs[0].kind, "reconcile");
  assert.deepEqual(state.calls.filter((item) => item.startsWith("enqueue")), [
    `enqueue:reconcile:account-reconcile:${accountId}`
  ]);
  assert.equal(state.audits.at(-1).operation, "operations.reconcile.queue");
  assert.equal(state.audits.at(-1).metadata.queuedJobs, 1);
});

test("runMaintenance releases stale reservations and finalizes empty deleting accounts", async () => {
  const { service, state } = operationsHarness();
  const result = await service.runMaintenance(
    { limit: 75, reason: "operator cleanup" },
    { actor: "root", requestId: "request-maintenance-1" }
  );
  assert.deepEqual(result.expiredUploads, { inspected: 2, cleaned: 1, failed: 0 });
  assert.equal(result.expiredReservations.released, 1);
  assert.equal(result.expiredSessions, 4);
  assert.deepEqual(result.finalizedAccountIds, ["99999999-9999-4999-8999-999999999999"]);
  assert(state.calls.includes("release:upload:stale"));
  assert.equal(state.audits.at(-1).operation, "operations.maintenance.run");
});

test("deleteAccount marks resources deleting, revokes sessions and queues account cleanup", async () => {
  const { service, state } = operationsHarness();
  const result = await service.deleteAccount(
    accountId,
    { expectedVersion: 3, reason: "owner requested deletion" },
    { actor: "root", requestId: "request-delete-1" }
  );
  assert.equal(result.accepted, true);
  assert.equal(result.status, "deleting");
  assert.equal(result.version, 4);
  assert.equal(result.knowledgeBasesMarked, 2);
  assert.equal(result.documentsMarked, 5);
  assert.equal(result.job.kind, "cleanup");
  assert.deepEqual(
    state.calls.filter((item) => item.startsWith("revoke") || item.startsWith("retire") || item.startsWith("mark") || item.startsWith("enqueue")),
    [
      "markAccountDeleting:3",
      `revokeAllSessions:${accountId}`,
      `retireActiveAdminResets:${accountId}`,
      `markAccountResourcesDeleting:${accountId}`,
      `enqueue:cleanup:account-delete:${accountId}`
    ]
  );
  assert.equal(state.audits.at(-1).operation, "account.delete.request");
});

test("deleteAccount version conflicts fail closed and append a failed audit", async () => {
  const { service, state } = operationsHarness();
  await assert.rejects(
    service.deleteAccount(
      accountId,
      { expectedVersion: 99, reason: "stale admin page" },
      { actor: "root", requestId: "request-delete-stale" }
    ),
    (error) => error.code === "KB_VERSION_CONFLICT" && error.status === 409
  );
  assert.equal(state.account.status, "active");
  assert.equal(state.audits.at(-1).result, "failed");
  assert.equal(state.audits.at(-1).metadata.errorCode, "KB_VERSION_CONFLICT");
});

test("executeAccountCleanup delegates each deleting base without finalizing account early", async () => {
  const { service, state } = operationsHarness();
  const result = await service.executeAccountCleanup(accountId);
  assert.equal(result.cleanedKnowledgeBases, 1);
  assert.equal(result.releasedBytes, "512");
  assert.deepEqual(state.calls, [
    `listDeletingBaseIds:${accountId}:100`,
    `executeBaseCleanup:${accountId}:${baseId}`
  ]);
});
