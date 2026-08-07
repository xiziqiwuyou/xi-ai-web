import fs from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { normalizeAppVersion } from "../server/app-version.mjs";

const MAX_JSON_BYTES = 80 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_SSE_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_EDIT_IMAGE_BYTES = 20 * 1024 * 1024;
const allowedImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export class ProductionSmokeError extends Error {
  constructor(code, { status = null, details = null } = {}) {
    super(code);
    this.name = "ProductionSmokeError";
    this.code = code;
    this.status = Number.isInteger(status) ? status : null;
    this.details = details && typeof details === "object" ? details : null;
  }
}

function smokeError(code, options) {
  return new ProductionSmokeError(code, options);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

export function normalizeSmokeBaseUrl(value, { allowInsecureHttp = false } = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw smokeError("INVALID_APPLICATION_ORIGIN");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw smokeError("INVALID_APPLICATION_ORIGIN");
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname) && !allowInsecureHttp) {
    throw smokeError("INSECURE_REMOTE_ORIGIN");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
  return parsed.toString().replace(/\/$/u, "");
}

function applicationUrl(baseUrl, pathname) {
  const parsed = new URL(baseUrl);
  const prefix = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/u, "");
  parsed.pathname = `${prefix}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

async function readBodyBounded(response, maxBytes = MAX_TEXT_BYTES) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw smokeError("RESPONSE_TOO_LARGE");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof ProductionSmokeError) throw error;
    throw smokeError("RESPONSE_READ_FAILED");
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

async function requestRaw(fetchImpl, url, init, { timeoutMs, failureCode }) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal
    });
  } catch {
    throw smokeError(failureCode || "NETWORK_ERROR");
  }
}

async function requestText(fetchImpl, baseUrl, pathname, { timeoutMs, failureCode, init } = {}) {
  const response = await requestRaw(fetchImpl, applicationUrl(baseUrl, pathname), init, {
    timeoutMs,
    failureCode
  });
  const text = await readBodyBounded(response, MAX_TEXT_BYTES);
  if (!response.ok) throw smokeError(failureCode || "HTTP_ERROR", { status: response.status });
  return { response, text };
}

async function requestJson(fetchImpl, baseUrl, pathname, {
  timeoutMs,
  failureCode,
  init,
  maxBytes = MAX_JSON_BYTES
} = {}) {
  const response = await requestRaw(fetchImpl, applicationUrl(baseUrl, pathname), init, {
    timeoutMs,
    failureCode
  });
  const text = await readBodyBounded(response, maxBytes);
  if (!response.ok) throw smokeError(failureCode || "HTTP_ERROR", { status: response.status });
  try {
    return { response, json: text ? JSON.parse(text) : {} };
  } catch {
    throw smokeError("INVALID_JSON_RESPONSE", { status: response.status });
  }
}

function jsonInit(payload) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}

function assertNoForbiddenBootstrapKeys(value) {
  const forbidden = /^(?:apiKey|password|secret|token|flowId)$/iu;
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, nested] of Object.entries(current)) {
      if (forbidden.test(key)) throw smokeError("PUBLIC_BOOTSTRAP_SECRET_FIELD");
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
}

function parseSseBlock(block) {
  let event = "message";
  const data = [];
  for (const line of block.split(/\r?\n/u)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim() || "message";
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length ? { event, data: data.join("\n") } : null;
}

export async function consumeSseResponse(response, {
  onEvent,
  maxBytes = MAX_SSE_BYTES,
  clock = () => Date.now()
} = {}) {
  if (!response.ok) throw smokeError("SSE_HTTP_ERROR", { status: response.status });
  if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/event-stream")) {
    await readBodyBounded(response, Math.min(maxBytes, MAX_TEXT_BYTES)).catch(() => {});
    throw smokeError("SSE_CONTENT_TYPE_INVALID", { status: response.status });
  }
  if (!response.body) throw smokeError("SSE_BODY_MISSING", { status: response.status });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  let eventCount = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw smokeError("SSE_RESPONSE_TOO_LARGE");
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/u);
      buffer = blocks.pop() || "";
      const receivedAt = clock();
      for (const block of blocks) {
        const parsed = parseSseBlock(block);
        if (!parsed) continue;
        eventCount += 1;
        await onEvent?.({ ...parsed, receivedAt });
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer);
      if (parsed) {
        eventCount += 1;
        await onEvent?.({ ...parsed, receivedAt: clock() });
      }
    }
  } catch (error) {
    if (error instanceof ProductionSmokeError) throw error;
    throw smokeError("SSE_STREAM_INTERRUPTED");
  } finally {
    reader.releaseLock();
  }
  return { eventCount, bytes: total };
}

async function inspectDiagnosticSse(fetchImpl, baseUrl, { timeoutMs, minGapMs }) {
  const startedAt = Date.now();
  const response = await requestRaw(fetchImpl, applicationUrl(baseUrl, "/api/diagnostics/sse"), {
    headers: { Accept: "text/event-stream" }
  }, { timeoutMs, failureCode: "SSE_DIAGNOSTIC_UNAVAILABLE" });
  if (!response.ok) {
    await readBodyBounded(response, MAX_TEXT_BYTES).catch(() => {});
    throw smokeError("SSE_DIAGNOSTIC_UNAVAILABLE", { status: response.status });
  }
  if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/event-stream")) {
    await readBodyBounded(response, MAX_TEXT_BYTES).catch(() => {});
    throw smokeError("SSE_DIAGNOSTIC_CONTENT_TYPE_INVALID", { status: response.status });
  }
  let probeAt = null;
  let doneAt = null;
  const result = await consumeSseResponse(response, {
    onEvent: ({ event, receivedAt }) => {
      if (event === "probe" && probeAt === null) probeAt = receivedAt;
      if (event === "done" && doneAt === null) doneAt = receivedAt;
    }
  });
  if (probeAt === null || doneAt === null || doneAt < probeAt) throw smokeError("SSE_DIAGNOSTIC_INCOMPLETE");
  const separationMs = doneAt - probeAt;
  if (separationMs < minGapMs) {
    throw smokeError("SSE_PROXY_BUFFERING_DETECTED", { details: { minimumMs: minGapMs, observedMs: separationMs } });
  }
  return {
    events: result.eventCount,
    firstEventMs: probeAt - startedAt,
    separationMs,
    totalMs: doneAt - startedAt
  };
}

export async function runDeploymentSmoke({
  baseUrl,
  expectedVersion,
  allowInsecureHttp = false,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  minSseGapMs = 200
}) {
  const applicationOrigin = normalizeSmokeBaseUrl(baseUrl, { allowInsecureHttp });
  const requestTimeoutMs = boundedInteger(timeoutMs, 15_000, 1_000, 120_000);
  const expected = normalizeAppVersion(expectedVersion);

  const [root, admin, healthResult, readyResult, bootstrapResult] = await Promise.all([
    requestText(fetchImpl, applicationOrigin, "/", { timeoutMs: requestTimeoutMs, failureCode: "ROOT_UNAVAILABLE" }),
    requestText(fetchImpl, applicationOrigin, "/xizi2333", { timeoutMs: requestTimeoutMs, failureCode: "ADMIN_SHELL_UNAVAILABLE" }),
    requestJson(fetchImpl, applicationOrigin, "/api/health", { timeoutMs: requestTimeoutMs, failureCode: "HEALTH_UNAVAILABLE" }),
    requestJson(fetchImpl, applicationOrigin, "/api/ready", { timeoutMs: requestTimeoutMs, failureCode: "READINESS_UNAVAILABLE" }),
    requestJson(fetchImpl, applicationOrigin, "/api/public/bootstrap", { timeoutMs: requestTimeoutMs, failureCode: "BOOTSTRAP_UNAVAILABLE" })
  ]);

  if (!root.text.includes('id="root"')) throw smokeError("ROOT_APP_MARKER_MISSING");
  if (!admin.text.includes('id="root"')) throw smokeError("ADMIN_APP_MARKER_MISSING");
  const health = healthResult.json;
  const readiness = readyResult.json;
  const bootstrap = bootstrapResult.json;
  if (health?.ok !== true) throw smokeError("HEALTH_NOT_OK");
  if (readiness?.ready !== true) throw smokeError("APPLICATION_NOT_READY");
  const actualVersion = normalizeAppVersion(health?.version);
  if (actualVersion !== expected) {
    throw smokeError("APPLICATION_VERSION_MISMATCH", { details: { expected, actual: actualVersion } });
  }
  assertNoForbiddenBootstrapKeys(bootstrap);

  const menus = Array.isArray(bootstrap?.menuItems) ? bootstrap.menuItems : [];
  const catalog = Array.isArray(bootstrap?.modelCatalog) ? bootstrap.modelCatalog : [];
  for (const moduleId of ["chat", "image"]) {
    const menu = menus.find((item) => item?.id === moduleId);
    if (!menu || menu.enabled === false || menu.visible === false) throw smokeError(`CORE_MENU_${moduleId.toUpperCase()}_UNAVAILABLE`);
    if (!catalog.some((entry) => entry?.enabled !== false && entry?.capabilities?.includes(moduleId))) {
      throw smokeError(`CORE_MODEL_${moduleId.toUpperCase()}_UNAVAILABLE`);
    }
  }

  const legacyConversation = await requestText(fetchImpl, applicationOrigin, "/api/conversations", {
    timeoutMs: requestTimeoutMs,
    failureCode: "LEGACY_CONVERSATION_CHECK_FAILED"
  }).catch((error) => {
    if (error instanceof ProductionSmokeError && error.status === 410) return { response: { status: 410 }, text: "" };
    throw error;
  });
  if (legacyConversation.response.status !== 410) throw smokeError("LEGACY_CONVERSATION_ROUTE_ACTIVE");

  const sse = await inspectDiagnosticSse(fetchImpl, applicationOrigin, {
    timeoutMs: requestTimeoutMs,
    minGapMs: boundedInteger(minSseGapMs, 200, 50, 1_500)
  });

  return {
    ok: true,
    evidence: "online-smoke",
    applicationOrigin,
    version: actualVersion,
    readiness: true,
    adminConfigured: Boolean(health.adminConfigured),
    chatModels: catalog.filter((entry) => entry?.enabled !== false && entry?.capabilities?.includes("chat")).length,
    imageModels: catalog.filter((entry) => entry?.enabled !== false && entry?.capabilities?.includes("image")).length,
    sse
  };
}

function validateApiKey(value) {
  const apiKey = String(value || "").trim();
  if (!apiKey || apiKey.length > 4_096 || /[\u0000-\u001F\u007F]/u.test(apiKey)) {
    throw smokeError("LIVE_API_KEY_INVALID");
  }
  return apiKey;
}

function modelRecord(bootstrap, modelId, capability) {
  const entry = bootstrap?.modelCatalog?.find((item) => item?.id === modelId);
  if (!entry || entry.enabled === false) throw smokeError("LIVE_MODEL_NOT_FOUND");
  if (!entry.capabilities?.includes(capability)) throw smokeError("LIVE_MODEL_CAPABILITY_MISMATCH");
  return entry;
}

function safeModelMetadata(entry) {
  return {
    modelId: entry.id,
    vendor: entry.vendor,
    endpointProtocol: entry.endpointProtocol
  };
}

function failedCase(name, entry, startedAt, error) {
  const failure = error instanceof ProductionSmokeError ? error : smokeError("LIVE_CASE_FAILED");
  return {
    case: name,
    status: "failed",
    durationMs: Date.now() - startedAt,
    ...(entry ? safeModelMetadata(entry) : {}),
    errorCode: failure.code,
    ...(failure.status ? { httpStatus: failure.status } : {})
  };
}

async function runCase(name, entry, operation) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    return {
      case: name,
      status: "passed",
      durationMs: Date.now() - startedAt,
      ...safeModelMetadata(entry),
      ...result
    };
  } catch (error) {
    return failedCase(name, entry, startedAt, error);
  }
}

function skippedCase(name, reason) {
  return { case: name, status: "skipped", reason };
}

async function runNonStreamingChat({ fetchImpl, baseUrl, timeoutMs, apiKey, entry }) {
  const { json } = await requestJson(fetchImpl, baseUrl, "/api/chat/title", {
    timeoutMs,
    failureCode: "CHAT_NONSTREAM_REQUEST_FAILED",
    init: jsonInit({
      connection: { apiKey },
      modelId: entry.id,
      history: [{
        id: "live-smoke-user",
        role: "user",
        content: "Summarize this production smoke request as a short title.",
        createdAt: new Date().toISOString()
      }]
    }),
    maxBytes: MAX_TEXT_BYTES
  });
  const titleLength = typeof json?.title === "string" ? json.title.trim().length : 0;
  if (!titleLength) throw smokeError("CHAT_NONSTREAM_RESULT_EMPTY");
  return { responseKind: "json", outputCharacters: titleLength };
}

async function runStreamingChat({ fetchImpl, baseUrl, timeoutMs, apiKey, entry }) {
  const startedAt = Date.now();
  const response = await requestRaw(fetchImpl, applicationUrl(baseUrl, "/api/chat/stream"), jsonInit({
    connection: { apiKey },
    modelId: entry.id,
    content: "Reply with a short xi-ai-web production smoke confirmation.",
    displayContent: "Production smoke request",
    conversation: {
      id: "live-smoke-chat",
      title: "Production smoke",
      assistantId: "",
      pinned: false,
      messageCount: 0,
      preview: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }), { timeoutMs, failureCode: "CHAT_STREAM_REQUEST_FAILED" });
  if (!response.ok) {
    await readBodyBounded(response, MAX_TEXT_BYTES).catch(() => {});
    throw smokeError("CHAT_STREAM_REQUEST_FAILED", { status: response.status });
  }

  let tokenEvents = 0;
  let tokenCharacters = 0;
  let firstTokenMs = null;
  let done = false;
  let providerError = false;
  await consumeSseResponse(response, {
    onEvent: ({ event, data, receivedAt }) => {
      let payload = {};
      try {
        payload = JSON.parse(data);
      } catch {
        throw smokeError("CHAT_STREAM_EVENT_INVALID");
      }
      if (event === "token" && typeof payload.token === "string") {
        tokenEvents += 1;
        tokenCharacters += payload.token.length;
        if (firstTokenMs === null) firstTokenMs = receivedAt - startedAt;
      }
      if (event === "error") providerError = true;
      if (event === "done") {
        done = true;
        if (["error", "stopped"].includes(payload?.message?.status)) providerError = true;
      }
    }
  });
  if (providerError) throw smokeError("CHAT_STREAM_PROVIDER_ERROR");
  if (!done) throw smokeError("CHAT_STREAM_DONE_MISSING");
  if (!tokenEvents || !tokenCharacters || firstTokenMs === null) throw smokeError("CHAT_STREAM_TOKEN_MISSING");
  return {
    responseKind: "sse",
    tokenEvents,
    outputCharacters: tokenCharacters,
    firstTokenMs
  };
}

function decodeImageDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/iu);
  if (!match) throw smokeError("IMAGE_DATA_URL_INVALID");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw smokeError("IMAGE_BYTES_INVALID");
  return { declaredMimeType: match[1].toLowerCase(), bytes };
}

async function verifyImageDataUrl(dataUrl) {
  const decoded = decodeImageDataUrl(dataUrl);
  const detected = await fileTypeFromBuffer(decoded.bytes);
  if (!detected || !allowedImageMimeTypes.has(detected.mime) || detected.mime !== decoded.declaredMimeType) {
    throw smokeError("IMAGE_MEDIA_TYPE_INVALID");
  }
  return { mimeType: detected.mime, bytes: decoded.bytes.length };
}

async function verifyGeneratedImage({ fetchImpl, baseUrl, timeoutMs, asset }) {
  const source = String(asset?.url || "");
  if (source.startsWith("data:image/")) return verifyImageDataUrl(source);
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw smokeError("IMAGE_ASSET_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw smokeError("IMAGE_ASSET_URL_INVALID");
  const { json } = await requestJson(fetchImpl, baseUrl, "/api/image/import", {
    timeoutMs,
    failureCode: "IMAGE_IMPORT_FAILED",
    init: jsonInit({ url: source }),
    maxBytes: MAX_IMAGE_BYTES * 2
  });
  return verifyImageDataUrl(json?.dataUrl);
}

async function imageInputFromFile(filePath) {
  let bytes;
  try {
    bytes = await fs.readFile(path.resolve(filePath));
  } catch {
    throw smokeError("IMAGE_EDIT_SOURCE_UNREADABLE");
  }
  if (!bytes.length || bytes.length > MAX_EDIT_IMAGE_BYTES) throw smokeError("IMAGE_EDIT_SOURCE_SIZE_INVALID");
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !allowedImageMimeTypes.has(detected.mime)) throw smokeError("IMAGE_EDIT_SOURCE_TYPE_INVALID");
  return {
    dataUrl: `data:${detected.mime};base64,${bytes.toString("base64")}`,
    name: `live-smoke-input.${detected.ext}`,
    mimeType: detected.mime
  };
}

async function runImageCase({ fetchImpl, baseUrl, timeoutMs, apiKey, entry, editInput }) {
  const mode = editInput ? "edit" : "generate";
  const { json } = await requestJson(fetchImpl, baseUrl, "/api/generate/image", {
    timeoutMs,
    failureCode: mode === "edit" ? "IMAGE_EDIT_REQUEST_FAILED" : "IMAGE_GENERATION_REQUEST_FAILED",
    init: jsonInit({
      connection: { apiKey },
      modelId: entry.id,
      prompt: editInput
        ? "Make a subtle color adjustment while preserving the source composition."
        : "A minimal red square centered on a clean white background.",
      options: {
        mode,
        count: 1,
        aspectRatio: "1:1",
        imageSize: "1K",
        size: "1024x1024",
        quality: "low",
        outputFormat: "png",
        ...(editInput ? { inputImages: [editInput] } : {})
      }
    })
  });
  if (json?.status !== "completed" || !Array.isArray(json?.assets) || json.assets.length !== 1) {
    throw smokeError("IMAGE_RESULT_INCOMPLETE");
  }
  const verified = await verifyGeneratedImage({ fetchImpl, baseUrl, timeoutMs, asset: json.assets[0] });
  return { responseKind: "image-bytes", imageMimeType: verified.mimeType, imageBytes: verified.bytes };
}

export async function runLiveProviderSmoke({
  baseUrl,
  apiKey,
  chatModelId = "",
  imageModelId = "",
  editImagePath = "",
  allowInsecureHttp = false,
  fetchImpl = fetch,
  timeoutMs = 300_000
}) {
  const applicationOrigin = normalizeSmokeBaseUrl(baseUrl, { allowInsecureHttp });
  const secret = validateApiKey(apiKey);
  const requestTimeoutMs = boundedInteger(timeoutMs, 300_000, 5_000, 900_000);
  const { json: bootstrap } = await requestJson(fetchImpl, applicationOrigin, "/api/public/bootstrap", {
    timeoutMs: Math.min(requestTimeoutMs, 30_000),
    failureCode: "LIVE_BOOTSTRAP_UNAVAILABLE",
    maxBytes: MAX_TEXT_BYTES
  });
  assertNoForbiddenBootstrapKeys(bootstrap);

  const cases = [];
  if (chatModelId) {
    const chatEntry = modelRecord(bootstrap, chatModelId, "chat");
    cases.push(await runCase("chat-nonstream", chatEntry, () => runNonStreamingChat({
      fetchImpl,
      baseUrl: applicationOrigin,
      timeoutMs: requestTimeoutMs,
      apiKey: secret,
      entry: chatEntry
    })));
    cases.push(await runCase("chat-stream", chatEntry, () => runStreamingChat({
      fetchImpl,
      baseUrl: applicationOrigin,
      timeoutMs: requestTimeoutMs,
      apiKey: secret,
      entry: chatEntry
    })));
  } else {
    cases.push(skippedCase("chat-nonstream", "LIVE_SMOKE_CHAT_MODEL_ID_NOT_SET"));
    cases.push(skippedCase("chat-stream", "LIVE_SMOKE_CHAT_MODEL_ID_NOT_SET"));
  }

  if (imageModelId) {
    const imageEntry = modelRecord(bootstrap, imageModelId, "image");
    cases.push(await runCase("image-generate", imageEntry, () => runImageCase({
      fetchImpl,
      baseUrl: applicationOrigin,
      timeoutMs: requestTimeoutMs,
      apiKey: secret,
      entry: imageEntry
    })));
    if (editImagePath) {
      const editInput = await imageInputFromFile(editImagePath);
      if (!imageEntry.capabilities?.includes("imageEdit")) {
        cases.push(failedCase("image-edit", imageEntry, Date.now(), smokeError("LIVE_MODEL_CAPABILITY_MISMATCH")));
      } else {
        cases.push(await runCase("image-edit", imageEntry, () => runImageCase({
          fetchImpl,
          baseUrl: applicationOrigin,
          timeoutMs: requestTimeoutMs,
          apiKey: secret,
          entry: imageEntry,
          editInput
        })));
      }
    } else {
      cases.push(skippedCase("image-edit", "LIVE_SMOKE_EDIT_IMAGE_PATH_NOT_SET"));
    }
  } else {
    cases.push(skippedCase("image-generate", "LIVE_SMOKE_IMAGE_MODEL_ID_NOT_SET"));
    cases.push(skippedCase("image-edit", "LIVE_SMOKE_IMAGE_MODEL_ID_NOT_SET"));
  }

  const report = {
    ok: cases.every((item) => item.status !== "failed"),
    evidence: "live-api",
    applicationOrigin,
    cases
  };
  if (JSON.stringify(report).includes(secret)) throw smokeError("LIVE_SECRET_REPORT_VIOLATION");
  return report;
}

export function publicSmokeFailure(error) {
  const failure = error instanceof ProductionSmokeError ? error : smokeError("UNEXPECTED_SMOKE_FAILURE");
  return {
    ok: false,
    errorCode: failure.code,
    ...(failure.status ? { httpStatus: failure.status } : {}),
    ...(failure.details ? { details: failure.details } : {})
  };
}
