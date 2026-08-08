import dns from "node:dns/promises";
import net from "node:net";
import { MCP_ERROR_CODES, McpError } from "./contract.mjs";
import { isBlockedAddress } from "../upstream-security.mjs";

const allowedProductionPorts = new Set([443, 8443]);

function envEnabled(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function endpointError(code, message, status = 400, cause) {
  throw new McpError(code, message, { status, cause });
}

export function normalizeMcpEndpoint(value, {
  production = process.env.NODE_ENV === "production",
  allowLocal = envEnabled(process.env.MCP_ALLOW_LOCAL_ENDPOINTS),
  allowInsecureHttp = envEnabled(process.env.MCP_ALLOW_INSECURE_HTTP)
} = {}) {
  const localAllowed = Boolean(allowLocal && !production);
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > 2_048) {
    endpointError(MCP_ERROR_CODES.ENDPOINT_INVALID, "MCP endpoint is invalid");
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    endpointError(MCP_ERROR_CODES.ENDPOINT_INVALID, "MCP endpoint is invalid", 400, error);
  }

  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    endpointError(MCP_ERROR_CODES.ENDPOINT_INVALID, "MCP endpoint cannot contain credentials or URL state");
  }
  if (parsed.protocol !== "https:") {
    if (!(localAllowed && parsed.protocol === "http:" && allowInsecureHttp)) {
      endpointError(MCP_ERROR_CODES.ENDPOINT_INVALID, "MCP endpoint must use HTTPS");
    }
  }

  const effectivePort = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  if (!Number.isSafeInteger(effectivePort) || effectivePort < 1 || effectivePort > 65_535) {
    endpointError(MCP_ERROR_CODES.ENDPOINT_INVALID, "MCP endpoint port is invalid");
  }
  if (production && !allowedProductionPorts.has(effectivePort)) {
    endpointError(MCP_ERROR_CODES.ENDPOINT_INVALID, "MCP endpoint port is not allowed in production");
  }
  if (!localAllowed && isBlockedAddress(parsed.hostname)) {
    endpointError(MCP_ERROR_CODES.ENDPOINT_UNSAFE, "MCP endpoint targets a restricted network");
  }

  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return {
    url: parsed.toString().replace(/\/$/u, ""),
    hostname: parsed.hostname,
    port: effectivePort,
    protocol: parsed.protocol,
    localAllowed,
    production
  };
}

function normalizeLookupRecords(records) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  return list
    .map((record) => ({
      address: String(record?.address || "").trim(),
      family: Number(record?.family) === 6 ? 6 : 4
    }))
    .filter((record) => net.isIP(record.address));
}

export async function assertSafeMcpEndpoint(value, {
  production = process.env.NODE_ENV === "production",
  allowLocal = envEnabled(process.env.MCP_ALLOW_LOCAL_ENDPOINTS),
  allowInsecureHttp = envEnabled(process.env.MCP_ALLOW_INSECURE_HTTP),
  lookup = dns.lookup
} = {}) {
  const target = normalizeMcpEndpoint(value, { production, allowLocal, allowInsecureHttp });
  const records = net.isIP(target.hostname)
    ? [{ address: target.hostname, family: net.isIP(target.hostname) }]
    : await Promise.resolve(lookup(target.hostname, { all: true, verbatim: true })).catch((error) => {
        endpointError(MCP_ERROR_CODES.DNS_UNSAFE, "MCP endpoint DNS validation failed", 400, error);
      });
  const normalizedRecords = normalizeLookupRecords(records);
  if (!normalizedRecords.length || (!target.localAllowed && normalizedRecords.some((record) => isBlockedAddress(record.address)))) {
    endpointError(MCP_ERROR_CODES.DNS_UNSAFE, "MCP endpoint resolves to a restricted network");
  }

  // Keep the first validated address and force the transport to reuse it for
  // every request in a discovery handshake. This closes the check-then-fetch
  // DNS rebinding gap present in a plain hostname fetch.
  return {
    ...target,
    address: normalizedRecords[0].address,
    family: normalizedRecords[0].family,
    resolvedAddresses: normalizedRecords.map((record) => record.address)
  };
}

export function pinnedLookup(target) {
  return (_hostname, options, callback) => {
    const family = target.family || net.isIP(target.address);
    if (options?.all) return callback(null, [{ address: target.address, family }]);
    return callback(null, target.address, family);
  };
}

export function isMcpAllowedProductionPort(port) {
  return allowedProductionPorts.has(Number(port));
}
