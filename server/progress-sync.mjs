import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import express from "express";

const MEBIBYTE = 1024 * 1024;
const CODE_PATTERN = /^\d{6}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,160}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SEMANTIC_ROLES = new Set(["sender", "receiver"]);
const ACTIVE_STATES = new Set([
  "waiting_join",
  "awaiting_approval",
  "approved",
  "payload_ready",
  "claimed"
]);
const TERMINAL_STATES = new Set(["completed", "rejected", "cancelled", "expired"]);

export const PROGRESS_SYNC_NO_STORE = "no-store, max-age=0";

export const PROGRESS_SYNC_ERROR_CODES = Object.freeze({
  ALREADY_CLAIMED: "PROGRESS_SYNC_ALREADY_CLAIMED",
  APPROVAL_MISMATCH: "PROGRESS_SYNC_APPROVAL_MISMATCH",
  ATTEMPT_LIMIT: "PROGRESS_SYNC_ATTEMPT_LIMIT",
  AUTH_INVALID: "PROGRESS_SYNC_AUTH_INVALID",
  CANCELLED: "PROGRESS_SYNC_CANCELLED",
  CAPACITY_REACHED: "PROGRESS_SYNC_CAPACITY_REACHED",
  CODE_EXPIRED: "PROGRESS_SYNC_CODE_EXPIRED",
  CODE_INVALID: "PROGRESS_SYNC_CODE_INVALID",
  INTERNAL: "PROGRESS_SYNC_INTERNAL_ERROR",
  INVALID_REQUEST: "PROGRESS_SYNC_INVALID_REQUEST",
  JOIN_ALREADY_PENDING: "PROGRESS_SYNC_JOIN_ALREADY_PENDING",
  PAYLOAD_ALREADY_UPLOADED: "PROGRESS_SYNC_PAYLOAD_ALREADY_UPLOADED",
  PAYLOAD_INVALID: "PROGRESS_SYNC_PAYLOAD_INVALID",
  PAYLOAD_NOT_READY: "PROGRESS_SYNC_PAYLOAD_NOT_READY",
  PAYLOAD_TOO_LARGE: "PROGRESS_SYNC_PAYLOAD_TOO_LARGE",
  REJECTED: "PROGRESS_SYNC_REJECTED",
  SESSION_NOT_FOUND: "PROGRESS_SYNC_SESSION_NOT_FOUND",
  STATE_INVALID: "PROGRESS_SYNC_STATE_INVALID",
  STORAGE_UNAVAILABLE: "PROGRESS_SYNC_STORAGE_UNAVAILABLE"
});

export class ProgressSyncError extends Error {
  constructor(status, code, message, { retryAfterSeconds } = {}) {
    super(message);
    this.name = "ProgressSyncError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function progressSyncError(status, code, message, options) {
  return new ProgressSyncError(status, code, message, options);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function asRandomBuffer(randomBytes, size) {
  const value = Buffer.from(randomBytes(size));
  if (value.length < size) {
    throw progressSyncError(
      500,
      PROGRESS_SYNC_ERROR_CODES.INTERNAL,
      "Temporary sync random source is unavailable"
    );
  }
  return value.subarray(0, size);
}

function normalizeSessionId(value) {
  const sessionId = String(value || "").trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw progressSyncError(
      400,
      PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
      "Temporary sync session identifier is invalid"
    );
  }
  return sessionId;
}

function normalizeCode(value) {
  const source = String(value || "").normalize("NFKC").trim();
  if (!/^[\d\s]+$/.test(source)) {
    throw progressSyncError(404, PROGRESS_SYNC_ERROR_CODES.CODE_INVALID, "Temporary sync code is invalid");
  }
  const compact = source.replace(/\s/g, "");
  if (!CODE_PATTERN.test(compact)) {
    throw progressSyncError(404, PROGRESS_SYNC_ERROR_CODES.CODE_INVALID, "Temporary sync code is invalid");
  }
  return compact;
}

function formatCode(value) {
  return value;
}

function normalizeSemanticRole(value, fallback) {
  const role = value === undefined || value === null || value === "" ? fallback : String(value).trim();
  if (!SEMANTIC_ROLES.has(role)) {
    throw progressSyncError(
      400,
      PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
      "Temporary sync semantic role is invalid"
    );
  }
  return role;
}

function oppositeSemanticRole(role) {
  return role === "sender" ? "receiver" : "sender";
}

function normalizeBase64Url(value, expectedBytes) {
  const text = String(value || "").trim();
  if (!BASE64URL_PATTERN.test(text) || text.length > expectedBytes * 2) return null;
  let decoded;
  try {
    decoded = Buffer.from(text, "base64url");
  } catch {
    return null;
  }
  if (decoded.length !== expectedBytes || decoded.toString("base64url") !== text) return null;
  return { text, decoded };
}

function normalizePublicMaterial(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw progressSyncError(
      400,
      PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
      "Temporary sync public material is invalid"
    );
  }
  const publicKey = normalizeBase64Url(value.publicKey, 65);
  const nonce = normalizeBase64Url(value.nonce, 16);
  if (!publicKey || !nonce || publicKey.decoded[0] !== 4) {
    throw progressSyncError(
      400,
      PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
      "Temporary sync public material is invalid"
    );
  }
  try {
    const converted = crypto.ECDH.convertKey(
      publicKey.decoded,
      "prime256v1",
      undefined,
      undefined,
      "uncompressed"
    );
    if (!Buffer.from(converted).equals(publicKey.decoded)) throw new Error("non-canonical key");
  } catch {
    throw progressSyncError(
      400,
      PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
      "Temporary sync public material is invalid"
    );
  }
  return Object.freeze({ publicKey: publicKey.text, nonce: nonce.text });
}

function normalizeDeviceLabel(value) {
  const label = String(value || "Unknown device")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return (label || "Unknown device").slice(0, 80);
}

function normalizeCiphertext(value, maxPayloadBytes) {
  let ciphertext;
  if (Buffer.isBuffer(value)) {
    ciphertext = value;
  } else if (value instanceof ArrayBuffer) {
    ciphertext = Buffer.from(value);
  } else if (ArrayBuffer.isView(value)) {
    ciphertext = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  } else {
    throw progressSyncError(
      400,
      PROGRESS_SYNC_ERROR_CODES.PAYLOAD_INVALID,
      "Encrypted temporary sync payload is invalid"
    );
  }
  if (!ciphertext.length) {
    throw progressSyncError(
      400,
      PROGRESS_SYNC_ERROR_CODES.PAYLOAD_INVALID,
      "Encrypted temporary sync payload is empty"
    );
  }
  if (ciphertext.length > maxPayloadBytes) {
    throw progressSyncError(
      413,
      PROGRESS_SYNC_ERROR_CODES.PAYLOAD_TOO_LARGE,
      "Encrypted temporary sync payload exceeds the configured limit"
    );
  }
  return ciphertext;
}

function safeEqual(left, right) {
  return Buffer.isBuffer(left)
    && Buffer.isBuffer(right)
    && left.length === right.length
    && crypto.timingSafeEqual(left, right);
}

function safeChildPath(rootDir, fileName) {
  const candidate = path.resolve(rootDir, fileName);
  if (path.dirname(candidate) !== rootDir) {
    throw progressSyncError(
      400,
      PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
      "Temporary sync storage path is invalid"
    );
  }
  return candidate;
}

export function createProgressSyncFileStore({
  dataDir,
  fsModule = fs,
  randomBytes = crypto.randomBytes
} = {}) {
  if (typeof dataDir !== "string" || !dataDir.trim()) {
    throw new TypeError("Temporary sync file store requires a data directory");
  }
  const rootDir = path.resolve(dataDir, "progress-sync");

  function payloadPath(sessionId) {
    return safeChildPath(rootDir, `${normalizeSessionId(sessionId)}.payload`);
  }

  async function initialize() {
    await fsModule.mkdir(rootDir, { recursive: true });
    const entries = await fsModule.readdir(rootDir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const target = safeChildPath(rootDir, entry.name);
      await fsModule.rm(target, { recursive: entry.isDirectory(), force: true });
    }));
  }

  async function write(sessionId, ciphertext) {
    const destination = payloadPath(sessionId);
    const suffix = asRandomBuffer(randomBytes, 12).toString("base64url");
    const temporary = safeChildPath(rootDir, `.${sessionId}.${suffix}.tmp`);
    try {
      await fsModule.writeFile(temporary, ciphertext, { flag: "wx", mode: 0o600 });
      await fsModule.rename(temporary, destination);
      try {
        await fsModule.chmod(destination, 0o600);
      } catch {
        // Windows and some mounted filesystems do not expose POSIX modes.
      }
    } finally {
      await fsModule.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async function read(sessionId) {
    return fsModule.readFile(payloadPath(sessionId));
  }

  async function remove(sessionId) {
    await fsModule.rm(payloadPath(sessionId), { force: true });
  }

  return Object.freeze({ rootDir, initialize, write, read, remove });
}

function stateError(session) {
  if (session.state === "expired") {
    return progressSyncError(410, PROGRESS_SYNC_ERROR_CODES.CODE_EXPIRED, "Temporary sync session has expired");
  }
  if (session.state === "rejected") {
    return progressSyncError(410, PROGRESS_SYNC_ERROR_CODES.REJECTED, "Temporary sync request was rejected");
  }
  if (session.state === "cancelled") {
    return progressSyncError(410, PROGRESS_SYNC_ERROR_CODES.CANCELLED, "Temporary sync session was cancelled");
  }
  if (session.state === "completed" || session.state === "claimed") {
    return progressSyncError(410, PROGRESS_SYNC_ERROR_CODES.ALREADY_CLAIMED, "Temporary sync payload was already claimed");
  }
  return progressSyncError(409, PROGRESS_SYNC_ERROR_CODES.STATE_INVALID, "Temporary sync session state does not allow this action");
}

export function createProgressSyncService({
  dataDir,
  storage,
  clock = Date.now,
  randomBytes = crypto.randomBytes,
  hashSecret,
  ttlMs = 10 * 60_000,
  terminalRetentionMs = 5 * 60_000,
  cleanupIntervalMs = 60_000,
  attemptWindowMs = 10 * 60_000,
  maxPayloadBytes = 32 * MEBIBYTE,
  maxSessions = 1_000,
  maxAttemptBuckets = 10_000,
  maxIpJoinAttempts = 5,
  maxSessionJoinAttempts = 5,
  maxSessionAuthAttempts = 10,
  autoCleanup = true
} = {}) {
  if (typeof clock !== "function" || typeof randomBytes !== "function") {
    throw new TypeError("Temporary sync service requires clock and random functions");
  }
  let currentTtlMs = boundedInteger(ttlMs, 10 * 60_000, 3 * 60_000, 30 * 60_000);
  const normalizedRetentionMs = boundedInteger(terminalRetentionMs, 5 * 60_000, 60_000, 30 * 60_000);
  const normalizedCleanupIntervalMs = boundedInteger(cleanupIntervalMs, 60_000, 1_000, 5 * 60_000);
  const normalizedAttemptWindowMs = boundedInteger(attemptWindowMs, 10 * 60_000, 1_000, 60 * 60_000);
  let currentMaxPayloadBytes = boundedInteger(
    maxPayloadBytes,
    32 * MEBIBYTE,
    5 * MEBIBYTE,
    64 * MEBIBYTE
  );
  const normalizedMaxSessions = boundedInteger(maxSessions, 1_000, 1, 10_000);
  const normalizedMaxAttemptBuckets = boundedInteger(maxAttemptBuckets, 10_000, 16, 100_000);
  let currentMaxIpJoinAttempts = boundedInteger(maxIpJoinAttempts, 5, 1, 1_000);
  let currentMaxSessionJoinAttempts = boundedInteger(maxSessionJoinAttempts, 5, 1, 100);
  const normalizedMaxSessionAuthAttempts = boundedInteger(maxSessionAuthAttempts, 10, 1, 100);
  const fileStore = storage || createProgressSyncFileStore({ dataDir, randomBytes });
  for (const method of ["initialize", "write", "read", "remove"]) {
    if (typeof fileStore?.[method] !== "function") {
      throw new TypeError(`Temporary sync storage is missing ${method}()`);
    }
  }

  const suppliedHashSecret = hashSecret === undefined
    ? asRandomBuffer(randomBytes, 32)
    : Buffer.from(hashSecret);
  if (suppliedHashSecret.length < 32 || suppliedHashSecret.length > 1024) {
    throw new TypeError("Temporary sync hash secret must contain 32 to 1024 bytes");
  }
  const hashKey = crypto.createHash("sha256").update(suppliedHashSecret).digest();
  const sessions = new Map();
  const codeIndex = new Map();
  const ipAttempts = new Map();
  let closed = false;

  function now() {
    const value = Number(clock());
    if (!Number.isFinite(value)) {
      throw progressSyncError(500, PROGRESS_SYNC_ERROR_CODES.INTERNAL, "Temporary sync clock is unavailable");
    }
    return Math.trunc(value);
  }

  function hashValue(purpose, value) {
    return crypto
      .createHmac("sha256", hashKey)
      .update("xi-ai-web/progress-sync/v1\0", "utf8")
      .update(purpose, "utf8")
      .update("\0", "utf8")
      .update(String(value), "utf8")
      .digest();
  }

  function hashText(purpose, value) {
    return hashValue(purpose, value).toString("base64url");
  }

  function materialHash(material) {
    return hashValue("receiver-material", `${material.publicKey}\0${material.nonce}`);
  }

  function materialWithDeviceLabel(material, deviceLabel) {
    if (deviceLabel === undefined || deviceLabel === null || deviceLabel === "") return material;
    return Object.freeze({ ...material, deviceLabel: normalizeDeviceLabel(deviceLabel) });
  }

  function opaqueToken(bytes = 32) {
    return asRandomBuffer(randomBytes, bytes).toString("base64url");
  }

  function authorizationCode() {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      let compact = "";
      let entropyBatches = 0;
      while (compact.length < 6 && entropyBatches < 32) {
        entropyBatches += 1;
        const entropy = asRandomBuffer(randomBytes, 12);
        for (const byte of entropy) {
          if (byte >= 250) continue;
          compact += String(byte % 10);
          if (compact.length === 6) break;
        }
      }
      if (compact.length !== 6) continue;
      const codeHashText = hashText("code", compact);
      if (!codeIndex.has(codeHashText)) return { compact, codeHashText };
    }
    throw progressSyncError(503, PROGRESS_SYNC_ERROR_CODES.CAPACITY_REACHED, "Temporary sync code capacity is exhausted");
  }

  function uniqueSessionId() {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const sessionId = opaqueToken(24);
      if (!sessions.has(sessionId)) return sessionId;
    }
    throw progressSyncError(503, PROGRESS_SYNC_ERROR_CODES.CAPACITY_REACHED, "Temporary sync session capacity is exhausted");
  }

  function runExclusive(session, operation) {
    const result = session.operation.then(operation, operation);
    session.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  async function ensureReady() {
    try {
      await ready;
    } catch {
      throw progressSyncError(
        503,
        PROGRESS_SYNC_ERROR_CODES.STORAGE_UNAVAILABLE,
        "Temporary sync storage is unavailable"
      );
    }
  }

  function findSession(sessionIdValue) {
    const sessionId = normalizeSessionId(sessionIdValue);
    const session = sessions.get(sessionId);
    if (!session) {
      throw progressSyncError(404, PROGRESS_SYNC_ERROR_CODES.SESSION_NOT_FOUND, "Temporary sync session was not found");
    }
    return session;
  }

  async function removePayload(session) {
    if (!session.hasPayload) return true;
    try {
      await fileStore.remove(session.id);
      session.hasPayload = false;
      return true;
    } catch {
      return false;
    }
  }

  async function terminalize(session, state) {
    if (!TERMINAL_STATES.has(state)) {
      throw progressSyncError(500, PROGRESS_SYNC_ERROR_CODES.INTERNAL, "Temporary sync terminal state is invalid");
    }
    const timestamp = now();
    session.state = state;
    session.updatedAt = timestamp;
    session.terminalAt = timestamp;
    session.purgeAt = timestamp + normalizedRetentionMs;
    await removePayload(session);
    session.sender = null;
    session.receiver = null;
    session.receiverMaterialHash = null;
    session.payloadBytes = 0;
  }

  async function expireIfNeeded(session) {
    if (ACTIVE_STATES.has(session.state) && session.expiresAt <= now()) {
      await terminalize(session, "expired");
      return true;
    }
    return false;
  }

  async function authenticate(session, tokenValue, allowedRoles) {
    const token = typeof tokenValue === "string" ? tokenValue : "";
    let role = null;
    if (token && token.length <= 512) {
      const creatorCandidate = hashValue("creator-token", token);
      const joinCandidate = hashValue("join-token", token);
      if (allowedRoles.includes("creator") && safeEqual(creatorCandidate, session.creatorTokenHash)) {
        role = "creator";
      } else if (
        allowedRoles.includes("join")
        && session.joinTokenHash
        && safeEqual(joinCandidate, session.joinTokenHash)
      ) {
        role = "join";
      }
    }
    if (role) return role;

    session.authAttempts += 1;
    if (session.authAttempts > normalizedMaxSessionAuthAttempts) {
      if (ACTIVE_STATES.has(session.state)) await terminalize(session, "expired");
      throw progressSyncError(
        429,
        PROGRESS_SYNC_ERROR_CODES.ATTEMPT_LIMIT,
        "Temporary sync authentication attempt limit was reached",
        { retryAfterSeconds: Math.max(1, Math.ceil((session.expiresAt - now()) / 1000)) }
      );
    }
    throw progressSyncError(401, PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID, "Temporary sync authentication failed");
  }

  function semanticRoleForTransport(session, transportRole) {
    return transportRole === "creator"
      ? session.creatorRole
      : oppositeSemanticRole(session.creatorRole);
  }

  async function authorizeSemanticRole(session, tokenValue, allowedSemanticRoles) {
    const transportRole = await authenticate(session, tokenValue, ["creator", "join"]);
    const semanticRole = semanticRoleForTransport(session, transportRole);
    if (!allowedSemanticRoles.includes(semanticRole)) {
      throw progressSyncError(
        403,
        PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID,
        "Temporary sync role is not allowed to perform this action"
      );
    }
    return semanticRole;
  }

  function statusProjection(session, semanticRole) {
    const status = {
      sessionId: session.id,
      state: session.state,
      expiresAt: new Date(session.expiresAt).toISOString(),
      creatorRole: session.creatorRole
    };
    if (!TERMINAL_STATES.has(session.state)) {
      if (semanticRole === "sender" && session.receiver) status.receiver = { ...session.receiver };
      if (semanticRole === "receiver" && session.sender) status.sender = { ...session.sender };
      if (session.payloadBytes > 0) status.payloadBytes = session.payloadBytes;
    }
    return status;
  }

  function cleanAttemptBuckets(timestamp = now()) {
    for (const [key, bucket] of ipAttempts) {
      if (bucket.resetAt <= timestamp) ipAttempts.delete(key);
    }
  }

  function consumeIpAttempt(ipValue) {
    const timestamp = now();
    cleanAttemptBuckets(timestamp);
    const ip = String(ipValue || "unknown").slice(0, 256);
    const key = hashText("join-ip", ip);
    let bucket = ipAttempts.get(key);
    if (!bucket) {
      if (ipAttempts.size >= normalizedMaxAttemptBuckets) {
        ipAttempts.delete(ipAttempts.keys().next().value);
      }
      bucket = { count: 0, resetAt: timestamp + normalizedAttemptWindowMs };
      ipAttempts.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > currentMaxIpJoinAttempts) {
      throw progressSyncError(
        429,
        PROGRESS_SYNC_ERROR_CODES.ATTEMPT_LIMIT,
        "Temporary sync code attempt limit was reached",
        { retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)) }
      );
    }
  }

  async function cleanupExpired() {
    await ensureReady();
    cleanAttemptBuckets();
    let expired = 0;
    let purged = 0;
    let cleanupRetried = 0;
    for (const session of [...sessions.values()]) {
      await runExclusive(session, async () => {
        if (sessions.get(session.id) !== session) return;
        if (await expireIfNeeded(session)) expired += 1;
        if (TERMINAL_STATES.has(session.state) && session.hasPayload) {
          if (await removePayload(session)) cleanupRetried += 1;
        }
        if (
          TERMINAL_STATES.has(session.state)
          && !session.hasPayload
          && session.purgeAt <= now()
        ) {
          sessions.delete(session.id);
          codeIndex.delete(session.codeHashText);
          purged += 1;
        }
      });
    }
    return { expired, purged, cleanupRetried };
  }

  function purgeTerminalSessionsForCapacity() {
    if (sessions.size < normalizedMaxSessions) return;
    const terminalSessions = [...sessions.values()]
      .filter((session) => TERMINAL_STATES.has(session.state) && !session.hasPayload)
      .sort((left, right) => (left.terminalAt || 0) - (right.terminalAt || 0));
    for (const session of terminalSessions) {
      if (sessions.size < normalizedMaxSessions) break;
      sessions.delete(session.id);
      codeIndex.delete(session.codeHashText);
    }
  }

  async function createSession({
    creatorRole: creatorRoleValue,
    sender: senderValue,
    receiver: receiverValue,
    material: materialValue,
    deviceLabel
  } = {}) {
    await ensureReady();
    await cleanupExpired();
    purgeTerminalSessionsForCapacity();
    if (sessions.size >= normalizedMaxSessions) {
      throw progressSyncError(503, PROGRESS_SYNC_ERROR_CODES.CAPACITY_REACHED, "Temporary sync session capacity was reached");
    }
    const creatorRole = normalizeSemanticRole(creatorRoleValue, "sender");
    if (senderValue && receiverValue) {
      throw progressSyncError(
        400,
        PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
        "Temporary sync create request contains conflicting role material"
      );
    }
    const creatorMaterialValue = creatorRole === "sender"
      ? senderValue || materialValue
      : receiverValue || materialValue;
    if ((creatorRole === "sender" && receiverValue) || (creatorRole === "receiver" && senderValue)) {
      throw progressSyncError(
        400,
        PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
        "Temporary sync create material does not match the creator role"
      );
    }
    const creatorMaterial = materialWithDeviceLabel(
      normalizePublicMaterial(creatorMaterialValue),
      deviceLabel
    );
    const sessionId = uniqueSessionId();
    const code = authorizationCode();
    const creatorToken = opaqueToken();
    const timestamp = now();
    const session = {
      id: sessionId,
      codeHashText: code.codeHashText,
      creatorTokenHash: hashValue("creator-token", creatorToken),
      joinTokenHash: null,
      creatorRole,
      sender: creatorRole === "sender" ? creatorMaterial : null,
      receiver: creatorRole === "receiver" ? creatorMaterial : null,
      receiverMaterialHash: creatorRole === "receiver" ? materialHash(creatorMaterial) : null,
      state: "waiting_join",
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: timestamp + currentTtlMs,
      terminalAt: null,
      purgeAt: null,
      joinAttempts: 0,
      authAttempts: 0,
      payloadBytes: 0,
      hasPayload: false,
      operation: Promise.resolve()
    };
    sessions.set(sessionId, session);
    codeIndex.set(code.codeHashText, sessionId);
    return {
      sessionId,
      code: formatCode(code.compact),
      creatorToken,
      creatorRole,
      expiresAt: new Date(session.expiresAt).toISOString()
    };
  }

  async function joinSession({
    code: codeValue,
    joinRole: joinRoleValue,
    sender: senderValue,
    receiver: receiverValue,
    material: materialValue,
    deviceLabel,
    ip
  } = {}) {
    await ensureReady();
    consumeIpAttempt(ip);
    const compactCode = normalizeCode(codeValue);
    const sessionId = codeIndex.get(hashText("code", compactCode));
    if (!sessionId || !sessions.has(sessionId)) {
      throw progressSyncError(404, PROGRESS_SYNC_ERROR_CODES.CODE_INVALID, "Temporary sync code is invalid");
    }
    const session = sessions.get(sessionId);
    return runExclusive(session, async () => {
      if (sessions.get(session.id) !== session) {
        throw progressSyncError(404, PROGRESS_SYNC_ERROR_CODES.CODE_INVALID, "Temporary sync code is invalid");
      }
      await expireIfNeeded(session);
      if (TERMINAL_STATES.has(session.state)) throw stateError(session);
      session.joinAttempts += 1;
      if (session.joinAttempts > currentMaxSessionJoinAttempts) {
        await terminalize(session, "expired");
        throw progressSyncError(
          429,
          PROGRESS_SYNC_ERROR_CODES.ATTEMPT_LIMIT,
          "Temporary sync session attempt limit was reached",
          { retryAfterSeconds: Math.max(1, Math.ceil(currentTtlMs / 1000)) }
        );
      }
      if (session.state !== "waiting_join") {
        throw progressSyncError(
          409,
          PROGRESS_SYNC_ERROR_CODES.JOIN_ALREADY_PENDING,
          "A receiver is already pending for this temporary sync session"
        );
      }
      const expectedJoinRole = oppositeSemanticRole(session.creatorRole);
      const joinRole = normalizeSemanticRole(joinRoleValue, expectedJoinRole);
      if (joinRole !== expectedJoinRole || (senderValue && receiverValue)) {
        throw progressSyncError(
          400,
          PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
          "Temporary sync join role does not complement the creator role"
        );
      }
      const joinMaterialValue = joinRole === "sender"
        ? senderValue || materialValue
        : receiverValue || materialValue;
      if ((joinRole === "sender" && receiverValue) || (joinRole === "receiver" && senderValue)) {
        throw progressSyncError(
          400,
          PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
          "Temporary sync join material does not match the join role"
        );
      }
      const joinMaterial = materialWithDeviceLabel(
        normalizePublicMaterial(joinMaterialValue),
        deviceLabel
      );
      const joinToken = opaqueToken();
      session.joinTokenHash = hashValue("join-token", joinToken);
      session[joinRole] = joinMaterial;
      if (joinRole === "receiver") session.receiverMaterialHash = materialHash(joinMaterial);
      session.state = "awaiting_approval";
      session.updatedAt = now();
      return {
        sessionId: session.id,
        joinToken,
        joinRole,
        expiresAt: new Date(session.expiresAt).toISOString(),
        [session.creatorRole]: { ...session[session.creatorRole] }
      };
    });
  }

  async function getStatus({ sessionId, token } = {}) {
    await ensureReady();
    const session = findSession(sessionId);
    return runExclusive(session, async () => {
      await expireIfNeeded(session);
      const transportRole = await authenticate(session, token, ["creator", "join"]);
      return statusProjection(session, semanticRoleForTransport(session, transportRole));
    });
  }

  async function approveSession({ sessionId, token, creatorToken, joinToken, receiver: receiverValue } = {}) {
    await ensureReady();
    const session = findSession(sessionId);
    return runExclusive(session, async () => {
      await expireIfNeeded(session);
      await authorizeSemanticRole(session, token || creatorToken || joinToken, ["sender"]);
      if (TERMINAL_STATES.has(session.state)) throw stateError(session);
      if (session.state !== "awaiting_approval") throw stateError(session);
      const receiverMaterial = normalizePublicMaterial(receiverValue);
      if (!safeEqual(materialHash(receiverMaterial), session.receiverMaterialHash)) {
        throw progressSyncError(
          409,
          PROGRESS_SYNC_ERROR_CODES.APPROVAL_MISMATCH,
          "Pending receiver material changed before approval"
        );
      }
      session.state = "approved";
      session.updatedAt = now();
      return statusProjection(session, "sender");
    });
  }

  async function rejectSession({ sessionId, token, creatorToken, joinToken } = {}) {
    await ensureReady();
    const session = findSession(sessionId);
    return runExclusive(session, async () => {
      await expireIfNeeded(session);
      await authorizeSemanticRole(session, token || creatorToken || joinToken, ["sender"]);
      if (TERMINAL_STATES.has(session.state)) throw stateError(session);
      if (session.state !== "awaiting_approval") throw stateError(session);
      await terminalize(session, "rejected");
      return statusProjection(session, "sender");
    });
  }

  async function uploadPayload({ sessionId, token, creatorToken, joinToken, ciphertext: ciphertextValue } = {}) {
    await ensureReady();
    const ciphertext = normalizeCiphertext(ciphertextValue, currentMaxPayloadBytes);
    const session = findSession(sessionId);
    return runExclusive(session, async () => {
      await expireIfNeeded(session);
      await authorizeSemanticRole(session, token || creatorToken || joinToken, ["sender"]);
      if (TERMINAL_STATES.has(session.state)) throw stateError(session);
      if (session.state === "payload_ready") {
        throw progressSyncError(
          409,
          PROGRESS_SYNC_ERROR_CODES.PAYLOAD_ALREADY_UPLOADED,
          "Temporary sync payload was already uploaded"
        );
      }
      if (session.state !== "approved") throw stateError(session);
      try {
        await fileStore.write(session.id, ciphertext);
      } catch {
        throw progressSyncError(
          503,
          PROGRESS_SYNC_ERROR_CODES.STORAGE_UNAVAILABLE,
          "Temporary sync storage is unavailable"
        );
      }
      session.hasPayload = true;
      session.payloadBytes = ciphertext.length;
      session.state = "payload_ready";
      session.updatedAt = now();
      return statusProjection(session, "sender");
    });
  }

  async function claimPayload({ sessionId, token, joinToken, creatorToken } = {}) {
    await ensureReady();
    const session = findSession(sessionId);
    return runExclusive(session, async () => {
      await expireIfNeeded(session);
      await authorizeSemanticRole(session, token || joinToken || creatorToken, ["receiver"]);
      if (TERMINAL_STATES.has(session.state) || session.state === "claimed") throw stateError(session);
      if (session.state !== "payload_ready") {
        throw progressSyncError(
          409,
          PROGRESS_SYNC_ERROR_CODES.PAYLOAD_NOT_READY,
          "Temporary sync payload is not ready"
        );
      }
      const expectedBytes = session.payloadBytes;
      session.state = "claimed";
      session.updatedAt = now();
      let ciphertext;
      try {
        ciphertext = await fileStore.read(session.id);
      } catch {
        session.state = "payload_ready";
        throw progressSyncError(
          503,
          PROGRESS_SYNC_ERROR_CODES.STORAGE_UNAVAILABLE,
          "Temporary sync storage is unavailable"
        );
      }
      if (!Buffer.isBuffer(ciphertext) || ciphertext.length !== expectedBytes) {
        await terminalize(session, "cancelled");
        throw progressSyncError(
          503,
          PROGRESS_SYNC_ERROR_CODES.STORAGE_UNAVAILABLE,
          "Temporary sync storage is unavailable"
        );
      }
      await terminalize(session, "completed");
      return { state: "completed", payloadBytes: expectedBytes, ciphertext };
    });
  }

  async function cancelSession({ sessionId, token } = {}) {
    await ensureReady();
    const session = findSession(sessionId);
    return runExclusive(session, async () => {
      await expireIfNeeded(session);
      const transportRole = await authenticate(session, token, ["creator", "join"]);
      const semanticRole = semanticRoleForTransport(session, transportRole);
      if (session.state === "cancelled") return statusProjection(session, semanticRole);
      if (TERMINAL_STATES.has(session.state)) throw stateError(session);
      await terminalize(session, "cancelled");
      return statusProjection(session, semanticRole);
    });
  }

  function snapshotMetadata() {
    return [...sessions.values()].map((session) => ({
      sessionId: session.id,
      codeHash: session.codeHashText,
      creatorTokenHash: session.creatorTokenHash.toString("base64url"),
      joinTokenHash: session.joinTokenHash?.toString("base64url") || null,
      creatorRole: session.creatorRole,
      sender: session.sender ? { ...session.sender } : null,
      receiver: session.receiver ? { ...session.receiver } : null,
      state: session.state,
      joinAttempts: session.joinAttempts,
      authAttempts: session.authAttempts,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      payloadBytes: session.payloadBytes,
      hasPayload: session.hasPayload
    }));
  }

  async function close() {
    if (closed) return;
    closed = true;
    if (cleanupTimer) clearInterval(cleanupTimer);
  }

  function updateConfig(config = {}) {
    const requestedTtlMs = config.ttlMs ?? Number(config.ttlSeconds) * 1000;
    const requestedMaxBytes = config.maxPayloadBytes ?? Number(config.maxPayloadMb) * MEBIBYTE;
    currentTtlMs = boundedInteger(requestedTtlMs, currentTtlMs, 3 * 60_000, 30 * 60_000);
    currentMaxPayloadBytes = boundedInteger(
      requestedMaxBytes,
      currentMaxPayloadBytes,
      5 * MEBIBYTE,
      64 * MEBIBYTE
    );
    currentMaxIpJoinAttempts = boundedInteger(
      config.maxIpJoinAttempts,
      currentMaxIpJoinAttempts,
      1,
      20
    );
    currentMaxSessionJoinAttempts = boundedInteger(
      config.maxSessionJoinAttempts,
      currentMaxSessionJoinAttempts,
      1,
      10
    );
    return getConfig();
  }

  function getConfig() {
    return {
      ttlSeconds: Math.trunc(currentTtlMs / 1000),
      maxPayloadBytes: currentMaxPayloadBytes,
      maxIpJoinAttempts: currentMaxIpJoinAttempts,
      maxSessionJoinAttempts: currentMaxSessionJoinAttempts
    };
  }

  const ready = Promise.resolve().then(() => fileStore.initialize());
  const cleanupTimer = autoCleanup
    ? setInterval(() => cleanupExpired().catch(() => {}), normalizedCleanupIntervalMs)
    : null;
  cleanupTimer?.unref?.();

  return Object.freeze({
    ready,
    get maxPayloadBytes() { return currentMaxPayloadBytes; },
    getConfig,
    updateConfig,
    createSession,
    joinSession,
    getStatus,
    approveSession,
    rejectSession,
    uploadPayload,
    claimPayload,
    cancelSession,
    cleanupExpired,
    snapshotMetadata,
    close
  });
}

export function progressSyncNoStore(req, res, next) {
  res.setHeader("Cache-Control", PROGRESS_SYNC_NO_STORE);
  next();
}

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

function requestMaterial(body, field) {
  if (body?.[field]) return body[field];
  return { publicKey: body?.publicKey, nonce: body?.nonce };
}

function requestToken(body) {
  return body?.token || body?.creatorToken || body?.joinToken || "";
}

function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function createProgressSyncRouter({ service, ...serviceOptions } = {}) {
  const runtime = service || createProgressSyncService(serviceOptions);
  const router = express.Router();
  const jsonParser = express.json({ limit: "16kb", strict: true });
  const rawParser = (req, res, next) => express.raw({
    type: "application/octet-stream",
    limit: runtime.maxPayloadBytes
  })(req, res, next);
  const payloadLengthGuard = (req, res, next) => {
    const contentLength = Number(req.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > runtime.maxPayloadBytes) {
      return res.status(413).json({
        error: {
          code: PROGRESS_SYNC_ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: "Temporary sync request exceeds the configured limit"
        }
      });
    }
    return next();
  };

  router.use(progressSyncNoStore);

  router.post(
    "/sessions",
    jsonParser,
    asyncRoute(async (req, res) => {
      const result = await runtime.createSession({
        creatorRole: req.body?.creatorRole,
        sender: req.body?.sender,
        receiver: req.body?.receiver,
        material: req.body?.material || requestMaterial(req.body, "sender"),
        deviceLabel: req.body?.deviceLabel
      });
      res.status(201).json(result);
    })
  );

  router.post(
    "/sessions/join",
    jsonParser,
    asyncRoute(async (req, res) => {
      const result = await runtime.joinSession({
        code: req.body?.code,
        joinRole: req.body?.joinRole,
        sender: req.body?.sender,
        receiver: req.body?.receiver,
        material: req.body?.material || requestMaterial(req.body, "receiver"),
        deviceLabel: req.body?.deviceLabel,
        ip: requestIp(req)
      });
      res.json(result);
    })
  );

  router.post(
    "/sessions/:id/status",
    jsonParser,
    asyncRoute(async (req, res) => {
      res.json(await runtime.getStatus({
        sessionId: req.params.id,
        token: requestToken(req.body)
      }));
    })
  );

  router.post(
    "/sessions/:id/approve",
    jsonParser,
    asyncRoute(async (req, res) => {
      res.json(await runtime.approveSession({
        sessionId: req.params.id,
        token: requestToken(req.body),
        receiver: requestMaterial(req.body, "receiver")
      }));
    })
  );

  router.post(
    "/sessions/:id/reject",
    jsonParser,
    asyncRoute(async (req, res) => {
      res.json(await runtime.rejectSession({
        sessionId: req.params.id,
        token: requestToken(req.body)
      }));
    })
  );

  router.post(
    "/sessions/:id/payload",
    payloadLengthGuard,
    rawParser,
    asyncRoute(async (req, res) => {
      res.json(await runtime.uploadPayload({
        sessionId: req.params.id,
        token: req.headers["x-progress-sync-token"] || req.headers["x-progress-sync-creator-token"],
        ciphertext: req.body
      }));
    })
  );

  router.post(
    "/sessions/:id/claim",
    jsonParser,
    asyncRoute(async (req, res) => {
      const result = await runtime.claimPayload({
        sessionId: req.params.id,
        token: requestToken(req.body)
      });
      res.status(200);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(result.ciphertext.length));
      res.send(result.ciphertext);
    })
  );

  router.delete(
    "/sessions/:id",
    jsonParser,
    asyncRoute(async (req, res) => {
      res.json(await runtime.cancelSession({
        sessionId: req.params.id,
        token: requestToken(req.body)
      }));
    })
  );

  router.use((req, res) => {
    res.status(404).json({
      error: {
        code: PROGRESS_SYNC_ERROR_CODES.SESSION_NOT_FOUND,
        message: "Temporary sync route was not found"
      }
    });
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let normalized = error;
    if (!(error instanceof ProgressSyncError) && error?.type === "entity.too.large") {
      normalized = progressSyncError(
        413,
        PROGRESS_SYNC_ERROR_CODES.PAYLOAD_TOO_LARGE,
        "Temporary sync request exceeds the configured limit"
      );
    } else if (!(error instanceof ProgressSyncError) && error?.type === "entity.parse.failed") {
      normalized = progressSyncError(
        400,
        PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST,
        "Temporary sync request body is invalid"
      );
    } else if (!(error instanceof ProgressSyncError)) {
      normalized = progressSyncError(
        500,
        PROGRESS_SYNC_ERROR_CODES.INTERNAL,
        "Temporary sync service is unavailable"
      );
    }
    if (normalized.retryAfterSeconds) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(normalized.retryAfterSeconds))));
    }
    return res.status(normalized.status).json({
      error: {
        code: normalized.code,
        message: normalized.message
      }
    });
  });

  Object.defineProperty(router, "progressSyncService", { value: runtime });
  return router;
}
