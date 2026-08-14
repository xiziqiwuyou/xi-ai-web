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
const MAX_CHUNK_TEXT_BYTES = 16_384;
const MAX_CHUNK_REVISIONS = 20;
const CHUNK_PREVIEW_SOURCE_CHARACTERS = 200_000;
const CHUNK_STRATEGY_PRESETS = Object.freeze([
  Object.freeze({ id: "compact", label: "紧凑", maxCharacters: 900, overlapCharacters: 80 }),
  Object.freeze({ id: "balanced", label: "均衡", maxCharacters: 1400, overlapCharacters: 160 }),
  Object.freeze({ id: "context_rich", label: "长上下文", maxCharacters: 2200, overlapCharacters: 240 })
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

function requireChunkStrategy(value) {
  const id = String(value || "").trim();
  const strategy = CHUNK_STRATEGY_PRESETS.find((entry) => entry.id === id);
  if (!strategy) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "chunkStrategyId 无效", {
      status: 400,
      details: { field: "chunkStrategyId" }
    });
  }
  return strategy;
}

function normalizeChunkText(value) {
  const text = String(value ?? "").normalize("NFKC").trim();
  const textBytes = Buffer.byteLength(text, "utf8");
  if (!text || textBytes > MAX_CHUNK_TEXT_BYTES || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "分块文本无效", {
      status: 400,
      details: { field: "text", maxBytes: MAX_CHUNK_TEXT_BYTES }
    });
  }
  return { text, textBytes, tokenEstimate: Math.max(1, Math.ceil([...text].length / 4)) };
}

function publicChunk(chunk) {
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    ordinal: chunk.ordinal,
    text: chunk.text,
    textBytes: chunk.textBytes,
    tokenEstimate: chunk.tokenEstimate,
    locator: chunk.locator,
    enabled: chunk.enabled,
    revision: chunk.revision,
    draft: chunk.draft,
    embeddingStatus: chunk.embeddingStatus,
    strategyId: chunk.strategyId,
    capacity: {
      activeChunkBytes: chunk.activeChunkBytes,
      activeVectorBytes: chunk.activeVectorBytes,
      draftChunkBytes: chunk.draftChunkBytes
    },
    createdAt: chunk.createdAt,
    updatedAt: chunk.updatedAt
  };
}

function previewText(text, strategy) {
  const characters = [...text];
  const items = [];
  let start = 0;
  while (start < characters.length) {
    let end = Math.min(characters.length, start + strategy.maxCharacters);
    if (end < characters.length) {
      const minimum = start + Math.floor(strategy.maxCharacters * 0.65);
      for (let cursor = end; cursor > minimum; cursor -= 1) {
        if (characters[cursor - 1] === "\n") {
          end = cursor;
          break;
        }
      }
    }
    const chunkText = characters.slice(start, end).join("").trim();
    if (chunkText) {
      items.push({
        ordinal: items.length,
        text: chunkText,
        textBytes: String(Buffer.byteLength(chunkText, "utf8")),
        tokenEstimate: Math.max(1, Math.ceil([...chunkText].length / 4)),
        locator: { type: "strategy_preview", characterStart: start, characterEnd: end }
      });
    }
    if (end >= characters.length) break;
    const next = Math.max(start + 1, end - strategy.overlapCharacters);
    start = next;
  }
  return items;
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
    ocr: document.ocrStatus
      ? {
          status: document.ocrStatus,
          provider: document.ocrProvider,
          bytes: document.ocrBytes,
          durationMs: document.ocrDurationMs,
          startedAt: document.ocrStartedAt,
          completedAt: document.ocrCompletedAt
        }
      : null,
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

    chunkStrategyPresets() {
      return { items: CHUNK_STRATEGY_PRESETS };
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

    async listDocumentChunks(accountId, documentId, input = {}) {
      const id = validateUuid(documentId, "documentId");
      requireDocument(await repositories.library.findDocument(accountId, id));
      const limit = Math.min(100, Math.max(1, Number(input.limit) || 50));
      const afterOrdinal = input.cursor === undefined || input.cursor === ""
        ? null
        : Number(input.cursor);
      if (afterOrdinal !== null && (!Number.isSafeInteger(afterOrdinal) || afterOrdinal < 0)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "cursor 无效", {
          status: 400,
          details: { field: "cursor" }
        });
      }
      const rows = await repositories.library.listDocumentChunks(accountId, id, {
        afterOrdinal,
        limit: limit + 1
      });
      const hasMore = rows.length > limit;
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(publicChunk),
        nextCursor: hasMore ? String(visible.at(-1)?.ordinal ?? "") : null,
        capacity: await repositories.library.documentChunkCapacity(accountId, id)
      };
    },

    async previewDocumentChunks(accountId, documentId, input) {
      const id = validateUuid(documentId, "documentId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["chunkStrategyId"]));
      const strategy = requireChunkStrategy(payload.chunkStrategyId);
      requireDocument(await repositories.library.findDocument(accountId, id));
      const sourceChunks = await repositories.library.listActiveChunkText(accountId, id, 501);
      const enabledText = sourceChunks.filter((chunk) => chunk.enabled).map((chunk) => chunk.text).join("\n\n");
      const sourceCharacters = [...enabledText];
      const sourceTruncated = sourceChunks.length > 500 || sourceCharacters.length > CHUNK_PREVIEW_SOURCE_CHARACTERS;
      const boundedText = sourceCharacters.slice(0, CHUNK_PREVIEW_SOURCE_CHARACTERS).join("");
      const chunks = previewText(boundedText, strategy);
      return {
        strategy,
        sourceCharacters: sourceCharacters.length,
        sourceBytes: String(Buffer.byteLength(boundedText, "utf8")),
        sourceTruncated,
        totalChunks: chunks.length,
        items: chunks.slice(0, 12),
        previewTruncated: chunks.length > 12
      };
    },

    async reviseChunk(accountId, chunkId, input) {
      const id = validateUuid(chunkId, "chunkId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["expectedRevision", "text", "enabled"]));
      const expectedRevision = validateExpectedVersion(payload.expectedRevision);
      if (!("text" in payload) && !("enabled" in payload)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "需要提供 text 或 enabled", {
          status: 400
        });
      }
      if ("enabled" in payload && typeof payload.enabled !== "boolean") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "enabled 必须是布尔值", {
          status: 400,
          details: { field: "enabled" }
        });
      }
      return repositories.transaction(async (transaction) => {
        await quotaService.lockContext(transaction, accountId);
        const current = await transaction.library.findActiveChunk(accountId, id, { forUpdate: true });
        if (!current) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_NOT_FOUND, "分块不存在", { status: 404 });
        }
        if (current.revision !== expectedRevision) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "分块已更新，请刷新后重试", {
            status: 409
          });
        }
        if (current.pendingIndexVersion !== null) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.REINDEX_IN_PROGRESS,
            "Chunk edits are blocked while a shadow index is building",
            { status: 409 }
          );
        }
        if (current.revision >= MAX_CHUNK_REVISIONS) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "分块草稿修订次数已达上限", {
            status: 409,
            details: { maxRevisions: MAX_CHUNK_REVISIONS }
          });
        }
        const normalized = "text" in payload
          ? normalizeChunkText(payload.text)
          : { text: current.text, textBytes: Number(current.textBytes), tokenEstimate: current.tokenEstimate };
        const enabled = "enabled" in payload ? Boolean(payload.enabled) : current.enabled;
        await transaction.library.insertChunkRevision({
          id: cryptoModule.randomUUID(),
          accountId,
          knowledgeBaseId: current.knowledgeBaseId,
          documentId: current.documentId,
          sourceChunkId: current.id,
          sourceIndexVersionId: current.sourceIndexVersionId,
          revision: current.revision + 1,
          text: normalized.text,
          textBytes: normalized.textBytes,
          tokenEstimate: normalized.tokenEstimate,
          locator: current.locator,
          enabled,
          strategyId: current.strategyId || "balanced"
        });
        const revised = await transaction.library.findActiveChunk(accountId, id);
        return {
          chunk: publicChunk(revised),
          activeIndexUnchanged: true,
          shadowReindexRequired: true
        };
      });
    },

    async assertChunkDraftReindexAllowed(accountId, baseId) {
      const id = validateUuid(baseId, "baseId");
      requireBase(await repositories.library.findBase(accountId, id));
      const chunkDraftsPending = await repositories.library.hasChunkDrafts(accountId, id);
      return { allowed: true, chunkDraftsPending };
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
      if (initial.ocrObjectKey) {
        await objectStore.deleteObject({ objectKey: initial.ocrObjectKey });
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
