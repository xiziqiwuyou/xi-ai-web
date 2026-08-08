import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import net from "node:net";
import {
  MCP_ERROR_CODES,
  MCP_LIMITS,
  MCP_PROTOCOL_VERSION,
  McpError,
  normalizeMcpToolDescriptors,
  mcpExecutionUnavailableError,
  parseMcpJsonRpcResult
} from "./contract.mjs";
import { assertSafeMcpEndpoint, pinnedLookup } from "./security.mjs";

function responseHeader(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === wanted);
  const value = key ? headers[key] : "";
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function abortedError() {
  return new McpError(MCP_ERROR_CODES.CANCELLED, "MCP discovery was cancelled", { status: 499 });
}

function protocolError(message = "MCP response is invalid") {
  return new McpError(MCP_ERROR_CODES.PROTOCOL_ERROR, message, { status: 502 });
}

function statusError(status) {
  if (status === 401 || status === 403) {
    return new McpError(MCP_ERROR_CODES.UPSTREAM_STATUS, "MCP server rejected discovery", { status: 502 });
  }
  if (status === 404 || status === 405 || status === 415) {
    return new McpError(MCP_ERROR_CODES.UPSTREAM_STATUS, "MCP discovery endpoint is not supported", { status: 502 });
  }
  if (status === 429) {
    return new McpError(MCP_ERROR_CODES.RATE_LIMITED, "MCP server rate limited discovery", { status: 502 });
  }
  return new McpError(MCP_ERROR_CODES.UPSTREAM_STATUS, "MCP server returned an unsuccessful response", { status: 502 });
}

function jsonFromBody(body) {
  if (body && typeof body === "object" && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
    return body;
  }
  const raw = Buffer.isBuffer(body) || body instanceof Uint8Array
    ? Buffer.from(body).toString("utf8")
    : String(body || "");
  if (!raw.trim()) throw protocolError("MCP JSON-RPC response is empty");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new McpError(MCP_ERROR_CODES.PROTOCOL_ERROR, "MCP JSON-RPC response is malformed", {
      status: 502,
      cause: error
    });
  }
}

function validateContentType(contentType) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("text/event-stream") || normalized.includes("multipart/mixed")) {
    throw new McpError(
      MCP_ERROR_CODES.TRANSPORT_UNSUPPORTED,
      "This MCP transport is not supported for discovery",
      { status: 501 }
    );
  }
  if (normalized && !normalized.includes("application/json") && !normalized.includes("+json")) {
    throw protocolError("MCP discovery returned an unsupported response format");
  }
}

function validateResponseEnvelope(response, { allowEmpty = false } = {}) {
  if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw statusError(Number(response?.status) || 502);
  }
  validateContentType(responseHeader(response.headers, "content-type"));
  if (!allowEmpty && (response.body === undefined || response.body === null || String(response.body).trim() === "")) {
    throw protocolError("MCP JSON-RPC response is empty");
  }
}

export function requestMcpJson(target, body, {
  signal,
  sessionId = "",
  timeoutMs = MCP_LIMITS.timeoutMs
} = {}) {
  if (signal?.aborted) return Promise.reject(abortedError());
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > MCP_LIMITS.maxRequestBytes) {
    return Promise.reject(new McpError(
      MCP_ERROR_CODES.PROTOCOL_ERROR,
      "MCP discovery request is too large",
      { status: 400 }
    ));
  }

  const parsed = new URL(target.url);
  const transport = parsed.protocol === "https:" ? https : http;
  const hostHeader = parsed.host;
  const requestOptions = {
    protocol: parsed.protocol,
    hostname: target.address,
    port: target.port,
    path: parsed.pathname || "/",
    method: "POST",
    headers: {
      Host: hostHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Content-Length": Buffer.byteLength(serialized, "utf8"),
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
    },
    lookup: pinnedLookup(target),
    ...(parsed.protocol === "https:" && !net.isIP(target.hostname) ? { servername: target.hostname } : {})
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let bytes = 0;
    const chunks = [];
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => {
      request.destroy();
      finish(abortedError());
    };
    const request = transport.request(requestOptions, (response) => {
      const contentType = responseHeader(response.headers, "content-type");
      try {
        validateContentType(contentType);
      } catch (error) {
        response.resume();
        finish(error);
        return;
      }
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MCP_LIMITS.maxResponseBytes) {
          request.destroy();
          finish(new McpError(
            MCP_ERROR_CODES.RESPONSE_TOO_LARGE,
            "MCP discovery response is too large",
            { status: 502 }
          ));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.once("end", () => {
        if (settled) return;
        if (response.statusCode < 200 || response.statusCode >= 300) {
          finish(statusError(response.statusCode));
          return;
        }
        finish(null, {
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks)
        });
      });
      response.once("error", (error) => finish(new McpError(
        MCP_ERROR_CODES.NETWORK_ERROR,
        "MCP discovery response could not be read",
        { status: 502, cause: error }
      )));
    });
    const timeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? Math.min(Math.trunc(Number(timeoutMs)), MCP_LIMITS.timeoutMs)
      : MCP_LIMITS.timeoutMs;
    const timer = setTimeout(() => {
      timedOut = true;
      request.destroy();
      finish(new McpError(MCP_ERROR_CODES.TIMEOUT, "MCP discovery timed out", { status: 504 }));
    }, timeout);
    timer.unref?.();
    request.once("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      if (timedOut) return;
      if (signal?.aborted) {
        finish(abortedError());
        return;
      }
      finish(new McpError(
        MCP_ERROR_CODES.NETWORK_ERROR,
        "MCP discovery network request failed",
        { status: 502, cause: error }
      ));
    });
    request.once("close", () => clearTimeout(timer));
    signal?.addEventListener("abort", abort, { once: true });
    request.end(serialized);
  });
}

function sessionIdFromResponse(response) {
  const sessionId = responseHeader(response?.headers, "mcp-session-id");
  if (!sessionId) return "";
  if (sessionId.length > 256 || /[\u0000-\u001f\u007f]/u.test(sessionId)) {
    throw protocolError("MCP session identifier is invalid");
  }
  return sessionId;
}

function initializeRequest() {
  return {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "xi-ai-web", version: "0.0.11" }
    }
  };
}

export async function discoverMcpTools({
  profileId,
  endpoint,
  signal,
  production = process.env.NODE_ENV === "production",
  allowLocal = false,
  allowInsecureHttp = false,
  lookup,
  requestImpl = requestMcpJson,
  now = () => new Date().toISOString()
} = {}) {
  if (signal?.aborted) throw abortedError();
  let target;
  try {
    target = await assertSafeMcpEndpoint(endpoint, {
      production,
      allowLocal,
      allowInsecureHttp,
      ...(lookup ? { lookup } : {})
    });
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(MCP_ERROR_CODES.DNS_UNSAFE, "MCP endpoint validation failed", { status: 400, cause: error });
  }

  const initialize = initializeRequest();
  const initializeResponse = await requestImpl(target, initialize, { signal });
  validateResponseEnvelope(initializeResponse);
  const initializeResult = parseMcpJsonRpcResult(jsonFromBody(initializeResponse?.body), initialize.id);
  const protocolVersion = String(initializeResult.protocolVersion || "").trim();
  if (!protocolVersion || protocolVersion.length > 64 || /[\u0000-\u001f\u007f]/u.test(protocolVersion)) {
    throw protocolError("MCP protocol version is invalid");
  }
  const sessionId = sessionIdFromResponse(initializeResponse);

  const initializedNotification = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  };
  const notificationResponse = await requestImpl(target, initializedNotification, { signal, sessionId });
  validateResponseEnvelope(notificationResponse, { allowEmpty: true });

  const listTools = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/list",
    params: {}
  };
  const listResponse = await requestImpl(target, listTools, { signal, sessionId });
  validateResponseEnvelope(listResponse);
  const listResult = parseMcpJsonRpcResult(jsonFromBody(listResponse?.body), listTools.id);
  const tools = normalizeMcpToolDescriptors(listResult.tools);

  return {
    profileId: String(profileId || ""),
    protocolVersion,
    tools,
    truncated: Boolean(listResult.nextCursor),
    discoveredAt: now()
  };
}

export function assertMcpExecutionUnavailable() {
  throw mcpExecutionUnavailableError();
}
