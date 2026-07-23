import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../errors.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_KEYS = new Set(["chunkId", "disposition"]);

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

function sourceInput(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "source 必须是对象", {
      status: 400,
      details: { field: "source" }
    });
  }
  const unknown = Object.keys(value).filter((key) => !SOURCE_KEYS.has(key));
  if (unknown.length) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "source 包含不支持的字段", {
      status: 400,
      details: { field: "source", unknown }
    });
  }
  return value;
}

function sourceDisposition(value) {
  const disposition = value === undefined || value === null || value === ""
    ? "inline"
    : String(value);
  if (!new Set(["inline", "attachment"]).has(disposition)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "disposition 无效", {
      status: 400,
      details: { field: "disposition" }
    });
  }
  return disposition;
}

export function createKnowledgeCitationService({
  repositories,
  objectStore,
  sourceUrlTtlSeconds = 5 * 60
} = {}) {
  if (!repositories?.retrieval?.findAuthorizedSource) {
    throw new TypeError("Knowledge citation service requires the retrieval repository");
  }
  if (!objectStore?.createSourceDownloadUrl) {
    throw new TypeError("Knowledge citation service requires signed COS source URLs");
  }
  const ttl = Math.min(15 * 60, Math.max(30, Math.trunc(Number(sourceUrlTtlSeconds) || 5 * 60)));

  return Object.freeze({
    async openSource(accountId, documentId, input = {}) {
      const id = validateUuid(documentId, "documentId");
      const payload = sourceInput(input);
      const chunkId = validateUuid(payload.chunkId, "chunkId");
      const disposition = sourceDisposition(payload.disposition);
      const source = await repositories.retrieval.findAuthorizedSource(accountId, id, chunkId);
      if (!source) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_NOT_FOUND, "文档来源不存在", {
          status: 404
        });
      }
      const signed = await objectStore.createSourceDownloadUrl({
        objectKey: source.objectKey,
        versionId: source.objectVersionId,
        disposition,
        downloadName: source.documentName,
        expiresSeconds: ttl
      });
      return {
        source: {
          url: signed.url,
          expiresAt: signed.expiresAt,
          expiresInSeconds: signed.expiresInSeconds,
          disposition,
          knowledgeBaseId: source.knowledgeBaseId,
          knowledgeBaseName: source.knowledgeBaseName,
          documentId: source.documentId,
          documentName: source.documentName,
          chunkId: source.chunkId,
          locator: source.locator
        }
      };
    }
  });
}

export const createKnowledgeSourceService = createKnowledgeCitationService;
