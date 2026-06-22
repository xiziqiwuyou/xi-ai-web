import type { ModelCapability, ModelCatalogEntry, ModelDefaultFor } from "../../types";

export const vendorLabels: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  "openai-compatible": "Compatible"
};

export function compactModelLabel(entry?: ModelCatalogEntry) {
  if (!entry) return "";
  const label = entry.label || entry.model;
  const vendorLabel =
    entry.vendor === "openai-compatible" ? "OpenAI Compatible" : vendorLabels[entry.vendor];
  const legacyPrefix = `${vendorLabel} / `;
  return label.startsWith(legacyPrefix) ? label.slice(legacyPrefix.length) : label;
}

export function modelOptionLabel(entry: ModelCatalogEntry) {
  return `${vendorLabels[entry.vendor] || entry.vendor} · ${compactModelLabel(entry)}`;
}

export function supportsCapability(entry: ModelCatalogEntry, capability: ModelCapability) {
  if (capability === "tts") {
    return entry.capabilities.includes("tts") || entry.capabilities.includes("audio");
  }
  return entry.capabilities.includes(capability);
}

export function modelsForCapability(entries: ModelCatalogEntry[], capability: ModelCapability) {
  return entries.filter((entry) => entry.enabled && supportsCapability(entry, capability));
}

export function findModelByRef(entries: ModelCatalogEntry[], ref?: string) {
  const value = (ref || "").trim();
  if (!value) return undefined;
  return entries.find((entry) => entry.id === value || entry.model === value);
}

export function isDefaultFor(entry: ModelCatalogEntry, capability: ModelCapability) {
  return entry.defaultFor.includes(capability as ModelDefaultFor);
}

export function preferredModelFor(
  entries: ModelCatalogEntry[],
  capability: ModelCapability,
  preferredRef?: string
) {
  return (
    findModelByRef(entries, preferredRef) ||
    entries.find((entry) => isDefaultFor(entry, capability)) ||
    entries[0]
  );
}
