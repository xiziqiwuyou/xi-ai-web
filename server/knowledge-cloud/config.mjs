import * as nodeCrypto from "node:crypto";
import {
  KNOWLEDGE_ERROR_CODES,
  knowledgeError
} from "./errors.mjs";

export const KNOWLEDGE_NODE_MIN_VERSION = "24.7.0";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["", "0", "false", "no", "off"]);

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

function parsePublicOrigin(value) {
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
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.pathname !== "/") {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "PUBLIC_ORIGIN 必须是 HTTP(S) 站点根地址",
      { status: 503, details: { field: "PUBLIC_ORIGIN" } }
    );
  }
  return url.origin;
}

export function loadKnowledgeDatabaseConfig(env = process.env) {
  requireEnvironment(env, ["DATABASE_URL"]);
  return Object.freeze({
    connectionString: parseDatabaseUrl(String(env.DATABASE_URL).trim()),
    sslMode: parseSslMode(env.DATABASE_SSL_MODE),
    sslCa: String(env.DATABASE_SSL_CA || "").trim(),
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
  return Object.freeze({
    enabled: true,
    database: loadKnowledgeDatabaseConfig(env),
    cos: loadCosConfig(env),
    publicOrigin: parsePublicOrigin(env.PUBLIC_ORIGIN),
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
      )
    }),
    embedding: Object.freeze({
      leaseSeconds: embeddingLeaseSeconds,
      requestTimeoutMs: embeddingRequestTimeoutMs
    })
  });
}

export function knowledgeConfigSecrets(config) {
  if (!config?.enabled) return [];
  return [
    config.database?.connectionString,
    config.auth?.tokenSecret,
    config.cos?.secretId,
    config.cos?.secretKey
  ].filter(Boolean);
}
