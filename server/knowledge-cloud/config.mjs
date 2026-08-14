import * as nodeCrypto from "node:crypto";
import {
  KNOWLEDGE_ERROR_CODES,
  knowledgeError
} from "./errors.mjs";

export const KNOWLEDGE_NODE_MIN_VERSION = "24.7.0";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["", "0", "false", "no", "off"]);
const DATABASE_URL_TLS_PARAMETERS = Object.freeze([
  "ssl",
  "sslcert",
  "sslkey",
  "sslmode",
  "sslrootcert",
  "uselibpqcompat"
]);

function parseBoolean(value, name, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw knowledgeError(
    KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
    `${name} 必须是 true 或 false`,
    { status: 503, details: { field: name } }
  );
}

function parseInteger(value, name, fallback, { min, max }) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      `${name} 超出允许范围`,
      { status: 503, details: { field: name, min, max } }
    );
  }
  return number;
}

function requireEnvironment(env, names) {
  const missing = names.filter((name) => !String(env[name] || "").trim());
  if (missing.length) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_MISSING,
      "知识库运行配置不完整",
      { status: 503, details: { missing } }
    );
  }
}

function parseNodeVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value || ""));
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function assertKnowledgeNodeRuntime({
  cryptoModule = nodeCrypto,
  nodeVersion = process.versions.node
} = {}) {
  const current = parseNodeVersion(nodeVersion);
  const minimum = parseNodeVersion(KNOWLEDGE_NODE_MIN_VERSION);
  const supportsArgon2 =
    typeof cryptoModule?.argon2 === "function" && typeof cryptoModule?.argon2Sync === "function";
  if (!current || !minimum || compareVersions(current, minimum) < 0 || !supportsArgon2) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.NODE_RUNTIME_UNSUPPORTED,
      `云知识库需要 Node.js ${KNOWLEDGE_NODE_MIN_VERSION} 或更高版本并启用内置 Argon2id`,
      {
        status: 503,
        details: {
          currentNode: String(nodeVersion || "unknown"),
          minimumNode: KNOWLEDGE_NODE_MIN_VERSION,
          argon2Available: supportsArgon2
        }
      }
    );
  }
}

function parseDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "DATABASE_URL 不是有效的 PostgreSQL 连接地址",
      { status: 503, details: { field: "DATABASE_URL" } }
    );
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "DATABASE_URL 必须使用 postgres 或 postgresql 协议",
      { status: 503, details: { field: "DATABASE_URL" } }
    );
  }
  const conflictingTlsParameter = DATABASE_URL_TLS_PARAMETERS.find((name) =>
    url.searchParams.has(name)
  );
  if (conflictingTlsParameter) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "DATABASE_URL TLS options must use the dedicated DATABASE_SSL_* settings",
      {
        status: 503,
        details: { field: "DATABASE_URL", parameter: conflictingTlsParameter }
      }
    );
  }
  return value;
}

function parseSslMode(value) {
  const mode = String(value || "disable").trim().toLowerCase();
  if (!new Set(["disable", "require", "verify-full"]).has(mode)) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "DATABASE_SSL_MODE 必须是 disable、require 或 verify-full",
      { status: 503, details: { field: "DATABASE_SSL_MODE" } }
    );
  }
  return mode;
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]" || normalized === "::1") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  return Boolean(match && Number(match[1]) === 127 && match.slice(1).every((part) => Number(part) <= 255));
}

function parsePublicOrigin(value, { production = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "PUBLIC_ORIGIN 不是有效地址",
      { status: 503, details: { field: "PUBLIC_ORIGIN" } }
    );
  }
  if (
    !new Set(["http:", "https:"]).has(url.protocol) ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "PUBLIC_ORIGIN 必须是 HTTP(S) 站点根地址",
      { status: 503, details: { field: "PUBLIC_ORIGIN" } }
    );
  }
  if (url.protocol !== "https:" && (production || !isLoopbackHostname(url.hostname))) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "PUBLIC_ORIGIN requires HTTPS except for loopback development and test runtimes",
      { status: 503, details: { field: "PUBLIC_ORIGIN", reason: "https_required" } }
    );
  }
  return url.origin;
}

function isProductionRuntime(env, runtime = {}) {
  return runtime.production ?? (
    env.NODE_ENV === "production" ||
    (env === process.env && process.argv.includes("--production"))
  );
}

export function loadKnowledgeDatabaseConfig(env = process.env, runtime = {}) {
  requireEnvironment(env, ["DATABASE_URL"]);
  const sslMode = parseSslMode(env.DATABASE_SSL_MODE);
  const production = isProductionRuntime(env, runtime);
  const allowInsecure = parseBoolean(
    env.KNOWLEDGE_ALLOW_INSECURE_DATABASE,
    "KNOWLEDGE_ALLOW_INSECURE_DATABASE",
    false
  );
  if (production && sslMode === "disable" && !allowInsecure) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "Production PostgreSQL requires certificate-verified TLS",
      { status: 503, details: { field: "DATABASE_SSL_MODE", reason: "verified_tls_required" } }
    );
  }
  return Object.freeze({
    connectionString: parseDatabaseUrl(String(env.DATABASE_URL).trim()),
    sslMode,
    sslCa: String(env.DATABASE_SSL_CA || "").trim(),
    tlsVerification: sslMode === "disable" ? "disabled" : "full",
    connectionTimeoutMs: parseInteger(
      env.KNOWLEDGE_DATABASE_CONNECT_TIMEOUT_MS,
      "KNOWLEDGE_DATABASE_CONNECT_TIMEOUT_MS",
      5000,
      { min: 500, max: 60000 }
    ),
    poolMax: parseInteger(env.KNOWLEDGE_DATABASE_POOL_MAX, "KNOWLEDGE_DATABASE_POOL_MAX", 10, {
      min: 1,
      max: 100
    })
  });
}

function loadCosConfig(env) {
  requireEnvironment(env, ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION"]);
  const bucket = String(env.COS_BUCKET).trim();
  const region = String(env.COS_REGION).trim();
  const bucketMatch = /^([a-z0-9][a-z0-9.-]{0,62})-(\d{5,})$/.exec(bucket);
  if (!bucketMatch) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "COS_BUCKET 必须使用 BucketName-APPID 格式",
      { status: 503, details: { field: "COS_BUCKET" } }
    );
  }
  if (!/^[a-z0-9-]{3,40}$/i.test(region)) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "COS_REGION 格式无效",
      { status: 503, details: { field: "COS_REGION" } }
    );
  }
  const appId = String(env.COS_APP_ID || bucketMatch[2]).trim();
  if (!/^\d{5,}$/.test(appId) || bucketMatch[2] !== appId) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "COS_APP_ID 必须与 COS_BUCKET 后缀一致",
      { status: 503, details: { field: "COS_APP_ID" } }
    );
  }
  return Object.freeze({
    secretId: String(env.COS_SECRET_ID).trim(),
    secretKey: String(env.COS_SECRET_KEY).trim(),
    bucket,
    region,
    appId,
    uploadGrantTtlSeconds: parseInteger(
      env.KNOWLEDGE_COS_UPLOAD_GRANT_TTL_SECONDS,
      "KNOWLEDGE_COS_UPLOAD_GRANT_TTL_SECONDS",
      15 * 60,
      { min: 60, max: 2 * 60 * 60 }
    ),
    sourceUrlTtlSeconds: parseInteger(
      env.KNOWLEDGE_COS_SOURCE_URL_TTL_SECONDS,
      "KNOWLEDGE_COS_SOURCE_URL_TTL_SECONDS",
      5 * 60,
      { min: 30, max: 15 * 60 }
    ),
    probeEnabled: parseBoolean(
      env.KNOWLEDGE_COS_PROBE_ENABLED,
      "KNOWLEDGE_COS_PROBE_ENABLED",
      true
    ),
    probeIntervalSeconds: parseInteger(
      env.KNOWLEDGE_COS_PROBE_INTERVAL_SECONDS,
      "KNOWLEDGE_COS_PROBE_INTERVAL_SECONDS",
      60,
      { min: 10, max: 3600 }
    ),
    probeTimeoutMs: parseInteger(
      env.KNOWLEDGE_COS_PROBE_TIMEOUT_MS,
      "KNOWLEDGE_COS_PROBE_TIMEOUT_MS",
      5000,
      { min: 500, max: 30000 }
    )
  });
}

function parseOcrEndpoint(value, { production = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "KNOWLEDGE_OCR_ENDPOINT must be a valid HTTP(S) URL",
      { status: 503, details: { field: "KNOWLEDGE_OCR_ENDPOINT" } }
    );
  }
  if (
    !new Set(["http:", "https:"]).has(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && (production || !isLoopbackHostname(url.hostname)))
  ) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "KNOWLEDGE_OCR_ENDPOINT requires HTTPS except for loopback development and test runtimes",
      { status: 503, details: { field: "KNOWLEDGE_OCR_ENDPOINT" } }
    );
  }
  return url.toString();
}

function loadOcrConfig(env, { production = false } = {}) {
  const enabled = parseBoolean(env.KNOWLEDGE_OCR_ENABLED, "KNOWLEDGE_OCR_ENABLED", false);
  if (!enabled) return Object.freeze({ enabled: false, provider: "disabled" });

  requireEnvironment(env, [
    "KNOWLEDGE_OCR_PROVIDER",
    "KNOWLEDGE_OCR_ENDPOINT",
    "KNOWLEDGE_OCR_API_KEY"
  ]);
  const provider = String(env.KNOWLEDGE_OCR_PROVIDER).trim().toLowerCase();
  if (provider !== "http-json-v1") {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "KNOWLEDGE_OCR_PROVIDER must be http-json-v1",
      { status: 503, details: { field: "KNOWLEDGE_OCR_PROVIDER" } }
    );
  }
  return Object.freeze({
    enabled: true,
    provider,
    endpoint: parseOcrEndpoint(String(env.KNOWLEDGE_OCR_ENDPOINT).trim(), { production }),
    apiKey: String(env.KNOWLEDGE_OCR_API_KEY).trim(),
    requestTimeoutMs: parseInteger(
      env.KNOWLEDGE_OCR_REQUEST_TIMEOUT_MS,
      "KNOWLEDGE_OCR_REQUEST_TIMEOUT_MS",
      60_000,
      { min: 1_000, max: 120_000 }
    ),
    maxInputBytes: parseInteger(
      env.KNOWLEDGE_OCR_MAX_INPUT_BYTES,
      "KNOWLEDGE_OCR_MAX_INPUT_BYTES",
      50 * 1024 * 1024,
      { min: 1_024, max: 100 * 1024 * 1024 }
    ),
    maxOutputBytes: parseInteger(
      env.KNOWLEDGE_OCR_MAX_OUTPUT_BYTES,
      "KNOWLEDGE_OCR_MAX_OUTPUT_BYTES",
      8 * 1024 * 1024,
      { min: 1_024, max: 16 * 1024 * 1024 }
    )
  });
}

export function loadKnowledgeConfig(
  env = process.env,
  runtime = { cryptoModule: nodeCrypto, nodeVersion: process.versions.node }
) {
  const enabled = parseBoolean(env.KNOWLEDGE_ENABLED, "KNOWLEDGE_ENABLED", false);
  if (!enabled) return Object.freeze({ enabled: false });

  assertKnowledgeNodeRuntime(runtime);
  requireEnvironment(env, [
    "DATABASE_URL",
    "KNOWLEDGE_TOKEN_SECRET",
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "COS_REGION",
    "PUBLIC_ORIGIN"
  ]);
  const tokenSecret = String(env.KNOWLEDGE_TOKEN_SECRET).trim();
  if (tokenSecret.length < 32) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "KNOWLEDGE_TOKEN_SECRET 至少需要 32 个字符",
      { status: 503, details: { field: "KNOWLEDGE_TOKEN_SECRET", minLength: 32 } }
    );
  }
  const embeddingLeaseSeconds = parseInteger(
    env.KNOWLEDGE_EMBEDDING_LEASE_SECONDS,
    "KNOWLEDGE_EMBEDDING_LEASE_SECONDS",
    120,
    { min: 30, max: 900 }
  );
  const embeddingRequestTimeoutMs = parseInteger(
    env.KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS,
    "KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS",
    60_000,
    { min: 1000, max: 120_000 }
  );
  if (embeddingRequestTimeoutMs >= embeddingLeaseSeconds * 1000) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS 必须小于向量批次租约时间",
      {
        status: 503,
        details: {
          field: "KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS",
          leaseSeconds: embeddingLeaseSeconds
        }
      }
    );
  }
  const workerHeartbeatIntervalSeconds = parseInteger(
    env.KNOWLEDGE_WORKER_HEARTBEAT_SECONDS,
    "KNOWLEDGE_WORKER_HEARTBEAT_SECONDS",
    10,
    { min: 2, max: 300 }
  );
  const workerStaleAfterSeconds = parseInteger(
    env.KNOWLEDGE_WORKER_STALE_SECONDS,
    "KNOWLEDGE_WORKER_STALE_SECONDS",
    45,
    { min: 10, max: 3600 }
  );
  if (workerHeartbeatIntervalSeconds >= workerStaleAfterSeconds) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "Knowledge worker heartbeat interval must be shorter than the stale threshold",
      { status: 503, details: { field: "KNOWLEDGE_WORKER_HEARTBEAT_SECONDS" } }
    );
  }
  const production = isProductionRuntime(env, runtime);
  return Object.freeze({
    enabled: true,
    database: loadKnowledgeDatabaseConfig(env, runtime),
    cos: loadCosConfig(env),
    publicOrigin: parsePublicOrigin(env.PUBLIC_ORIGIN, {
      production
    }),
    auth: Object.freeze({
      tokenSecret,
      sessionTtlSeconds: parseInteger(
        env.KNOWLEDGE_SESSION_TTL_SECONDS,
        "KNOWLEDGE_SESSION_TTL_SECONDS",
        60 * 60 * 24 * 14,
        { min: 60 * 60, max: 60 * 60 * 24 * 90 }
      )
    }),
    worker: Object.freeze({
      concurrency: parseInteger(
        env.KNOWLEDGE_WORKER_CONCURRENCY,
        "KNOWLEDGE_WORKER_CONCURRENCY",
        2,
        { min: 1, max: 32 }
      ),
      leaseSeconds: parseInteger(
        env.KNOWLEDGE_WORKER_LEASE_SECONDS,
        "KNOWLEDGE_WORKER_LEASE_SECONDS",
        60,
        { min: 15, max: 3600 }
      ),
      heartbeatIntervalSeconds: workerHeartbeatIntervalSeconds,
      staleAfterSeconds: workerStaleAfterSeconds
    }),
    embedding: Object.freeze({
      leaseSeconds: embeddingLeaseSeconds,
      requestTimeoutMs: embeddingRequestTimeoutMs
    }),
    retrieval: Object.freeze({
      enhancementTimeoutMs: parseInteger(
        env.KNOWLEDGE_RETRIEVAL_ENHANCEMENT_TIMEOUT_MS,
        "KNOWLEDGE_RETRIEVAL_ENHANCEMENT_TIMEOUT_MS",
        15_000,
        { min: 1_000, max: 60_000 }
      )
    }),
    ocr: loadOcrConfig(env, { production })
  });
}

export function knowledgeConfigSecrets(config) {
  if (!config?.enabled) return [];
  return [
    config.database?.connectionString,
    config.auth?.tokenSecret,
    config.cos?.secretId,
    config.cos?.secretKey,
    config.ocr?.apiKey
  ].filter(Boolean);
}
