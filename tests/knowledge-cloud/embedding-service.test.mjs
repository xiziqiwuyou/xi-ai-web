import assert from "node:assert/strict";
import test from "node:test";
import {
  createKnowledgeEmbeddingService,
  knowledgeEmbeddingReservationKeys
} from "../../server/knowledge-cloud/embeddings/service.mjs";
import { requireKnowledgeEmbeddingProfile } from "../../server/knowledge-cloud/embedding-profiles.mjs";
import {
  KNOWLEDGE_ERROR_CODES,
  knowledgeError
} from "../../server/knowledge-cloud/errors.mjs";

const accountId = "00000000-0000-4000-8000-0000000000a1";
const otherAccountId = "00000000-0000-4000-8000-0000000000a2";
const baseId = "00000000-0000-4000-8000-0000000000b1";
const documentId = "00000000-0000-4000-8000-0000000000d1";
const sessionId = "00000000-0000-4000-8000-0000000000e1";
const initialIndexId = "00000000-0000-4000-8000-000000000101";

function snapshot(profile) {
  return {
    vendor: profile.vendor,
    catalogModelId: profile.id,
    actualModel: profile.actualModel,
    dimensions: profile.dimensions,
    fingerprint: profile.fingerprint
  };
}

function createHarness({ active = false, providerFailure = null, loseLease = false, activeBatches = 0 } = {}) {
  const initialProfile = requireKnowledgeEmbeddingProfile("openai-text-embedding-3-small");
  const state = {
    inTransaction: false,
    providerCalls: 0,
    providerInputs: [],
    activeBatches,
    base: {
      id: baseId,
      accountId,
      name: "产品资料",
      description: "",
      status: "active",
      embedding: snapshot(initialProfile),
      chunkVersion: 1,
      activeIndexVersion: active ? 1 : null,
      pendingIndexVersion: active ? null : 1,
      version: 1,
      documentCount: 1,
      readyDocumentCount: active ? 1 : 0,
      logicalBytes: "0"
    },
    document: { id: documentId, status: active ? "ready" : "awaiting_embedding", version: 1 },
    indexes: new Map([[1, {
      id: initialIndexId,
      accountId,
      knowledgeBaseId: baseId,
      version: 1,
      status: active ? "active" : "building",
      chunkVersion: 1,
      logicalBytes: "0",
      profile: snapshot(initialProfile)
    }]]),
    chunks: [0, 1].map((ordinal) => ({
      id: `00000000-0000-4000-8000-0000000002${ordinal + 10}`,
      documentId,
      indexVersionId: initialIndexId,
      ordinal,
      text: `chunk-${ordinal}`,
      contentHash: String(ordinal).repeat(64),
      embeddingState: active ? "ready" : "pending",
      leaseId: null
    })),
    batches: new Map(),
    expiredBatchIds: new Set(),
    vectors: new Map(),
    quotaEvents: [],
    deletedIndexes: [],
    uuidCounter: 500
  };

  const targetIndex = () => state.indexes.get(state.base.pendingIndexVersion ?? state.base.activeIndexVersion);
  const progress = (indexVersionId, targetDocumentId = null) => {
    const chunks = state.chunks.filter((chunk) =>
      chunk.indexVersionId === indexVersionId && (!targetDocumentId || chunk.documentId === targetDocumentId));
    const ready = chunks.filter((chunk) => chunk.embeddingState === "ready").length;
    return {
      totalChunks: chunks.length,
      readyChunks: ready,
      pendingChunks: chunks.length - ready,
      leasedChunks: chunks.filter((chunk) => chunk.embeddingState === "leased").length,
      failedChunks: chunks.filter((chunk) => chunk.embeddingState === "failed").length,
      vectorBytes: String(ready * (targetIndex()?.profile.dimensions || initialProfile.dimensions) * 4),
      lastErrorCode: null
    };
  };

  const embeddings = {
    async findExpiredBatches(ownerId) {
      if (ownerId !== accountId) return [];
      return [...state.batches.values()].filter(
        (batch) => batch.status === "leased" && state.expiredBatchIds.has(batch.id)
      );
    },
    async findBatchByIdempotency(_accountId, key) {
      return [...state.batches.values()].find((batch) => batch.idempotencyKey === key) || null;
    },
    async findDocumentContext(ownerId, targetDocumentId) {
      if (ownerId !== accountId || targetDocumentId !== documentId) return null;
      const index = targetIndex();
      return index ? {
        accountId,
        knowledgeBaseId: baseId,
        documentId,
        documentStatus: state.document.status,
        documentVersion: state.document.version,
        baseStatus: state.base.status,
        baseVersion: state.base.version,
        activeIndexVersion: state.base.activeIndexVersion,
        pendingIndexVersion: state.base.pendingIndexVersion,
        indexVersionId: index.id,
        indexVersion: index.version,
        indexStatus: index.status,
        chunkVersion: index.chunkVersion,
        profile: index.profile
      } : null;
    },
    async countActiveBatches() { return state.activeBatches; },
    async selectChunksForLease({ indexVersionId, limit }) {
      return state.chunks
        .filter((chunk) => chunk.indexVersionId === indexVersionId && ["pending", "failed"].includes(chunk.embeddingState))
        .slice(0, limit)
        .map((chunk) => ({ id: chunk.id, ordinal: chunk.ordinal, text: chunk.text, contentHash: chunk.contentHash }));
    },
    async startBatch(batch) {
      const existing = [...state.batches.values()].find((item) => item.idempotencyKey === batch.idempotencyKey);
      const next = {
        ...(existing || {}),
        ...batch,
        status: "leased",
        providerUsage: {},
        errorCode: null,
        errorMetadata: {},
        vectorBytes: "0",
        completedAt: null
      };
      state.batches.set(next.id, next);
      return next;
    },
    async leaseChunks({ batchId, chunkIds }) {
      let count = 0;
      for (const chunk of state.chunks) {
        if (chunkIds.includes(chunk.id) && ["pending", "failed"].includes(chunk.embeddingState)) {
          chunk.embeddingState = "leased";
          chunk.leaseId = batchId;
          count += 1;
        }
      }
      return count;
    },
    async markDocumentEmbedding() {
      if (state.document.status === "awaiting_embedding") state.document.status = "embedding";
      return documentId;
    },
    async documentProgress(_accountId, _documentId, indexVersionId) {
      return progress(indexVersionId, documentId);
    },
    async lockBatchForCompletion(_accountId, batchId, ownerSessionId) {
      if (loseLease) return null;
      const batch = state.batches.get(batchId);
      return batch?.status === "leased" && batch.leaseOwnerSessionId === ownerSessionId ? batch : null;
    },
    async insertVectors({ vectors }) {
      for (const vector of vectors) state.vectors.set(vector.chunkId, vector.embedding);
      return vectors.length;
    },
    async completeBatchChunks(batchId) {
      let count = 0;
      for (const chunk of state.chunks) {
        if (chunk.leaseId === batchId && chunk.embeddingState === "leased") {
          chunk.embeddingState = "ready";
          chunk.leaseId = null;
          count += 1;
        }
      }
      return count;
    },
    async completeBatch(batchId, usage, vectorBytes) {
      const batch = state.batches.get(batchId);
      if (!batch || batch.status !== "leased") return null;
      Object.assign(batch, {
        status: "completed",
        providerUsage: usage,
        vectorBytes,
        completedAt: new Date("2026-07-22T00:00:00.000Z")
      });
      return batchId;
    },
    async markReadyDocuments(_accountId, _baseId, indexVersionId) {
      const next = progress(indexVersionId, documentId);
      if (next.totalChunks && next.pendingChunks === 0 && ["awaiting_embedding", "embedding"].includes(state.document.status)) {
        state.document.status = "ready";
        state.base.readyDocumentCount = 1;
        return 1;
      }
      return 0;
    },
    async refreshIndexLogicalBytes() { return "1"; },
    async indexProgress(_accountId, _baseId, indexVersionId) { return progress(indexVersionId); },
    async activateInitialIndex(_accountId, _baseId, indexVersionId, version) {
      const index = state.indexes.get(version);
      index.status = "active";
      state.base.activeIndexVersion = version;
      state.base.pendingIndexVersion = null;
      return index.id === indexVersionId;
    },
    async resetBatchChunks(batchId) {
      let count = 0;
      for (const chunk of state.chunks) {
        if (chunk.leaseId === batchId) {
          chunk.embeddingState = "pending";
          chunk.leaseId = null;
          count += 1;
        }
      }
      return count;
    },
    async releaseBatch(batchId, status, errorCode, errorMetadata) {
      const batch = state.batches.get(batchId);
      if (!batch || batch.status !== "leased") return null;
      Object.assign(batch, { status, errorCode, errorMetadata });
      return batchId;
    },
    async markDocumentAwaitingError(_accountId, _documentId, errorCode, errorMetadata) {
      if (state.document.status === "embedding") state.document.status = "awaiting_embedding";
      state.document.errorCode = errorCode;
      state.document.errorMetadata = errorMetadata;
      return documentId;
    },
    async findIndex(_accountId, _baseId, version) { return state.indexes.get(version) || null; },
    async indexFootprint(_accountId, _baseId, indexVersionId) {
      const chunks = state.chunks.filter((chunk) => chunk.indexVersionId === indexVersionId);
      return {
        chunkCount: chunks.length,
        chunkBytes: String(chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.text), 0)),
        incompleteChunks: chunks.filter((chunk) => chunk.embeddingState !== "ready").length
      };
    },
    async indexDocumentFootprints(_accountId, _baseId, indexVersionId) {
      const chunks = state.chunks.filter((chunk) => chunk.indexVersionId === indexVersionId);
      const dimensions = targetIndex()?.profile.dimensions || initialProfile.dimensions;
      return [{
        documentId,
        chunkCount: chunks.length,
        chunkBytes: String(chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.text), 0)),
        vectorBytes: String(chunks.filter((chunk) => chunk.embeddingState === "ready").length * dimensions * 4)
      }];
    },
    async cloneIndexChunks({ sourceIndexVersionId, targetIndexVersionId }) {
      const source = state.chunks.filter((chunk) =>
        chunk.indexVersionId === sourceIndexVersionId && chunk.embeddingState === "ready");
      for (const chunk of source) {
        state.chunks.push({
          ...chunk,
          id: `00000000-0000-4000-8000-${String(state.uuidCounter++).padStart(12, "0")}`,
          indexVersionId: targetIndexVersionId,
          embeddingState: "pending",
          leaseId: null
        });
      }
      return source.length;
    },
    async cutoverReindex({ oldIndex, nextIndex }) {
      oldIndex.status = "retired";
      nextIndex.status = "active";
      state.base.activeIndexVersion = nextIndex.version;
      state.base.pendingIndexVersion = null;
      return baseId;
    },
    async deleteRetiredIndex(_accountId, _baseId, indexVersionId) {
      const index = [...state.indexes.values()].find((item) => item.id === indexVersionId);
      state.chunks = state.chunks.filter((chunk) => chunk.indexVersionId !== indexVersionId);
      state.indexes.delete(index.version);
      state.deletedIndexes.push(indexVersionId);
      return { chunks: 2, index: 1 };
    }
  };

  const library = {
    async findBase(ownerId, targetBaseId) {
      return ownerId === accountId && targetBaseId === baseId ? { ...state.base } : null;
    },
    async insertIndexVersion(index) {
      state.indexes.set(index.version, {
        id: index.id,
        accountId,
        knowledgeBaseId: baseId,
        version: index.version,
        status: "building",
        chunkVersion: index.chunkVersion,
        logicalBytes: "0",
        profile: index.embedding
      });
      return index.id;
    },
    async updateBase(_accountId, _baseId, expectedVersion, next) {
      if (state.base.version !== expectedVersion) return null;
      Object.assign(state.base, {
        ...next,
        version: state.base.version + 1
      });
      return baseId;
    }
  };

  const quotaService = {
    async lockContext() {
      return {
        account: { id: accountId, status: "active", usedBytes: "0", reservedBytes: "0" },
        effectiveLimits: { maxConcurrentEmbeddingsPerAccount: 2, quotaBytes: 5 * 1024 ** 3 }
      };
    },
    async reserve(_transaction, input) {
      state.quotaEvents.push({ action: "reserve", ...input });
      return { reservedBytes: String(input.bytes) };
    },
    async settle(_transaction, input) {
      state.quotaEvents.push({ action: "settle", ...input });
      return { usedBytes: String(input.actualBytes), reservedBytes: "0" };
    },
    async release(_transaction, input) {
      state.quotaEvents.push({ action: "release", ...input });
      return { releasedBytes: "1" };
    },
    async releaseIndexUsage(_transaction, input) {
      state.quotaEvents.push({ action: "release-index", ...input });
      return { releasedBytes: "1" };
    },
    async attributeIndexUsage(_transaction, input) {
      state.quotaEvents.push({ action: "attribute-index", ...input });
      return { attributedBytes: input.allocations.reduce(
        (sum, allocation) => sum + BigInt(allocation.usedBytes),
        0n
      ).toString() };
    }
  };

  const repositories = {
    embeddings,
    library,
    quota: {},
    transaction: async (work) => {
      assert.equal(state.inTransaction, false);
      state.inTransaction = true;
      try {
        return await work({ embeddings, library, quota: {} });
      } finally {
        state.inTransaction = false;
      }
    }
  };
  const provider = {
    async embed({ profile, connection, input }) {
      assert.equal(state.inTransaction, false, "provider calls must run outside database transactions");
      state.providerCalls += 1;
      state.providerInputs.push({ profileId: profile.id, connection, input });
      const failure = typeof providerFailure === "function"
        ? providerFailure(state.providerCalls)
        : providerFailure;
      if (failure) throw failure;
      return {
        embeddings: input.map(() => Array.from({ length: profile.dimensions }, () => 0.25)),
        usage: { prompt_tokens: input.length * 3, total_tokens: input.length * 3 }
      };
    }
  };
  const cryptoModule = {
    randomUUID() {
      return `00000000-0000-4000-8000-${String(state.uuidCounter++).padStart(12, "0")}`;
    }
  };
  const service = createKnowledgeEmbeddingService({
    repositories,
    provider,
    quotaService,
    cryptoModule,
    clock: () => new Date("2026-07-22T00:00:00.000Z"),
    leaseSeconds: 120
  });
  return { service, state, initialProfile };
}

test("a committed batch resumes idempotently without a second provider call", async () => {
  const { service, state, initialProfile } = createHarness();
  const connection = { baseUrl: "https://api.openai.com/v1", apiKey: "session-key-only" };
  const payload = {
    embeddingProfileId: initialProfile.id,
    idempotencyKey: "batch-idempotency-0001",
    connection
  };
  const first = await service.nextBatch(accountId, sessionId, documentId, payload);
  assert.equal(first.done, true);
  assert.equal(first.providerCall, true);
  assert.equal(first.batch.chunkCount, 2);
  assert.equal(state.providerCalls, 1);
  assert.equal(state.document.status, "ready");
  assert.equal(state.base.activeIndexVersion, 1);
  assert.equal(state.base.pendingIndexVersion, null);
  assert.equal(state.vectors.size, 2);
  assert.deepEqual(state.quotaEvents.map((event) => event.action), ["reserve", "settle"]);

  const replay = await service.nextBatch(accountId, sessionId, documentId, payload);
  assert.equal(replay.done, true);
  assert.equal(replay.providerCall, false);
  assert.equal(replay.batch.idempotent, true);
  assert.equal(state.providerCalls, 1);
  const persisted = JSON.stringify({
    batches: [...state.batches.values()],
    document: state.document,
    quotaEvents: state.quotaEvents.map(({ connection: _connection, ...event }) => event)
  });
  assert.equal(persisted.includes(connection.apiKey), false);
  assert.equal(persisted.includes(connection.baseUrl), false);
});

test("provider failure releases the lease and stores only redacted metadata", async () => {
  const failure = knowledgeError(
    KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
    "OpenAI request failed",
    {
      status: 502,
      details: {
        vendor: "openai-do-not-persist-this-key",
        upstreamStatus: 401,
        upstreamCode: "do-not-persist-this-key",
        retryable: false
      }
    }
  );
  const { service, state, initialProfile } = createHarness({ providerFailure: failure });
  const connection = { baseUrl: "https://private.proxy/v1", apiKey: "do-not-persist-this-key" };
  await assert.rejects(
    service.nextBatch(accountId, sessionId, documentId, {
      embeddingProfileId: initialProfile.id,
      idempotencyKey: "batch-provider-fail-01",
      connection
    }),
    (error) => error === failure
  );
  const batch = [...state.batches.values()][0];
  assert.equal(batch.status, "failed");
  assert.deepEqual(batch.errorMetadata, {
    vendor: null,
    upstreamStatus: 401,
    upstreamCode: "authentication_error",
    retryable: false
  });
  assert.equal(state.document.status, "awaiting_embedding");
  assert(state.chunks.every((chunk) => chunk.embeddingState === "pending"));
  assert.deepEqual(state.quotaEvents.map((event) => event.action), ["reserve", "release"]);
  const persisted = JSON.stringify({ batch, document: state.document, quotaEvents: state.quotaEvents });
  assert.equal(persisted.includes(connection.apiKey), false);
  assert.equal(persisted.includes(connection.baseUrl), false);
});

test("per-account concurrency and lease loss fail before duplicate vector writes", async () => {
  const limited = createHarness({ activeBatches: 2 });
  await assert.rejects(
    limited.service.nextBatch(accountId, sessionId, documentId, {
      embeddingProfileId: limited.initialProfile.id,
      idempotencyKey: "batch-concurrency-0001",
      connection: { baseUrl: "https://api.openai.com/v1", apiKey: "key" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.RATE_LIMITED
  );
  assert.equal(limited.state.providerCalls, 0);

  const lost = createHarness({ loseLease: true });
  await assert.rejects(
    lost.service.nextBatch(accountId, sessionId, documentId, {
      embeddingProfileId: lost.initialProfile.id,
      idempotencyKey: "batch-lease-loss-0001",
      connection: { baseUrl: "https://api.openai.com/v1", apiKey: "key" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST
  );
  assert.equal(lost.state.providerCalls, 1);
  assert.equal(lost.state.vectors.size, 0);
});

test("failed and expired batches can resume with the same idempotency key", async () => {
  const providerFailure = knowledgeError(
    KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
    "temporary failure",
    { status: 502, details: { upstreamStatus: 503, retryable: true } }
  );
  const failed = createHarness({
    providerFailure: (call) => call === 1 ? providerFailure : null
  });
  const payload = {
    embeddingProfileId: failed.initialProfile.id,
    idempotencyKey: "batch-retry-same-key-01",
    connection: { baseUrl: "https://api.openai.com/v1", apiKey: "session-key" }
  };
  await assert.rejects(failed.service.nextBatch(accountId, sessionId, documentId, payload));
  const retried = await failed.service.nextBatch(accountId, sessionId, documentId, payload);
  assert.equal(retried.done, true);
  assert.equal(failed.state.providerCalls, 2);
  assert.deepEqual(
    failed.state.quotaEvents.map((event) => event.action),
    ["reserve", "release", "reserve", "settle"]
  );

  const expired = createHarness();
  const expiredBatchId = "00000000-0000-4000-8000-000000000777";
  expired.state.batches.set(expiredBatchId, {
    id: expiredBatchId,
    accountId,
    knowledgeBaseId: baseId,
    documentId,
    indexVersionId: initialIndexId,
    idempotencyKey: "batch-expired-same-key-1",
    status: "leased",
    leaseOwnerSessionId: sessionId,
    chunkCount: 1
  });
  expired.state.expiredBatchIds.add(expiredBatchId);
  expired.state.chunks[0].embeddingState = "leased";
  expired.state.chunks[0].leaseId = expiredBatchId;
  const resumed = await expired.service.nextBatch(accountId, sessionId, documentId, {
    embeddingProfileId: expired.initialProfile.id,
    idempotencyKey: "batch-expired-same-key-1",
    connection: { baseUrl: "https://api.openai.com/v1", apiKey: "session-key" }
  });
  assert.equal(resumed.done, true);
  assert.deepEqual(
    expired.state.quotaEvents.map((event) => event.action),
    ["release", "reserve", "settle"]
  );
});

test("cross-account document and base identifiers fail before provider access", async () => {
  const { service, state, initialProfile } = createHarness({ active: true });
  await assert.rejects(
    service.nextBatch(otherAccountId, sessionId, documentId, {
      embeddingProfileId: initialProfile.id,
      idempotencyKey: "batch-cross-account-001",
      connection: { baseUrl: "https://api.openai.com/v1", apiKey: "session-key" }
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.DOCUMENT_NOT_FOUND
  );
  await assert.rejects(
    service.reindex(otherAccountId, baseId, {
      expectedVersion: 1,
      embeddingProfileId: initialProfile.id
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND
  );
  assert.equal(state.providerCalls, 0);
});

test("shadow reindex reserves capacity, embeds the pending version and atomically cleans the old index", async () => {
  const { service, state } = createHarness({ active: true });
  const qwen = requireKnowledgeEmbeddingProfile("qwen-text-embedding-v4");
  const accepted = await service.reindex(accountId, baseId, {
    expectedVersion: 1,
    embeddingProfileId: qwen.id
  });
  assert.equal(accepted.reindex.sourceIndexVersion, 1);
  assert.equal(accepted.reindex.pendingIndexVersion, 2);
  assert.equal(state.base.activeIndexVersion, 1);
  assert.equal(state.base.pendingIndexVersion, 2);
  assert.equal(state.chunks.filter((chunk) => chunk.indexVersionId !== initialIndexId).length, 2);
  assert.deepEqual(state.quotaEvents.map((event) => event.action), ["reserve", "reserve", "settle"]);

  const result = await service.nextBatch(accountId, sessionId, documentId, {
    embeddingProfileId: qwen.id,
    idempotencyKey: "batch-reindex-qwen-01",
    connection: { baseUrl: qwen.defaultBaseUrl, apiKey: "qwen-session-key" }
  });
  assert.equal(result.done, true);
  assert.equal(result.cutover, true);
  assert.equal(result.cleanedIndexVersion, 1);
  assert.equal(state.base.activeIndexVersion, 2);
  assert.equal(state.base.pendingIndexVersion, null);
  assert.deepEqual(state.deletedIndexes, [initialIndexId]);
  assert.equal(state.indexes.has(1), false);
  assert.equal(state.indexes.get(2).status, "active");
  assert.deepEqual(
    state.quotaEvents.map((event) => event.action),
    ["reserve", "reserve", "settle", "settle", "attribute-index", "release-index"]
  );
  assert.equal(
    state.quotaEvents.at(-3).reservationKey,
    knowledgeEmbeddingReservationKeys.reindexVectors(state.indexes.get(2).id)
  );
  assert.deepEqual(
    state.quotaEvents.at(-2).allocations.map((allocation) => ({
      component: allocation.component,
      documentId: allocation.documentId
    })),
    [
      { component: "chunk_text", documentId },
      { component: "vector", documentId }
    ]
  );
  assert.deepEqual(state.quotaEvents.at(-1).components, ["chunk_text", "vector"]);
});
