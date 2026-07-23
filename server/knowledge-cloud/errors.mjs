import crypto from "node:crypto";

export const KNOWLEDGE_ERROR_CODES = Object.freeze({
  ACCOUNT_EXISTS: "KB_ACCOUNT_EXISTS",
  ACCOUNT_NOT_FOUND: "KB_ACCOUNT_NOT_FOUND",
  ACCOUNT_FROZEN: "KB_ACCOUNT_FROZEN",
  ADMIN_AUTH_REQUIRED: "KB_ADMIN_AUTH_REQUIRED",
  ADMIN_UNAVAILABLE: "KB_ADMIN_UNAVAILABLE",
  ADMIN_RESET_REQUIRED: "KB_ADMIN_RESET_REQUIRED",
  ADMIN_REASON_REQUIRED: "KB_ADMIN_REASON_REQUIRED",
  AUTH_INVALID_CREDENTIALS: "KB_AUTH_INVALID_CREDENTIALS",
  AUTH_REQUIRED: "KB_AUTH_REQUIRED",
  CONFIG_INVALID: "KB_CONFIG_INVALID",
  CONFIG_MISSING: "KB_CONFIG_MISSING",
  DATABASE_UNAVAILABLE: "KB_DATABASE_UNAVAILABLE",
  DISABLED: "KB_DISABLED",
  DOCUMENT_LIMIT_EXCEEDED: "KB_DOCUMENT_LIMIT_EXCEEDED",
  DOCUMENT_NOT_FOUND: "KB_DOCUMENT_NOT_FOUND",
  EMBEDDING_BATCH_IN_PROGRESS: "KB_EMBEDDING_BATCH_IN_PROGRESS",
  EMBEDDING_BATCH_LEASE_LOST: "KB_EMBEDDING_BATCH_LEASE_LOST",
  EMBEDDING_CONNECTION_REQUIRED: "KB_EMBEDDING_CONNECTION_REQUIRED",
  EMBEDDING_PROVIDER_ERROR: "KB_EMBEDDING_PROVIDER_ERROR",
  EMBEDDING_PROFILE_INVALID: "KB_EMBEDDING_PROFILE_INVALID",
  EMBEDDING_PROFILE_CHANGE_REQUIRES_REINDEX: "KB_EMBEDDING_PROFILE_CHANGE_REQUIRES_REINDEX",
  FILE_TOO_LARGE: "KB_FILE_TOO_LARGE",
  INVALID_REQUEST: "KB_INVALID_REQUEST",
  INTERNAL: "KB_INTERNAL_ERROR",
  INVITE_INVALID: "KB_INVITE_INVALID",
  INVITE_NOT_FOUND: "KB_INVITE_NOT_FOUND",
  INVITE_REQUIRED: "KB_INVITE_REQUIRED",
  INDEX_NOT_READY: "KB_INDEX_NOT_READY",
  MIGRATION_CHECKSUM_MISMATCH: "KB_MIGRATION_CHECKSUM_MISMATCH",
  MIGRATION_FAILED: "KB_MIGRATION_FAILED",
  MIGRATION_HISTORY_INVALID: "KB_MIGRATION_HISTORY_INVALID",
  MIGRATIONS_REQUIRED: "KB_MIGRATIONS_REQUIRED",
  NODE_RUNTIME_UNSUPPORTED: "KB_NODE_RUNTIME_UNSUPPORTED",
  KNOWLEDGE_BASE_LIMIT_EXCEEDED: "KB_KNOWLEDGE_BASE_LIMIT_EXCEEDED",
  KNOWLEDGE_BASE_NOT_FOUND: "KB_KNOWLEDGE_BASE_NOT_FOUND",
  REINDEX_IN_PROGRESS: "KB_REINDEX_IN_PROGRESS",
  JOB_LEASE_LOST: "KB_JOB_LEASE_LOST",
  JOB_NOT_FOUND: "KB_JOB_NOT_FOUND",
  JOB_STATE_INVALID: "KB_JOB_STATE_INVALID",
  OBJECT_STORE_UNAVAILABLE: "KB_OBJECT_STORE_UNAVAILABLE",
  ORIGIN_INVALID: "KB_ORIGIN_INVALID",
  QUOTA_EXCEEDED: "KB_QUOTA_EXCEEDED",
  QUOTA_RESERVATION_INVALID: "KB_QUOTA_RESERVATION_INVALID",
  RATE_LIMITED: "KB_RATE_LIMITED",
  RECOVERY_INVALID: "KB_RECOVERY_INVALID",
  REGISTRATION_DISABLED: "KB_REGISTRATION_DISABLED",
  ROUTE_NOT_FOUND: "KB_ROUTE_NOT_FOUND",
  REQUEST_TOO_LARGE: "KB_REQUEST_TOO_LARGE",
  PARSER_EMPTY: "KB_PARSER_EMPTY",
  PARSER_ENCRYPTED: "KB_PARSER_ENCRYPTED",
  PARSER_FAILED: "KB_PARSER_FAILED",
  PARSER_MALFORMED: "KB_PARSER_MALFORMED",
  PARSER_RESOURCE_LIMIT: "KB_PARSER_RESOURCE_LIMIT",
  PARSER_TIMEOUT: "KB_PARSER_TIMEOUT",
  PARSER_TYPE_MISMATCH: "KB_PARSER_TYPE_MISMATCH",
  PARSER_UNSUPPORTED: "KB_PARSER_UNSUPPORTED",
  RESET_INVALID: "KB_RESET_INVALID",
  SCHEMA_AHEAD: "KB_SCHEMA_AHEAD",
  SESSION_EXPIRED: "KB_SESSION_EXPIRED",
  CSRF_INVALID: "KB_CSRF_INVALID",
  UNAVAILABLE: "KB_UNAVAILABLE",
  UPLOAD_EXPIRED: "KB_UPLOAD_EXPIRED",
  UPLOAD_IN_PROGRESS_LIMIT: "KB_UPLOAD_IN_PROGRESS_LIMIT",
  UPLOAD_MISMATCH: "KB_UPLOAD_MISMATCH",
  UPLOAD_NOT_FOUND: "KB_UPLOAD_NOT_FOUND",
  UPLOAD_STATE_INVALID: "KB_UPLOAD_STATE_INVALID",
  VERSION_CONFLICT: "KB_VERSION_CONFLICT",
  VECTOR_EXTENSION_MISSING: "KB_VECTOR_EXTENSION_MISSING"
});

const SECRET_KEY_PATTERN =
  /(api[-_]?key|authorization|cookie|credential|database[-_]?url|password|private[-_]?key|secret|session|token)/i;
const MAX_STRING_LENGTH = 4000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 80;

function boundedString(value) {
  const text = String(value ?? "");
  return text.length > MAX_STRING_LENGTH ? `${text.slice(0, MAX_STRING_LENGTH)}...[truncated]` : text;
}

function redactString(value, secrets) {
  let result = boundedString(value)
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:/]+:)[^@\s/]+@/gi, "$1[redacted]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bAKID[A-Za-z0-9]{12,}\b/g, "[redacted-cos-secret-id]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-api-key]");

  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < 4) continue;
    result = result.split(secret).join("[redacted]");
  }
  return result;
}

export function redactKnowledgeValue(value, { secrets = [], depth = 0 } = {}) {
  if (depth > 5) return "[truncated]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string" || value instanceof URL) {
    return redactString(value, secrets);
  }
  if (value instanceof Error) {
    return {
      name: boundedString(value.name || "Error"),
      message: redactString(value.message || "", secrets),
      code: typeof value.code === "string" ? boundedString(value.code) : undefined
    };
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => redactKnowledgeValue(entry, { secrets, depth: depth + 1 }));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([key, entry]) => [
          key,
          SECRET_KEY_PATTERN.test(key)
            ? "[redacted]"
            : redactKnowledgeValue(entry, { secrets, depth: depth + 1 })
        ])
    );
  }
  return boundedString(value);
}

export class KnowledgeError extends Error {
  constructor(code, message, { status = 500, details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "KnowledgeError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function knowledgeError(code, message, options) {
  return new KnowledgeError(code, message, options);
}

export function createKnowledgeRequestId() {
  return crypto.randomUUID();
}

export function toKnowledgeErrorPayload(error, { requestId, secrets = [] } = {}) {
  const isKnowledgeError = error instanceof KnowledgeError;
  const status = isKnowledgeError && Number.isInteger(error.status) ? error.status : 500;
  const code = isKnowledgeError ? error.code : KNOWLEDGE_ERROR_CODES.INTERNAL;
  const message = isKnowledgeError && status < 500 ? error.message : "知识库服务暂时不可用";
  const details = isKnowledgeError
    ? redactKnowledgeValue(error.details, { secrets })
    : undefined;

  return {
    status,
    body: {
      error: {
        code,
        message,
        requestId: requestId || createKnowledgeRequestId(),
        ...(details && typeof details === "object" ? { details } : {})
      }
    },
    log: redactKnowledgeValue(
      {
        code,
        status,
        requestId,
        error
      },
      { secrets }
    )
  };
}
