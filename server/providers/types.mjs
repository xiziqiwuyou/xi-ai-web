export const providerKinds = new Set([
  "openai",
  "anthropic",
  "gemini",
  "kimi",
  "deepseek",
  "qwen",
  "openai-compatible"
]);

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
    "codeExecution",
    "streaming"
  ],
  anthropic: ["chat", "vision", "toolCalling", "webSearch", "urlContext", "codeExecution", "streaming"],
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
    "codeExecution",
    "streaming"
  ],
  kimi: ["chat", "vision", "toolCalling", "streaming"],
  deepseek: ["chat", "toolCalling", "streaming"],
  qwen: ["chat", "vision", "audio", "embedding", "toolCalling", "webSearch", "codeExecution", "streaming"],
  "openai-compatible": ["chat", "image", "tts", "stt", "embedding", "video", "toolCalling", "streaming"]
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
  const pathPart = String(endpointPath || "").trim();
  const normalizedPath = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return `${provider.baseUrl}${normalizedPath}`;
}

export function compactText(value, max = 700) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export async function fetchJson(url, { headers, body, signal }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body),
    redirect: "error",
    signal
  });
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`模型服务返回 ${response.status}: ${compactText(raw)}`);
  }
  if (!contentType.includes("json")) return { text: raw };
  return raw ? JSON.parse(raw) : {};
}

export async function fetchAsset(url, { headers, body, signal }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body),
    redirect: "error",
    signal
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`模型服务返回 ${response.status}: ${compactText(errorText)}`);
  }
  if (contentType.includes("json")) return response.json();
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    dataUrl: `data:${contentType || "application/octet-stream"};base64,${buffer.toString("base64")}`
  };
}

export async function fetchMultipartJson(url, { headers, fields, file, signal }) {
  return fetchMultipartForm(url, {
    headers,
    fields,
    files: file ? [file] : [],
    signal
  });
}

export async function fetchMultipartForm(url, { headers, fields, files, signal }) {
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
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`模型服务返回 ${response.status}: ${compactText(raw)}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) return { text: raw };
  return raw ? JSON.parse(raw) : {};
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
