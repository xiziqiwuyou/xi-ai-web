import crypto from "node:crypto";
import { MCP_ERROR_CODES, McpError } from "./contract.mjs";

export const MCP_SESSION_COOKIE_NAME = "xi_mcp_session";
export const MCP_SESSION_TTL_MS = 15 * 60 * 1000;

function sessionError(code, message) {
  return new McpError(code, message, { status: 403 });
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest();
}

function safeDigestEqual(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function boundedPositiveInt(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

export function createMcpSessionStore({
  ttlMs = MCP_SESSION_TTL_MS,
  maxSessions = 1_024,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  randomUUID = crypto.randomUUID
} = {}) {
  const lifetime = boundedPositiveInt(ttlMs, MCP_SESSION_TTL_MS, 60 * 60 * 1000);
  const capacity = boundedPositiveInt(maxSessions, 1_024, 8_192);
  const sessions = new Map();

  const cleanup = () => {
    const timestamp = now();
    for (const [key, record] of sessions) {
      if (record.expiresAt <= timestamp) sessions.delete(key);
    }
  };

  const read = (cookieToken) => {
    cleanup();
    if (typeof cookieToken !== "string" || cookieToken.length < 32 || cookieToken.length > 256) return null;
    const key = digest(cookieToken).toString("base64url");
    const record = sessions.get(key);
    if (!record || record.expiresAt <= now()) {
      sessions.delete(key);
      return null;
    }
    return { key, record };
  };

  const evictIfNeeded = () => {
    cleanup();
    while (sessions.size >= capacity) {
      let oldestKey = "";
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, record] of sessions) {
        if (record.lastSeenAt < oldestAt) {
          oldestAt = record.lastSeenAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      sessions.delete(oldestKey);
    }
  };

  const issue = (cookieToken = "") => {
    const existing = read(cookieToken);
    const csrfToken = randomBytes(32).toString("base64url");
    const timestamp = now();
    if (existing) {
      existing.record.csrfDigest = digest(csrfToken);
      existing.record.expiresAt = timestamp + lifetime;
      existing.record.lastSeenAt = timestamp;
      return {
        sessionId: existing.record.sessionId,
        cookieToken: "",
        csrfToken,
        expiresAt: new Date(existing.record.expiresAt).toISOString(),
        created: false
      };
    }

    evictIfNeeded();
    const nextCookieToken = randomBytes(32).toString("base64url");
    const record = {
      sessionId: randomUUID(),
      csrfDigest: digest(csrfToken),
      expiresAt: timestamp + lifetime,
      lastSeenAt: timestamp
    };
    sessions.set(digest(nextCookieToken).toString("base64url"), record);
    return {
      sessionId: record.sessionId,
      cookieToken: nextCookieToken,
      csrfToken,
      expiresAt: new Date(record.expiresAt).toISOString(),
      created: true
    };
  };

  const resolve = (cookieToken) => {
    const found = read(cookieToken);
    if (!found) {
      throw sessionError(MCP_ERROR_CODES.APPROVAL_SESSION_INVALID, "MCP approval session is missing or expired");
    }
    found.record.lastSeenAt = now();
    return { sessionId: found.record.sessionId, expiresAt: found.record.expiresAt };
  };

  const verify = (cookieToken, csrfToken) => {
    const found = read(cookieToken);
    if (!found) {
      throw sessionError(MCP_ERROR_CODES.APPROVAL_SESSION_INVALID, "MCP approval session is missing or expired");
    }
    const supplied = typeof csrfToken === "string" && csrfToken.length >= 32 && csrfToken.length <= 256
      ? digest(csrfToken)
      : Buffer.alloc(32);
    if (!safeDigestEqual(found.record.csrfDigest, supplied)) {
      throw sessionError(MCP_ERROR_CODES.APPROVAL_CSRF_INVALID, "MCP approval request could not be verified");
    }
    found.record.lastSeenAt = now();
    return { sessionId: found.record.sessionId, expiresAt: found.record.expiresAt };
  };

  const invalidate = (cookieToken) => {
    const found = read(cookieToken);
    if (!found) return false;
    return sessions.delete(found.key);
  };

  return {
    issue,
    resolve,
    verify,
    invalidate,
    cleanup,
    get size() {
      cleanup();
      return sessions.size;
    }
  };
}
