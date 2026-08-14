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
  deduplicateAdjacentChunksDetailed,
  fuseRetrievalResults,
  utf8ByteLength
} from "./fusion.mjs";
import { createKnowledgeRetrievalRateLimiter } from "./rate-limit.mjs";
import { normalizeKnowledgeEnhancementConnection } from "./enhancement-provider.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_KEYS = new Set([
  "query",
  "context",
  "queryContext",
  "knowledgeBaseIds",
  "baseIds",
  "topK",
  "mode",
  "retrievalMode",
  "candidateCount",
  "candidateLimit",
  "minimumRelevance",
  "minRelevance",
  "contextTokenBudget",
  "tokenBudget",
  "queryRewrite",
  "rerank",
  "enhancementConnection",
  "trace",
  "includeTrace",
  "connections",
  "embeddingConnections",
  "connection"
]);
const RETRIEVAL_MODES = new Set(["vector", "fulltext", "hybrid"]);

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

function aliasedValue(payload, primary, alias) {
  if (Object.hasOwn(payload, primary) && Object.hasOwn(payload, alias)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${primary} was provided more than once`, {
      status: 400,
      details: { field: primary }
    });
  }
  return payload[primary] ?? payload[alias];
}

function normalizeRetrievalMode(payload) {
  const requested = aliasedValue(payload, "mode", "retrievalMode");
  if (requested === undefined || requested === null || requested === "") return "vector";
  const mode = String(requested).trim().toLowerCase();
  if (!RETRIEVAL_MODES.has(mode)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "Retrieval mode is invalid", {
      status: 400,
      details: { field: "mode", allowed: [...RETRIEVAL_MODES] }
    });
  }
  return mode;
}

function resolveCandidateCount(payload, topK) {
  const requested = aliasedValue(payload, "candidateCount", "candidateLimit");
  if (requested === undefined || requested === null || requested === "") {
    return Math.min(
      KNOWLEDGE_RETRIEVAL_BOUNDS.maxCandidates,
      Math.max(12, topK * 4)
    );
  }
  const count = Number(requested);
  if (!Number.isSafeInteger(count) || count < 1 ||
      count > KNOWLEDGE_RETRIEVAL_BOUNDS.maxCandidates) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "Candidate count is invalid", {
      status: 400,
      details: {
        field: "candidateCount",
        max: KNOWLEDGE_RETRIEVAL_BOUNDS.maxCandidates
      }
    });
  }
  return count;
}

function resolveMinimumRelevance(payload) {
  const requested = aliasedValue(payload, "minimumRelevance", "minRelevance");
  if (requested === undefined || requested === null || requested === "") return 0;
  const relevance = Number(requested);
  if (!Number.isFinite(relevance) || relevance < 0 || relevance > 1) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "Minimum relevance is invalid", {
      status: 400,
      details: { field: "minimumRelevance", min: 0, max: 1 }
    });
  }
  return relevance;
}

function resolveContextTokenBudget(payload, maximumTokens) {
  const requested = aliasedValue(payload, "contextTokenBudget", "tokenBudget");
  if (requested === undefined || requested === null || requested === "") return maximumTokens;
  const budget = Number(requested);
  if (!Number.isSafeInteger(budget) || budget < KNOWLEDGE_RETRIEVAL_BOUNDS.minContextTokens ||
      budget > maximumTokens) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "Context token budget is invalid", {
      status: 400,
      details: {
        field: "contextTokenBudget",
        min: KNOWLEDGE_RETRIEVAL_BOUNDS.minContextTokens,
        max: maximumTokens
      }
    });
  }
  return budget;
}

function normalizeTraceOption(payload) {
  const requested = aliasedValue(payload, "trace", "includeTrace");
  if (requested === undefined) return false;
  if (typeof requested !== "boolean") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "Trace option is invalid", {
      status: 400,
      details: { field: "trace" }
    });
  }
  return requested;
}

function normalizeEnhancement(value, field, { allowFallback = false } = {}) {
  if (value === undefined) {
    return field === "rerank"
      ? { enabled: false, allowFallback: false }
      : { enabled: false };
  }
  const source = assertObject(value, field);
  const allowed = new Set(allowFallback ? ["enabled", "allowFallback"] : ["enabled"]);
  rejectUnknownKeys(source, allowed, field);
  if (typeof source.enabled !== "boolean") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field}.enabled is invalid`, {
      status: 400,
      details: { field: `${field}.enabled` }
    });
  }
  if (allowFallback && source.allowFallback !== undefined &&
      typeof source.allowFallback !== "boolean") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field}.allowFallback is invalid`, {
      status: 400,
      details: { field: `${field}.allowFallback` }
    });
  }
  if (allowFallback && source.allowFallback && !source.enabled) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field}.allowFallback requires reranking`, {
      status: 400,
      details: { field: `${field}.allowFallback` }
    });
  }
  return allowFallback
    ? { enabled: source.enabled, allowFallback: source.allowFallback === true }
    : { enabled: source.enabled };
}

function assertEnhancementEnabled(settings, option, field) {
  if (!option.enabled) return;
  const allowed = field === "queryRewrite"
    ? settings.queryRewriteEnabled === true
    : settings.rerankEnabled === true;
  if (!allowed) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.RETRIEVAL_ENHANCEMENT_DISABLED,
      `${field} is disabled by the administrator`,
      { status: 403, details: { field } }
    );
  }
}

function elapsedMilliseconds(clock, startedAt) {
  return Math.max(0, Number((clock() - startedAt).toFixed(3)));
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("Knowledge retrieval request cancelled");
  error.name = "AbortError";
  throw error;
}

function roundTraceScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Number(score.toFixed(8)) : null;
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
  if (base.readyDocumentCount < 1) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INDEX_NOT_READY, "知识库尚无可检索文档", {
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

function groupKey(profile) {
  return [
    profile.vendor,
    profile.actualModel,
    profile.dimensions,
    profile.fingerprint
  ].join("\u0000");
}

function groupBases(bases) {
  const groups = new Map();
  for (const base of bases) {
    const profile = requireReadyBase(base);
    const key = groupKey(profile);
    const group = groups.get(key) || { key, profile, bases: [] };
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

async function retrieveWithQuality({
  accountId,
  input,
  signal,
  repositories,
  provider,
  enhancementProvider,
  limiter,
  maximumContextBytes,
  maximumContextTokens,
  clock
}) {
  const totalStartedAt = clock();
  throwIfAborted(signal);
  const payload = assertObject(input);
  rejectUnknownKeys(payload, REQUEST_KEYS);
  const knowledgeBaseIds = normalizeBaseIds(payload);
  const query = boundedText(payload.query, "query", KNOWLEDGE_RETRIEVAL_BOUNDS.maxQueryBytes, {
    required: true
  });
  const queryContext = boundedText(
    payload.queryContext ?? payload.context ?? "",
    "context",
    KNOWLEDGE_RETRIEVAL_BOUNDS.maxQueryContextBytes
  );
  const mode = normalizeRetrievalMode(payload);
  const minimumRelevance = resolveMinimumRelevance(payload);
  const includeTrace = normalizeTraceOption(payload);
  const queryRewrite = normalizeEnhancement(payload.queryRewrite, "queryRewrite");
  const rerank = normalizeEnhancement(payload.rerank, "rerank", { allowFallback: true });
  const serverMaximumTokens = Math.min(
    KNOWLEDGE_RETRIEVAL_BOUNDS.maxContextTokens,
    Math.max(
      KNOWLEDGE_RETRIEVAL_BOUNDS.minContextTokens,
      Math.trunc(Number(maximumContextTokens) || Math.ceil(maximumContextBytes / 4))
    )
  );
  const contextTokenBudget = resolveContextTokenBudget(payload, serverMaximumTokens);

  const preflightStartedAt = clock();
  const retrievalContext = await repositories.retrieval.findRetrievalContext(accountId);
  const effectiveLimits = effectiveRetrievalLimits(retrievalContext);
  assertEnhancementEnabled(retrievalContext.settings, queryRewrite, "queryRewrite");
  assertEnhancementEnabled(retrievalContext.settings, rerank, "rerank");
  const effectiveTopK = resolveEffectiveTopK(payload.topK, effectiveLimits.maxRetrievalTopK);
  const candidateCount = resolveCandidateCount(payload, effectiveTopK);
  await limiter.consume(accountId, Math.max(
    1,
    Math.trunc(Number(effectiveLimits.retrievalRequestsPerMinutePerAccount) || 60)
  ));
  const found = await repositories.retrieval.findBasesForRetrieval(accountId, knowledgeBaseIds);
  const byId = new Map(found.map((base) => [base.id, base]));
  const missing = knowledgeBaseIds.filter((id) => !byId.has(id));
  if (missing.length) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND, "Knowledge base was not found", {
      status: 404,
      details: { knowledgeBaseIds: missing }
    });
  }
  const bases = knowledgeBaseIds.map((id) => byId.get(id));
  const groups = groupBases(bases);
  const preflightDurationMs = elapsedMilliseconds(clock, preflightStartedAt);
  throwIfAborted(signal);

  let groupInputs = [];
  if (mode !== "fulltext") {
    if (!provider?.embed) {
      throw knowledgeError(KNOWLEDGE_ERROR_CODES.UNAVAILABLE, "Embedding provider is unavailable", {
        status: 503
      });
    }
    const connections = connectionMap(payload);
    groupInputs = groups.map((group) => ({
      ...group,
      connection: connectionForGroup(connections, group, groups.length)
    }));
  }
  if (mode !== "vector" && !repositories.retrieval.searchFullText) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.UNAVAILABLE, "Full-text retrieval is unavailable", {
      status: 503
    });
  }

  const enhancementRequested = queryRewrite.enabled || rerank.enabled;
  if (enhancementRequested && (!enhancementProvider?.rewrite || !enhancementProvider?.rerank)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.UNAVAILABLE, "Query enhancement is unavailable", {
      status: 503
    });
  }
  const enhancementConnection = enhancementRequested
    ? normalizeKnowledgeEnhancementConnection(payload.enhancementConnection)
    : null;
  let effectiveQuery = query;
  let rewriteDurationMs = 0;
  let rewriteStatus = "disabled";
  if (queryRewrite.enabled) {
    const rewriteStartedAt = clock();
    effectiveQuery = await enhancementProvider.rewrite({
      query,
      queryContext,
      connection: enhancementConnection,
      signal
    });
    rewriteDurationMs = elapsedMilliseconds(clock, rewriteStartedAt);
    rewriteStatus = "applied";
  }

  const groupVectors = new Map();
  let embeddingDurationMs = 0;
  if (mode !== "fulltext") {
    const embeddingInput = queryContext ? `${effectiveQuery}\n\n${queryContext}` : effectiveQuery;
    const embeddingStartedAt = clock();
    const settled = await Promise.allSettled(groupInputs.map((group) => provider.embed({
      profile: group.profile,
      connection: group.connection,
      input: [embeddingInput],
      signal
    })));
    throwIfAborted(signal);
    embeddingDurationMs = elapsedMilliseconds(clock, embeddingStartedAt);
    const failedIndex = settled.findIndex((result) => result.status === "rejected");
    if (failedIndex >= 0) throw providerFailure(settled[failedIndex].reason, groupInputs[failedIndex]);
    settled.forEach((result, index) => {
      const group = groupInputs[index];
      const vector = result.value?.embeddings?.[0];
      if (!Array.isArray(vector) || vector.length !== group.profile.dimensions ||
          vector.some((value) => !Number.isFinite(Number(value)))) {
        throw providerFailure(new Error("Embedding dimensions are invalid"), group);
      }
      groupVectors.set(group.key, vector.map(Number));
    });
  }

  const operations = [];
  for (const group of groups) {
    for (const base of group.bases) {
      if (mode !== "fulltext") operations.push({
        id: `vector:${base.id}`,
        mode: "vector",
        run: () => repositories.retrieval.searchSimilar({
          accountId,
          knowledgeBaseId: base.id,
          indexVersionId: base.activeIndex.id,
          dimensions: group.profile.dimensions,
          queryEmbedding: groupVectors.get(group.key),
          limit: candidateCount
        })
      });
      if (mode !== "vector") operations.push({
        id: `fulltext:${base.id}`,
        mode: "fulltext",
        run: () => repositories.retrieval.searchFullText({
          accountId,
          knowledgeBaseId: base.id,
          indexVersionId: base.activeIndex.id,
          query: effectiveQuery,
          limit: candidateCount
        })
      });
    }
  }
  const recallStartedAt = clock();
  const recall = await Promise.allSettled(operations.map((operation) => operation.run()));
  throwIfAborted(signal);
  const recallDurationMs = elapsedMilliseconds(clock, recallStartedAt);
  const failedRecall = recall.find((result) => result.status === "rejected");
  if (failedRecall) throw failedRecall.reason;
  const rankedLists = operations.map((operation, index) => ({
    id: operation.id,
    mode: operation.mode,
    hits: recall[index].value
  }));

  const fused = fuseRetrievalResults(rankedLists);
  let rankedCandidates = fused;
  let rerankDurationMs = 0;
  let rerankStatus = "disabled";
  if (rerank.enabled && fused.length) {
    const rerankStartedAt = clock();
    try {
      rankedCandidates = await enhancementProvider.rerank({
        query: effectiveQuery,
        candidates: fused,
        connection: enhancementConnection,
        signal
      });
      rerankStatus = "applied";
    } catch (error) {
      if (!rerank.allowFallback || signal?.aborted) throw error;
      rankedCandidates = fused;
      rerankStatus = "fallback";
    } finally {
      rerankDurationMs = elapsedMilliseconds(clock, rerankStartedAt);
    }
  }
  const relevant = rankedCandidates.filter((candidate) =>
    Number(candidate.relevanceScore) >= minimumRelevance
  );
  const deduplication = deduplicateAdjacentChunksDetailed(relevant);
  const finalCandidates = deduplication.accepted.slice(0, effectiveTopK);
  const formatted = buildBoundedKnowledgeContext(finalCandidates, {
    maximumBytes: maximumContextBytes,
    maximumTokens: contextTokenBudget,
    mode
  });
  const selected = new Set(formatted.chunks.map((chunk) => chunk.chunkId));
  const adjacent = new Set(deduplication.rejected.map((entry) => entry.candidate.chunkId));
  const topK = new Set(finalCandidates.map((candidate) => candidate.chunkId));
  const citations = new Map(formatted.citations.map((entry) => [entry.chunkId, entry.id]));
  const vectorCandidates = rankedLists.filter((list) => list.mode === "vector")
    .reduce((total, list) => total + list.hits.length, 0);
  const fullTextCandidates = rankedLists.filter((list) => list.mode === "fulltext")
    .reduce((total, list) => total + list.hits.length, 0);
  const trace = includeTrace ? {
    originalQuery: query,
    effectiveQuery,
    mode,
    options: { candidateCount, minimumRelevance, contextTokenBudget, queryRewrite, rerank },
    stages: {
      preflight: { durationMs: preflightDurationMs, baseCount: bases.length },
      rewrite: { durationMs: rewriteDurationMs, status: rewriteStatus },
      embedding: { durationMs: embeddingDurationMs, groupCount: mode === "fulltext" ? 0 : groups.length },
      recall: { durationMs: recallDurationMs, vectorCandidates, fullTextCandidates },
      rerank: { durationMs: rerankDurationMs, status: rerankStatus },
      filter: {
        fusedCandidates: rankedCandidates.length,
        belowMinimumRelevance: rankedCandidates.length - relevant.length,
        adjacentSuppressed: deduplication.rejected.length
      },
      context: {
        selectedCandidates: formatted.chunks.length,
        contextTokens: formatted.contextTokens,
        tokenBudget: formatted.tokenBudget,
        truncated: formatted.truncated
      }
    },
    candidates: rankedCandidates.slice(0, KNOWLEDGE_RETRIEVAL_BOUNDS.maxTraceCandidates).map((candidate) => {
      let filteredReason = null;
      if (Number(candidate.relevanceScore) < minimumRelevance) filteredReason = "minimum_relevance";
      else if (adjacent.has(candidate.chunkId)) filteredReason = "adjacent_chunk";
      else if (!topK.has(candidate.chunkId)) filteredReason = "top_k";
      else if (!selected.has(candidate.chunkId)) filteredReason = "token_budget";
      return {
        knowledgeBaseId: candidate.knowledgeBaseId,
        documentId: candidate.documentId,
        chunkId: candidate.chunkId,
        ranks: { vector: candidate.vectorRank || null, fulltext: candidate.fullTextRankPosition || null },
        rerankRank: candidate.rerankRank || null,
        scores: {
          vector: roundTraceScore(candidate.vectorScore),
          fulltext: roundTraceScore(candidate.fullTextScore),
          relevance: roundTraceScore(candidate.relevanceScore),
          rrf: roundTraceScore(candidate.rrfScore)
        },
        selected: selected.has(candidate.chunkId),
        filteredReason,
        citationId: citations.get(candidate.chunkId) || null
      };
    }),
    profiles: groups.map((group) => ({
      fingerprint: group.profile.fingerprint,
      dimensions: group.profile.dimensions,
      indexVersions: [...new Set(group.bases.map((base) => base.activeIndex.version))].sort((left, right) => left - right),
      knowledgeBaseIds: group.bases.map((base) => base.id)
    })),
    timing: { totalMs: elapsedMilliseconds(clock, totalStartedAt) }
  } : undefined;

  throwIfAborted(signal);

  return {
    mode,
    knowledgeBaseIds,
    topK: effectiveTopK,
    candidateCount,
    minimumRelevance,
    maxTopK: Math.min(
      KNOWLEDGE_RETRIEVAL_BOUNDS.maxTopK,
      Math.max(1, Number(effectiveLimits.maxRetrievalTopK) || KNOWLEDGE_RETRIEVAL_BOUNDS.maxTopK)
    ),
    queryBytes: utf8ByteLength(query),
    context: formatted.context,
    contextBytes: formatted.contextBytes,
    contextTokens: formatted.contextTokens,
    contextTokenBudget: formatted.tokenBudget,
    contextTruncated: formatted.truncated,
    chunks: formatted.chunks,
    citations: formatted.citations,
    profileGroups: groups.map((group) => ({
      embeddingProfileId: group.profile.id,
      vendor: group.profile.vendor,
      actualModel: group.profile.actualModel,
      dimensions: group.profile.dimensions,
      indexVersions: [...new Set(group.bases.map((base) => base.activeIndex.version))].sort((left, right) => left - right),
      knowledgeBaseIds: group.bases.map((base) => base.id)
    })),
    ...(includeTrace ? { trace } : {})
  };
}

export function createKnowledgeRetrievalService({
  repositories,
  provider = createKnowledgeEmbeddingProvider(),
  enhancementProvider = null,
  rateLimiter,
  tokenSecret,
  maximumContextBytes = KNOWLEDGE_RETRIEVAL_BOUNDS.maxContextBytes,
  maximumContextTokens = Math.ceil(maximumContextBytes / 4),
  clock = () => performance.now()
} = {}) {
  if (!repositories?.retrieval?.findRetrievalContext) {
    throw new TypeError("Knowledge retrieval service requires the retrieval repository");
  }
  if (typeof clock !== "function") throw new TypeError("Knowledge retrieval service requires a clock");
  const limiter = rateLimiter || createKnowledgeRetrievalRateLimiter({
    repository: repositories.auth,
    tokenSecret
  });

  return Object.freeze({
    async retrieve(accountId, input, { signal } = {}) {
      return retrieveWithQuality({
        accountId,
        input,
        signal,
        repositories,
        provider,
        enhancementProvider,
        limiter,
        maximumContextBytes,
        maximumContextTokens,
        clock
      });
    }
  });
}

export { resolveEffectiveTopK as resolveKnowledgeRetrievalTopK };
