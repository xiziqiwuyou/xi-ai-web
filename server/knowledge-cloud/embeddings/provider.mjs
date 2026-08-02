import { KNOWLEDGE_ERROR_CODES, KnowledgeError, knowledgeError } from "../errors.mjs";
import {
  DEFAULT_UPSTREAM_BASE_URL,
  normalizeUpstreamBaseUrl
} from "../../upstream-security.mjs";
import { providerUrl } from "../../providers/types.mjs";

const MAX_API_KEY_CHARS = 4096;
const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_PROVIDER_ERROR_BYTES = 64 * 1024;
const CONNECTION_KEYS = new Set(["baseUrl", "apiKey"]);
const SAFE_UPSTREAM_CODES = new Map([
  ["invalid_api_key", "invalid_api_key"],
  ["invalid_key", "invalid_api_key"],
  ["authentication_error", "authentication_error"],
  ["unauthorized", "authentication_error"],
  ["insufficient_quota", "insufficient_quota"],
  ["rate_limit_exceeded", "rate_limit_exceeded"],
  ["rate_limited", "rate_limit_exceeded"],
  ["model_not_found", "model_not_found"],
  ["invalid_request_error", "invalid_request_error"],
  ["content_filter", "content_filter"],
  ["timeout", "timeout"],
  ["server_error", "upstream_unavailable"],
  ["service_unavailable", "upstream_unavailable"],
  ["upstream_unavailable", "upstream_unavailable"]
]);

function assertConnectionObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_CONNECTION_REQUIRED,
      "请配置当前向量模型的 API Key",
      { status: 400 }
    );
  }
  const unknown = Object.keys(value).filter((key) => !CONNECTION_KEYS.has(key));
  if (unknown.length) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "向量连接包含不支持的字段", {
      status: 400,
      details: { field: "connection", unknown }
    });
  }
}

function boundedSecret(value, field, max) {
  const text = String(value || "").trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_CONNECTION_REQUIRED,
      "请配置当前向量模型的 API Key",
      { status: 400, details: { field } }
    );
  }
  return text;
}

export function normalizeKnowledgeEmbeddingConnection(value) {
  assertConnectionObject(value);
  const apiKey = boundedSecret(value.apiKey, "connection.apiKey", MAX_API_KEY_CHARS);
  return Object.freeze({ apiKey });
}

export function buildKnowledgeEmbeddingRequest(profile, input) {
  const texts = Array.isArray(input) ? input : [];
  const body = {
    model: profile.actualModel,
    input: texts,
    dimensions: profile.dimensions
  };
  if (profile.vendor === "openai") body.encoding_format = "float";
  return body;
}

function safeProviderMessage(value, secrets) {
  let text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 4) {
      text = text.split(secret).join("[redacted]");
    }
  }
  text = text.replace(/\s+/gu, " ").trim();
  return text.slice(0, 500);
}

export function normalizeKnowledgeUpstreamCode(value, status) {
  const normalized = String(value || "").trim().toLowerCase();
  if (SAFE_UPSTREAM_CODES.has(normalized)) return SAFE_UPSTREAM_CODES.get(normalized);
  if (status === 401 || status === 403) return "authentication_error";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit_exceeded";
  if (status >= 500 && status <= 599) return "upstream_unavailable";
  if (status >= 400 && status <= 499) return "invalid_request_error";
  return null;
}

async function readBoundedText(response, maximumBytes) {
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
      "向量服务返回内容过大",
      { status: 502, details: { retryable: false } }
    );
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maximumBytes) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
        "向量服务返回内容过大",
        { status: 502, details: { retryable: false } }
      );
    }
    return text;
  }

  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => {});
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
        "向量服务返回内容过大",
        { status: 502, details: { retryable: false } }
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function normalizeUsage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const key of ["prompt_tokens", "total_tokens", "input_tokens"]) {
    const number = Number(value[key]);
    if (Number.isSafeInteger(number) && number >= 0) result[key] = number;
  }
  return result;
}

function normalizeEmbeddingResponse(json, profile, expectedCount) {
  const data = Array.isArray(json?.data) ? [...json.data] : [];
  if (data.length !== expectedCount) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
      "向量服务返回数量与请求不一致",
      { status: 502, details: { retryable: true } }
    );
  }
  data.sort((left, right) => Number(left?.index) - Number(right?.index));
  const embeddings = data.map((item, index) => {
    if (Number(item?.index) !== index || !Array.isArray(item?.embedding)) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
        "向量服务返回顺序无效",
        { status: 502, details: { retryable: true } }
      );
    }
    if (
      item.embedding.length !== profile.dimensions ||
      item.embedding.some((component) => !Number.isFinite(Number(component)))
    ) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
        "向量服务返回维度无效",
        {
          status: 502,
          details: { expectedDimensions: profile.dimensions, retryable: false }
        }
      );
    }
    return item.embedding.map(Number);
  });
  return { embeddings, usage: normalizeUsage(json?.usage) };
}

function providerFailure(response, raw, profile, connection) {
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  const upstream = payload?.error && typeof payload.error === "object" ? payload.error : payload;
  const upstreamCode = normalizeKnowledgeUpstreamCode(
    upstream?.code || upstream?.type,
    response.status
  );
  const providerMessage = safeProviderMessage(
    upstream?.message || raw || `HTTP ${response.status}`,
    connection.redactions
  );
  return knowledgeError(
    KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
    `${profile.label} 请求失败`,
    {
      status: 502,
      details: {
        vendor: profile.vendor,
        upstreamStatus: response.status,
        upstreamCode,
        providerMessage,
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500
      }
    }
  );
}

export function createKnowledgeEmbeddingProvider({
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 60_000,
  upstreamRef
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Knowledge embedding provider requires fetch");
  }
  return Object.freeze({
    async embed({ profile, connection: rawConnection, input, signal }) {
      const connectionCredential = normalizeKnowledgeEmbeddingConnection(rawConnection);
      const configuredBaseUrl = normalizeUpstreamBaseUrl(
        upstreamRef?.current || DEFAULT_UPSTREAM_BASE_URL,
        { fallback: "" }
      );
      if (!configuredBaseUrl) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
          "向量服务上游地址不可用",
          { status: 503, details: { retryable: false } }
        );
      }
      const connection = Object.freeze({
        apiKey: connectionCredential.apiKey,
        baseUrl: configuredBaseUrl,
        redactions: [
          connectionCredential.apiKey,
          typeof rawConnection?.baseUrl === "string" ? rawConnection.baseUrl : ""
        ].filter(Boolean)
      });
      if (!profile || !["openai", "qwen"].includes(profile.vendor)) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_PROFILE_INVALID,
          "当前向量模型不受支持",
          { status: 400 }
        );
      }
      const texts = Array.isArray(input) ? input.map((value) => String(value)) : [];
      if (!texts.length || texts.length > profile.maxBatchInputs || texts.some((text) => !text.trim())) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "向量批次输入无效", {
          status: 400
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("embedding request timeout")), requestTimeoutMs);
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener?.("abort", abort, { once: true });
      try {
        const response = await fetchImpl(providerUrl({
          kind: profile.vendor,
          baseUrl: connection.baseUrl
        }, "/embeddings"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${connection.apiKey}`
          },
          body: JSON.stringify(buildKnowledgeEmbeddingRequest(profile, texts)),
          redirect: "error",
          signal: controller.signal
        });
        const raw = await readBoundedText(
          response,
          response.ok ? MAX_PROVIDER_RESPONSE_BYTES : MAX_PROVIDER_ERROR_BYTES
        );
        if (!response.ok) throw providerFailure(response, raw, profile, connection);
        let json;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
            "向量服务返回了无效 JSON",
            { status: 502, details: { retryable: true } }
          );
        }
        return normalizeEmbeddingResponse(json, profile, texts.length);
      } catch (error) {
        if (error instanceof KnowledgeError) throw error;
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.EMBEDDING_PROVIDER_ERROR,
          `${profile.label} 暂时不可用`,
          {
            status: 502,
            details: {
              vendor: profile.vendor,
              providerMessage: safeProviderMessage(error?.message, connection.redactions),
              retryable: true
            },
            cause: error
          }
        );
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener?.("abort", abort);
      }
    }
  });
}
