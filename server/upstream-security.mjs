import dns from "node:dns/promises";
import net from "node:net";

export const DEFAULT_UPSTREAM_BASE_URL = "https://api.xi-ai.cn";

function enabled(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.internal.",
  "instance-data.ec2.internal"
]);

function ipv4ToNumber(value) {
  const parts = String(value).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function isBlockedIpv4(value) {
  const number = ipv4ToNumber(value);
  if (number === null) return false;
  const ranges = [
    [0x00000000, 0x00ffffff],
    [0x0a000000, 0x0affffff],
    [0x64400000, 0x647fffff],
    [0x7f000000, 0x7fffffff],
    [0xa9fe0000, 0xa9feffff],
    [0xac100000, 0xac1fffff],
    [0xc0a80000, 0xc0a8ffff],
    [0xc6120000, 0xc613ffff],
    [0xe0000000, 0xffffffff]
  ];
  return ranges.some(([start, end]) => number >= start && number <= end);
}

function ipv6Bytes(value) {
  let source = String(value).toLowerCase().replace(/^\[|\]$/g, "");
  if (source.includes(".")) {
    const split = source.lastIndexOf(":");
    const ipv4 = ipv4ToNumber(source.slice(split + 1));
    if (split < 0 || ipv4 === null) return null;
    source = `${source.slice(0, split)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const pieces = source.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  if (left.concat(right).some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if (pieces.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const words = [...left, ...Array.from({ length: missing }, () => "0"), ...right].map((part) => Number.parseInt(part, 16));
  const bytes = [];
  words.forEach((word) => bytes.push((word >> 8) & 0xff, word & 0xff));
  return bytes.length === 16 ? bytes : null;
}

function isBlockedIpv6(value) {
  const bytes = ipv6Bytes(value);
  if (!bytes) return false;
  const first = bytes[0];
  const isAll = (expected) => bytes.every((byte) => byte === expected);
  const isMappedV4 = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const mapped = isMappedV4 ? bytes.slice(12).join(".") : "";
  return (
    isAll(0) ||
    (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) ||
    (first & 0xfe) === 0xfc ||
    (first & 0xfe) === 0xfe && (bytes[1] & 0xc0) === 0x80 ||
    first >= 0xff ||
    (mapped && isBlockedIpv4(mapped))
  );
}

export function isBlockedAddress(value) {
  const address = String(value || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!address) return true;
  if (net.isIP(address) === 4) return isBlockedIpv4(address);
  if (net.isIP(address) === 6) return isBlockedIpv6(address);
  return blockedHostnames.has(address) || address.endsWith(".localhost") || address.endsWith(".local");
}

export function normalizeUpstreamBaseUrl(value, {
  fallback = DEFAULT_UPSTREAM_BASE_URL,
  production = process.env.NODE_ENV === "production",
  allowLocal = String(process.env.ALLOW_LOCAL_UPSTREAM || "").toLowerCase() === "true"
} = {}) {
  const candidate = String(value || "").trim().replace(/\/+$/u, "");
  if (!candidate) return fallback;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return fallback;
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    return fallback;
  }
  if (
    production &&
    parsed.protocol !== "https:" &&
    !(allowLocal && isBlockedAddress(parsed.hostname))
  ) return fallback;
  if (!allowLocal && isBlockedAddress(parsed.hostname)) return fallback;
  return parsed.toString().replace(/\/+$/u, "");
}

export function managedUpstreamPolicy({
  env = process.env,
  production = env.NODE_ENV === "production"
} = {}) {
  const explicitValue = String(env.UPSTREAM_BASE_URL || "").trim();
  const allowLocal = enabled(env.ALLOW_LOCAL_UPSTREAM);
  const allowAdminOverride = enabled(env.ALLOW_ADMIN_UPSTREAM_OVERRIDE);
  const configuredBaseUrl = explicitValue
    ? normalizeUpstreamBaseUrl(explicitValue, { fallback: "", production, allowLocal })
    : "";
  return {
    explicit: Boolean(explicitValue),
    configuredBaseUrl,
    allowAdminOverride,
    locked: Boolean(production && explicitValue && !allowAdminOverride)
  };
}

export async function assertSafeUpstreamBaseUrl(value, options = {}) {
  const allowLocal = options.allowLocal ?? String(process.env.ALLOW_LOCAL_UPSTREAM || "").toLowerCase() === "true";
  const lookup = typeof options.lookup === "function" ? options.lookup : dns.lookup;
  const normalized = normalizeUpstreamBaseUrl(value, { ...options, allowLocal, fallback: "" });
  if (!normalized) throw new Error("上游 API 域名无效或不被允许");
  const parsed = new URL(normalized);
  if (isBlockedAddress(parsed.hostname) && !allowLocal) {
    throw new Error("上游 API 域名指向受限制的网络地址");
  }
  if (net.isIP(parsed.hostname)) return normalized;
  const records = await lookup(parsed.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isBlockedAddress(record.address))) {
    throw new Error("上游 API 域名解析到了受限制的网络地址");
  }
  return normalized;
}

export async function assertManagedUpstreamBaseUrl(value, {
  env = process.env,
  production = env.NODE_ENV === "production",
  rejectOverride = false,
  allowLocal = enabled(env.ALLOW_LOCAL_UPSTREAM),
  lookup
} = {}) {
  const policy = managedUpstreamPolicy({ env, production });
  if (!policy.locked) {
    return assertSafeUpstreamBaseUrl(value, { production, allowLocal, lookup });
  }
  if (!policy.configuredBaseUrl) {
    throw new Error("Configured production upstream is invalid");
  }
  const requested = normalizeUpstreamBaseUrl(value, {
    fallback: "",
    production,
    allowLocal
  });
  if (rejectOverride && requested !== policy.configuredBaseUrl) {
    throw new Error("Production upstream is locked by UPSTREAM_BASE_URL");
  }
  return assertSafeUpstreamBaseUrl(policy.configuredBaseUrl, {
    production,
    allowLocal,
    lookup
  });
}

export async function assertSafePublicHttpsUrl(value, options = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("Public asset URL is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Public asset URL must use HTTPS without embedded credentials");
  }
  if (isBlockedAddress(parsed.hostname)) {
    throw new Error("Public asset URL points to a restricted network address");
  }
  if (!net.isIP(parsed.hostname)) {
    const lookup = typeof options.lookup === "function" ? options.lookup : dns.lookup;
    const records = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isBlockedAddress(record.address))) {
      throw new Error("Public asset URL resolves to a restricted network address");
    }
  }
  return parsed.toString();
}
