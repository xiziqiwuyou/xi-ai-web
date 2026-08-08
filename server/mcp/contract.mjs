import crypto from "node:crypto";

export const MCP_LIMITS = Object.freeze({
  maxProfiles: 64,
  maxIdChars: 120,
  maxLabelChars: 120,
  maxEndpointChars: 2_048,
  maxTools: 128,
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
  timeoutMs: 8_000
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
  EXECUTION_NOT_AVAILABLE: "MCP_EXECUTION_NOT_AVAILABLE"
});

export const MCP_PROTOCOL_VERSION = "2025-06-18";

const profileKeys = new Set([
  "id",
  "label",
  "endpoint",
  "enabled",
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
  const createdAt = existing?.createdAt
    ? timestamp(existing.createdAt, now())
    : timestamp(value.createdAt, now());
  const updatedAt = touch ? now() : timestamp(value.updatedAt, createdAt);

  return {
    id,
    label,
    endpoint,
    enabled: typeof value.enabled === "boolean" ? value.enabled : existing?.enabled !== false,
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
    const name = text(tool.name, MCP_LIMITS.maxToolNameChars, {
      required: true,
      code: MCP_ERROR_CODES.PROTOCOL_ERROR
    });
    if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,127}$/u.test(name) || names.has(name)) {
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
