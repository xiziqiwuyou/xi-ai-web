import crypto from "node:crypto";
import {
  APPROVED_KNOWLEDGE_EMBEDDING_PROFILES,
  publicKnowledgeEmbeddingProfiles,
  requireKnowledgeEmbeddingProfile
} from "../embedding-profiles.mjs";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../errors.mjs";
import { createKnowledgeQuotaService } from "../quotas/service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;
const BASE_STATUSES = new Set(["active", "archived"]);
const UPLOADED_DOCUMENT_STATUSES = new Set([
  "uploaded",
  "parsing",
  "awaiting_embedding",
  "embedding",
  "ready",
  "needs_ocr"
]);

function nowDate(clock) {
  const value = clock();
  return value instanceof Date ? value : new Date(value);
}

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

function normalizeText(value, field, { min = 0, max }) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.INVALID_REQUEST,
      `${field} 长度需要在 ${min}-${max} 个字符之间`,
      { status: 400, details: { field } }
    );
  }
  return text;
}

function validateDeclaredBytes(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "文件大小无效", {
      status: 400,
      details: { field: "declaredBytes" }
    });
  }
  return number;
}

function validateMimeType(value) {
  const mimeType = String(value || "").trim().toLowerCase();
  if (!MIME_PATTERN.test(mimeType)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "文件 MIME 类型无效", {
      status: 400,
      details: { field: "declaredMimeType" }
    });
  }
  return mimeType;
}

function validateChecksum(value) {
  const checksum = String(value || "").trim().toLowerCase();
  if (!checksum) return null;
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "SHA-256 校验值无效", {
      status: 400,
      details: { field: "checksumSha256" }
    });
  }
  return checksum;
}

function publicBase(base) {
  return {
    id: base.id,
    name: base.name,
    description: base.description,
    status: base.status,
    embeddingProfile: base.embedding
      ? {
          id: base.embedding.catalogModelId,
          vendor: base.embedding.vendor,
          actualModel: base.embedding.actualModel,
          dimensions: base.embedding.dimensions,
          fingerprint: base.embedding.fingerprint
        }
      : null,
    chunkVersion: base.chunkVersion,
    activeIndexVersion: base.activeIndexVersion,
    pendingIndexVersion: base.pendingIndexVersion,
    version: base.version,
    documentCount: base.documentCount,
    readyDocumentCount: base.readyDocumentCount,
    logicalBytes: base.logicalBytes,
    embeddingProgress: base.embeddingProgress,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    archivedAt: base.archivedAt
  };
}

function publicDocument(document) {
  return {
    id: document.id,
    knowledgeBaseId: document.knowledgeBaseId,
    displayName: document.displayName,
    declaredMimeType: document.declaredMimeType,
    verifiedMimeType: document.verifiedMimeType,
    declaredBytes: document.declaredBytes,
    verifiedBytes: document.verifiedBytes,
    declaredChecksumSha256: document.declaredChecksumSha256,
    checksumSha256: document.checksumSha256,
    objectVersionId: document.objectVersionId,
    objectEtag: document.objectEtag,
    uploadExpiresAt: document.uploadExpiresAt,
    status: document.status,
    parserVersion: document.parserVersion,
    errorCode: document.errorCode,
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

function requireBase(base) {
  if (!base) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND, "知识库不存在", {
      status: 404
    });
  }
  return base;
}

function requireDocument(document) {
  if (!document) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_NOT_FOUND, "文档不存在", {
      status: 404
    });
  }
  return document;
}

function validateUploadHead(document, head, input) {
  if (!Number.isSafeInteger(head.bytes) || head.bytes < 1) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_MISMATCH, "无法确认上传文件大小", {
      status: 409
    });
  }
  if (head.bytes !== Number(document.declaredBytes)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_MISMATCH, "实际文件大小与申请不一致", {
      status: 409,
      details: {
        declaredBytes: document.declaredBytes,
        actualBytes: String(head.bytes)
      }
    });
  }
  if (input.etag && head.etag && input.etag !== head.etag) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_MISMATCH, "文件 ETag 与上传结果不一致", {
      status: 409
    });
  }
  if (
    document.declaredChecksumSha256 &&
    head.checksumSha256 &&
    document.declaredChecksumSha256 !== head.checksumSha256
  ) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_MISMATCH, "文件 SHA-256 校验失败", {
      status: 409
    });
  }
}

export function createKnowledgeLibraryService({
  repositories,
  objectStore,
  clock = () => new Date(),
  cryptoModule = crypto,
  quotaService = createKnowledgeQuotaService({ repositories, cryptoModule })
}) {
  if (!repositories?.library || !repositories?.quota || typeof repositories.transaction !== "function") {
    throw new TypeError("Knowledge library service requires library, quota and transaction repositories");
  }
  if (!objectStore?.createUploadGrant || !objectStore?.headObject || !objectStore?.deleteObject) {
    throw new TypeError("Knowledge library service requires an object-store adapter");
  }

  const service = {
    embeddingProfiles() {
      return { items: publicKnowledgeEmbeddingProfiles() };
    },

    async listBases(accountId) {
      return { items: (await repositories.library.listBases(accountId)).map(publicBase) };
    },

    async getBase(accountId, baseId) {
      const base = requireBase(
        await repositories.library.findBase(accountId, validateUuid(baseId, "baseId"))
      );
      return { base: publicBase(base) };
    },

    async createBase(accountId, input) {
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["name", "description", "embeddingProfileId"]));
      const name = normalizeText(payload.name, "name", { min: 1, max: 120 });
      const description = normalizeText(payload.description || "", "description", { max: 2000 });
      const profile = requireKnowledgeEmbeddingProfile(payload.embeddingProfileId);
      const baseId = cryptoModule.randomUUID();
      const base = await repositories.transaction(async (transaction) => {
        const context = await quotaService.lockContext(transaction, accountId);
        if (context.account.knowledgeBaseCount >= context.effectiveLimits.maxKnowledgeBasesPerAccount) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.KNOWLEDGE_BASE_LIMIT_EXCEEDED,
            "知识库数量已达到当前账号上限",
            { status: 409, details: { limit: context.effectiveLimits.maxKnowledgeBasesPerAccount } }
          );
        }
        const created = await transaction.library.insertBase({
          id: baseId,
          accountId,
          name,
          description,
          embedding: {
            vendor: profile.vendor,
            catalogModelId: profile.id,
            actualModel: profile.actualModel,
            dimensions: profile.dimensions,
            fingerprint: profile.fingerprint
          }
        });
        await transaction.library.insertIndexVersion({
          id: cryptoModule.randomUUID(),
          accountId,
          knowledgeBaseId: baseId,
          version: 1,
          chunkVersion: 1,
          embedding: created.embedding
        });
        return created;
      });
      return { base: publicBase(base) };
    },

    async updateBase(accountId, baseId, input) {
      const id = validateUuid(baseId, "baseId");
      const payload = assertObject(input);
      rejectUnknownKeys(
        payload,
        new Set(["expectedVersion", "name", "description", "status", "embeddingProfileId"])
      );
      const expectedVersion = validateExpectedVersion(payload.expectedVersion);
      const result = await repositories.transaction(async (transaction) => {
        const current = requireBase(await transaction.library.findBase(accountId, id, { forUpdate: true }));
        if (current.version !== expectedVersion) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "知识库已更新，请刷新后重试", {
            status: 409
          });
        }
        const nextName = "name" in payload
          ? normalizeText(payload.name, "name", { min: 1, max: 120 })
          : current.name;
        const nextDescription = "description" in payload
          ? normalizeText(payload.description, "description", { max: 2000 })
          : current.description;
        const nextStatus = "status" in payload ? String(payload.status) : current.status;
        if (!BASE_STATUSES.has(nextStatus)) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "status 无效", {
            status: 400,
            details: { field: "status" }
          });
        }
        const profile = "embeddingProfileId" in payload
          ? requireKnowledgeEmbeddingProfile(payload.embeddingProfileId)
          : APPROVED_KNOWLEDGE_EMBEDDING_PROFILES.find(
              (entry) => entry.fingerprint === current.embedding?.fingerprint
            );
        if (!profile) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.EMBEDDING_PROFILE_INVALID,
            "知识库当前向量模型不再受支持",
            { status: 409 }
          );
        }
        const profileChanged = current.embedding?.fingerprint !== profile.fingerprint;
        if (profileChanged && current.documentCount > 0) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.EMBEDDING_PROFILE_CHANGE_REQUIRES_REINDEX,
            "已有文档的知识库需要通过重新索引切换向量模型",
            { status: 409 }
          );
        }
        const nextIndexVersion = profileChanged
          ? Math.max(current.activeIndexVersion || 0, current.pendingIndexVersion || 0) + 1
          : current.pendingIndexVersion;
        const updated = await transaction.library.updateBase(accountId, id, expectedVersion, {
          name: nextName,
          description: nextDescription,
          status: nextStatus,
          pendingIndexVersion: nextIndexVersion,
          activeIndexVersion: profileChanged ? null : current.activeIndexVersion,
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
        if (profileChanged) {
          await transaction.library.retireReplaceableIndexVersions(accountId, id);
          await transaction.library.insertIndexVersion({
            id: cryptoModule.randomUUID(),
            accountId,
            knowledgeBaseId: id,
            version: nextIndexVersion,
            chunkVersion: current.chunkVersion,
            embedding: {
              vendor: profile.vendor,
              catalogModelId: profile.id,
              actualModel: profile.actualModel,
              dimensions: profile.dimensions,
              fingerprint: profile.fingerprint
            }
          });
        }
        return requireBase(await transaction.library.findBase(accountId, id));
      });
      return { base: publicBase(result) };
    },

    async deleteBase(accountId, baseId, input) {
      const id = validateUuid(baseId, "baseId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["expectedVersion"]));
      const expectedVersion = validateExpectedVersion(payload.expectedVersion);
      const job = await repositories.transaction(async (transaction) => {
        const current = requireBase(await transaction.library.findBase(accountId, id, { forUpdate: true }));
        if (current.version !== expectedVersion) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "知识库已更新，请刷新后重试", {
            status: 409
          });
        }
        if (!(await transaction.library.markBaseDeleting(accountId, id, expectedVersion))) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "知识库已更新，请刷新后重试", {
            status: 409
          });
        }
        await transaction.library.markBaseDocumentsDeleting(accountId, id);
        return transaction.library.enqueueJob({
          id: cryptoModule.randomUUID(),
          accountId,
          knowledgeBaseId: id,
          dedupeKey: `base-delete:${id}`,
          kind: "cleanup"
        });
      });
      return { accepted: true, job };
    },

    async listDocuments(accountId, baseId) {
      const id = validateUuid(baseId, "baseId");
      requireBase(await repositories.library.findBase(accountId, id));
      return {
        items: (await repositories.library.listDocuments(accountId, id)).map(publicDocument)
      };
    },

    async createUploadGrant(accountId, baseId, input) {
      const id = validateUuid(baseId, "baseId");
      const payload = assertObject(input);
      rejectUnknownKeys(
        payload,
        new Set(["displayName", "declaredMimeType", "declaredBytes", "checksumSha256"])
      );
      const displayName = normalizeText(payload.displayName, "displayName", { min: 1, max: 512 });
      const declaredMimeType = validateMimeType(payload.declaredMimeType);
      const declaredBytes = validateDeclaredBytes(payload.declaredBytes);
      const declaredChecksumSha256 = validateChecksum(payload.checksumSha256);
      const documentId = cryptoModule.randomUUID();
      const opaqueObjectId = cryptoModule.randomUUID();
      const objectKey = `knowledge/${accountId}/${id}/${documentId}/source/${opaqueObjectId}`;
      const reservationKey = `document-upload:${documentId}`;
      const uploadExpiresAt = new Date(
        nowDate(clock).getTime() + objectStore.grantTtlSeconds * 1000
      );

      const document = await repositories.transaction(async (transaction) => {
        const context = await quotaService.lockContext(transaction, accountId);
        const base = requireBase(await transaction.library.findBase(accountId, id, { forUpdate: true }));
        if (base.status !== "active") {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_STATE_INVALID, "仅活动知识库可以上传文档", {
            status: 409
          });
        }
        if (declaredBytes > context.effectiveLimits.maxFileBytes) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.FILE_TOO_LARGE, "文件超过当前账号的单文件限制", {
            status: 413,
            details: { maxFileBytes: context.effectiveLimits.maxFileBytes }
          });
        }
        if (context.account.documentCount >= context.effectiveLimits.maxDocumentsPerAccount) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_LIMIT_EXCEEDED, "账号文档数量已达上限", {
            status: 409
          });
        }
        const baseDocumentCount = await transaction.quota.countDocumentsInBase(accountId, id);
        if (baseDocumentCount >= context.effectiveLimits.maxDocumentsPerKnowledgeBase) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_LIMIT_EXCEEDED, "该知识库文档数量已达上限", {
            status: 409
          });
        }
        if (context.account.activeUploadCount >= context.effectiveLimits.maxConcurrentUploadsPerAccount) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_IN_PROGRESS_LIMIT, "并发上传数量已达上限", {
            status: 429,
            details: { limit: context.effectiveLimits.maxConcurrentUploadsPerAccount }
          });
        }
        const pending = await transaction.library.insertPendingDocument({
          id: documentId,
          accountId,
          knowledgeBaseId: id,
          displayName,
          declaredMimeType,
          declaredBytes,
          declaredChecksumSha256,
          objectKey,
          uploadReservationKey: reservationKey,
          uploadExpiresAt
        });
        await quotaService.reserve(transaction, {
          context,
          accountId,
          knowledgeBaseId: id,
          documentId,
          reservationKey,
          component: "original",
          bytes: declaredBytes,
          expiresAt: uploadExpiresAt,
          metadata: { purpose: "direct_upload" }
        });
        return pending;
      });

      try {
        const grant = await objectStore.createUploadGrant({ objectKey });
        return {
          document: publicDocument(document),
          upload: {
            ...grant,
            expiresAt: uploadExpiresAt.toISOString(),
            constraints: {
              contentLength: declaredBytes,
              contentType: declaredMimeType
            },
            requiredHeaders: {
              "Content-Type": declaredMimeType
            }
          }
        };
      } catch (error) {
        await repositories.transaction(async (transaction) => {
          const context = await quotaService.lockContext(transaction, accountId, { requireActive: false });
          const current = await transaction.library.findDocument(accountId, documentId, { forUpdate: true });
          if (!current || current.status !== "pending_upload") return;
          await quotaService.release(transaction, {
            context,
            accountId,
            knowledgeBaseId: id,
            documentId,
            reservationKey,
            component: "original",
            metadata: { reason: "grant_failed" }
          });
          await transaction.library.deletePendingDocument(accountId, documentId);
        }).catch(() => undefined);
        throw error;
      }
    },

    async finalizeUpload(accountId, documentId, input = {}) {
      const id = validateUuid(documentId, "documentId");
      const payload = input && typeof input === "object" && !Array.isArray(input) ? input : {};
      rejectUnknownKeys(payload, new Set(["etag", "versionId"]));
      const etag = payload.etag ? String(payload.etag).trim().replace(/^"|"$/g, "") : null;
      const versionId = payload.versionId
        ? normalizeText(payload.versionId, "versionId", { min: 1, max: 512 })
        : null;
      const initial = requireDocument(await repositories.library.findDocument(accountId, id));
      if (UPLOADED_DOCUMENT_STATUSES.has(initial.status)) {
        return { document: publicDocument(initial), idempotent: true };
      }
      if (initial.status !== "pending_upload") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_STATE_INVALID, "文档当前状态不能完成上传", {
          status: 409,
          details: { status: initial.status }
        });
      }
      if (initial.uploadExpiresAt && new Date(initial.uploadExpiresAt) <= nowDate(clock)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_EXPIRED, "上传授权已过期，请重新上传", {
          status: 409
        });
      }
      const head = await objectStore.headObject({ objectKey: initial.objectKey, versionId });
      validateUploadHead(initial, head, { etag });

      return repositories.transaction(async (transaction) => {
        const context = await quotaService.lockContext(transaction, accountId);
        const current = requireDocument(
          await transaction.library.findDocument(accountId, id, { forUpdate: true })
        );
        if (UPLOADED_DOCUMENT_STATUSES.has(current.status)) {
          return { document: publicDocument(current), idempotent: true };
        }
        if (current.status !== "pending_upload" || current.version !== initial.version) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_STATE_INVALID, "文档上传状态已变化", {
            status: 409
          });
        }
        if (current.uploadExpiresAt && new Date(current.uploadExpiresAt) <= nowDate(clock)) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_EXPIRED, "上传授权已过期，请重新上传", {
            status: 409
          });
        }
        await quotaService.settle(transaction, {
          context,
          accountId,
          knowledgeBaseId: current.knowledgeBaseId,
          documentId: current.id,
          reservationKey: current.uploadReservationKey,
          component: "original",
          actualBytes: head.bytes,
          metadata: { etag: head.etag, versionId: head.versionId }
        });
        const uploaded = await transaction.library.markDocumentUploaded(
          accountId,
          current.id,
          current.version,
          {
            bytes: head.bytes,
            contentType: null,
            checksumSha256: head.checksumSha256,
            versionId: head.versionId,
            etag: head.etag
          }
        );
        if (!uploaded) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_STATE_INVALID, "文档上传状态已变化", {
            status: 409
          });
        }
        const job = await transaction.library.enqueueJob({
          id: cryptoModule.randomUUID(),
          accountId,
          knowledgeBaseId: current.knowledgeBaseId,
          documentId: current.id,
          dedupeKey: `document-parse:${current.id}`,
          kind: "parse"
        });
        return { document: publicDocument(uploaded), job, idempotent: false };
      });
    },

    async deleteDocument(accountId, documentId, input) {
      const id = validateUuid(documentId, "documentId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["expectedVersion"]));
      const expectedVersion = validateExpectedVersion(payload.expectedVersion);
      const job = await repositories.transaction(async (transaction) => {
        const current = requireDocument(
          await transaction.library.findDocument(accountId, id, { forUpdate: true })
        );
        if (current.version !== expectedVersion) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "文档已更新，请刷新后重试", {
            status: 409
          });
        }
        if (!(await transaction.library.markDocumentDeleting(accountId, id, expectedVersion))) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "文档已更新，请刷新后重试", {
            status: 409
          });
        }
        return transaction.library.enqueueJob({
          id: cryptoModule.randomUUID(),
          accountId,
          knowledgeBaseId: current.knowledgeBaseId,
          documentId: id,
          dedupeKey: `document-delete:${id}`,
          kind: "cleanup"
        });
      });
      return { accepted: true, job };
    },

    async cleanupExpiredUploads({ limit = 50 } = {}) {
      const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
      const documents = await repositories.library.findExpiredPendingUploads(boundedLimit);
      const result = { inspected: documents.length, cleaned: 0, failed: 0 };
      for (const document of documents) {
        try {
          await objectStore.deleteObject({
            objectKey: document.objectKey,
            versionId: document.objectVersionId
          });
          await repositories.transaction(async (transaction) => {
            const context = await quotaService.lockContext(transaction, document.accountId, {
              requireActive: false
            });
            const current = await transaction.library.findDocument(
              document.accountId,
              document.id,
              { forUpdate: true }
            );
            if (
              !current ||
              current.status !== "pending_upload" ||
              !current.uploadExpiresAt ||
              new Date(current.uploadExpiresAt) > nowDate(clock)
            ) return;
            await quotaService.release(transaction, {
              context,
              accountId: current.accountId,
              knowledgeBaseId: current.knowledgeBaseId,
              documentId: current.id,
              reservationKey: current.uploadReservationKey,
              component: "original",
              metadata: { reason: "upload_expired" }
            });
            await transaction.library.deletePendingDocument(current.accountId, current.id);
            result.cleaned += 1;
          });
        } catch {
          result.failed += 1;
        }
      }
      return result;
    },

    async executeDocumentCleanup(accountId, documentId) {
      const id = validateUuid(documentId, "documentId");
      const initial = await repositories.library.findDocument(accountId, id);
      if (!initial) return { deleted: false, missing: true };
      if (initial.status !== "deleting") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_STATE_INVALID, "文档未进入删除流程", {
          status: 409
        });
      }
      await objectStore.deleteObject({
        objectKey: initial.objectKey,
        versionId: initial.objectVersionId
      });
      if (initial.normalizedObjectKey) {
        await objectStore.deleteObject({ objectKey: initial.normalizedObjectKey });
      }
      return repositories.transaction(async (transaction) => {
        const context = await quotaService.lockContext(transaction, accountId, {
          requireActive: false
        });
        const current = await transaction.library.findDocument(accountId, id, { forUpdate: true });
        if (!current) return { deleted: false, missing: true };
        if (current.status !== "deleting") {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_STATE_INVALID, "文档删除状态已变化", {
            status: 409
          });
        }
        if (current.uploadReservationKey) {
          await quotaService.release(transaction, {
            context,
            accountId,
            knowledgeBaseId: current.knowledgeBaseId,
            documentId: id,
            reservationKey: current.uploadReservationKey,
            component: "original",
            metadata: { reason: "document_deleted" }
          });
        }
        const usage = await quotaService.releaseDocumentUsage(transaction, {
          context,
          accountId,
          knowledgeBaseId: current.knowledgeBaseId,
          documentId: id,
          reservationKey: `document-delete:${id}`,
          metadata: { reason: "document_deleted" }
        });
        const deleted = await transaction.library.deleteDocument(accountId, id);
        return { deleted: Boolean(deleted), releasedBytes: usage.releasedBytes };
      });
    },

    async executeBaseCleanup(accountId, baseId) {
      const id = validateUuid(baseId, "baseId");
      const base = await repositories.library.findBase(accountId, id);
      if (!base) return { deleted: false, missing: true };
      if (base.status !== "deleting") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_STATE_INVALID, "知识库未进入删除流程", {
          status: 409
        });
      }
      const documents = await repositories.library.listDocuments(accountId, id);
      let released = 0n;
      for (const document of documents) {
        const result = await service.executeDocumentCleanup(accountId, document.id);
        released += BigInt(result.releasedBytes || "0");
      }
      return repositories.transaction(async (transaction) => {
        const context = await quotaService.lockContext(transaction, accountId, {
          requireActive: false
        });
        const current = await transaction.library.findBase(accountId, id, { forUpdate: true });
        if (!current) return { deleted: false, missing: true, releasedBytes: released.toString() };
        if (current.status !== "deleting") {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_STATE_INVALID, "知识库删除状态已变化", {
            status: 409
          });
        }
        const remainder = await quotaService.releaseBaseUsage(transaction, {
          context,
          accountId,
          knowledgeBaseId: id,
          reservationKey: `base-delete:${id}`,
          metadata: { reason: "knowledge_base_deleted" }
        });
        released += BigInt(remainder.releasedBytes || "0");
        const deleted = await transaction.library.deleteBase(accountId, id);
        return { deleted: Boolean(deleted), releasedBytes: released.toString() };
      });
    }
  };
  return Object.freeze(service);
}
