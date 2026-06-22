import crypto from "node:crypto";

export const vendorKinds = ["openai", "anthropic", "gemini", "openai-compatible"];

export const modelCapabilities = [
  "chat",
  "vision",
  "image",
  "tts",
  "stt",
  "audio",
  "video",
  "embedding",
  "fileSearch",
  "toolCalling",
  "streaming"
];

export const defaultForCapabilities = ["chat", "image", "tts", "stt", "video", "embedding"];

const vendorLabels = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  "openai-compatible": "OpenAI Compatible"
};

const defaultCatalog = [
  {
    id: "openai-gpt-4-1-mini",
    vendor: "openai",
    model: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: ["chat"],
    enabled: true
  },
  {
    id: "openai-gpt-4-1",
    vendor: "openai",
    model: "gpt-4.1",
    label: "GPT-4.1",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-image-1",
    vendor: "openai",
    model: "gpt-image-1",
    label: "GPT Image 1",
    capabilities: ["image"],
    defaultFor: ["image"],
    enabled: true
  },
  {
    id: "openai-gpt-4o-mini-tts",
    vendor: "openai",
    model: "gpt-4o-mini-tts",
    label: "GPT-4o Mini TTS",
    capabilities: ["tts", "audio"],
    defaultFor: ["tts"],
    enabled: true
  },
  {
    id: "openai-gpt-4o-transcribe",
    vendor: "openai",
    model: "gpt-4o-transcribe",
    label: "GPT-4o Transcribe",
    capabilities: ["stt", "audio"],
    defaultFor: ["stt"],
    enabled: true
  },
  {
    id: "openai-text-embedding-3-small",
    vendor: "openai",
    model: "text-embedding-3-small",
    label: "Text Embedding 3 Small",
    capabilities: ["embedding"],
    defaultFor: ["embedding"],
    enabled: true
  },
  {
    id: "claude-sonnet-4-5",
    vendor: "anthropic",
    model: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "claude-haiku-4-5",
    vendor: "anthropic",
    model: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-2-5-flash",
    vendor: "gemini",
    model: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-2-5-pro",
    vendor: "gemini",
    model: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-2-5-flash-image",
    vendor: "gemini",
    model: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    capabilities: ["image", "vision"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-2-5-flash-preview-tts",
    vendor: "gemini",
    model: "gemini-2.5-flash-preview-tts",
    label: "Gemini 2.5 Flash Preview TTS",
    capabilities: ["tts", "audio"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-embedding-001",
    vendor: "gemini",
    model: "gemini-embedding-001",
    label: "Gemini Embedding 001",
    capabilities: ["embedding"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "compatible-chat",
    vendor: "openai-compatible",
    model: "gpt-4.1-mini",
    label: "Compatible Chat",
    capabilities: ["chat", "streaming"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "compatible-video",
    vendor: "openai-compatible",
    model: "video-model",
    label: "Compatible Video",
    capabilities: ["video"],
    defaultFor: ["video"],
    enabled: true,
    mediaConfig: {
      generatePath: "/video/generations",
      statusPath: "/video/generations/status",
      idJsonPath: "id",
      statusJsonPath: "status",
      assetJsonPath: "url",
      requestShape: "openai-compatible"
    }
  }
];

export function normalizeVendorKind(value) {
  return vendorKinds.includes(value) ? value : "openai-compatible";
}

export function vendorLabel(vendor) {
  return vendorLabels[normalizeVendorKind(vendor)] || vendorLabels["openai-compatible"];
}

export function defaultModelCatalog() {
  return defaultCatalog.map((entry) => ({ ...entry, capabilities: [...entry.capabilities], defaultFor: [...entry.defaultFor] }));
}

function cleanText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
}

function uniqueValues(values, allowed) {
  const allowedSet = new Set(allowed);
  return [...new Set(Array.isArray(values) ? values : [])].filter((value) => allowedSet.has(value));
}

function cleanMediaConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const cleanPath = (field, fallback = "") => cleanText(source[field], fallback).slice(0, 180);
  const requestShape = source.requestShape === "simple-json" ? "simple-json" : "openai-compatible";
  const config = {
    generatePath: cleanPath("generatePath"),
    statusPath: cleanPath("statusPath"),
    idJsonPath: cleanPath("idJsonPath"),
    statusJsonPath: cleanPath("statusJsonPath"),
    assetJsonPath: cleanPath("assetJsonPath"),
    requestShape,
    pollIntervalSeconds: Number.isFinite(Number(source.pollIntervalSeconds))
      ? Math.max(10, Math.min(120, Number(source.pollIntervalSeconds)))
      : undefined,
    maxPollAttempts: Number.isFinite(Number(source.maxPollAttempts))
      ? Math.max(1, Math.min(120, Number(source.maxPollAttempts)))
      : undefined
  };
  return Object.fromEntries(Object.entries(config).filter(([, next]) => next !== undefined && next !== ""));
}

function mergeEntries(existing, next) {
  const capabilities = uniqueValues(
    [...(existing.capabilities || []), ...(next.capabilities || [])],
    modelCapabilities
  );
  const defaultFor = uniqueValues(
    [...(existing.defaultFor || []), ...(next.defaultFor || [])],
    defaultForCapabilities
  );

  defaultFor.forEach((capability) => {
    if (!capabilities.includes(capability)) capabilities.push(capability);
  });

  return {
    ...existing,
    ...next,
    label: existing.label || next.label,
    capabilities: capabilities.length ? capabilities : ["chat"],
    defaultFor,
    enabled: Boolean(existing.enabled || next.enabled)
  };
}

function deriveId(entry) {
  const vendor = normalizeVendorKind(entry.vendor);
  const model = slug(entry.model || entry.label);
  return model ? `${vendor}-${model}` : crypto.randomUUID();
}

export function normalizeCatalogEntry(entry, fallback = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const vendor = normalizeVendorKind(source.vendor ?? source.kind ?? fallback.vendor);
  const model = cleanText(source.model ?? source.defaultModel ?? fallback.model);
  const label = cleanText(source.label ?? source.name ?? fallback.label, model || vendorLabel(vendor));
  const capabilities = uniqueValues(
    source.capabilities ?? fallback.capabilities ?? ["chat"],
    modelCapabilities
  );
  const defaultFor = uniqueValues(source.defaultFor ?? fallback.defaultFor ?? [], defaultForCapabilities);

  defaultFor.forEach((capability) => {
    if (!capabilities.includes(capability)) capabilities.push(capability);
  });

  return {
    id: cleanText(source.id ?? fallback.id, "") || deriveId({ vendor, model, label }),
    vendor,
    model,
    label,
    capabilities: capabilities.length ? capabilities : ["chat"],
    defaultFor,
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled ?? true,
    mediaConfig: cleanMediaConfig(source.mediaConfig ?? fallback.mediaConfig)
  };
}

export function normalizeModelCatalog(value, fallback = defaultModelCatalog()) {
  const entries = Array.isArray(value) ? value : [];
  const seenIds = new Set();
  const seenModels = new Map();
  const normalized = entries
    .map((entry) => normalizeCatalogEntry(entry))
    .filter((entry) => entry.model)
    .map((entry) => {
      let id = entry.id;
      while (seenIds.has(id)) id = `${entry.id}-${seenIds.size + 1}`;
      seenIds.add(id);
      return { ...entry, id };
    });

  const deduped = [];
  for (const entry of normalized) {
    const key = `${entry.vendor}:${entry.model}`;
    const existingIndex = seenModels.get(key);
    if (typeof existingIndex === "number") {
      deduped[existingIndex] = mergeEntries(deduped[existingIndex], entry);
      continue;
    }
    seenModels.set(key, deduped.length);
    deduped.push(entry);
  }

  return deduped.length ? deduped : fallback;
}

function chatCapabilities(vendor, providerCapabilities = []) {
  const base = ["chat"];
  if (providerCapabilities.includes("vision") || vendor !== "openai-compatible") base.push("vision");
  if (providerCapabilities.includes("toolCalling") || vendor !== "openai-compatible") {
    base.push("toolCalling");
  }
  if (providerCapabilities.includes("streaming") || vendor !== "anthropic") base.push("streaming");
  return [...new Set(base)];
}

function addLegacyEntry(entriesByKey, provider, capability, model, defaultFor = []) {
  const vendor = normalizeVendorKind(provider.kind);
  const cleanModel = cleanText(model);
  if (!cleanModel) return;

  const providerKey = cleanText(provider.id || provider.name || vendor, vendor);
  const key = `${providerKey}:${vendor}:${cleanModel}`;
  const existing = entriesByKey.get(key);
  const capabilities =
    capability === "chat"
      ? chatCapabilities(vendor, provider.capabilities || [])
      : capability === "tts" || capability === "stt"
        ? [capability, "audio"]
        : [capability];

  if (existing) {
    existing.capabilities = [...new Set([...existing.capabilities, ...capabilities])];
    existing.defaultFor = [...new Set([...existing.defaultFor, ...defaultFor])];
    return;
  }

  const providerName = cleanText(provider.name, vendorLabel(vendor));
  entriesByKey.set(key, {
    id: `${slug(providerKey)}-${slug(cleanModel) || crypto.randomUUID()}`,
    vendor,
    model: cleanModel,
    label: `${providerName} / ${cleanModel}`,
    capabilities,
    defaultFor,
    enabled: provider.enabled !== false
  });
}

export function catalogFromLegacyProviders(providers = []) {
  const entriesByKey = new Map();

  (Array.isArray(providers) ? providers : []).forEach((provider) => {
    const models = provider?.models && typeof provider.models === "object" ? provider.models : {};
    const defaultModel = cleanText(models.chat || provider?.defaultModel);
    const chatModels = [
      defaultModel,
      ...(Array.isArray(provider?.modelOptions) ? provider.modelOptions : [])
    ].filter(Boolean);

    [...new Set(chatModels)].forEach((model, index) => {
      addLegacyEntry(entriesByKey, provider, "chat", model, index === 0 ? ["chat"] : []);
    });

    addLegacyEntry(entriesByKey, provider, "vision", models.vision, []);
    addLegacyEntry(entriesByKey, provider, "image", models.image, ["image"]);
    addLegacyEntry(entriesByKey, provider, "tts", models.tts, ["tts"]);
    addLegacyEntry(entriesByKey, provider, "stt", models.stt, ["stt"]);
    addLegacyEntry(entriesByKey, provider, "embedding", models.embedding, ["embedding"]);
    addLegacyEntry(entriesByKey, provider, "video", models.video, ["video"]);
  });

  return normalizeModelCatalog([...defaultModelCatalog(), ...entriesByKey.values()], defaultModelCatalog());
}

export function publicModelCatalog(catalog = []) {
  return normalizeModelCatalog(catalog, []).filter((entry) => entry.enabled);
}

export function findModelEntry(catalog, modelId) {
  const id = cleanText(modelId);
  return normalizeModelCatalog(catalog, []).find((entry) => entry.id === id || entry.model === id);
}

export function buildRuntimeProvider(entry, connection) {
  return {
    id: entry.id,
    name: entry.label,
    kind: entry.vendor,
    baseUrl: cleanText(connection.baseUrl).replace(/\/+$/, ""),
    apiKey: cleanText(connection.apiKey),
    defaultModel: entry.model,
    models: { chat: entry.model },
    capabilities: entry.capabilities,
    enabled: entry.enabled,
    mediaConfig: entry.mediaConfig,
    transient: true
  };
}
