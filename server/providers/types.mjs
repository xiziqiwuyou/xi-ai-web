export const providerKinds = new Set([
  "openai",
  "anthropic",
  "gemini",
  "kimi",
  "deepseek",
  "qwen",
  "botcf",
  "openai-compatible"
]);

export const endpointProtocols = new Set([
  "openai-chat",
  "openai-responses",
  "anthropic-messages",
  "gemini-generate-content"
]);

const defaultEndpointProtocols = {
  openai: "openai-responses",
  anthropic: "anthropic-messages",
  gemini: "gemini-generate-content",
  kimi: "openai-chat",
  deepseek: "openai-chat",
  qwen: "openai-chat",
  botcf: "openai-chat",
  "openai-compatible": "openai-chat"
};

export const providerCapabilities = {
  openai: [
    "chat",
    "vision",
    "image",
    "imageEdit",
    "tts",
    "stt",
    "embedding",
    "fileSearch",
    "toolCalling",
    "webSearch",
    "codeExecution"
  ],
  anthropic: ["chat", "vision", "toolCalling", "webSearch", "urlContext", "codeExecution"],
  gemini: [
    "chat",
    "vision",
    "image",
    "imageEdit",
    "tts",
    "stt",
    "embedding",
    "fileSearch",
    "toolCalling",
    "webSearch",
    "urlContext",
    "codeExecution"
  ],
  kimi: ["chat", "vision", "toolCalling"],
  deepseek: ["chat", "toolCalling"],
  qwen: ["chat", "vision", "audio", "embedding", "toolCalling", "webSearch", "codeExecution"],
  botcf: ["image", "imageEdit"],
  "openai-compatible": ["chat", "image", "tts", "stt", "embedding", "video", "toolCalling"]
};

export const providerDefaults = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: {
      chat: "gpt-5.6-luna",
      vision: "gpt-5.6-luna",
      image: "gpt-image-2",
      tts: "gpt-4o-mini-tts",
      stt: "gpt-4o-transcribe",
      embedding: "text-embedding-3-small"
    }
  },
  anthropic: {
    name: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    models: {
      chat: "claude-opus-4-8",
      vision: "claude-opus-4-8"
    }
  },
  gemini: {
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: {
      chat: "gemini-3.5-flash",
      vision: "gemini-3.5-flash",
      image: "gemini-3.1-flash-image",
      tts: "gemini-2.5-flash-preview-tts",
      stt: "gemini-3.5-flash",
      embedding: "gemini-embedding-2"
    }
  },
  kimi: {
    name: "Kimi",
    baseUrl: "https://api.moonshot.ai/v1",
    models: {
      chat: "kimi-k3",
      vision: "kimi-k2.6"
    }
  },
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: {
      chat: "deepseek-v4-flash"
    }
  },
  qwen: {
    name: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: {
      chat: "qwen3.7-plus",
      vision: "qwen3.5-omni-plus",
      embedding: "text-embedding-v4"
    }
  },
  botcf: {
    name: "BotCF",
    baseUrl: "https://botcf.com/v1",
    models: {
      image: "gpt-image-2"
    }
  },
  "openai-compatible": {
    name: "OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    models: {
      chat: "gpt-4.1-mini",
      vision: "gpt-4.1-mini",
      image: "gpt-image-1",
      tts: "gpt-4o-mini-tts",
      stt: "gpt-4o-transcribe",
      embedding: "text-embedding-3-small",
      video: "video-model"
    }
  }
};

export function normalizeProviderKind(kind) {
  return providerKinds.has(kind) ? kind : "openai-compatible";
}

export function defaultEndpointProtocol(kind) {
  return defaultEndpointProtocols[normalizeProviderKind(kind)];
}

export function normalizeEndpointProtocol(value, kind) {
  return endpointProtocols.has(value) ? value : defaultEndpointProtocol(kind);
}

export function defaultCapabilities(kind) {
  return providerCapabilities[normalizeProviderKind(kind)] || providerCapabilities["openai-compatible"];
}

export function modelForCapability(provider, capability = "chat") {
  return (
    provider?.models?.[capability] ||
    (capability === "chat" ? provider?.defaultModel : "") ||
    provider?.defaultModel ||
    providerDefaults[normalizeProviderKind(provider?.kind)].models[capability] ||
    ""
  );
}

export function assertCapability(provider, capability) {
  const capabilities = provider?.capabilities || defaultCapabilities(provider?.kind);
  if (!capabilities.includes(capability)) {
    throw new Error(`${provider?.name || "当前模型服务"} 不支持 ${capability} 能力`);
  }
}

export function providerUrl(provider, endpointPath) {
  const baseUrl = String(provider?.baseUrl || "").trim().replace(/\/+$/u, "");
  const parsedBase = new URL(baseUrl);
  const basePath = parsedBase.pathname.replace(/\/+$/u, "");
  const pathPart = String(endpointPath || "").trim();
  const normalizedPath = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const versionPattern = /\/v\d+(?:(?:alpha|beta)\d*)?$/iu;
  const baseVersion = basePath.match(versionPattern)?.[0] || "";
  const baseHasVersion = Boolean(baseVersion);
  const endpointHasVersion = /^\/v\d+(?:(?:alpha|beta)\d*)?(?:\/|$)/iu.test(normalizedPath);
  const targetVersion = /^\/models\/[^/]+:/u.test(normalizedPath) ? "/v1beta" : "/v1";

  if (endpointHasVersion) {
    const unversionedBase = baseHasVersion ? baseUrl.slice(0, -baseVersion.length) : baseUrl;
    return `${unversionedBase}${normalizedPath}`;
  }
  if (!baseHasVersion) return `${baseUrl}${targetVersion}${normalizedPath}`;
  if (baseVersion.toLowerCase() === targetVersion) return `${baseUrl}${normalizedPath}`;
  return `${baseUrl.slice(0, -baseVersion.length)}${targetVersion}${normalizedPath}`;
}

export function compactText(value, max = 700) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function isHtmlDocument(value, contentType = "") {
  const mediaType = String(contentType || "").toLowerCase();
  const prefix = String(value ?? "").trimStart().slice(0, 512);
  return (
    mediaType.includes("text/html") ||
    mediaType.includes("application/xhtml+xml") ||
    /^<!doctype\s+html\b/iu.test(prefix) ||
    /^<html(?:\s|>)/iu.test(prefix)
  );
}

function providerResponseLabel(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "上游模型 API";
  }
}

export function parseProviderJsonText(raw, { contentType = "", url = "" } = {}) {
  const text = String(raw ?? "").trim();
  if (isHtmlDocument(text, contentType)) {
    throw new Error(
      `模型服务返回了 HTML 页面而不是 JSON（${providerResponseLabel(url)}）。请检查后台统一上游 API 域名及反向代理是否支持对应的 /v1 或 /v1beta 端点`
    );
  }
  if (!text) throw new Error("模型服务返回了空响应");
  try {
    return JSON.parse(text);
  } catch {
    const mediaType = String(contentType || "").split(";", 1)[0].trim() || "unknown";
    throw new Error(`模型服务返回了无法解析的 JSON（Content-Type: ${mediaType}）`);
  }
}

const MAX_PROVIDER_SSE_FRAME_BYTES = 1024 * 1024;

function dispatchSseFrame(frame, onEvent) {
  let event = "message";
  const data = [];

  for (const rawLine of frame.split(/\r?\n/u)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const separator = rawLine.indexOf(":");
    const field = separator === -1 ? rawLine : rawLine.slice(0, separator);
    const rawValue = separator === -1 ? "" : rawLine.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") event = value || "message";
    if (field === "data") data.push(value);
  }

  if (data.length) onEvent({ event, data: data.join("\n") });
}

/**
 * Consume an upstream Server-Sent Events response without assuming network
 * chunk boundaries align with either UTF-8 characters or SSE frames.
 */
export async function consumeSseEvents(response, onEvent, { maxFrameBytes = MAX_PROVIDER_SSE_FRAME_BYTES } = {}) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Model service did not return a readable stream");

  const decoder = new TextDecoder();
  let buffer = "";
  const dispatchAvailableFrames = () => {
    let match = buffer.match(/\r?\n\r?\n/u);
    while (match) {
      const boundary = match.index ?? 0;
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + match[0].length);
      dispatchSseFrame(frame, onEvent);
      match = buffer.match(/\r?\n\r?\n/u);
    }
    if (Buffer.byteLength(buffer, "utf8") > maxFrameBytes) {
      throw new Error("Model service sent an oversized SSE frame");
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    dispatchAvailableFrames();
  }

  buffer += decoder.decode();
  dispatchAvailableFrames();
  if (buffer.trim()) {
    if (Buffer.byteLength(buffer, "utf8") > maxFrameBytes) {
      throw new Error("Model service sent an oversized SSE frame");
    }
    dispatchSseFrame(buffer, onEvent);
  }
}

function normalizedResponseLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 128 * 1024 * 1024);
}

async function readResponseBuffer(response, maxResponseBytes) {
  const limit = normalizedResponseLimit(maxResponseBytes, 8 * 1024 * 1024);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error(`Model service response exceeds ${Math.ceil(limit / 1024 / 1024)} MB`);
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Model service response exceeds ${Math.ceil(limit / 1024 / 1024)} MB`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function readResponseText(response, maxResponseBytes) {
  return (await readResponseBuffer(response, maxResponseBytes)).toString("utf8");
}

export async function fetchJson(url, { headers, body, signal, maxResponseBytes }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body),
    redirect: "error",
    signal
  });
  const contentType = response.headers.get("content-type") || "";
  const raw = await readResponseText(response, maxResponseBytes);
  if (!response.ok) {
    if (isHtmlDocument(raw, contentType)) {
      throw new Error(`模型服务返回 ${response.status} HTML 页面，请检查上游 API 端点配置`);
    }
    throw new Error(`模型服务返回 ${response.status}: ${compactText(raw)}`);
  }
  return parseProviderJsonText(raw, { contentType, url });
}

export async function fetchAsset(url, { headers, body, signal, maxResponseBytes = 64 * 1024 * 1024 }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body),
    redirect: "error",
    signal
  });
  const contentType = response.headers.get("content-type") || "";
  const normalizedContentType = contentType.toLowerCase();
  if (!response.ok) {
    const errorText = await readResponseText(response, 1024 * 1024);
    throw new Error(`模型服务返回 ${response.status}: ${compactText(errorText)}`);
  }
  if (normalizedContentType.includes("json")) {
    const raw = await readResponseText(response, maxResponseBytes);
    return parseProviderJsonText(raw, { contentType, url });
  }
  const buffer = await readResponseBuffer(response, maxResponseBytes);
  const responsePrefix = buffer.subarray(0, 512).toString("utf8");
  if (isHtmlDocument(responsePrefix, contentType)) {
    throw new Error(`模型服务返回了 HTML 页面而不是媒体资源（${providerResponseLabel(url)}）`);
  }
  return {
    dataUrl: `data:${contentType || "application/octet-stream"};base64,${buffer.toString("base64")}`
  };
}

export async function fetchMultipartJson(url, { headers, fields, file, signal, maxResponseBytes }) {
  return fetchMultipartForm(url, {
    headers,
    fields,
    files: file ? [file] : [],
    signal,
    maxResponseBytes
  });
}

export async function fetchMultipartForm(url, { headers, fields, files, signal, maxResponseBytes = 64 * 1024 * 1024 }) {
  const form = new FormData();
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  (Array.isArray(files) ? files : []).forEach((file) => {
    if (!file?.buffer) return;
    form.append(
      file.fieldName || "file",
      new Blob([file.buffer], { type: file.mimeType || "application/octet-stream" }),
      file.fileName || "upload.bin"
    );
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { ...(headers || {}) },
    body: form,
    redirect: "error",
    signal
  });
  const raw = await readResponseText(response, maxResponseBytes);
  if (!response.ok) {
    throw new Error(`模型服务返回 ${response.status}: ${compactText(raw)}`);
  }
  const contentType = response.headers.get("content-type") || "";
  return parseProviderJsonText(raw, { contentType, url });
}

export function extractOpenAICompatibleText(json) {
  return (
    json.choices?.[0]?.message?.content ||
    json.choices?.[0]?.text ||
    json.output_text ||
    json.text ||
    compactText(JSON.stringify(json), 1200)
  );
}

export function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return { input: String(value) };
  }
}

export function parseStrictToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new Error("Tool arguments must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object");
  }
  return parsed;
}

export function stringifyToolOutput(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function normalizeTools(tools = []) {
  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => tool?.name && tool?.parameters)
    .map((tool) => ({
      name: String(tool.name),
      description: String(tool.description || ""),
      parameters: tool.parameters
    }));
}

export function hasImageContent(messages = []) {
  return messages.some((message) =>
    Array.isArray(message.content) && message.content.some((part) => part?.type === "image")
  );
}

export function dataUrlPayload(dataUrl = "") {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2]
  };
}

export function bufferFromDataUrl(dataUrl = "") {
  const payload = dataUrlPayload(dataUrl);
  if (!payload) return null;
  return {
    mimeType: payload.mimeType,
    buffer: Buffer.from(payload.base64, "base64")
  };
}
