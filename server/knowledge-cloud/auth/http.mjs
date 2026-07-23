import net from "node:net";
import {
  KNOWLEDGE_ERROR_CODES,
  knowledgeError
} from "../errors.mjs";

export function parseKnowledgeCookies(header = "") {
  const cookies = {};
  for (const part of String(header).split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    try {
      const name = decodeURIComponent(trimmed.slice(0, separator));
      const value = decodeURIComponent(trimmed.slice(separator + 1));
      cookies[name] = value;
    } catch {
      // Ignore malformed cookie fragments and continue parsing bounded values.
    }
  }
  return cookies;
}

function ipv4Prefix(address) {
  const parts = address.split(".");
  return parts.length === 4 ? `${parts.slice(0, 3).join(".")}.0/24` : address;
}

function ipv6Prefix(address) {
  const normalized = address.toLowerCase();
  const pieces = normalized.split(":");
  return `${pieces.slice(0, 4).join(":")}::/64`;
}

export function knowledgeClientContext(req) {
  const remoteAddress = String(req.ip || req.socket?.remoteAddress || "unknown");
  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(remoteAddress)?.[1];
  const address = mappedIpv4 || remoteAddress;
  const ipPrefix = net.isIP(address) === 4
    ? ipv4Prefix(address)
    : net.isIP(address) === 6
      ? ipv6Prefix(address)
      : "unknown";
  return {
    ipPrefix,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 512)
  };
}

export function requireKnowledgeOrigin(expectedOrigin) {
  return (req, _res, next) => {
    const origin = String(req.headers.origin || "");
    let normalized = "";
    try {
      normalized = new URL(origin).origin;
    } catch {
      normalized = "";
    }
    if (!normalized || normalized !== expectedOrigin) {
      return next(
        knowledgeError(KNOWLEDGE_ERROR_CODES.ORIGIN_INVALID, "请求来源校验失败", {
          status: 403
        })
      );
    }
    return next();
  };
}

export function setKnowledgeSessionCookie(res, auth, publicOrigin, token) {
  const secure = String(publicOrigin).startsWith("https://");
  res.setHeader(
    "Set-Cookie",
    `${auth.cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${auth.sessionTtlSeconds}; Priority=High${secure ? "; Secure" : ""}`
  );
}

export function clearKnowledgeSessionCookie(res, auth, publicOrigin) {
  const secure = String(publicOrigin).startsWith("https://");
  res.setHeader(
    "Set-Cookie",
    `${auth.cookieName}=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0; Priority=High${secure ? "; Secure" : ""}`
  );
}

export function knowledgeSessionToken(req, cookieName) {
  return parseKnowledgeCookies(req.headers.cookie || "")[cookieName] || "";
}
