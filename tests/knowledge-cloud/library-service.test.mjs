import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createKnowledgeLibraryService } from "../../server/knowledge-cloud/library/service.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const otherAccountId = "22222222-2222-4222-8222-222222222222";

function runtimeSettings(overrides = {}) {
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
    maxRetrievalTopK: 20,
    ...overrides
  };
}

function harness({ limits = {}, grantFails = false } = {}) {
  const state = {
    account: {
      id: accountId,
      status: "active",
      quotaBytes: "1000",
      usedBytes: "0",
      reservedBytes: "0",
      limitOverrides: {},
      knowledgeBaseCount: 0,
      documentCount: 0,
      chunkCount: 0,
      activeUploadCount: 0
    },
    settings: runtimeSettings(limits),
    bases: new Map(),
    documents: new Map(),
    indexes: [],
    ledger: [],
    jobs: [],
    grants: [],
    heads: new Map(),
    deletes: [],
    now: "2026-01-01T00:00:00.000Z"
  };

  const refreshCounts = () => {
    state.account.knowledgeBaseCount = [...state.bases.values()].filter(
      (base) => base.accountId === accountId
    ).length;
    state.account.documentCount = [...state.documents.values()].filter(
      (document) => document.accountId === accountId
    ).length;
    state.account.activeUploadCount = [...state.documents.values()].filter(
      (document) => document.accountId === accountId && document.status === "pending_upload"
    ).length;
  };

  const library = {
    async listBases(ownerId) {
      return [...state.bases.values()]
        .filter((base) => base.accountId === ownerId)
        .map((base) => structuredClone(base));
    },
    async findBase(ownerId, baseId) {
      const base = state.bases.get(baseId);
      if (!base || base.accountId !== ownerId) return null;
      const documentCount = [...state.documents.values()].filter(
        (document) => document.accountId === ownerId && document.knowledgeBaseId === baseId
      ).length;
      return structuredClone({ ...base, documentCount });
    },
    async insertBase(base) {
      const record = {
        ...structuredClone(base),
        status: "active",
        chunkVersion: 1,
        activeIndexVersion: null,
        pendingIndexVersion: 1,
        version: 1,
        documentCount: 0,
        readyDocumentCount: 0,
        logicalBytes: "0",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        archivedAt: null
      };
      state.bases.set(record.id, record);
      refreshCounts();
      return structuredClone(record);
    },
    async insertIndexVersion(index) {
      state.indexes.push(structuredClone(index));
      return index.id;
    },
    async updateBase(ownerId, baseId, expectedVersion, next) {
      const current = state.bases.get(baseId);
      if (!current || current.accountId !== ownerId || current.version !== expectedVersion) return null;
      state.bases.set(baseId, {
        ...current,
        ...structuredClone(next),
        version: current.version + 1,
        updatedAt: "2026-01-01T00:01:00.000Z"
      });
      return baseId;
    },
    async retireReplaceableIndexVersions() {
      return 1;
    },
    async markBaseDeleting(ownerId, baseId, expectedVersion) {
      const current = state.bases.get(baseId);
      if (!current || current.accountId !== ownerId || current.version !== expectedVersion) return null;
      state.bases.set(baseId, { ...current, status: "deleting", version: current.version + 1 });
      return baseId;
    },
    async markBaseDocumentsDeleting(ownerId, baseId) {
      let count = 0;
      for (const [id, document] of state.documents) {
        if (document.accountId === ownerId && document.knowledgeBaseId === baseId) {
          state.documents.set(id, { ...document, status: "deleting", version: document.version + 1 });
          count += 1;
        }
      }
      return count;
    },
    async listDocuments(ownerId, baseId) {
      return [...state.documents.values()].filter(
        (document) => document.accountId === ownerId && document.knowledgeBaseId === baseId
      ).map((document) => structuredClone(document));
    },
    async findDocument(ownerId, documentId) {
      const document = state.documents.get(documentId);
      return document?.accountId === ownerId ? structuredClone(document) : null;
    },
    async insertPendingDocument(document) {
      const record = {
        ...structuredClone(document),
        declaredBytes: String(document.declaredBytes),
        verifiedMimeType: null,
        verifiedBytes: null,
        checksumSha256: null,
        objectVersionId: null,
        objectEtag: null,
        uploadGrantIssuedAt: "2026-01-01T00:00:00.000Z",
        uploadExpiresAt: document.uploadExpiresAt.toISOString(),
        normalizedObjectKey: null,
        normalizedBytes: null,
        status: "pending_upload",
        parserVersion: null,
        errorCode: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      };
      state.documents.set(record.id, record);
      refreshCounts();
      return structuredClone(record);
    },
    async markDocumentUploaded(ownerId, documentId, expectedVersion, object) {
      const current = state.documents.get(documentId);
      if (
        !current || current.accountId !== ownerId || current.version !== expectedVersion ||
        current.status !== "pending_upload"
      ) return null;
      const next = {
        ...current,
        status: "uploaded",
        verifiedMimeType: object.contentType,
        verifiedBytes: String(object.bytes),
        checksumSha256: object.checksumSha256,
        objectVersionId: object.versionId,
        objectEtag: object.etag,
        version: current.version + 1
      };
      state.documents.set(documentId, next);
      refreshCounts();
      return structuredClone(next);
    },
    async markDocumentDeleting(ownerId, documentId, expectedVersion) {
      const current = state.documents.get(documentId);
      if (!current || current.accountId !== ownerId || current.version !== expectedVersion) return null;
      state.documents.set(documentId, { ...current, status: "deleting", version: current.version + 1 });
      refreshCounts();
      return documentId;
    },
    async deletePendingDocument(ownerId, documentId) {
      const current = state.documents.get(documentId);
      if (!current || current.accountId !== ownerId || current.verifiedBytes !== null) return 0;
      state.documents.delete(documentId);
      refreshCounts();
      return 1;
    },
    async deleteDocument(ownerId, documentId) {
      const current = state.documents.get(documentId);
      if (!current || current.accountId !== ownerId || current.status !== "deleting") return 0;
      state.documents.delete(documentId);
      refreshCounts();
      return 1;
    },
    async deleteBase(ownerId, baseId) {
      const current = state.bases.get(baseId);
      if (!current || current.accountId !== ownerId || current.status !== "deleting") return 0;
      state.bases.delete(baseId);
      refreshCounts();
      return 1;
    },
    async enqueueJob(job) {
      const existing = state.jobs.find(
        (current) => current.accountId === job.accountId &&
          current.kind === job.kind && current.dedupeKey === job.dedupeKey
      );
      if (existing) return structuredClone(existing);
      const record = { ...structuredClone(job), status: "queued", runAfter: null };
      state.jobs.push(record);
      return structuredClone(record);
    },
    async findExpiredPendingUploads(limit) {
      return [...state.documents.values()]
        .filter((document) =>
          document.status === "pending_upload" &&
          document.uploadExpiresAt &&
          new Date(document.uploadExpiresAt) <= new Date(state.now)
        )
        .slice(0, limit)
        .map((document) => structuredClone(document));
    }
  };

  const quota = {
    async lockAccountCapacity(ownerId) {
      if (ownerId !== accountId) return null;
      refreshCounts();
      return structuredClone(state.account);
    },
    async countDocumentsInBase(ownerId, baseId) {
      return [...state.documents.values()].filter(
        (document) => document.accountId === ownerId && document.knowledgeBaseId === baseId
      ).length;
    },
    async reservationState(ownerId, reservationKey, component) {
      const entries = state.ledger.filter(
        (entry) => entry.accountId === ownerId &&
          entry.reservationKey === reservationKey && entry.component === component
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
    async adjustAccountUsage(_ownerId, delta) {
      state.account.reservedBytes = (
        BigInt(state.account.reservedBytes) + BigInt(delta.reservedDeltaBytes || 0)
      ).toString();
      state.account.usedBytes = (
        BigInt(state.account.usedBytes) + BigInt(delta.usedDeltaBytes || 0)
      ).toString();
      return {
        quotaBytes: state.account.quotaBytes,
        usedBytes: state.account.usedBytes,
        reservedBytes: state.account.reservedBytes
      };
    },
    async documentUsage(ownerId, documentId) {
      const totals = new Map();
      for (const entry of state.ledger) {
        if (entry.accountId !== ownerId || entry.documentId !== documentId) continue;
        totals.set(entry.component, (totals.get(entry.component) || 0n) + BigInt(entry.usedDeltaBytes));
      }
      return [...totals.entries()]
        .filter(([, used]) => used !== 0n)
        .map(([component, used]) => ({ component, usedBytes: used.toString() }));
    },
    async documentCapacity(ownerId, documentId) {
      const totals = new Map();
      for (const entry of state.ledger) {
        if (entry.accountId !== ownerId || entry.documentId !== documentId) continue;
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
    async indexUsage(ownerId, indexVersionId) {
      const totals = new Map();
      for (const entry of state.ledger) {
        if (entry.accountId !== ownerId || entry.indexVersionId !== indexVersionId) continue;
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
    async baseCapacity(ownerId, knowledgeBaseId) {
      const totals = new Map();
      for (const entry of state.ledger) {
        if (entry.accountId !== ownerId || entry.knowledgeBaseId !== knowledgeBaseId) continue;
        const key = `${entry.component}:${entry.documentId || ""}:${entry.indexVersionId || ""}`;
        const current = totals.get(key) || {
          component: entry.component,
          documentId: entry.documentId || null,
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
    }
  };

  const admin = { async getRuntimeSettings() { return structuredClone(state.settings); } };
  const repositories = {
    library,
    quota,
    admin,
    async transaction(work) {
      return work({ library, quota, admin });
    }
  };
  const objectStore = {
    grantTtlSeconds: 900,
    async createUploadGrant({ objectKey }) {
      state.grants.push(objectKey);
      if (grantFails) throw Object.assign(new Error("STS unavailable"), { code: "upstream" });
      return {
        provider: "tencent-cos",
        bucket: "test-1250000000",
        region: "ap-guangzhou",
        objectKey,
        uploadUrl: `https://test-1250000000.cos.ap-guangzhou.myqcloud.com/${objectKey}?q-signature=test`,
        startTime: 1,
        expiredTime: 901,
        credentials: {
          tmpSecretId: "temporary-id",
          tmpSecretKey: "temporary-key",
          sessionToken: "temporary-token"
        }
      };
    },
    async headObject({ objectKey }) {
      return state.heads.get(objectKey) || {
        objectKey,
        bytes: 128,
        contentType: "text/plain",
        etag: "etag-1",
        versionId: "version-1",
        checksumSha256: null
      };
    },
    async deleteObject(input) {
      state.deletes.push(structuredClone(input));
      return { deleted: true };
    }
  };
  const service = createKnowledgeLibraryService({
    repositories,
    objectStore,
    clock: () => new Date(state.now),
    cryptoModule: crypto
  });
  return { service, state };
}

async function createBase(service) {
  const { base } = await service.createBase(accountId, {
    name: "产品资料",
    description: "内部产品说明",
    embeddingProfileId: "qwen-text-embedding-v4"
  });
  return base;
}

test("knowledge bases use approved profile snapshots and account ownership", async () => {
  const { service, state } = harness();
  const base = await createBase(service);
  assert.equal(base.embeddingProfile.vendor, "qwen");
  assert.equal(base.embeddingProfile.actualModel, "text-embedding-v4");
  assert.equal(base.embeddingProfile.dimensions, 1024);
  assert.equal(state.indexes.length, 1);
  assert.equal(state.indexes[0].embedding.fingerprint, base.embeddingProfile.fingerprint);
  await assert.rejects(
    service.getBase(otherAccountId, base.id),
    (error) => error.code === "KB_KNOWLEDGE_BASE_NOT_FOUND" && error.status === 404
  );
});

test("base limits are enforced while lowering limits never deletes existing data", async () => {
  const { service, state } = harness({ limits: { maxKnowledgeBasesPerAccount: 1 } });
  await createBase(service);
  await assert.rejects(
    createBase(service),
    (error) => error.code === "KB_KNOWLEDGE_BASE_LIMIT_EXCEEDED" && error.status === 409
  );
  assert.equal(state.bases.size, 1);
});

test("direct upload reserves quota, returns an exact generated key, and settles once", async () => {
  const { service, state } = harness();
  const base = await createBase(service);
  const result = await service.createUploadGrant(accountId, base.id, {
    displayName: "guide.txt",
    declaredMimeType: "text/plain",
    declaredBytes: 128
  });
  assert.match(
    result.upload.objectKey,
    new RegExp(`^knowledge/${accountId}/${base.id}/${result.document.id}/source/[0-9a-f-]+$`)
  );
  assert.equal("objectKey" in result.document, false);
  assert.equal(state.account.reservedBytes, "128");
  assert.equal(state.account.usedBytes, "0");

  const finalized = await service.finalizeUpload(accountId, result.document.id, { etag: "etag-1" });
  assert.equal(finalized.document.status, "uploaded");
  assert.equal(finalized.job.kind, "parse");
  assert.equal(state.account.reservedBytes, "0");
  assert.equal(state.account.usedBytes, "128");

  const repeated = await service.finalizeUpload(accountId, result.document.id, {});
  assert.equal(repeated.idempotent, true);
  assert.equal(state.account.usedBytes, "128");
  assert.equal(state.ledger.filter((entry) => entry.entryType === "settle").length, 1);
});

test("clients cannot choose an owner or COS object key", async () => {
  const { service, state } = harness();
  const base = await createBase(service);
  await assert.rejects(
    service.createUploadGrant(accountId, base.id, {
      displayName: "guide.txt",
      declaredMimeType: "text/plain",
      declaredBytes: 128,
      accountId: otherAccountId,
      objectKey: "knowledge/other-account/owned-path"
    }),
    (error) => error.code === "KB_INVALID_REQUEST" && error.status === 400
  );
  assert.equal(state.documents.size, 0);
  assert.equal(state.grants.length, 0);
});

test("pending upload concurrency is enforced from server-owned state", async () => {
  const { service } = harness({ limits: { maxConcurrentUploadsPerAccount: 1 } });
  const base = await createBase(service);
  await service.createUploadGrant(accountId, base.id, {
    displayName: "first.txt",
    declaredMimeType: "text/plain",
    declaredBytes: 128
  });
  await assert.rejects(
    service.createUploadGrant(accountId, base.id, {
      displayName: "second.txt",
      declaredMimeType: "text/plain",
      declaredBytes: 128
    }),
    (error) => error.code === "KB_UPLOAD_IN_PROGRESS_LIMIT" && error.status === 429
  );
});

test("upload mismatch preserves the reservation for a correct retry", async () => {
  const { service, state } = harness();
  const base = await createBase(service);
  const result = await service.createUploadGrant(accountId, base.id, {
    displayName: "guide.txt",
    declaredMimeType: "text/plain",
    declaredBytes: 128
  });
  state.heads.set(state.grants[0], {
    objectKey: state.grants[0],
    bytes: 129,
    contentType: "text/plain",
    etag: "etag-2",
    versionId: null,
    checksumSha256: null
  });
  await assert.rejects(
    service.finalizeUpload(accountId, result.document.id, {}),
    (error) => error.code === "KB_UPLOAD_MISMATCH" && error.status === 409
  );
  assert.equal(state.account.reservedBytes, "128");
  assert.equal(state.account.usedBytes, "0");
});

test("STS failure compensates the pending document and quota reservation", async () => {
  const { service, state } = harness({ grantFails: true });
  const base = await createBase(service);
  await assert.rejects(
    service.createUploadGrant(accountId, base.id, {
      displayName: "guide.txt",
      declaredMimeType: "text/plain",
      declaredBytes: 128
    }),
    /STS unavailable/
  );
  assert.equal(state.documents.size, 0);
  assert.equal(state.account.reservedBytes, "0");
});

test("expired pending uploads delete orphan objects and release reservations", async () => {
  const { service, state } = harness();
  const base = await createBase(service);
  await service.createUploadGrant(accountId, base.id, {
    displayName: "guide.txt",
    declaredMimeType: "text/plain",
    declaredBytes: 128
  });
  state.now = "2026-01-01T00:16:00.000Z";
  const result = await service.cleanupExpiredUploads();
  assert.deepEqual(result, { inspected: 1, cleaned: 1, failed: 0 });
  assert.equal(state.documents.size, 0);
  assert.equal(state.account.reservedBytes, "0");
  assert.equal(state.deletes.length, 1);
});

test("deletion returns quota only after object cleanup succeeds", async () => {
  const { service, state } = harness();
  const base = await createBase(service);
  const upload = await service.createUploadGrant(accountId, base.id, {
    displayName: "guide.txt",
    declaredMimeType: "text/plain",
    declaredBytes: 128
  });
  const finalized = await service.finalizeUpload(accountId, upload.document.id, {});
  const storedDocument = state.documents.get(upload.document.id);
  state.documents.set(upload.document.id, {
    ...storedDocument,
    normalizedObjectKey: `knowledge/${accountId}/${base.id}/${upload.document.id}/normalized/v1-index-1.ndjson`,
    normalizedBytes: "64"
  });
  const queued = await service.deleteDocument(accountId, upload.document.id, {
    expectedVersion: finalized.document.version
  });
  assert.equal(queued.accepted, true);
  assert.equal(state.account.usedBytes, "128");

  const cleaned = await service.executeDocumentCleanup(accountId, upload.document.id);
  assert.equal(cleaned.deleted, true);
  assert.equal(cleaned.releasedBytes, "128");
  assert.equal(state.account.usedBytes, "0");
  assert.equal(state.deletes.length, 2);
  assert.match(state.deletes[1].objectKey, /\/normalized\/v1-index-1\.ndjson$/);
});

test("knowledge-base cleanup releases orphaned reindex usage and reservations", async () => {
  const { service, state } = harness();
  const base = await createBase(service);
  const indexVersionId = state.indexes[0].id;
  state.ledger.push(
    {
      id: "ledger-shadow-used",
      accountId,
      entryType: "settle",
      component: "chunk_text",
      reservedDeltaBytes: "0",
      usedDeltaBytes: "120",
      reservationKey: `reindex:${indexVersionId}:chunks`,
      knowledgeBaseId: base.id,
      documentId: null,
      indexVersionId,
      metadata: {}
    },
    {
      id: "ledger-shadow-reserved",
      accountId,
      entryType: "reserve",
      component: "vector",
      reservedDeltaBytes: "40",
      usedDeltaBytes: "0",
      reservationKey: `reindex:${indexVersionId}:vectors`,
      knowledgeBaseId: base.id,
      documentId: null,
      indexVersionId,
      metadata: {}
    }
  );
  state.account.usedBytes = "120";
  state.account.reservedBytes = "40";

  await service.deleteBase(accountId, base.id, { expectedVersion: base.version });
  const cleaned = await service.executeBaseCleanup(accountId, base.id);
  assert.equal(cleaned.deleted, true);
  assert.equal(cleaned.releasedBytes, "120");
  assert.equal(state.account.usedBytes, "0");
  assert.equal(state.account.reservedBytes, "0");
  assert.equal(state.bases.has(base.id), false);
});

test("an existing document requires the reindex flow before profile changes", async () => {
  const { service } = harness();
  const base = await createBase(service);
  await service.createUploadGrant(accountId, base.id, {
    displayName: "guide.txt",
    declaredMimeType: "text/plain",
    declaredBytes: 128
  });
  await assert.rejects(
    service.updateBase(accountId, base.id, {
      expectedVersion: base.version,
      embeddingProfileId: "openai-text-embedding-3-small"
    }),
    (error) => error.code === "KB_EMBEDDING_PROFILE_CHANGE_REQUIRES_REINDEX"
  );
});

test("an empty base profile switch retires old indexes and clears the active pointer", async () => {
  const { service, state } = harness();
  const base = await createBase(service);
  const stored = state.bases.get(base.id);
  state.bases.set(base.id, { ...stored, activeIndexVersion: 1, pendingIndexVersion: null });

  const result = await service.updateBase(accountId, base.id, {
    expectedVersion: base.version,
    embeddingProfileId: "openai-text-embedding-3-small"
  });
  assert.equal(result.base.embeddingProfile.vendor, "openai");
  assert.equal(result.base.activeIndexVersion, null);
  assert.equal(result.base.pendingIndexVersion, 2);
  assert.equal(state.indexes.length, 2);
  assert.equal(state.indexes.at(-1).version, 2);
});
