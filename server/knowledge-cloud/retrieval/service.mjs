import {
  APPROVED_KNOWLEDGE_EMBEDDING_PROFILES
} from "../embedding-profiles.mjs";
import {
  createKnowledgeEmbeddingProvider,
  normalizeKnowledgeEmbeddingConnection,
  normalizeKnowledgeUpstreamCode
} from "../embeddings/provider.mjs";
import { KNOWLEDGE_ERROR_CODES, KnowledgeError, knowledgeError } from "../errors.mjs";
import { resolveKnowledgeEffectiveLimits } from "../limits.mjs";
import {
  KNOWLEDGE_RETRIEVAL_BOUNDS,
  buildBoundedKnowledgeContext,
  deduplicateAdjacentChunks,
  fuseRetrievalResults,
  utf8ByteLength
} from "./fusion.mjs";
import { createKnowledgeRetrievalRateLimiter } from "./rate-limit.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_KEYS = new Set([
  "query",
  "context",
  "queryContext",
  "knowledgeBaseIds",
  "baseIds",
  "topK",
  "connections",
  "embeddingConnections",
  "connection"
]);

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

function normalizeBaseIds(payload) {
  const supplied = payload.knowledgeBaseIds ?? payload.baseIds;
  if (!Array.isArray(supplied)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "knowledgeBaseIds 必须是数组", {
      status: 400,
      details: { field: "knowledgeBaseIds" }
    });
  }
  if (supplied.length < 1 || supplied.length > KNOWLEDGE_RETRIEVAL_BOUNDS.maxBases) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "单次只能检索 1-3 个知识库", {
      status: 400,
      details: { field: "knowledgeBaseIds", max: KNOWLEDGE_RETRIEVAL_BOUNDS.maxBases }
    });
  }
  const ids = [...new Set(supplied.map((id, index) => validateUuid(id, `knowledgeBaseIds[${index}]`)))];
  if (ids.length !== supplied.length) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "knowledgeBaseIds 不能重复", {
      status: 400,
      details: { field: "knowledgeBaseIds" }
    });
  }
  if (ids.length < 1 || ids.length > KNOWLEDGE_RETRIEVAL_BOUNDS.maxBases) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "单次只能检索 1-3 个知识库", {
      status: 400,
      details: { field: "knowledgeBaseIds", max: KNOWLEDGE_RETRIEVAL_BOUNDS.maxBases }
    });
  }
  return ids;
}

function boundedText(value, field, maximumBytes, { required = false } = {}) {
  const text = String(value ?? "").normalize("NFKC").trim();
  const byteLength = utf8ByteLength(text);
  if ((required && !text) || /\u0000/u.test(text)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 无效`, {
      status: 400,
      details: { field }
    });
  }
  if (byteLength > maximumBytes) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.REQUEST_TOO_LARGE, `${field} 超过大小限制`, {
      status: 413,
      details: { field, maxBytes: maximumBytes }
    });
  }
  return text;
}

function resolveEffectiveTopK(requested, effectiveLimit) {
  const serverLimit = Math.min(
    KNOWLEDGE_RETRIEVAL_BOUNDS.maxTopK,
    Math.max(1, Math.trunc(Number(effectiveLimit) || KNOWLEDGE_RETRIEVAL_BOUNDS.maxTopK))
  );
  if (requested === undefined || requested === null || requested === "") return serverLimit;
  const parsed = Number(requested);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "topK 无效", {
      status: 400,
      details: { field: "topK" }
    });
  }
  return Math.min(parsed, serverLimit);
}

function sameProfile(left, right) {
  return Boolean(left && right &&
    left.vendor === right.vendor &&
    left.catalogModelId === right.catalogModelId &&
    left.actualModel === right.actualModel &&
    Number(left.dimensions) === Number(right.dimensions) &&
    left.fingerprint === right.fingerprint);
}

function approvedProfile(snapshot) {
  return APPROVED_KNOWLEDGE_EMBEDDING_PROFILES.find((profile) =>
    profile.vendor === snapshot?.vendor &&
    profile.id === snapshot?.catalogModelId &&
    profile.actualModel === snapshot?.actualModel &&
    profile.dimensions === Number(snapshot?.dimensions) &&
    profile.fingerprint === snapshot?.fingerprint
  ) || null;
}

function requireReadyBase(base) {
  const profile = approvedProfile(base?.profile);
  const activeProfile = approvedProfile(base?.activeIndex?.profile);
  const ready = base?.status === "active" &&
    base.activeIndexVersion !== null &&
    base.activeIndex?.status === "active" &&
    base.activeIndex.version === base.activeIndexVersion &&
    profile && activeProfile && sameProfile(profileToSnapshot(profile), base.profile) &&
    sameProfile(base.profile, base.activeIndex.profile);
  if (!ready) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INDEX_NOT_READY, "知识库索引尚未就绪", {
      status: 409,
      details: { knowledgeBaseId: base?.id || null }
    });
  }
  if (base.readyDocumentCount !== base.documentCount) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INDEX_NOT_READY, "知识库仍有文档未完成索引", {
      status: 409,
      details: { knowledgeBaseId: base.id }
    });
  }
  return profile;
}

function profileToSnapshot(profile) {
  return {
    vendor: profile.vendor,
    catalogModelId: profile.id,
    actualModel: profile.actualModel,
    dimensions: profile.dimensions,
    fingerprint: profile.fingerprint
  };
}

function groupKey(base, profile) {
  return [
    profile.vendor,
    profile.actualModel,
    profile.dimensions,
    base.activeIndex.version,
    profile.fingerprint
  ].join("\u0000");
}

function groupBases(bases) {
  const groups = new Map();
  for (const base of bases) {
    const profile = requireReadyBase(base);
    const key = groupKey(base, profile);
    const group = groups.get(key) || { key, profile, indexVersion: base.activeIndex.version, bases: [] };
    group.bases.push(base);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function addConnection(map, key, value) {
  if (!key || !value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value.connection && typeof value.connection === "object" ? value.connection : value;
  map.set(String(key), { apiKey: source.apiKey });
}

function connectionMap(payload) {
  const map = new Map();
  const source = payload.embeddingConnections ?? payload.connections;
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const connection = entry.connection && typeof entry.connection === "object"
        ? entry.connection
        : entry;
      for (const key of [entry.profileId, entry.fingerprint, entry.vendor]) {
        addConnection(map, key, connection);
      }
    }
  } else if (source && typeof source === "object") {
    for (const [key, value] of Object.entries(source)) addConnection(map, key, value);
  }
  if (payload.connection) addConnection(map, "__single__", payload.connection);
  return map;
}

function connectionForGroup(map, group, groupCount) {
  const candidates = [
    group.key,
    group.profile.id,
    group.profile.fingerprint,
    group.profile.vendor,
    ...(groupCount === 1 ? ["__single__"] : [])
  ];
  const raw = candidates.map((key) => map.get(key)).find(Boolean);
  if (!raw) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_CONNECTION_REQUIRED,
      "所选知识库缺少兼容的向量连接",
      {
        status: 400,
        details: {
          embeddingProfileId: group.profile.id,
          knowledgeBaseIds: group.bases.map((base) => base.id)
        }
      }
    );
  }
  return normalizeKnowledgeEmbeddingConnection(raw);
}

function providerFailure(error, group) {
  const details = error instanceof KnowledgeError && error.details && typeof error.details === "object"
    ? error.details
    : {};
  const upstreamStatus = Number.isInteger(details.upstreamStatus) &&
    details.upstreamStatus >= 100 && details.upstreamStatus <= 599
    ? details.upstreamStatus
    : null;
  return knowledgeError(
    KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
    "知识库查询向量生成失败",
    {
      status: 502,
      details: {
        embeddingProfileId: group.profile.id,
        knowledgeBaseIds: group.bases.map((base) => base.id),
        upstreamStatus,
        upstreamCode: normalizeKnowledgeUpstreamCode(details.upstreamCode, upstreamStatus),
        retryable: details.retryable !== false
      }
    }
  );
}

function effectiveRetrievalLimits(context) {
  const account = context?.account;
  if (!account) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "需要登录知识库账号", {
      status: 401
    });
  }
  if (account.status === "frozen") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.ACCOUNT_FROZEN, "知识库账号已冻结", {
      status: 423
    });
  }
  if (account.status !== "active" || !context.settings) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "知识库账号不可用", {
      status: 401
    });
  }
  return resolveKnowledgeEffectiveLimits(context.settings, account);
}

export function createKnowledgeRetrievalService({
  repositories,
  provider = createKnowledgeEmbeddingProvider(),
  rateLimiter,
  tokenSecret,
  maximumContextBytes = KNOWLEDGE_RETRIEVAL_BOUNDS.maxContextBytes
} = {}) {
  if (!repositories?.retrieval?.findRetrievalContext) {
    throw new TypeError("Knowledge retrieval service requires the retrieval repository");
  }
  if (!provider?.embed) throw new TypeError("Knowledge retrieval service requires an embedding provider");
  const limiter = rateLimiter || createKnowledgeRetrievalRateLimiter({
    repository: repositories.auth,
    tokenSecret
  });

  return Object.freeze({
    async retrieve(accountId, input, { signal } = {}) {
      const payload = assertObject(input);
      rejectUnknownKeys(payload, REQUEST_KEYS);
      const knowledgeBaseIds = normalizeBaseIds(payload);
      const query = boundedText(
        payload.query,
        "query",
        KNOWLEDGE_RETRIEVAL_BOUNDS.maxQueryBytes,
        { required: true }
      );
      const queryContext = boundedText(
        payload.queryContext ?? payload.context ?? "",
        "context",
        KNOWLEDGE_RETRIEVAL_BOUNDS.maxQueryContextBytes
      );

      const retrievalContext = await repositories.retrieval.findRetrievalContext(accountId);
      const effectiveLimits = effectiveRetrievalLimits(retrievalContext);

      const effectiveTopK = resolveEffectiveTopK(
        payload.topK,
        effectiveLimits.maxRetrievalTopK
      );
      const requestRateLimit = Math.max(
        1,
        Math.trunc(Number(effectiveLimits.retrievalRequestsPerMinutePerAccount) || 60)
      );
      await limiter.consume(accountId, requestRateLimit);

      const found = await repositories.retrieval.findBasesForRetrieval(accountId, knowledgeBaseIds);
      const byId = new Map(found.map((base) => [base.id, base]));
      const missing = knowledgeBaseIds.filter((id) => !byId.has(id));
      if (missing.length) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND, "知识库不存在", {
          status: 404,
          details: { knowledgeBaseIds: missing }
        });
      }
      const bases = knowledgeBaseIds.map((id) => byId.get(id));
      const groups = groupBases(bases);

      const connections = connectionMap(payload);
      const groupInputs = groups.map((group) => ({
        ...group,
        connection: connectionForGroup(connections, group, groups.length)
      }));
      const embeddingInput = queryContext ? `${query}\n\n${queryContext}` : query;
      const embeddingSettled = await Promise.allSettled(
        groupInputs.map((group) => provider.embed({
          profile: group.profile,
          connection: group.connection,
          input: [embeddingInput],
          signal
        }))
      );
      const failedEmbedding = embeddingSettled.findIndex((result) => result.status === "rejected");
      if (failedEmbedding >= 0) {
        throw providerFailure(embeddingSettled[failedEmbedding].reason, groupInputs[failedEmbedding]);
      }
      const groupVectors = new Map();
      embeddingSettled.forEach((result, index) => {
        const group = groupInputs[index];
        const vector = result.value?.embeddings?.[0];
        if (!Array.isArray(vector) || vector.length !== group.profile.dimensions ||
            vector.some((value) => !Number.isFinite(Number(value)))) {
          throw providerFailure(
            knowledgeError(KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR, "向量维度无效", {
              status: 502,
              details: { retryable: false }
            }),
            group
          );
        }
        groupVectors.set(group.key, vector.map(Number));
      });

      const searchLimit = Math.min(100, Math.max(12, effectiveTopK * 4));
      const searchEntries = groupInputs.flatMap((group) => group.bases.map((base) => ({ group, base })));
      const searchSettled = await Promise.allSettled(searchEntries.map(({ group, base }) =>
        repositories.retrieval.searchSimilar({
          accountId,
          knowledgeBaseId: base.id,
          indexVersionId: base.activeIndex.id,
          dimensions: group.profile.dimensions,
          queryEmbedding: groupVectors.get(group.key),
          limit: searchLimit
        })
      ));
      const failedSearch = searchSettled.find((result) => result.status === "rejected");
      if (failedSearch) throw failedSearch.reason;
      const baseResults = searchEntries.map(({ base }, index) => ({
        baseId: base.id,
        hits: searchSettled[index].value
      }));
      const fused = fuseRetrievalResults(baseResults);
      const deduplicated = deduplicateAdjacentChunks(fused).slice(0, effectiveTopK);
      const formatted = buildBoundedKnowledgeContext(deduplicated, {
        maximumBytes: maximumContextBytes
      });

      return {
        mode: "vector",
        knowledgeBaseIds,
        topK: effectiveTopK,
        maxTopK: Math.min(
          KNOWLEDGE_RETRIEVAL_BOUNDS.maxTopK,
          Math.max(1, Number(effectiveLimits.maxRetrievalTopK) || KNOWLEDGE_RETRIEVAL_BOUNDS.maxTopK)
        ),
        queryBytes: utf8ByteLength(query),
        context: formatted.context,
        contextBytes: formatted.contextBytes,
        contextTruncated: formatted.truncated,
        chunks: formatted.chunks,
        citations: formatted.citations,
        profileGroups: groupInputs.map((group) => ({
          embeddingProfileId: group.profile.id,
          vendor: group.profile.vendor,
          actualModel: group.profile.actualModel,
          dimensions: group.profile.dimensions,
          indexVersion: group.indexVersion,
          knowledgeBaseIds: group.bases.map((base) => base.id)
        }))
      };
    }
  });
}

export { resolveEffectiveTopK as resolveKnowledgeRetrievalTopK };
