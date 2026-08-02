import type { ModelCapability, ModelCatalogEntry } from "../../types";

export const vendorLabels: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  kimi: "Kimi",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  botcf: "BotCF",
  "openai-compatible": "Compatible"
};

export function compactModelLabel(entry?: ModelCatalogEntry) {
  if (!entry) return "";
  const label = entry.label || entry.model;
  const vendorLabel =
    entry.vendorLabel || (entry.vendor === "openai-compatible" ? "OpenAI Compatible" : vendorLabels[entry.vendor]);
  const legacyPrefix = `${vendorLabel} / `;
  return label.startsWith(legacyPrefix) ? label.slice(legacyPrefix.length) : label;
}

export function modelOptionLabel(entry: ModelCatalogEntry) {
  return `${entry.vendorLabel || vendorLabels[entry.vendor] || entry.vendor} · ${compactModelLabel(entry)}`;
}

export function supportsCapability(entry: ModelCatalogEntry, capability: ModelCapability) {
  if (capability === "tts") {
    return entry.capabilities.includes("tts") || entry.capabilities.includes("audio");
  }
  return entry.capabilities.includes(capability);
}

export function sortModelsByOrder(entries: ModelCatalogEntry[]) {
  return entries
    .map((entry, sourceIndex) => ({ entry, sourceIndex }))
    .sort((left, right) => {
      const leftOrder = Number.isFinite(left.entry.order) ? left.entry.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.entry.order) ? right.entry.order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.sourceIndex - right.sourceIndex;
    })
    .map(({ entry }) => entry);
}

export function modelsForCapability(entries: ModelCatalogEntry[], capability: ModelCapability) {
  return sortModelsByOrder(entries).filter((entry) => entry.enabled && supportsCapability(entry, capability));
}

export function findModelByRef(entries: ModelCatalogEntry[], ref?: string) {
  const value = (ref || "").trim();
  if (!value) return undefined;
  return entries.find((entry) => entry.id === value || entry.model === value);
}

export function preferredModelFor(
  entries: ModelCatalogEntry[],
  capability: ModelCapability,
  preferredRef?: string
) {
  const availableModels = modelsForCapability(entries, capability);
  return findModelByRef(availableModels, preferredRef) || availableModels[0];
}
