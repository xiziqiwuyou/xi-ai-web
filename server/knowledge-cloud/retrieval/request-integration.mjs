import {
  knowledgeSessionToken,
  requireKnowledgeOrigin
} from "../auth/http.mjs";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  createKnowledgeRequestId
} from "../errors.mjs";
import {
  KNOWLEDGE_RETRIEVAL_BOUNDS,
  truncateUtf8,
  utf8ByteLength
} from "./fusion.mjs";

const PUBLIC_KNOWLEDGE_ROUTES = new Set([
  "/api/chat/stream",
  "/api/agents/run"
]);

function requestBody(req) {
  return req?.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body
    : {};
}

export function hasCloudKnowledgeSelection(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (!Object.hasOwn(body, "knowledgeBaseIds")) return false;
  return !Array.isArray(body.knowledgeBaseIds) || body.knowledgeBaseIds.length > 0;
}

function appendRequestSecrets(req, values) {
  const existing = Array.isArray(req.knowledgeSecrets) ? req.knowledgeSecrets : [];
  const next = [...existing];
  for (const value of Array.isArray(values) ? values : [values]) {
    if (typeof value === "string" && value.length >= 4 && !next.includes(value)) {
      next.push(value);
    }
  }
  req.knowledgeSecrets = next;
}

function embeddingConnectionSecrets(value, result = [], seen = new WeakSet(), depth = 0) {
  if (depth > 6 || !value || typeof value !== "object" || seen.has(value)) return result;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 50)) {
      embeddingConnectionSecrets(entry, result, seen, depth + 1);
    }
    return result;
  }
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    if ((key === "baseUrl" || key === "apiKey") && typeof entry === "string") {
      result.push(entry);
    } else if (entry && typeof entry === "object") {
      embeddingConnectionSecrets(entry, result, seen, depth + 1);
    }
  }
  return result;
}

export function projectCloudKnowledgeRetrievalInput(body, query) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const input = {
    query,
    knowledgeBaseIds: Array.isArray(source.knowledgeBaseIds)
      ? [...source.knowledgeBaseIds]
      : source.knowledgeBaseIds,
    embeddingConnections: source.embeddingConnections
  };
  if (Object.hasOwn(source, "topK") && source.topK !== undefined) input.topK = source.topK;
  return input;
}

function requireIntegrationServices(runtime) {
  if (runtime?.available !== false && runtime?.auth && runtime?.retrieval) {
    return { auth: runtime.auth, retrieval: runtime.retrieval };
  }
  const disabled = runtime?.state === "disabled";
  throw new KnowledgeError(
    disabled ? KNOWLEDGE_ERROR_CODES.DISABLED : KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
    disabled ? "云知识库功能未启用" : "知识库检索服务暂时不可用",
    {
      status: 503,
      details: { reasonCode: runtime?.reasonCode || null }
    }
  );
}

function assertExactOrigin(req, originMiddleware) {
  let failure;
  originMiddleware(req, undefined, (error) => {
    failure = error;
  });
  if (failure) throw failure;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("Request was cancelled");
  error.name = "AbortError";
  throw error;
}

function safeRetrievalResult(result, knowledgeBaseIds) {
  const rawContext = String(result?.context || "");
  const context = truncateUtf8(rawContext, KNOWLEDGE_RETRIEVAL_BOUNDS.maxContextBytes);
  const topK = Number(result?.topK);
  const citations = Array.isArray(result?.citations) ? [...result.citations] : [];
  const citationByChunkId = new Map(
    citations
      .filter((entry) => entry && typeof entry === "object" && entry.chunkId)
      .map((entry) => [String(entry.chunkId), entry])
  );
  const searchChunks = (Array.isArray(result?.chunks) ? result.chunks : [])
    .slice(0, KNOWLEDGE_RETRIEVAL_BOUNDS.maxTopK)
    .map((chunk, index) => {
      if (!chunk || typeof chunk !== "object") return null;
      const text = truncateUtf8(
        String(chunk.text || "").trim(),
        KNOWLEDGE_RETRIEVAL_BOUNDS.maxChunkContextBytes
      );
      if (!text) return null;
      const chunkId = String(chunk.chunkId || "").slice(0, 180);
      const source = citationByChunkId.get(chunkId);
      return {
        id: String(chunk.citationId || chunkId || `cloud-chunk-${index}`).slice(0, 180),
        index: Number.isFinite(Number(chunk.ordinal)) ? Number(chunk.ordinal) : index,
        documentId: String(chunk.documentId || source?.documentId || "").slice(0, 180) || undefined,
        documentName: String(source?.documentName || "").slice(0, 180) || undefined,
        text
      };
    })
    .filter(Boolean);
  return {
    context,
    knowledgeCitations: citations,
    searchChunks,
    metadata: {
      mode: typeof result?.mode === "string" ? result.mode.slice(0, 32) : "vector",
      knowledgeBaseIds: [...knowledgeBaseIds],
      ...(Number.isSafeInteger(topK) && topK > 0 ? { topK } : {}),
      contextTruncated:
        Boolean(result?.contextTruncated) || utf8ByteLength(rawContext) > utf8ByteLength(context)
    }
  };
}

export function createCloudKnowledgeRequestIntegration(runtime) {
  const exactOrigin = requireKnowledgeOrigin(runtime?.config?.publicOrigin || "");

  return Object.freeze({
    async preflight(req, { query, signal } = {}) {
      const body = requestBody(req);
      if (!hasCloudKnowledgeSelection(body)) return null;

      req.knowledgeRuntime = runtime;
      req.knowledgeRequestId ||= createKnowledgeRequestId();
      appendRequestSecrets(req, embeddingConnectionSecrets(body.embeddingConnections));

      const sessionToken = knowledgeSessionToken(
        req,
        runtime?.auth?.cookieName || "xi_kb_session"
      );
      const csrfToken = String(req.headers?.["x-knowledge-csrf"] || "");
      appendRequestSecrets(req, [sessionToken, csrfToken]);

      const { auth, retrieval } = requireIntegrationServices(runtime);
      assertExactOrigin(req, exactOrigin);
      throwIfAborted(signal);
      const session = await auth.requireSession(sessionToken);
      throwIfAborted(signal);
      auth.verifyCsrf(session, csrfToken);

      const input = projectCloudKnowledgeRetrievalInput(body, query);
      let result;
      try {
        result = await retrieval.retrieve(session.account.id, input, { signal });
      } catch (error) {
        throwIfAborted(signal);
        throw error;
      }
      throwIfAborted(signal);
      return safeRetrievalResult(result, input.knowledgeBaseIds);
    }
  });
}

export function composeCloudKnowledgeSystemContext({
  trustedContext,
  knowledge,
  trailingContext
} = {}) {
  return [trustedContext, knowledge?.context, trailingContext].filter(Boolean).join("\n\n");
}

export function combineCloudKnowledgeSearchChunks(localChunks, knowledge) {
  return [
    ...(Array.isArray(localChunks) ? localChunks : []),
    ...(Array.isArray(knowledge?.searchChunks) ? knowledge.searchChunks : [])
  ];
}

export function withCloudKnowledgeCitations(message, knowledge) {
  if (!knowledge) return message;
  return {
    ...message,
    knowledgeCitations: [...knowledge.knowledgeCitations]
  };
}

export function withCloudKnowledgeResultRaw(raw, knowledge) {
  if (!knowledge) return raw;
  return {
    ...raw,
    knowledgeCitations: [...knowledge.knowledgeCitations],
    knowledgeRetrieval: { ...knowledge.metadata }
  };
}

export function isCloudKnowledgePublicRequest(req) {
  const requestUrl = String(req?.originalUrl || req?.url || "");
  const path = requestUrl.split("?", 1)[0];
  return PUBLIC_KNOWLEDGE_ROUTES.has(path);
}
