import type {
  AdminBootstrapPayload,
  ModelCatalogEntry,
  ModelVendorEntry,
  ProviderKind
} from "./types";

const providerKinds = new Set<ProviderKind>([
  "openai",
  "anthropic",
  "gemini",
  "kimi",
  "deepseek",
  "qwen",
  "botcf",
  "openai-compatible"
]);

const providerLabels: Record<ProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  kimi: "Kimi",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  botcf: "BotCF",
  "openai-compatible": "OpenAI Compatible"
};

function providerKind(value: unknown): ProviderKind {
  return providerKinds.has(value as ProviderKind)
    ? value as ProviderKind
    : "openai-compatible";
}

function normalizedCatalogEntry(
  entry: ModelCatalogEntry,
  declaredVendors: ModelVendorEntry[],
  fallbackOrder: number
): ModelCatalogEntry {
  const adapter = providerKind(entry.vendor);
  const requestedVendorId = typeof entry.vendorId === "string" ? entry.vendorId.trim() : "";
  const declaredVendor = declaredVendors.find((vendor) => vendor.id === requestedVendorId)
    || declaredVendors.find((vendor) => vendor.id === adapter)
    || declaredVendors.find((vendor) => vendor.adapter === adapter);
  const vendorId = requestedVendorId || declaredVendor?.id || adapter;
  const vendorLabel = typeof entry.vendorLabel === "string" && entry.vendorLabel.trim()
    ? entry.vendorLabel.trim()
    : declaredVendor?.label || providerLabels[adapter];

  return {
    ...entry,
    order: Number.isFinite(entry.order) ? Math.max(0, Math.trunc(entry.order)) : fallbackOrder,
    vendorId,
    vendor: adapter,
    vendorLabel
  };
}

function normalizedModelVendors(
  declaredVendors: ModelVendorEntry[],
  modelCatalog: ModelCatalogEntry[]
): ModelVendorEntry[] {
  const vendors = declaredVendors.map((vendor, index) => ({
    ...vendor,
    adapter: providerKind(vendor.adapter),
    enabled: typeof vendor.enabled === "boolean" ? vendor.enabled : true,
    order: Number.isFinite(vendor.order) ? vendor.order : index
  }));
  const knownIds = new Set(vendors.map((vendor) => vendor.id));

  for (const entry of modelCatalog) {
    if (knownIds.has(entry.vendorId)) continue;
    vendors.push({
      id: entry.vendorId,
      label: entry.vendorLabel || providerLabels[entry.vendor],
      adapter: entry.vendor,
      enabled: true,
      order: vendors.length
    });
    knownIds.add(entry.vendorId);
  }

  if (!vendors.length) {
    vendors.push({
      id: "openai-compatible",
      label: providerLabels["openai-compatible"],
      adapter: "openai-compatible",
      enabled: true,
      order: 0
    });
  }

  return vendors;
}

export function normalizeAdminBootstrapPayload<T extends Partial<AdminBootstrapPayload>>(
  payload: T
): AdminBootstrapPayload & T {
  const declaredVendors = Array.isArray(payload.modelVendors) ? payload.modelVendors : [];
  const modelCatalog = (Array.isArray(payload.modelCatalog) ? payload.modelCatalog : [])
    .map((entry, order) => normalizedCatalogEntry(entry, declaredVendors, order))
    .sort((left, right) => left.order - right.order)
    .map((entry, order) => ({ ...entry, order }));

  return {
    ...payload,
    menuItems: Array.isArray(payload.menuItems) ? payload.menuItems : [],
    modelVendors: normalizedModelVendors(declaredVendors, modelCatalog),
    modelCatalog,
    assistants: Array.isArray(payload.assistants) ? payload.assistants : [],
    appPresets: Array.isArray(payload.appPresets) ? payload.appPresets : [],
    promptPresets: Array.isArray(payload.promptPresets) ? payload.promptPresets : [],
    langflowWorkflows: Array.isArray(payload.langflowWorkflows) ? payload.langflowWorkflows : [],
    toolSettings: Array.isArray(payload.toolSettings) ? payload.toolSettings : []
  } as AdminBootstrapPayload & T;
}
