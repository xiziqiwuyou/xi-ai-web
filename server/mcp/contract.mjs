import crypto from "node:crypto";

export const MCP_LIMITS = Object.freeze({
  maxProfiles: 64,
  maxIdChars: 120,
  maxLabelChars: 120,
  maxEndpointChars: 2_048,
  maxTools: 128,
  maxAllowedTools: 128,
  maxToolNameChars: 128,
  maxToolLabelChars: 160,
  maxDescriptionChars: 2_000,
  maxSchemaBytes: 32 * 1024,
  maxSchemaDepth: 8,
  maxSchemaKeys: 64,
  maxSchemaArrayItems: 64,
  maxSchemaStringChars: 2_048,
  maxRequestBytes: 32 * 1024,
  maxResponseBytes: 1 * 1024 * 1024,
  timeoutMs: 8_000,
  maxArgumentBytes: 16 * 1024,
  maxArgumentDepth: 8,
  maxArgumentKeys: 256,
  maxArgumentArrayItems: 64,
  maxArgumentStringChars: 4_096,
  maxProjectedResultBytes: 64 * 1024,
  maxResultContentItems: 32,
  maxResultTextChars: 16 * 1024,
  approvalTtlMs: 60_000,
  maxPendingApprovals: 256,
  maxSessionIdChars: 256,
  maxTurnIdChars: 160,
  maxProviderAliasChars: 128
});

export const MCP_ERROR_CODES = Object.freeze({
  PROFILE_INVALID: "MCP_PROFILE_INVALID",
  PROFILE_NOT_FOUND: "MCP_PROFILE_NOT_FOUND",
  PROFILE_DISABLED: "MCP_PROFILE_DISABLED",
  ENDPOINT_INVALID: "MCP_ENDPOINT_INVALID",
  ENDPOINT_UNSAFE: "MCP_ENDPOINT_UNSAFE",
  DNS_UNSAFE: "MCP_DNS_UNSAFE",
  NETWORK_ERROR: "MCP_NETWORK_ERROR",
  TIMEOUT: "MCP_TIMEOUT",
  CANCELLED: "MCP_DISCOVERY_CANCELLED",
  PROTOCOL_ERROR: "MCP_PROTOCOL_ERROR",
  TRANSPORT_UNSUPPORTED: "MCP_TRANSPORT_UNSUPPORTED",
  RESPONSE_TOO_LARGE: "MCP_RESPONSE_TOO_LARGE",
  UPSTREAM_STATUS: "MCP_UPSTREAM_STATUS",
  RATE_LIMITED: "MCP_RATE_LIMITED",
  DISCOVERY_IN_PROGRESS: "MCP_DISCOVERY_IN_PROGRESS",
  EXECUTION_NOT_AVAILABLE: "MCP_EXECUTION_NOT_AVAILABLE",
  EXECUTION_DISABLED: "MCP_EXECUTION_DISABLED",
  EXECUTION_MODE_UNSUPPORTED: "MCP_EXECUTION_MODE_UNSUPPORTED",
  TOOL_NOT_ALLOWED: "MCP_TOOL_NOT_ALLOWED",
  ARGUMENTS_INVALID: "MCP_ARGUMENTS_INVALID",
  RESULT_INVALID: "MCP_RESULT_INVALID",
  APPROVAL_INVALID: "MCP_APPROVAL_INVALID",
  APPROVAL_NOT_FOUND: "MCP_APPROVAL_NOT_FOUND",
  APPROVAL_EXPIRED: "MCP_APPROVAL_EXPIRED",
  APPROVAL_REPLAYED: "MCP_APPROVAL_REPLAYED",
  APPROVAL_SESSION_MISMATCH: "MCP_APPROVAL_SESSION_MISMATCH",
  APPROVAL_REJECTED: "MCP_APPROVAL_REJECTED",
  APPROVAL_CANCELLED: "MCP_APPROVAL_CANCELLED",
  APPROVAL_INVALIDATED: "MCP_APPROVAL_INVALIDATED",
  APPROVAL_CAPACITY: "MCP_APPROVAL_CAPACITY",
  APPROVAL_SESSION_INVALID: "MCP_APPROVAL_SESSION_INVALID",
  APPROVAL_CSRF_INVALID: "MCP_APPROVAL_CSRF_INVALID",
  CONNECTION_NOT_FOUND: "MCP_CONNECTION_NOT_FOUND",
  CONNECTION_CAPACITY: "MCP_CONNECTION_CAPACITY",
  USER_CONNECTIONS_DISABLED: "MCP_USER_CONNECTIONS_DISABLED"
});

export const MCP_PROTOCOL_VERSION = "2025-06-18";

const profileKeys = new Set([
  "id",
  "label",
  "endpoint",
  "enabled",
  "executionEnabled",
  "allowedToolNames",
  "createdAt",
  "updatedAt"
]);

const forbiddenJsonKeys = new Set(["__proto__", "constructor", "prototype"]);

export class McpError extends Error {
  constructor(code, message, { status = 400, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "McpError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status = 400, cause) {
  throw new McpError(code, message, { status, cause });
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlainRecord(value) {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function containsControlCharacters(value) {
  return /[\u0000-\u001f\u007f]/u.test(String(value));
}

function text(value, maximum, { required = false, code = MCP_ERROR_CODES.PROFILE_INVALID } = {}) {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    fail(code, "MCP profile text is invalid");
  }
  const normalized = value.trim();
  if (containsControlCharacters(normalized) || normalized.length > maximum || (required && !normalized)) {
    fail(code, "MCP profile text is invalid");
  }
  return normalized;
}

function timestamp(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function assertProfileKeys(value, allowTimestamps) {
  for (const key of Object.keys(value)) {
    if (!profileKeys.has(key) || (!allowTimestamps && (key === "createdAt" || key === "updatedAt"))) {
      fail(MCP_ERROR_CODES.PROFILE_INVALID, "MCP profile contains an unsupported field");
    }
  }
}

function normalizeToolName(value, code = MCP_ERROR_CODES.PROFILE_INVALID, status = 400) {
  if (typeof value !== "string") fail(code, "MCP tool name is invalid", status);
  const name = value.trim();
  if (
    !name ||
    name.length > MCP_LIMITS.maxToolNameChars ||
    !/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,127}$/u.test(name)
  ) {
    fail(code, "MCP tool name is invalid", status);
  }
  return name;
}

function normalizeAllowedToolNames(value, fallback = []) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source) || source.length > MCP_LIMITS.maxAllowedTools) {
    fail(MCP_ERROR_CODES.PROFILE_INVALID, "MCP allowed tool names are invalid");
  }
  return [...new Set(source.map((name) => normalizeToolName(name)))];
}

export function normalizeMcpServerProfile(value, {
  existing = null,
  now = () => new Date().toISOString(),
  idFactory = () => `mcp-${crypto.randomUUID()}`,
  touch = false,
  allowTimestamps = true
} = {}) {
  if (!isRecord(value)) fail(MCP_ERROR_CODES.PROFILE_INVALID, "MCP profile must be an object");
  assertProfileKeys(value, allowTimestamps);

  const id = text(value.id ?? existing?.id ?? idFactory(), MCP_LIMITS.maxIdChars);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(id)) {
    fail(MCP_ERROR_CODES.PROFILE_INVALID, "MCP profile ID is invalid");
  }
  const label = text(value.label ?? existing?.label, MCP_LIMITS.maxLabelChars, { required: true });
  const endpoint = text(value.endpoint ?? existing?.endpoint, MCP_LIMITS.maxEndpointChars, { required: true });
  if (typeof value.enabled !== "undefined" && typeof value.enabled !== "boolean") {
    fail(MCP_ERROR_CODES.PROFILE_INVALID, "MCP profile enabled state is invalid");
  }
  if (typeof value.executionEnabled !== "undefined" && typeof value.executionEnabled !== "boolean") {
    fail(MCP_ERROR_CODES.PROFILE_INVALID, "MCP profile execution state is invalid");
  }
  const allowedToolNames = normalizeAllowedToolNames(
    value.allowedToolNames,
    existing?.allowedToolNames || []
  );
  const createdAt = existing?.createdAt
    ? timestamp(existing.createdAt, now())
    : timestamp(value.createdAt, now());
  const updatedAt = touch ? now() : timestamp(value.updatedAt, createdAt);

  return {
    id,
    label,
    endpoint,
    enabled: typeof value.enabled === "boolean" ? value.enabled : existing?.enabled !== false,
    executionEnabled: typeof value.executionEnabled === "boolean"
      ? value.executionEnabled
      : existing?.executionEnabled === true,
    allowedToolNames,
    createdAt,
    updatedAt
  };
}

function duplicateKey(profile) {
  return {
    id: profile.id,
    label: profile.label.toLocaleLowerCase("en-US"),
    endpoint: profile.endpoint.toLocaleLowerCase("en-US")
  };
}

function assertUniqueProfiles(profiles) {
  const seen = { id: new Set(), label: new Set(), endpoint: new Set() };
  for (const profile of profiles) {
    const keys = duplicateKey(profile);
    for (const kind of Object.keys(seen)) {
      if (seen[kind].has(keys[kind])) {
        fail(MCP_ERROR_CODES.PROFILE_INVALID, "MCP profiles contain duplicate identities");
      }
      seen[kind].add(keys[kind]);
    }
  }
}

export function assertMcpServerCollection(value, options = {}) {
  if (!Array.isArray(value) || value.length > MCP_LIMITS.maxProfiles) {
    fail(MCP_ERROR_CODES.PROFILE_INVALID, "MCP profile collection is invalid");
  }
  const profiles = value.map((item) => normalizeMcpServerProfile(item, options));
  assertUniqueProfiles(profiles);
  return profiles;
}

export function normalizeMcpServers(value, options = {}) {
  if (!Array.isArray(value)) return [];
  const profiles = [];
  const seen = { id: new Set(), label: new Set(), endpoint: new Set() };
  for (const item of value.slice(0, MCP_LIMITS.maxProfiles)) {
    try {
      const profile = normalizeMcpServerProfile(item, options);
      const keys = duplicateKey(profile);
      if (Object.keys(seen).some((kind) => seen[kind].has(keys[kind]))) continue;
      Object.keys(seen).forEach((kind) => seen[kind].add(keys[kind]));
      profiles.push(profile);
    } catch {
      // A malformed legacy row must not prevent the rest of the metadata from loading.
    }
  }
  return profiles;
}

function cloneBoundedJson(value, depth, state) {
  if (depth > MCP_LIMITS.maxSchemaDepth) {
    fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is too deep", 502);
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (value.length > MCP_LIMITS.maxSchemaStringChars || containsControlCharacters(value)) {
      fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is too large", 502);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MCP_LIMITS.maxSchemaArrayItems) {
      fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is too large", 502);
    }
    return value.map((item) => cloneBoundedJson(item, depth + 1, state));
  }
  if (!isRecord(value)) fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is invalid", 502);
  const keys = Object.keys(value);
  if (keys.length > MCP_LIMITS.maxSchemaKeys) {
    fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is too large", 502);
  }
  const output = {};
  for (const key of keys) {
    if (forbiddenJsonKeys.has(key) || containsControlCharacters(key) || key.length > 120) {
      fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is invalid", 502);
    }
    state.keyCount += 1;
    if (state.keyCount > MCP_LIMITS.maxSchemaKeys * MCP_LIMITS.maxSchemaDepth) {
      fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is too large", 502);
    }
    output[key] = cloneBoundedJson(value[key], depth + 1, state);
  }
  return output;
}

export function normalizeMcpToolDescriptors(tools) {
  if (!Array.isArray(tools) || tools.length > MCP_LIMITS.maxTools) {
    fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tools response is invalid", 502);
  }
  const names = new Set();
  return tools.map((tool) => {
    if (!isRecord(tool)) fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool descriptor is invalid", 502);
    const name = normalizeToolName(tool.name, MCP_ERROR_CODES.PROTOCOL_ERROR, 502);
    if (names.has(name)) {
      fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tools response contains duplicate or invalid names", 502);
    }
    names.add(name);
    const label = text(tool.title ?? tool.label ?? name, MCP_LIMITS.maxToolLabelChars, {
      code: MCP_ERROR_CODES.PROTOCOL_ERROR
    }) || name;
    const description = text(tool.description, MCP_LIMITS.maxDescriptionChars, {
      code: MCP_ERROR_CODES.PROTOCOL_ERROR
    });
    let inputSchema;
    if (tool.inputSchema !== undefined) {
      if (!isRecord(tool.inputSchema)) {
        fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is invalid", 502);
      }
      const state = { keyCount: 0 };
      inputSchema = cloneBoundedJson(tool.inputSchema, 0, state);
      if (Buffer.byteLength(JSON.stringify(inputSchema), "utf8") > MCP_LIMITS.maxSchemaBytes) {
        fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP tool schema is too large", 502);
      }
    }
    return {
      name,
      label,
      description,
      ...(inputSchema ? { inputSchema } : {}),
      requiresApproval: true,
      untrusted: true
    };
  });
}

const forbiddenValueKeys = new Set(["__proto__", "constructor", "prototype"]);
const invalidValueControlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const droppedResultKeys = new Set(["url", "uri", "href", "link"]);
const redactedResultKeys = new Set([
  "apikey",
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken"
]);

function sanitizeUntrustedText(value) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, "[redacted]")
    .replace(/\bBearer\s+[^\s]+/giu, "Bearer [redacted]")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeBoundedValue(value, depth, state, limits, sanitizeStrings = false, redactSensitiveKeys = false) {
  if (depth > limits.maxDepth) fail(limits.code, limits.message, limits.status);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(limits.code, limits.message, limits.status);
    return value;
  }
  if (typeof value === "string") {
    if (value.length > limits.maxStringChars || invalidValueControlCharacters.test(value)) {
      fail(limits.code, limits.message, limits.status);
    }
    return sanitizeStrings ? sanitizeUntrustedText(value) : value;
  }
  if (Array.isArray(value)) {
    if (value.length > limits.maxArrayItems) fail(limits.code, limits.message, limits.status);
    return value.map((item) => normalizeBoundedValue(item, depth + 1, state, limits, sanitizeStrings, redactSensitiveKeys));
  }
  if (!isPlainRecord(value)) fail(limits.code, limits.message, limits.status);
  const keys = Object.keys(value);
  if (keys.length > limits.maxKeys) fail(limits.code, limits.message, limits.status);
  const output = {};
  for (const key of keys) {
    if (forbiddenValueKeys.has(key) || key.length > 120 || containsControlCharacters(key)) {
      fail(limits.code, limits.message, limits.status);
    }
    state.keyCount += 1;
    if (state.keyCount > limits.maxKeys) fail(limits.code, limits.message, limits.status);
    const normalizedKey = key.toLowerCase();
    if (redactSensitiveKeys && droppedResultKeys.has(normalizedKey)) continue;
    if (redactSensitiveKeys && redactedResultKeys.has(normalizedKey)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = normalizeBoundedValue(value[key], depth + 1, state, limits, sanitizeStrings, redactSensitiveKeys);
  }
  return output;
}

function argumentLimits() {
  return {
    code: MCP_ERROR_CODES.ARGUMENTS_INVALID,
    message: "MCP tool arguments are invalid",
    status: 400,
    maxDepth: MCP_LIMITS.maxArgumentDepth,
    maxKeys: MCP_LIMITS.maxArgumentKeys,
    maxArrayItems: MCP_LIMITS.maxArgumentArrayItems,
    maxStringChars: MCP_LIMITS.maxArgumentStringChars
  };
}

function resultLimits() {
  return {
    code: MCP_ERROR_CODES.RESULT_INVALID,
    message: "MCP tool result is invalid",
    status: 502,
    maxDepth: MCP_LIMITS.maxArgumentDepth,
    maxKeys: MCP_LIMITS.maxArgumentKeys,
    maxArrayItems: MCP_LIMITS.maxArgumentArrayItems,
    maxStringChars: MCP_LIMITS.maxResultTextChars
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function normalizeMcpToolArguments(value) {
  if (!isPlainRecord(value)) {
    fail(MCP_ERROR_CODES.ARGUMENTS_INVALID, "MCP tool arguments must be an object");
  }
  const normalized = normalizeBoundedValue(value, 0, { keyCount: 0 }, argumentLimits());
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MCP_LIMITS.maxArgumentBytes) {
    fail(MCP_ERROR_CODES.ARGUMENTS_INVALID, "MCP tool arguments are too large");
  }
  return normalized;
}

export function digestMcpToolArguments(value) {
  return crypto.createHash("sha256").update(canonicalJson(normalizeMcpToolArguments(value)), "utf8").digest("hex");
}

function assertExactKeys(value, allowed, code, message, status) {
  if (!isPlainRecord(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    fail(code, message, status);
  }
}

function projectResultContentItem(item) {
  assertExactKeys(
    item,
    item?.type === "text"
      ? new Set(["type", "text"])
      : item?.type === "resource"
        ? new Set(["type", "resource"])
        : item?.type === "resource_link"
          ? new Set(["type", "uri", "name", "title", "description", "mimeType"])
          : new Set(),
    MCP_ERROR_CODES.RESULT_INVALID,
    "MCP tool result content is invalid",
    502
  );
  if (item.type === "text") {
    if (typeof item.text !== "string") fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool result content is invalid", 502);
    return {
      type: "text",
      text: normalizeBoundedValue(item.text, 0, { keyCount: 0 }, resultLimits(), true)
    };
  }
  if (item.type === "resource") {
    assertExactKeys(
      item.resource,
      new Set(["uri", "mimeType", "text"]),
      MCP_ERROR_CODES.RESULT_INVALID,
      "MCP tool resource result is invalid",
      502
    );
    if (typeof item.resource.text !== "string") {
      fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP binary resource results are not supported", 502);
    }
    return {
      type: "resource",
      ...(typeof item.resource.mimeType === "string"
        ? { mimeType: normalizeBoundedValue(item.resource.mimeType, 0, { keyCount: 0 }, resultLimits(), true) }
        : {}),
      text: normalizeBoundedValue(item.resource.text, 0, { keyCount: 0 }, resultLimits(), true)
    };
  }
  if (item.type === "resource_link") {
    if (typeof item.uri !== "string") fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool resource link is invalid", 502);
    const projected = { type: "resource_link" };
    for (const key of ["name", "title", "description", "mimeType"]) {
      if (item[key] === undefined) continue;
      if (typeof item[key] !== "string") fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool resource link is invalid", 502);
      projected[key] = normalizeBoundedValue(item[key], 0, { keyCount: 0 }, resultLimits(), true);
    }
    return projected;
  }
  fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool result content type is not supported", 502);
}

export function projectMcpToolResult(value) {
  assertExactKeys(
    value,
    new Set(["content", "structuredContent", "isError"]),
    MCP_ERROR_CODES.RESULT_INVALID,
    "MCP tool result is invalid",
    502
  );
  if (value.isError !== undefined && typeof value.isError !== "boolean") {
    fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool result error state is invalid", 502);
  }
  if (value.content !== undefined && (!Array.isArray(value.content) || value.content.length > MCP_LIMITS.maxResultContentItems)) {
    fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool result content is invalid", 502);
  }
  const content = (value.content || []).map(projectResultContentItem);
  const seen = new Set();
  for (const item of content) {
    const key = canonicalJson(item);
    if (seen.has(key)) fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool result contains duplicate content", 502);
    seen.add(key);
  }
  const structuredContent = value.structuredContent === undefined
    ? undefined
    : normalizeBoundedValue(value.structuredContent, 0, { keyCount: 0 }, resultLimits(), true, true);
  if (!content.length && structuredContent === undefined) {
    fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool result is empty", 502);
  }
  const projected = {
    type: "mcp_tool_result",
    untrusted: true,
    isError: value.isError === true,
    content,
    ...(structuredContent === undefined ? {} : { structuredContent })
  };
  if (Buffer.byteLength(JSON.stringify(projected), "utf8") > MCP_LIMITS.maxProjectedResultBytes) {
    fail(MCP_ERROR_CODES.RESULT_INVALID, "MCP tool result projection is too large", 502);
  }
  return projected;
}

const approvalBindingKeys = new Set([
  "sessionId",
  "turnId",
  "profileId",
  "toolName",
  "providerAlias",
  "argumentsDigest"
]);

function approvalText(value, maximum, label) {
  if (typeof value !== "string") fail(MCP_ERROR_CODES.APPROVAL_INVALID, `MCP approval ${label} is invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || containsControlCharacters(normalized)) {
    fail(MCP_ERROR_CODES.APPROVAL_INVALID, `MCP approval ${label} is invalid`);
  }
  return normalized;
}

export function normalizeMcpApprovalBinding(value) {
  assertExactKeys(
    value,
    approvalBindingKeys,
    MCP_ERROR_CODES.APPROVAL_INVALID,
    "MCP approval binding is invalid",
    400
  );
  const sessionId = approvalText(value.sessionId, MCP_LIMITS.maxSessionIdChars, "session");
  const turnId = approvalText(value.turnId, MCP_LIMITS.maxTurnIdChars, "turn");
  const profileId = approvalText(value.profileId, MCP_LIMITS.maxIdChars, "profile");
  const toolName = normalizeToolName(value.toolName, MCP_ERROR_CODES.APPROVAL_INVALID);
  const providerAlias = approvalText(value.providerAlias, MCP_LIMITS.maxProviderAliasChars, "provider alias");
  const argumentsDigest = String(value.argumentsDigest || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(argumentsDigest)) {
    fail(MCP_ERROR_CODES.APPROVAL_INVALID, "MCP approval arguments digest is invalid");
  }
  return { sessionId, turnId, profileId, toolName, providerAlias, argumentsDigest };
}

export function parseMcpJsonRpcResult(payload, expectedId) {
  if (!isRecord(payload) || payload.jsonrpc !== "2.0" || payload.id !== expectedId) {
    fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP JSON-RPC response is invalid", 502);
  }
  if (isRecord(payload.error)) {
    fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP server returned a protocol error", 502);
  }
  if (!Object.hasOwn(payload, "result") || !isRecord(payload.result)) {
    fail(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP JSON-RPC result is invalid", 502);
  }
  return payload.result;
}

export function mcpExecutionUnavailableError() {
  return new McpError(
    MCP_ERROR_CODES.EXECUTION_NOT_AVAILABLE,
    "Remote MCP tool execution is not available in this release",
    { status: 501 }
  );
}
