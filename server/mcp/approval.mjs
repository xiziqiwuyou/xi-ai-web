import crypto from "node:crypto";
import {
  MCP_ERROR_CODES,
  MCP_LIMITS,
  McpError,
  normalizeMcpApprovalBinding
} from "./contract.mjs";

const terminalMessages = Object.freeze({
  approved: [MCP_ERROR_CODES.APPROVAL_REPLAYED, "MCP approval has already been used"],
  rejected: [MCP_ERROR_CODES.APPROVAL_REJECTED, "MCP approval was rejected"],
  cancelled: [MCP_ERROR_CODES.APPROVAL_CANCELLED, "MCP approval was cancelled"],
  expired: [MCP_ERROR_CODES.APPROVAL_EXPIRED, "MCP approval expired"],
  invalidated: [MCP_ERROR_CODES.APPROVAL_INVALIDATED, "MCP approval is no longer valid"]
});

function approvalError(code, message, status = 409) {
  return new McpError(code, message, { status });
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function identityDigest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function sameDigest(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function publicApproval(record) {
  return {
    id: record.id,
    turnId: record.turnId,
    profileId: record.profileId,
    toolName: record.toolName,
    providerAlias: record.providerAlias,
    status: record.status,
    createdAt: new Date(record.createdAtMs).toISOString(),
    expiresAt: new Date(record.expiresAtMs).toISOString()
  };
}

function terminalError(record) {
  const [code, message] = terminalMessages[record.status] || [
    MCP_ERROR_CODES.APPROVAL_INVALID,
    "MCP approval state is invalid"
  ];
  return approvalError(code, message);
}

export function createMcpApprovalStore({
  now = () => Date.now(),
  ttlMs = MCP_LIMITS.approvalTtlMs,
  capacity = MCP_LIMITS.maxPendingApprovals,
  idFactory = () => `mcp-approval-${crypto.randomBytes(24).toString("base64url")}`
} = {}) {
  const normalizedTtlMs = positiveInteger(ttlMs, MCP_LIMITS.approvalTtlMs, MCP_LIMITS.approvalTtlMs);
  const normalizedCapacity = positiveInteger(
    capacity,
    MCP_LIMITS.maxPendingApprovals,
    MCP_LIMITS.maxPendingApprovals
  );
  const records = new Map();

  const settle = (record, status, error) => {
    if (record.status !== "pending") return false;
    record.status = status;
    record.settledAtMs = now();
    clearTimeout(record.expiryTimer);
    if (error) record.reject(error);
    else record.resolve(publicApproval(record));
    return true;
  };

  const expireRecord = (record) => {
    if (record.status !== "pending" || now() < record.expiresAtMs) return false;
    return settle(record, "expired", approvalError(
      MCP_ERROR_CODES.APPROVAL_EXPIRED,
      "MCP approval expired"
    ));
  };

  const cleanup = () => {
    const timestamp = now();
    for (const record of records.values()) expireRecord(record);
    for (const [id, record] of records) {
      if (record.status !== "pending" && timestamp >= record.expiresAtMs + normalizedTtlMs) {
        records.delete(id);
      }
    }
  };

  const makeRoom = () => {
    cleanup();
    if (records.size < normalizedCapacity) return;
    const terminal = [...records.values()]
      .filter((record) => record.status !== "pending")
      .sort((left, right) => (left.settledAtMs || left.createdAtMs) - (right.settledAtMs || right.createdAtMs));
    for (const record of terminal) {
      records.delete(record.id);
      if (records.size < normalizedCapacity) return;
    }
    throw approvalError(
      MCP_ERROR_CODES.APPROVAL_CAPACITY,
      "MCP approval capacity is exhausted",
      429
    );
  };

  const requireRecord = (approvalId) => {
    if (typeof approvalId !== "string" || !approvalId.trim()) {
      throw approvalError(MCP_ERROR_CODES.APPROVAL_NOT_FOUND, "MCP approval was not found", 404);
    }
    const record = records.get(approvalId.trim());
    if (!record) throw approvalError(MCP_ERROR_CODES.APPROVAL_NOT_FOUND, "MCP approval was not found", 404);
    expireRecord(record);
    if (record.status !== "pending") throw terminalError(record);
    return record;
  };

  const assertSession = (record, sessionId) => {
    if (
      typeof sessionId !== "string" ||
      !sessionId.trim() ||
      !sameDigest(record.sessionDigest, identityDigest(sessionId.trim()))
    ) {
      throw approvalError(
        MCP_ERROR_CODES.APPROVAL_SESSION_MISMATCH,
        "MCP approval session does not match",
        403
      );
    }
  };

  const create = (value) => {
    const binding = normalizeMcpApprovalBinding(value);
    makeRoom();
    const id = String(idFactory() || "").trim();
    if (!/^mcp-approval-[A-Za-z0-9_-]{16,160}$/u.test(id) || records.has(id)) {
      throw approvalError(MCP_ERROR_CODES.APPROVAL_INVALID, "MCP approval identifier is invalid", 500);
    }
    const createdAtMs = now();
    let resolve;
    let reject;
    const wait = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    void wait.catch(() => undefined);
    const record = {
      id,
      sessionDigest: identityDigest(binding.sessionId),
      turnId: binding.turnId,
      profileId: binding.profileId,
      toolName: binding.toolName,
      providerAlias: binding.providerAlias,
      argumentsDigest: binding.argumentsDigest,
      status: "pending",
      createdAtMs,
      expiresAtMs: createdAtMs + normalizedTtlMs,
      settledAtMs: null,
      expiryTimer: null,
      resolve,
      reject
    };
    record.expiryTimer = setTimeout(() => expireRecord(record), normalizedTtlMs);
    record.expiryTimer.unref?.();
    records.set(id, record);
    return { approval: publicApproval(record), wait };
  };

  const approve = ({ approvalId, sessionId } = {}) => {
    const record = requireRecord(approvalId);
    assertSession(record, sessionId);
    settle(record, "approved");
    return publicApproval(record);
  };

  const reject = ({ approvalId, sessionId } = {}) => {
    const record = requireRecord(approvalId);
    assertSession(record, sessionId);
    settle(record, "rejected", approvalError(
      MCP_ERROR_CODES.APPROVAL_REJECTED,
      "MCP approval was rejected"
    ));
    return publicApproval(record);
  };

  const cancel = ({ approvalId, sessionId } = {}) => {
    const record = requireRecord(approvalId);
    assertSession(record, sessionId);
    settle(record, "cancelled", approvalError(
      MCP_ERROR_CODES.APPROVAL_CANCELLED,
      "MCP approval was cancelled"
    ));
    return publicApproval(record);
  };

  const invalidate = ({ profileId, toolName } = {}) => {
    const normalizedProfileId = String(profileId || "").trim();
    const normalizedToolName = toolName === undefined ? "" : String(toolName || "").trim();
    if (!normalizedProfileId) {
      throw approvalError(MCP_ERROR_CODES.APPROVAL_INVALID, "MCP approval invalidation is invalid", 400);
    }
    let count = 0;
    for (const record of records.values()) {
      if (
        record.status === "pending" &&
        record.profileId === normalizedProfileId &&
        (!normalizedToolName || record.toolName === normalizedToolName)
      ) {
        if (settle(record, "invalidated", approvalError(
          MCP_ERROR_CODES.APPROVAL_INVALIDATED,
          "MCP approval is no longer valid"
        ))) count += 1;
      }
    }
    return count;
  };

  const close = () => {
    for (const record of records.values()) {
      settle(record, "cancelled", approvalError(
        MCP_ERROR_CODES.APPROVAL_CANCELLED,
        "MCP approval was cancelled"
      ));
      clearTimeout(record.expiryTimer);
    }
    records.clear();
  };

  return {
    create,
    approve,
    reject,
    cancel,
    invalidate,
    cleanup,
    close,
    get size() {
      cleanup();
      return records.size;
    },
    get pendingCount() {
      cleanup();
      return [...records.values()].filter((record) => record.status === "pending").length;
    }
  };
}
