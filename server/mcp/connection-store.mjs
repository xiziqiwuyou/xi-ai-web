import crypto from "node:crypto";
import { MCP_ERROR_CODES, MCP_LIMITS, McpError } from "./contract.mjs";

export const MCP_USER_CONNECTION_TTL_MS = 15 * 60 * 1000;

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function fail(code, message, status = 400) {
  throw new McpError(code, message, { status });
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function safeEqualDigest(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function publicTool(record, tool) {
  return {
    id: tool.id,
    profileId: record.profileId,
    profileLabel: "User MCP service",
    name: tool.descriptor.name,
    label: tool.descriptor.label || tool.descriptor.name,
    requiresApproval: true,
    untrusted: true,
    source: "user"
  };
}

function publicConnection(record) {
  return {
    id: record.id,
    profileId: record.profileId,
    tools: [...record.tools.values()].map((tool) => publicTool(record, tool)),
    expiresAt: new Date(record.expiresAt).toISOString()
  };
}

export function createMcpConnectionStore({
  ttlMs = MCP_USER_CONNECTION_TTL_MS,
  capacity = 256,
  maxPerSession = 8,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  onRemove = () => {}
} = {}) {
  const lifetime = positiveInteger(ttlMs, MCP_USER_CONNECTION_TTL_MS, 60 * 60 * 1000);
  const maximumConnections = positiveInteger(capacity, 256, 2_048);
  const maximumPerSession = positiveInteger(maxPerSession, 8, 32);
  const records = new Map();
  const toolIndex = new Map();

  const removeRecord = (record, reason) => {
    if (!record || !records.delete(record.id)) return false;
    for (const tool of record.tools.values()) toolIndex.delete(tool.id);
    try {
      onRemove({ profileId: record.profileId, reason });
    } catch {}
    return true;
  };

  const cleanup = () => {
    const timestamp = now();
    for (const record of records.values()) {
      if (record.expiresAt <= timestamp) removeRecord(record, "expired");
    }
  };

  const recordForSession = (sessionId, connectionId) => {
    cleanup();
    const record = records.get(String(connectionId || "").trim());
    if (!record || !safeEqualDigest(record.sessionDigest, digest(String(sessionId || "").trim()))) {
      fail(MCP_ERROR_CODES.CONNECTION_NOT_FOUND, "MCP connection was not found", 404);
    }
    return record;
  };

  const makeId = (prefix, bytes = 24) => `${prefix}${randomBytes(bytes).toString("base64url")}`;

  const create = ({ sessionId, endpoint, tools } = {}) => {
    cleanup();
    const normalizedSessionId = String(sessionId || "").trim();
    const normalizedEndpoint = String(endpoint || "").trim();
    if (!normalizedSessionId || normalizedSessionId.length > MCP_LIMITS.maxSessionIdChars) {
      fail(MCP_ERROR_CODES.APPROVAL_SESSION_INVALID, "MCP connection session is invalid", 403);
    }
    if (!normalizedEndpoint || normalizedEndpoint.length > MCP_LIMITS.maxEndpointChars) {
      fail(MCP_ERROR_CODES.ENDPOINT_INVALID, "MCP connection endpoint is invalid");
    }
    if (!Array.isArray(tools) || !tools.length || tools.length > MCP_LIMITS.maxTools) {
      fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP connection has no usable tools", 502);
    }
    const sessionDigest = digest(normalizedSessionId);
    const sessionCount = [...records.values()].filter((record) => safeEqualDigest(record.sessionDigest, sessionDigest)).length;
    if (records.size >= maximumConnections || sessionCount >= maximumPerSession) {
      fail(MCP_ERROR_CODES.CONNECTION_CAPACITY, "MCP connection capacity is exhausted", 429);
    }
    let id = makeId("umcp_conn_");
    while (records.has(id)) id = makeId("umcp_conn_");
    const profileId = makeId("umcp_profile_");
    const createdAt = now();
    const record = {
      id,
      profileId,
      sessionDigest,
      endpoint: normalizedEndpoint,
      createdAt,
      expiresAt: createdAt + lifetime,
      tools: new Map()
    };
    for (const descriptor of tools) {
      let toolId = makeId("umcp_tool_", 18);
      while (toolIndex.has(toolId)) toolId = makeId("umcp_tool_", 18);
      const tool = { id: toolId, descriptor };
      record.tools.set(descriptor.name, tool);
      toolIndex.set(toolId, { connectionId: id, toolName: descriptor.name });
    }
    records.set(id, record);
    return publicConnection(record);
  };

  const list = (sessionId) => {
    cleanup();
    const sessionDigest = digest(String(sessionId || "").trim());
    return [...records.values()]
      .filter((record) => safeEqualDigest(record.sessionDigest, sessionDigest))
      .map(publicConnection);
  };

  const disconnect = ({ sessionId, connectionId } = {}) => {
    const record = recordForSession(sessionId, connectionId);
    removeRecord(record, "disconnected");
    return publicConnection(record);
  };

  const resolveTools = ({ sessionId, requestedIds } = {}) => {
    cleanup();
    if (!Array.isArray(requestedIds) || requestedIds.length > 16) {
      fail(MCP_ERROR_CODES.TOOL_NOT_ALLOWED, "Remote MCP tool selectors are invalid");
    }
    const ids = [...new Set(requestedIds)];
    return ids.map((id) => {
      const indexed = toolIndex.get(String(id || "").trim());
      if (!indexed) fail(MCP_ERROR_CODES.TOOL_NOT_ALLOWED, "Remote MCP tool is not allowed");
      const record = recordForSession(sessionId, indexed.connectionId);
      const tool = record.tools.get(indexed.toolName);
      if (!tool || tool.id !== id) fail(MCP_ERROR_CODES.TOOL_NOT_ALLOWED, "Remote MCP tool is not allowed");
      return {
        ...publicTool(record, tool),
        alias: tool.id,
        connectionId: record.id,
        source: "user",
        descriptor: tool.descriptor
      };
    });
  };

  const resolveLiveTool = ({ sessionId, connectionId, toolName, toolId } = {}) => {
    const record = recordForSession(sessionId, connectionId);
    const tool = record.tools.get(String(toolName || "").trim());
    if (!tool || tool.id !== toolId) fail(MCP_ERROR_CODES.TOOL_NOT_ALLOWED, "Remote MCP tool is not allowed");
    return {
      endpoint: record.endpoint,
      profileId: record.profileId,
      descriptor: tool.descriptor
    };
  };

  const clear = (reason = "policy-disabled") => {
    for (const record of [...records.values()]) removeRecord(record, reason);
  };

  return {
    create,
    list,
    disconnect,
    resolveTools,
    resolveLiveTool,
    cleanup,
    clear,
    get size() {
      cleanup();
      return records.size;
    }
  };
}
