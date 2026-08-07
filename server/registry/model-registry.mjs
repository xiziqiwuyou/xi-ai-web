import crypto from "node:crypto";
import { normalizeEndpointProtocol } from "../providers/types.mjs";

export const vendorKinds = [
  "openai",
  "anthropic",
  "gemini",
  "kimi",
  "deepseek",
  "qwen",
  "botcf",
  "openai-compatible"
];

export const modelCapabilities = [
  "chat",
  "vision",
  "image",
  "imageEdit",
  "tts",
  "stt",
  "audio",
  "video",
  "embedding",
  "fileSearch",
  "toolCalling",
  "webSearch",
  "urlContext",
  "codeExecution"
];

export const defaultForCapabilities = ["chat", "image", "tts", "stt", "video", "embedding"];

const vendorLabels = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  kimi: "Kimi",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  botcf: "BotCF",
  "openai-compatible": "OpenAI Compatible"
};

const defaultVendors = vendorKinds.map((adapter, order) => ({
  id: adapter,
  label: vendorLabels[adapter],
  adapter,
  enabled: true,
  order
}));

const defaultContextWindowTokens = 128_000;
const defaultMaxInputCharacters = 100_000;
const defaultMaxOutputTokens = 16_384;

function inferredContextWindowTokens(vendor, model) {
  const normalized = String(model || "").toLowerCase();
  if (/^gpt-4\.1(?:-|$)/.test(normalized)) return 1_047_576;
  if (/^gemini-(?:2\.5|3)/.test(normalized)) return 1_048_576;
  if (vendor === "anthropic") return 200_000;
  if (vendor === "kimi") return 262_144;
  if (vendor === "qwen") return 1_000_000;
  return defaultContextWindowTokens;
}

function cleanContextWindowTokens(value, vendor, model) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.max(4_096, Math.min(2_000_000, Math.trunc(parsed)));
  return inferredContextWindowTokens(vendor, model);
}

function cleanMaxInputCharacters(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.max(1_000, Math.min(2_000_000, Math.trunc(parsed)));
  return defaultMaxInputCharacters;
}

function inferredMaxOutputTokens(vendor, model) {
  const normalized = String(model || "").toLowerCase();
  if (vendor === "anthropic") {
    if (/haiku-4-5(?:-|$)/.test(normalized)) return 64_000;
    if (/(?:fable-5|sonnet-5|opus-4-[678]|sonnet-4-6)(?:-|$)/.test(normalized)) return 128_000;
  }
  return defaultMaxOutputTokens;
}

function cleanMaxOutputTokens(value, vendor, model) {
  if (value === undefined || value === null || value === "") return inferredMaxOutputTokens(vendor, model);
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.max(1, Math.min(1_048_576, Math.trunc(parsed)));
  return inferredMaxOutputTokens(vendor, model);
}

const defaultCatalog = [
  {
    id: "openai-gpt-5-6-sol",
    vendor: "openai",
    model: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-5-6-terra",
    vendor: "openai",
    model: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-5-6-luna",
    vendor: "openai",
    model: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-5-4-mini",
    vendor: "openai",
    model: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    capabilities: ["chat"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-4-1-mini",
    vendor: "openai",
    model: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-image-2",
    vendor: "openai",
    model: "gpt-image-2",
    label: "GPT Image 2",
    capabilities: ["image", "imageEdit"],
    defaultFor: ["image"],
    enabled: true
  },
  {
    id: "openai-gpt-image-2-vip",
    vendor: "openai",
    model: "gpt-image-2-vip",
    label: "GPT Image 2 VIP",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-image-1-5",
    vendor: "openai",
    model: "gpt-image-1.5",
    label: "GPT Image 1.5",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-image-1",
    vendor: "openai",
    model: "gpt-image-1",
    label: "GPT Image 1",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "openai-gpt-image-1-mini",
    vendor: "openai",
    model: "gpt-image-1-mini",
    label: "GPT Image 1 Mini",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-gpt-image-2",
    vendor: "botcf",
    model: "gpt-image-2",
    label: "BotCF Image2",
    capabilities: ["image", "imageEdit"],
    defaultFor: ["image"],
    enabled: true
  },
  {
    id: "botcf-gpt-image-2-2k",
    vendor: "botcf",
    model: "gpt-image-2-2k",
    label: "BotCF Image2 2K",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-gpt-image-2-4k",
    vendor: "botcf",
    model: "gpt-image-2-4k",
    label: "BotCF Image2 4K",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-grok-imagine-image",
    vendor: "botcf",
    model: "grok-imagine-image",
    label: "BotCF Grok Imagine",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-grok-imagine-image-quality",
    vendor: "botcf",
    model: "grok-imagine-image-quality",
    label: "BotCF Grok Imagine Quality",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-gemini-3-1-flash-image",
    vendor: "botcf",
    model: "gemini-3.1-flash-image",
    label: "BotCF Gemini 3.1 Flash Image",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-gemini-3-pro-image",
    vendor: "botcf",
    model: "gemini-3-pro-image",
    label: "BotCF Gemini 3 Pro Image",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-nana-banana-2-sync",
    vendor: "botcf",
    model: "nana-banana-2_sync",
    label: "BotCF Nana Banana 2",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-nana-banana-pro-sync",
    vendor: "botcf",
    model: "nana-banana-pro_sync",
    label: "BotCF Nana Banana Pro",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "botcf-nana-banana-2-4k-sync",
    vendor: "botcf",
    model: "nana-banana-2-4k_sync",
    label: "BotCF Nana Banana 2 4K",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
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
    id: "openai-text-embedding-3-large",
    vendor: "openai",
    model: "text-embedding-3-large",
    label: "Text Embedding 3 Large",
    capabilities: ["embedding"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "claude-fable-5",
    vendor: "anthropic",
    model: "claude-fable-5",
    label: "Claude Fable 5",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "claude-sonnet-5",
    vendor: "anthropic",
    model: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "claude-opus-4-8",
    vendor: "anthropic",
    model: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "claude-opus-4-7",
    vendor: "anthropic",
    model: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "claude-sonnet-4-6",
    vendor: "anthropic",
    model: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "claude-haiku-4-5",
    vendor: "anthropic",
    model: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-3-5-flash",
    vendor: "gemini",
    model: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-3-1-pro-preview",
    vendor: "gemini",
    model: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-2-5-pro",
    vendor: "gemini",
    model: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-2-5-flash",
    vendor: "gemini",
    model: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-3-1-flash-image",
    vendor: "gemini",
    model: "gemini-3.1-flash-image",
    label: "Gemini 3.1 Flash Image",
    capabilities: ["image", "imageEdit", "vision"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-nano-banana-2",
    vendor: "gemini",
    model: "gemini-3.1-flash-image",
    label: "Nano Banana 2",
    capabilities: ["image", "imageEdit", "vision"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-3-pro-image",
    vendor: "gemini",
    model: "gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    capabilities: ["image", "imageEdit", "vision"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "gemini-2-5-flash-image",
    vendor: "gemini",
    model: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    capabilities: ["image", "imageEdit", "vision"],
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
    id: "gemini-embedding-2",
    vendor: "gemini",
    model: "gemini-embedding-2",
    label: "Gemini Embedding 2",
    capabilities: ["embedding"],
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
    id: "kimi-k3",
    vendor: "kimi",
    model: "kimi-k3",
    label: "Kimi K3",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "kimi-k2-7-code",
    vendor: "kimi",
    model: "kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    capabilities: ["chat", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "kimi-k2-7-code-highspeed",
    vendor: "kimi",
    model: "kimi-k2.7-code-highspeed",
    label: "Kimi K2.7 Code Highspeed",
    capabilities: ["chat", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "kimi-k2-6",
    vendor: "kimi",
    model: "kimi-k2.6",
    label: "Kimi K2.6",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "deepseek-v4-flash",
    vendor: "deepseek",
    model: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    endpointProtocol: "openai-responses",
    capabilities: ["chat", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "deepseek-v4-pro",
    vendor: "deepseek",
    model: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    capabilities: ["chat", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "qwen3-7-max",
    vendor: "qwen",
    model: "qwen3.7-max",
    label: "Qwen 3.7 Max",
    capabilities: ["chat", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "qwen3-7-plus",
    vendor: "qwen",
    model: "qwen3.7-plus",
    label: "Qwen 3.7 Plus",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "qwen3-6-flash",
    vendor: "qwen",
    model: "qwen3.6-flash",
    label: "Qwen 3.6 Flash",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "qwen3-coder-plus",
    vendor: "qwen",
    model: "qwen3-coder-plus",
    label: "Qwen 3 Coder Plus",
    capabilities: ["chat", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "qwen3-5-omni-plus",
    vendor: "qwen",
    model: "qwen3.5-omni-plus",
    label: "Qwen 3.5 Omni Plus",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: [],
    enabled: true
  },
  {
    id: "qwen-text-embedding-v4",
    vendor: "qwen",
    model: "text-embedding-v4",
    label: "Qwen Text Embedding V4",
    capabilities: ["embedding"],
    defaultFor: [],
    enabled: true
  },
];

export function normalizeVendorKind(value) {
  return vendorKinds.includes(value) ? value : "openai-compatible";
}

export function vendorLabel(vendor) {
  return vendorLabels[normalizeVendorKind(vendor)] || vendorLabels["openai-compatible"];
}

function shippedHostedCapabilities(entry) {
  if (!entry.capabilities.includes("chat")) return [];
  if (entry.vendor === "openai") return ["webSearch", "codeExecution"];
  if (entry.vendor === "anthropic") {
    return /(?:fable-5|sonnet-5|opus-4-[678]|sonnet-4-6)/i.test(entry.model)
      ? ["webSearch", "urlContext", "codeExecution"]
      : [];
  }
  if (entry.vendor === "gemini") return ["webSearch", "urlContext", "codeExecution"];
  if (entry.vendor === "qwen") {
    if (/^qwen3[.-]6-flash/i.test(entry.model)) return ["webSearch", "codeExecution"];
    if (/^qwen3[.-]7-max/i.test(entry.model)) return ["webSearch"];
  }
  return [];
}

function withShippedHostedCapabilities(entry) {
  return {
    ...entry,
    capabilities: [...new Set([...entry.capabilities, ...shippedHostedCapabilities(entry)])]
  };
}

export function defaultModelCatalog() {
  return defaultCatalog.map((entry, order) => {
    const next = withShippedHostedCapabilities(entry);
    return {
      ...next,
      vendorId: entry.vendor,
      vendorLabel: vendorLabel(entry.vendor),
      endpointProtocol: normalizeEndpointProtocol(entry.endpointProtocol, entry.vendor),
      order: cleanModelOrder(entry.order, order),
      contextWindowTokens: cleanContextWindowTokens(entry.contextWindowTokens, entry.vendor, entry.model),
      maxOutputTokens: cleanMaxOutputTokens(entry.maxOutputTokens, entry.vendor, entry.model),
      maxInputCharacters: cleanMaxInputCharacters(entry.maxInputCharacters),
      capabilities: uniqueValues(next.capabilities, modelCapabilities),
      defaultFor: [...entry.defaultFor]
    };
  });
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

function cleanVendorId(value, fallback = "") {
  return slug(cleanText(value, fallback)).slice(0, 64);
}

function cleanVendorOrder(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(10_000, Math.trunc(parsed))) : fallback;
}

function cleanModelOrder(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100_000, Math.trunc(parsed))) : fallback;
}

export function defaultModelVendors() {
  return defaultVendors.map((entry) => ({ ...entry }));
}

export function normalizeModelVendorEntry(entry, fallback = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const fallbackSource = fallback && typeof fallback === "object" ? fallback : {};
  const adapter = normalizeVendorKind(source.adapter ?? fallbackSource.adapter);
  const label = cleanText(
    source.label ?? source.name ?? fallbackSource.label,
    vendorLabel(adapter)
  ).slice(0, 80);
  const id = cleanVendorId(
    source.id ?? fallbackSource.id,
    adapter
  ) || adapter;
  return {
    id,
    label: label || vendorLabel(adapter),
    adapter,
    enabled: typeof source.enabled === "boolean"
      ? source.enabled
      : fallbackSource.enabled !== false,
    order: cleanVendorOrder(source.order, cleanVendorOrder(fallbackSource.order))
  };
}

export function normalizeModelVendors(value, fallback = defaultModelVendors()) {
  const entries = Array.isArray(value) ? value : [];
  const source = entries.length ? entries : fallback;
  const seenIds = new Set();
  return source.map((entry, order) => {
    const normalized = normalizeModelVendorEntry(entry, { order });
    let id = normalized.id;
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${normalized.id.slice(0, 58)}-${suffix}`;
      suffix += 1;
    }
    seenIds.add(id);
    return { ...normalized, id };
  }).sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
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
    order: Math.min(cleanModelOrder(existing.order), cleanModelOrder(next.order)),
    label: existing.label || next.label,
    capabilities: capabilities.length ? capabilities : ["chat"],
    defaultFor,
    enabled: Boolean(existing.enabled || next.enabled)
  };
}

function deriveId(entry) {
  const vendor = normalizeVendorKind(entry.vendor);
  const vendorId = cleanVendorId(entry.vendorId, vendor) || vendor;
  const model = slug(entry.model || entry.label);
  return model ? `${vendorId}-${model}`.slice(0, 140) : crypto.randomUUID();
}

export function normalizeCatalogEntry(entry, fallback = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const vendor = normalizeVendorKind(source.vendor ?? source.kind ?? fallback.vendor);
  const vendorId = cleanVendorId(source.vendorId ?? fallback.vendorId, vendor) || vendor;
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
    id: cleanText(source.id ?? fallback.id, "") || deriveId({ vendorId, vendor, model, label }),
    vendorId,
    vendor,
    vendorLabel: vendorLabel(vendor),
    endpointProtocol: normalizeEndpointProtocol(
      source.endpointProtocol ?? fallback.endpointProtocol,
      vendor
    ),
    order: cleanModelOrder(source.order, cleanModelOrder(fallback.order)),
    model,
    label,
    capabilities: capabilities.length ? capabilities : ["chat"],
    defaultFor,
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled ?? true,
    contextWindowTokens: cleanContextWindowTokens(
      source.contextWindowTokens ?? fallback.contextWindowTokens,
      vendor,
      model
    ),
    maxOutputTokens: cleanMaxOutputTokens(
      source.maxOutputTokens ?? fallback.maxOutputTokens,
      vendor,
      model
    ),
    maxInputCharacters: cleanMaxInputCharacters(
      source.maxInputCharacters ?? fallback.maxInputCharacters
    ),
    mediaConfig: cleanMediaConfig(source.mediaConfig ?? fallback.mediaConfig)
  };
}

export function normalizeModelCatalog(value, fallback = defaultModelCatalog(), modelVendors = []) {
  const entries = Array.isArray(value) && value.length
    ? value
    : Array.isArray(fallback)
      ? fallback
      : [];
  const vendorsById = new Map(
    normalizeModelVendors(modelVendors, []).map((vendor) => [vendor.id, vendor])
  );
  const seenIds = new Set();
  const seenModels = new Map();
  const normalized = entries
    .map((entry, order) => {
      const normalizedEntry = normalizeCatalogEntry(entry, { order });
      const vendor = vendorsById.get(normalizedEntry.vendorId);
      return vendor
        ? normalizeCatalogEntry({ ...normalizedEntry, vendor: vendor.adapter }, normalizedEntry)
        : normalizedEntry;
    })
    .filter((entry) => entry.model)
    .map((entry) => {
      let id = entry.id;
      let suffix = seenIds.size + 1;
      while (seenIds.has(id)) {
        id = `${entry.id}-${suffix}`;
        suffix += 1;
      }
      seenIds.add(id);
      return { ...entry, id };
    });

  const deduped = [];
  for (const entry of normalized) {
    const key = `${entry.vendorId}:${entry.model}`;
    const existingIndex = seenModels.get(key);
    if (typeof existingIndex === "number") {
      deduped[existingIndex] = mergeEntries(deduped[existingIndex], entry);
      continue;
    }
    seenModels.set(key, deduped.length);
    deduped.push(entry);
  }

  return deduped
    .sort((left, right) => left.order - right.order)
    .map((entry, order) => ({ ...entry, order }));
}

function inferredVendorEntry(entry, order) {
  const normalizedEntry = normalizeCatalogEntry(entry);
  const isDefaultVendor = normalizedEntry.vendorId === normalizedEntry.vendor;
  return normalizeModelVendorEntry({
    id: normalizedEntry.vendorId,
    label: isDefaultVendor
      ? vendorLabel(normalizedEntry.vendor)
      : `${vendorLabel(normalizedEntry.vendor)} (${normalizedEntry.vendorId})`,
    adapter: normalizedEntry.vendor,
    enabled: true,
    order
  });
}

export function reconcileModelRegistry(modelVendors, modelCatalog, fallbackCatalog = defaultModelCatalog()) {
  const vendors = normalizeModelVendors(modelVendors, defaultModelVendors());
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const sourceCatalog = Array.isArray(modelCatalog) ? modelCatalog : fallbackCatalog;

  for (const sourceEntry of sourceCatalog) {
    const normalizedEntry = normalizeCatalogEntry(sourceEntry);
    if (vendorsById.has(normalizedEntry.vendorId)) continue;
    const inferred = inferredVendorEntry(normalizedEntry, vendors.length);
    vendors.push(inferred);
    vendorsById.set(inferred.id, inferred);
  }

  const normalizedCatalog = normalizeModelCatalog(
    sourceCatalog,
    sourceCatalog.length ? fallbackCatalog : [],
    vendors
  ).map((entry) => {
    const vendor = vendorsById.get(entry.vendorId);
    return vendor
      ? { ...entry, vendor: vendor.adapter, vendorLabel: vendor.label }
      : entry;
  });

  return {
    modelVendors: vendors.sort((left, right) => left.order - right.order || left.label.localeCompare(right.label)),
    modelCatalog: normalizedCatalog
  };
}

function chatCapabilities(vendor, providerCapabilities = []) {
  const base = ["chat"];
  ["vision", "toolCalling", "webSearch", "urlContext", "codeExecution"].forEach((capability) => {
    if (providerCapabilities.includes(capability)) base.push(capability);
  });
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
      : capability === "image" && ["openai", "gemini", "botcf"].includes(vendor)
        ? ["image", "imageEdit"]
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
    vendorId: vendor,
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

export function publicModelCatalog(catalog = [], modelVendors = []) {
  return reconcileModelRegistry(modelVendors, catalog, [])
    .modelCatalog
    .filter((entry) => entry.enabled);
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
    endpointProtocol: normalizeEndpointProtocol(entry.endpointProtocol, entry.vendor),
    baseUrl: cleanText(connection.baseUrl).replace(/\/+$/, ""),
    apiKey: cleanText(connection.apiKey),
    defaultModel: entry.model,
    models: { chat: entry.model },
    capabilities: entry.capabilities,
    enabled: entry.enabled,
    maxOutputTokens: entry.maxOutputTokens,
    mediaConfig: entry.mediaConfig,
    transient: true
  };
}
