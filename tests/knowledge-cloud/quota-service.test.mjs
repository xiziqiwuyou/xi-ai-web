import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createKnowledgeQuotaService } from "../../server/knowledge-cloud/quotas/service.mjs";

function settings() {
  return {
    defaultQuotaBytes: 1000,
    maxKnowledgeBasesPerAccount: 20,
    maxDocumentsPerAccount: 1000,
    maxDocumentsPerKnowledgeBase: 500,
    maxFileBytes: 500,
    maxChunksPerAccount: 100000,
    maxConcurrentUploadsPerAccount: 3,
    maxConcurrentIngestionsPerAccount: 2,
    maxConcurrentEmbeddingsPerAccount: 2,
    retrievalRequestsPerMinutePerAccount: 60,
    maxRetrievalTopK: 20
  };
}

function harness(overrides = {}) {
  const state = {
    account: {
      id: "account-1",
      status: "active",
      quotaBytes: "1000",
      usedBytes: "100",
      reservedBytes: "0",
      limitOverrides: {},
      knowledgeBaseCount: 0,
      documentCount: 0,
      chunkCount: 0,
      activeUploadCount: 0,
      ...overrides
    },
    ledger: []
  };
  const quota = {
    async lockAccountCapacity() {
      return { ...state.account };
    },
    async reservationState(accountId, reservationKey, component) {
      const entries = state.ledger.filter(
        (entry) => entry.accountId === accountId &&
          entry.reservationKey === reservationKey &&
          entry.component === component
      );
      return {
        entryCount: entries.length,
        reservedBytes: entries.reduce((sum, entry) => sum + BigInt(entry.reservedDeltaBytes), 0n).toString(),
        usedBytes: entries.reduce((sum, entry) => sum + BigInt(entry.usedDeltaBytes), 0n).toString()
      };
    },
    async insertLedgerEntry(entry) {
      state.ledger.push(structuredClone(entry));
      return entry.id;
    },
    async adjustAccountUsage(_accountId, delta) {
      const reserved = BigInt(state.account.reservedBytes) + BigInt(delta.reservedDeltaBytes || 0);
      const used = BigInt(state.account.usedBytes) + BigInt(delta.usedDeltaBytes || 0);
      if (reserved < 0n || used < 0n) return null;
      state.account.reservedBytes = reserved.toString();
      state.account.usedBytes = used.toString();
      return {
        quotaBytes: state.account.quotaBytes,
        usedBytes: state.account.usedBytes,
        reservedBytes: state.account.reservedBytes
      };
    },
    async documentUsage() {
      return [];
    },
    async documentCapacity(accountId, documentId) {
      const totals = new Map();
      for (const entry of state.ledger) {
        if (entry.accountId !== accountId || entry.documentId !== documentId) continue;
        const key = `${entry.component}:${entry.indexVersionId || ""}`;
        const current = totals.get(key) || {
          component: entry.component,
          indexVersionId: entry.indexVersionId || null,
          reservedBytes: 0n,
          usedBytes: 0n
        };
        current.reservedBytes += BigInt(entry.reservedDeltaBytes);
        current.usedBytes += BigInt(entry.usedDeltaBytes);
        totals.set(key, current);
      }
      return [...totals.values()].map((entry) => ({
        ...entry,
        reservedBytes: entry.reservedBytes.toString(),
        usedBytes: entry.usedBytes.toString()
      }));
    },
    async indexUsage(accountId, indexVersionId) {
      const totals = new Map();
      for (const entry of state.ledger) {
        if (entry.accountId !== accountId || entry.indexVersionId !== indexVersionId) continue;
        const key = `${entry.component}:${entry.documentId || ""}`;
        const current = totals.get(key) || {
          component: entry.component,
          documentId: entry.documentId || null,
          reservedBytes: 0n,
          usedBytes: 0n
        };
        current.reservedBytes += BigInt(entry.reservedDeltaBytes);
        current.usedBytes += BigInt(entry.usedDeltaBytes);
        totals.set(key, current);
      }
      return [...totals.values()].map((entry) => ({
        ...entry,
        reservedBytes: entry.reservedBytes.toString(),
        usedBytes: entry.usedBytes.toString()
      }));
    },
    async baseCapacity(accountId, knowledgeBaseId) {
      return state.ledger
        .filter((entry) => entry.accountId === accountId && entry.knowledgeBaseId === knowledgeBaseId)
        .map((entry) => ({
          component: entry.component,
          documentId: entry.documentId || null,
          indexVersionId: entry.indexVersionId || null,
          reservedBytes: entry.reservedDeltaBytes,
          usedBytes: entry.usedDeltaBytes
        }));
    },
    async accountLedgerTotals() {
      return {
        reservedBytes: state.ledger
          .reduce((sum, entry) => sum + BigInt(entry.reservedDeltaBytes), 0n)
          .toString(),
        usedBytes: state.ledger
          .reduce((sum, entry) => sum + BigInt(entry.usedDeltaBytes), 0n)
          .toString()
      };
    }
  };
  const transaction = {
    quota,
    admin: { async getRuntimeSettings() { return settings(); } }
  };
  const repositories = { quota, admin: transaction.admin };
  return {
    state,
    transaction,
    service: createKnowledgeQuotaService({ repositories, cryptoModule: crypto })
  };
}

test("quota reservation is idempotent and settlement cannot double charge", async () => {
  const { service, transaction, state } = harness();
  const input = {
    accountId: "account-1",
    knowledgeBaseId: "base-1",
    documentId: "document-1",
    reservationKey: "document-upload:document-1",
    component: "original",
    bytes: 200
  };
  await service.reserve(transaction, input);
  await service.reserve(transaction, input);
  assert.equal(state.account.reservedBytes, "200");
  assert.equal(state.ledger.filter((entry) => entry.entryType === "reserve").length, 1);

  await service.settle(transaction, { ...input, actualBytes: 200 });
  assert.equal(state.account.reservedBytes, "0");
  assert.equal(state.account.usedBytes, "300");
  await assert.rejects(
    service.settle(transaction, { ...input, actualBytes: 200 }),
    (error) => error.code === "KB_QUOTA_RESERVATION_INVALID" && error.status === 409
  );
});

test("quota reservation rejects capacity overflow before writing a ledger entry", async () => {
  const { service, transaction, state } = harness({ usedBytes: "900" });
  await assert.rejects(
    service.reserve(transaction, {
      accountId: "account-1",
      knowledgeBaseId: "base-1",
      documentId: "document-1",
      reservationKey: "document-upload:document-1",
      component: "original",
      bytes: 101
    }),
    (error) => error.code === "KB_QUOTA_EXCEEDED" && error.status === 413
  );
  assert.equal(state.ledger.length, 0);
  assert.equal(state.account.reservedBytes, "0");
});

test("failed or expired work can release reservations for a frozen account", async () => {
  const { service, transaction, state } = harness();
  const input = {
    accountId: "account-1",
    knowledgeBaseId: "base-1",
    documentId: "document-1",
    reservationKey: "document-upload:document-1",
    component: "original",
    bytes: 200
  };
  await service.reserve(transaction, input);
  state.account.status = "frozen";
  const result = await service.release(transaction, input);
  assert.equal(result.releasedBytes, "200");
  assert.equal(state.account.reservedBytes, "0");
});

test("a balanced failed reservation key can be reserved again without mutating ledger history", async () => {
  const { service, transaction, state } = harness();
  const input = {
    accountId: "account-1",
    knowledgeBaseId: "base-1",
    documentId: "document-1",
    reservationKey: "embedding-batch:batch-1:vectors",
    component: "vector",
    bytes: 200
  };
  await service.reserve(transaction, input);
  await service.release(transaction, input);
  await service.reserve(transaction, input);
  assert.equal(state.account.reservedBytes, "200");
  assert.equal(state.ledger.filter((entry) => entry.entryType === "reserve").length, 2);
  assert.equal(state.ledger.filter((entry) => entry.entryType === "release").length, 1);
});

test("shadow index usage is attributed to documents before document cleanup", async () => {
  const { service, transaction, state } = harness({ usedBytes: "300" });
  state.ledger.push({
    accountId: "account-1",
    knowledgeBaseId: "base-1",
    documentId: null,
    indexVersionId: "index-2",
    reservationKey: "reindex:index-2:chunks",
    component: "chunk_text",
    entryType: "settle",
    reservedDeltaBytes: "0",
    usedDeltaBytes: "200"
  });
  await service.attributeIndexUsage(transaction, {
    accountId: "account-1",
    knowledgeBaseId: "base-1",
    indexVersionId: "index-2",
    components: ["chunk_text"],
    allocations: [
      { component: "chunk_text", documentId: "document-1", usedBytes: "120" },
      { component: "chunk_text", documentId: "document-2", usedBytes: "80" }
    ],
    reservationKey: "reindex-attribution:index-2"
  });
  assert.equal(state.account.usedBytes, "300");
  assert.equal(
    state.ledger.filter((entry) => entry.entryType === "reconcile" && entry.documentId).length,
    2
  );

  const released = await service.releaseDocumentUsage(transaction, {
    accountId: "account-1",
    knowledgeBaseId: "base-1",
    documentId: "document-1",
    reservationKey: "document-delete:document-1"
  });
  assert.equal(released.releasedBytes, "120");
  assert.equal(state.account.usedBytes, "180");
});

test("reconciliation repairs account counters from the append-only ledger", async () => {
  const { service, transaction, state } = harness({ usedBytes: "999", reservedBytes: "50" });
  state.ledger.push({
    accountId: "account-1",
    reservationKey: "document-upload:document-1",
    component: "original",
    entryType: "settle",
    reservedDeltaBytes: "0",
    usedDeltaBytes: "125"
  });
  const result = await service.reconcileAccountCounters(transaction, "account-1");
  assert.equal(result.changed, true);
  assert.equal(state.account.usedBytes, "125");
  assert.equal(state.account.reservedBytes, "0");
});
