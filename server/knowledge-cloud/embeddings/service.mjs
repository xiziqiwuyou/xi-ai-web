import crypto from "node:crypto";
import {
  APPROVED_KNOWLEDGE_EMBEDDING_PROFILES,
  requireKnowledgeEmbeddingProfile
} from "../embedding-profiles.mjs";
import { KNOWLEDGE_ERROR_CODES, KnowledgeError, knowledgeError } from "../errors.mjs";
import { createKnowledgeQuotaService } from "../quotas/service.mjs";
import {
  createKnowledgeEmbeddingProvider,
  normalizeKnowledgeUpstreamCode,
  normalizeKnowledgeEmbeddingConnection
} from "./provider.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/u;
const EMBEDDABLE_DOCUMENT_STATUSES = new Set(["awaiting_embedding", "embedding", "ready"]);

function assertObject(value, field = "payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 必须是对象`, {
      status: 400,
      details: { field }
    });
  }
  return value;
}

function rejectUnknownKeys(value, allowed, field = "payload") {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 包含不支持的字段`, {
      status: 400,
      details: { field, unknown }
    });
  }
}

function validateUuid(value, field) {
  const id = String(value || "").trim();
  if (!UUID_PATTERN.test(id)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 无效`, {
      status: 400,
      details: { field }
    });
  }
  return id;
}

function validateExpectedVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "expectedVersion 无效", {
      status: 400,
      details: { field: "expectedVersion" }
    });
  }
  return version;
}

function validateIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "idempotencyKey 无效", {
      status: 400,
      details: { field: "idempotencyKey" }
    });
  }
  return key;
}

function nowDate(clock) {
  const value = clock();
  return value instanceof Date ? value : new Date(value);
}

function exactApprovedProfile(snapshot) {
  return APPROVED_KNOWLEDGE_EMBEDDING_PROFILES.find(
    (profile) =>
      profile.vendor === snapshot?.vendor &&
      profile.id === snapshot?.catalogModelId &&
      profile.actualModel === snapshot?.actualModel &&
      profile.dimensions === snapshot?.dimensions &&
      profile.fingerprint === snapshot?.fingerprint
  ) || null;
}

function requireDocumentContext(context) {
  if (!context) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_NOT_FOUND, "文档不存在", {
      status: 404
    });
  }
  if (context.baseStatus !== "active") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "归档或删除中的知识库不能继续索引", {
      status: 409
    });
  }
  if (!EMBEDDABLE_DOCUMENT_STATUSES.has(context.documentStatus)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "文档尚未进入可向量化状态", {
      status: 409,
      details: { documentStatus: context.documentStatus }
    });
  }
  return context;
}

function verifyRequestedProfile(context, profileId) {
  const requested = requireKnowledgeEmbeddingProfile(profileId);
  const persisted = exactApprovedProfile(context.profile);
  if (!persisted || persisted.fingerprint !== requested.fingerprint) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_PROFILE_INVALID,
      "向量连接与知识库索引模型不匹配",
      {
        status: 409,
        details: {
          expectedProfileId: context.profile?.catalogModelId || null,
          receivedProfileId: requested.id
        }
      }
    );
  }
  return persisted;
}

function isShadowReindex(context) {
  return context.activeIndexVersion !== null &&
    context.pendingIndexVersion === context.indexVersion &&
    context.activeIndexVersion !== context.pendingIndexVersion;
}

function batchReservationKey(batchId) {
  return `embedding-batch:${batchId}:vectors`;
}

function reindexChunkReservationKey(indexVersionId) {
  return `reindex:${indexVersionId}:chunks`;
}

function reindexVectorReservationKey(indexVersionId) {
  return `reindex:${indexVersionId}:vectors`;
}

function publicBatch(batch, { idempotent = false } = {}) {
  return {
    id: batch.id,
    status: batch.status,
    chunkCount: batch.chunkCount,
    vectorBytes: batch.vectorBytes,
    completedAt: batch.completedAt,
    idempotent
  };
}

function providerErrorMetadata(error) {
  const details = error instanceof KnowledgeError && error.details && typeof error.details === "object"
    ? error.details
    : {};
  const upstreamStatus = Number.isInteger(details.upstreamStatus) &&
    details.upstreamStatus >= 100 && details.upstreamStatus <= 599
    ? details.upstreamStatus
    : null;
  return {
    vendor: ["openai", "qwen"].includes(details.vendor) ? details.vendor : null,
    upstreamStatus,
    upstreamCode: normalizeKnowledgeUpstreamCode(details.upstreamCode, upstreamStatus),
    retryable: details.retryable !== false
  };
}

export function createKnowledgeEmbeddingService({
  repositories,
  provider = createKnowledgeEmbeddingProvider(),
  quotaService = createKnowledgeQuotaService({ repositories }),
  cryptoModule = crypto,
  clock = () => new Date(),
  leaseSeconds = 120
} = {}) {
  if (!repositories?.embeddings || !repositories?.library || !repositories?.quota ||
      typeof repositories.transaction !== "function") {
    throw new TypeError("Knowledge embedding service requires embedding, library, quota and transaction repositories");
  }
  if (!provider?.embed) throw new TypeError("Knowledge embedding service requires a provider adapter");

  async function releaseExpiredBatches(transaction, accountId, quotaContext) {
    const expired = await transaction.embeddings.findExpiredBatches(accountId, 100);
    for (const batch of expired) {
      await transaction.embeddings.resetBatchChunks(batch.id);
      await transaction.embeddings.releaseBatch(
        batch.id,
        "released",
        KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST,
        { retryable: true }
      );
      await quotaService.release(transaction, {
        accountId,
        reservationKey: batchReservationKey(batch.id),
        component: "vector",
        knowledgeBaseId: batch.knowledgeBaseId,
        documentId: batch.documentId,
        indexVersionId: batch.indexVersionId,
        metadata: { reason: "embedding_lease_expired" },
        context: quotaContext
      });
    }
  }

  async function batchProgress(accountId, batch) {
    return repositories.embeddings.documentProgress(
      accountId,
      batch.documentId,
      batch.indexVersionId
    );
  }

  async function claimBatch(accountId, sessionId, documentId, input) {
    const id = validateUuid(documentId, "documentId");
    const payload = assertObject(input);
    rejectUnknownKeys(payload, new Set(["embeddingProfileId", "idempotencyKey", "connection"]));
    const idempotencyKey = validateIdempotencyKey(payload.idempotencyKey);
    const connection = normalizeKnowledgeEmbeddingConnection(payload.connection);

    const claim = await repositories.transaction(async (transaction) => {
      const quotaContext = await quotaService.lockContext(transaction, accountId);
      await releaseExpiredBatches(transaction, accountId, quotaContext);
      const existing = await transaction.embeddings.findBatchByIdempotency(
        accountId,
        idempotencyKey,
        { forUpdate: true }
      );
      if (existing?.status === "completed") {
        if (existing.documentId !== id) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "幂等键已用于其他文档", {
            status: 409
          });
        }
        return { completed: existing, connection };
      }
      if (existing?.status === "leased") {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_IN_PROGRESS,
          "相同向量批次仍在处理中",
          { status: 409, details: { retryable: true } }
        );
      }

      const context = requireDocumentContext(
        await transaction.embeddings.findDocumentContext(accountId, id, { forUpdate: true })
      );
      const profile = verifyRequestedProfile(context, payload.embeddingProfileId);
      const activeBatches = await transaction.embeddings.countActiveBatches(accountId);
      const concurrencyLimit = Number(quotaContext.effectiveLimits.maxConcurrentEmbeddingsPerAccount) || 2;
      if (activeBatches >= concurrencyLimit) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.RATE_LIMITED, "并发向量化任务已达到上限", {
          status: 429,
          details: { limit: concurrencyLimit, retryAfterSeconds: 2 }
        });
      }

      const chunks = await transaction.embeddings.selectChunksForLease({
        accountId,
        knowledgeBaseId: context.knowledgeBaseId,
        documentId: context.documentId,
        indexVersionId: context.indexVersionId,
        limit: profile.maxBatchInputs
      });
      if (!chunks.length) {
        return {
          done: true,
          context,
          profile,
          progress: await transaction.embeddings.documentProgress(
            accountId,
            context.documentId,
            context.indexVersionId
          ),
          connection
        };
      }

      const batchId = existing?.id || cryptoModule.randomUUID();
      const leaseExpiresAt = new Date(nowDate(clock).getTime() + leaseSeconds * 1000);
      const vectorBytes = BigInt(chunks.length) * BigInt(profile.dimensions) * BigInt(profile.bytesPerComponent);
      const shadowReindex = isShadowReindex(context);
      if (!shadowReindex) {
        await quotaService.reserve(transaction, {
          accountId,
          reservationKey: batchReservationKey(batchId),
          component: "vector",
          bytes: vectorBytes.toString(),
          knowledgeBaseId: context.knowledgeBaseId,
          documentId: context.documentId,
          indexVersionId: context.indexVersionId,
          metadata: { chunkCount: chunks.length, dimensions: profile.dimensions },
          expiresAt: leaseExpiresAt,
          context: quotaContext
        });
      }
      const batch = await transaction.embeddings.startBatch({
        id: batchId,
        accountId,
        knowledgeBaseId: context.knowledgeBaseId,
        documentId: context.documentId,
        indexVersionId: context.indexVersionId,
        idempotencyKey,
        leaseOwnerSessionId: sessionId,
        leaseExpiresAt,
        chunkCount: chunks.length
      });
      if (!batch) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_IN_PROGRESS,
          "相同向量批次仍在处理中",
          { status: 409, details: { retryable: true } }
        );
      }
      const leased = await transaction.embeddings.leaseChunks({
        accountId,
        batchId: batch.id,
        leaseExpiresAt,
        chunkIds: chunks.map((chunk) => chunk.id)
      });
      if (leased !== chunks.length) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST,
          "向量批次领取失败，请重试",
          { status: 409, details: { retryable: true } }
        );
      }
      await transaction.embeddings.markDocumentEmbedding(accountId, context.documentId);
      return { batch, chunks, context, profile, vectorBytes, shadowReindex, connection };
    });

    if (claim.completed) {
      const progress = await batchProgress(accountId, claim.completed);
      return {
        done: progress.pendingChunks === 0,
        batch: publicBatch(claim.completed, { idempotent: true }),
        progress,
        providerCall: false
      };
    }
    if (claim.done) {
      return {
        done: claim.progress.pendingChunks === 0,
        batch: null,
        progress: claim.progress,
        providerCall: false
      };
    }
    return claim;
  }

  async function failClaim(accountId, claim, error) {
    const metadata = providerErrorMetadata(error);
    await repositories.transaction(async (transaction) => {
      const quotaContext = await quotaService.lockContext(transaction, accountId, { requireActive: false });
      const batch = await transaction.embeddings.lockBatchForCompletion(
        accountId,
        claim.batch.id,
        claim.batch.leaseOwnerSessionId
      );
      if (!batch) return;
      await transaction.embeddings.resetBatchChunks(batch.id);
      await transaction.embeddings.releaseBatch(
        batch.id,
        "failed",
        KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
        metadata
      );
      if (!claim.shadowReindex) {
        await quotaService.release(transaction, {
          accountId,
          reservationKey: batchReservationKey(batch.id),
          component: "vector",
          knowledgeBaseId: batch.knowledgeBaseId,
          documentId: batch.documentId,
          indexVersionId: batch.indexVersionId,
          metadata: { reason: "embedding_provider_failed" },
          context: quotaContext
        });
      }
      await transaction.embeddings.markDocumentAwaitingError(
        accountId,
        batch.documentId,
        KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
        metadata
      );
    });
  }

  async function commitClaim(accountId, sessionId, claim, providerResult) {
    return repositories.transaction(async (transaction) => {
      const quotaContext = await quotaService.lockContext(transaction, accountId);
      const batch = await transaction.embeddings.lockBatchForCompletion(
        accountId,
        claim.batch.id,
        sessionId
      );
      if (!batch) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST,
          "向量批次租约已失效，请继续索引",
          { status: 409, details: { retryable: true } }
        );
      }
      const context = requireDocumentContext(
        await transaction.embeddings.findDocumentContext(
          accountId,
          batch.documentId,
          { forUpdate: true }
        )
      );
      const profile = exactApprovedProfile(context.profile);
      if (!profile || profile.fingerprint !== claim.profile.fingerprint ||
          context.indexVersionId !== batch.indexVersionId) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST,
          "知识库索引已切换，请继续索引",
          { status: 409, details: { retryable: true } }
        );
      }
      if (providerResult.embeddings.length !== claim.chunks.length) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
          "向量服务返回数量与批次不一致",
          { status: 502 }
        );
      }
      const vectors = claim.chunks.map((chunk, index) => ({
        chunkId: chunk.id,
        embedding: providerResult.embeddings[index]
      }));
      const inserted = await transaction.embeddings.insertVectors({
        dimensions: profile.dimensions,
        accountId,
        knowledgeBaseId: context.knowledgeBaseId,
        indexVersionId: context.indexVersionId,
        vectors
      });
      if (inserted !== vectors.length) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST, "向量批次写入不完整", {
          status: 409,
          details: { retryable: true }
        });
      }
      const completedChunks = await transaction.embeddings.completeBatchChunks(batch.id);
      if (completedChunks !== vectors.length) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST, "向量批次租约已失效", {
          status: 409,
          details: { retryable: true }
        });
      }
      const vectorBytes = BigInt(vectors.length) * BigInt(profile.dimensions) * BigInt(profile.bytesPerComponent);
      if (!claim.shadowReindex) {
        await quotaService.settle(transaction, {
          accountId,
          reservationKey: batchReservationKey(batch.id),
          component: "vector",
          actualBytes: vectorBytes.toString(),
          knowledgeBaseId: context.knowledgeBaseId,
          documentId: context.documentId,
          indexVersionId: context.indexVersionId,
          metadata: { chunkCount: vectors.length, dimensions: profile.dimensions },
          context: quotaContext
        });
      }
      if (!(await transaction.embeddings.completeBatch(batch.id, providerResult.usage, vectorBytes.toString()))) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST, "向量批次租约已失效", {
          status: 409,
          details: { retryable: true }
        });
      }
      await transaction.embeddings.markReadyDocuments(
        accountId,
        context.knowledgeBaseId,
        context.indexVersionId
      );
      await transaction.embeddings.refreshIndexLogicalBytes(
        accountId,
        context.knowledgeBaseId,
        context.indexVersionId
      );

      const indexProgress = await transaction.embeddings.indexProgress(
        accountId,
        context.knowledgeBaseId,
        context.indexVersionId
      );
      let cutover = false;
      let cleanedIndexVersion = null;
      if (indexProgress.pendingChunks === 0 && claim.shadowReindex) {
        const oldIndex = await transaction.embeddings.findIndex(
          accountId,
          context.knowledgeBaseId,
          context.activeIndexVersion,
          { forUpdate: true }
        );
        const nextIndex = await transaction.embeddings.findIndex(
          accountId,
          context.knowledgeBaseId,
          context.pendingIndexVersion,
          { forUpdate: true }
        );
        if (!oldIndex || !nextIndex || nextIndex.id !== context.indexVersionId) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST, "影子索引状态已变化", {
            status: 409,
            details: { retryable: true }
          });
        }
        await quotaService.settle(transaction, {
          accountId,
          reservationKey: reindexVectorReservationKey(nextIndex.id),
          component: "vector",
          actualBytes: indexProgress.vectorBytes,
          knowledgeBaseId: context.knowledgeBaseId,
          indexVersionId: nextIndex.id,
          metadata: { reason: "reindex_cutover", dimensions: profile.dimensions }
        });
        const documentFootprints = await transaction.embeddings.indexDocumentFootprints(
          accountId,
          context.knowledgeBaseId,
          nextIndex.id
        );
        await quotaService.attributeIndexUsage(transaction, {
          accountId,
          knowledgeBaseId: context.knowledgeBaseId,
          indexVersionId: nextIndex.id,
          components: ["chunk_text", "vector"],
          allocations: documentFootprints.flatMap((footprint) => [
            {
              component: "chunk_text",
              documentId: footprint.documentId,
              usedBytes: footprint.chunkBytes
            },
            {
              component: "vector",
              documentId: footprint.documentId,
              usedBytes: footprint.vectorBytes
            }
          ]),
          reservationKey: `reindex-attribution:${nextIndex.id}`,
          metadata: { reason: "reindex_document_attribution" }
        });
        if (!(await transaction.embeddings.cutoverReindex({
          accountId,
          knowledgeBaseId: context.knowledgeBaseId,
          oldIndex,
          nextIndex
        }))) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_BATCH_LEASE_LOST, "影子索引切换失败", {
            status: 409,
            details: { retryable: true }
          });
        }
        await quotaService.releaseIndexUsage(transaction, {
          accountId,
          knowledgeBaseId: context.knowledgeBaseId,
          indexVersionId: oldIndex.id,
          components: ["chunk_text", "vector"],
          reservationKey: `reindex-cleanup:${oldIndex.id}`,
          metadata: { reason: "reindex_old_index_cleanup" }
        });
        await transaction.embeddings.deleteRetiredIndex(
          accountId,
          context.knowledgeBaseId,
          oldIndex.id
        );
        cutover = true;
        cleanedIndexVersion = oldIndex.version;
      } else if (context.activeIndexVersion === null) {
        cutover = await transaction.embeddings.activateInitialIndex(
          accountId,
          context.knowledgeBaseId,
          context.indexVersionId,
          context.indexVersion
        );
      }

      return {
        done: (await transaction.embeddings.documentProgress(
          accountId,
          context.documentId,
          context.indexVersionId
        )).pendingChunks === 0,
        batch: publicBatch({ ...batch, status: "completed", vectorBytes: vectorBytes.toString(), completedAt: nowDate(clock) }),
        progress: await transaction.embeddings.documentProgress(
          accountId,
          context.documentId,
          context.indexVersionId
        ),
        indexProgress,
        cutover,
        cleanedIndexVersion,
        providerCall: true
      };
    });
  }

  return Object.freeze({
    async nextBatch(accountId, sessionId, documentId, input) {
      const claim = await claimBatch(accountId, sessionId, documentId, input);
      if (!claim.batch || !claim.chunks) return claim;
      try {
        const providerResult = await provider.embed({
          profile: claim.profile,
          connection: claim.connection,
          input: claim.chunks.map((chunk) => chunk.text)
        });
        return await commitClaim(accountId, sessionId, claim, providerResult);
      } catch (error) {
        await failClaim(accountId, claim, error).catch(() => {});
        throw error;
      }
    },

    async reindex(accountId, baseId, input) {
      const id = validateUuid(baseId, "baseId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["expectedVersion", "embeddingProfileId"]));
      const expectedVersion = validateExpectedVersion(payload.expectedVersion);
      const profile = requireKnowledgeEmbeddingProfile(payload.embeddingProfileId);
      return repositories.transaction(async (transaction) => {
        await quotaService.lockContext(transaction, accountId);
        const base = await transaction.library.findBase(accountId, id, { forUpdate: true });
        if (!base) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND, "知识库不存在", {
            status: 404
          });
        }
        if (base.version !== expectedVersion) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "知识库已更新，请刷新后重试", {
            status: 409
          });
        }
        if (base.status !== "active") {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "归档或删除中的知识库不能重新索引", {
            status: 409
          });
        }
        if (base.pendingIndexVersion !== null || base.activeIndexVersion === null) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.REINDEX_IN_PROGRESS,
            base.pendingIndexVersion !== null ? "知识库已有正在构建的索引" : "请先完成当前索引",
            { status: 409 }
          );
        }
        const activeIndex = await transaction.embeddings.findIndex(
          accountId,
          id,
          base.activeIndexVersion,
          { forUpdate: true }
        );
        if (!activeIndex || activeIndex.status !== "active") {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.REINDEX_IN_PROGRESS, "当前索引状态不可重建", {
            status: 409
          });
        }
        const footprint = await transaction.embeddings.indexFootprint(accountId, id, activeIndex.id);
        if (footprint.incompleteChunks > 0) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.REINDEX_IN_PROGRESS, "请先完成当前文档的向量化", {
            status: 409,
            details: { incompleteChunks: footprint.incompleteChunks }
          });
        }
        const nextVersion = Math.max(base.activeIndexVersion, base.pendingIndexVersion || 0) + 1;
        const nextIndexId = cryptoModule.randomUUID();
        const vectorBytes = BigInt(footprint.chunkCount) * BigInt(profile.dimensions) * BigInt(profile.bytesPerComponent);
        if (BigInt(footprint.chunkBytes) > 0n) {
          await quotaService.reserve(transaction, {
            accountId,
            reservationKey: reindexChunkReservationKey(nextIndexId),
            component: "chunk_text",
            bytes: footprint.chunkBytes,
            knowledgeBaseId: id,
            indexVersionId: nextIndexId,
            metadata: { reason: "reindex_shadow_chunks", chunkCount: footprint.chunkCount }
          });
        }
        if (vectorBytes > 0n) {
          await quotaService.reserve(transaction, {
            accountId,
            reservationKey: reindexVectorReservationKey(nextIndexId),
            component: "vector",
            bytes: vectorBytes.toString(),
            knowledgeBaseId: id,
            indexVersionId: nextIndexId,
            metadata: {
              reason: "reindex_shadow_vectors",
              chunkCount: footprint.chunkCount,
              dimensions: profile.dimensions
            }
          });
        }
        await transaction.library.insertIndexVersion({
          id: nextIndexId,
          accountId,
          knowledgeBaseId: id,
          version: nextVersion,
          chunkVersion: base.chunkVersion,
          embedding: {
            vendor: profile.vendor,
            catalogModelId: profile.id,
            actualModel: profile.actualModel,
            dimensions: profile.dimensions,
            fingerprint: profile.fingerprint
          }
        });
        const cloned = await transaction.embeddings.cloneIndexChunks({
          accountId,
          knowledgeBaseId: id,
          sourceIndexVersionId: activeIndex.id,
          targetIndexVersionId: nextIndexId
        });
        if (cloned !== footprint.chunkCount) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.REINDEX_IN_PROGRESS, "影子索引分块复制不完整", {
            status: 409
          });
        }
        if (BigInt(footprint.chunkBytes) > 0n) {
          await quotaService.settle(transaction, {
            accountId,
            reservationKey: reindexChunkReservationKey(nextIndexId),
            component: "chunk_text",
            actualBytes: footprint.chunkBytes,
            knowledgeBaseId: id,
            indexVersionId: nextIndexId,
            metadata: { reason: "reindex_shadow_chunks", chunkCount: cloned }
          });
        }
        const updated = await transaction.library.updateBase(accountId, id, expectedVersion, {
          name: base.name,
          description: base.description,
          status: base.status,
          pendingIndexVersion: nextVersion,
          activeIndexVersion: base.activeIndexVersion,
          embedding: {
            vendor: profile.vendor,
            catalogModelId: profile.id,
            actualModel: profile.actualModel,
            dimensions: profile.dimensions,
            fingerprint: profile.fingerprint
          }
        });
        if (!updated) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "知识库已更新，请刷新后重试", {
            status: 409
          });
        }
        await transaction.embeddings.refreshIndexLogicalBytes(accountId, id, nextIndexId);
        let cutover = false;
        if (footprint.chunkCount === 0) {
          const nextIndex = await transaction.embeddings.findIndex(
            accountId,
            id,
            nextVersion,
            { forUpdate: true }
          );
          if (!nextIndex || !(await transaction.embeddings.cutoverReindex({
            accountId,
            knowledgeBaseId: id,
            oldIndex: activeIndex,
            nextIndex
          }))) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.REINDEX_IN_PROGRESS, "空索引切换失败", {
              status: 409
            });
          }
          await quotaService.releaseIndexUsage(transaction, {
            accountId,
            knowledgeBaseId: id,
            indexVersionId: activeIndex.id,
            components: ["chunk_text", "vector"],
            reservationKey: `reindex-cleanup:${activeIndex.id}`,
            metadata: { reason: "reindex_old_index_cleanup" }
          });
          await transaction.embeddings.deleteRetiredIndex(accountId, id, activeIndex.id);
          cutover = true;
        }
        return {
          accepted: true,
          reindex: {
            knowledgeBaseId: id,
            sourceIndexVersion: activeIndex.version,
            pendingIndexVersion: nextVersion,
            embeddingProfileId: profile.id,
            totalChunks: footprint.chunkCount,
            reservedBytes: (BigInt(footprint.chunkBytes) + vectorBytes).toString(),
            cutover
          }
        };
      });
    }
  });
}

export const knowledgeEmbeddingReservationKeys = Object.freeze({
  batch: batchReservationKey,
  reindexChunks: reindexChunkReservationKey,
  reindexVectors: reindexVectorReservationKey
});
