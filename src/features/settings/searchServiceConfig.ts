import type {
  SearchEngine,
  SearchProviderKind,
  SearchServiceConfig,
  UserProviderConfig
} from "../../types";

const storageKey = "xi-ai-web-search-service";

const searchEngines: SearchEngine[] = [
  "search_std",
  "search_pro",
  "search_pro_sogou",
  "search_pro_quark"
];

export const searchServicePresets: Record<
  SearchProviderKind,
  Pick<SearchServiceConfig, "provider" | "model" | "searchEngine" | "count" | "contentSize">
> = {
  glm: {
    provider: "glm",
    model: "",
    searchEngine: "search_std",
    count: 8,
    contentSize: "medium"
  },
  kimi: {
    provider: "kimi",
    model: "kimi-k3",
    searchEngine: "search_std",
    count: 8,
    contentSize: "medium"
  }
};

export const defaultSearchServiceConfig: SearchServiceConfig = {
  ...searchServicePresets.glm,
  apiKey: ""
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function sanitizeSearchServiceConfig(value: unknown): SearchServiceConfig {
  const source = value && typeof value === "object" ? (value as Partial<SearchServiceConfig>) : {};
  const provider: SearchProviderKind = source.provider === "kimi" ? "kimi" : "glm";
  const preset = searchServicePresets[provider];
  const parsedCount = Number(source.count);
  return {
    provider,
    apiKey: cleanText(source.apiKey),
    model: cleanText(source.model, preset.model),
    searchEngine: searchEngines.includes(source.searchEngine as SearchEngine)
      ? (source.searchEngine as SearchEngine)
      : preset.searchEngine,
    count: Number.isFinite(parsedCount) ? Math.max(1, Math.min(20, Math.trunc(parsedCount))) : preset.count,
    contentSize: source.contentSize === "high" ? "high" : "medium"
  };
}

export function isSearchServiceReady(value: SearchServiceConfig) {
  const config = sanitizeSearchServiceConfig(value);
  return Boolean(
    config.apiKey &&
      (config.provider !== "kimi" || config.model)
  );
}

export function searchServicePayload(value: SearchServiceConfig) {
  return isSearchServiceReady(value) ? sanitizeSearchServiceConfig(value) : undefined;
}

export function searchServiceForUserProvider(
  provider: SearchProviderKind,
  connection: UserProviderConfig
) {
  return searchServicePayload({
    ...searchServicePresets[provider],
    apiKey: connection.apiKey
  });
}

export function loadSearchServiceConfig() {
  if (typeof window === "undefined") return defaultSearchServiceConfig;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? sanitizeSearchServiceConfig(JSON.parse(raw)) : defaultSearchServiceConfig;
  } catch {
    return defaultSearchServiceConfig;
  }
}

export function saveSearchServiceConfig(value: SearchServiceConfig) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(sanitizeSearchServiceConfig(value)));
  } catch {
    // The in-memory config remains usable when sessionStorage is unavailable.
  }
}

export const searchServiceStorageKey = storageKey;
