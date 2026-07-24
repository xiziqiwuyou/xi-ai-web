import type { UserProviderConfig } from "../../types";

const storageKey = "cherry-web-user-provider";

export const connectionPresets = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", label: "Claude", baseUrl: "https://api.anthropic.com/v1" },
  { id: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "botcf", label: "BotCF", baseUrl: "https://botcf.com/v1" },
  { id: "compatible", label: "兼容接口", baseUrl: "https://api.openai.com/v1" }
];

export const defaultUserProviderConfig: UserProviderConfig = {
  baseUrl: connectionPresets[0].baseUrl,
  apiKey: "",
  lastModelId: ""
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function sanitizeUserProviderConfig(value: unknown): UserProviderConfig {
  const source = value && typeof value === "object" ? (value as Partial<UserProviderConfig>) : {};
  return {
    baseUrl: cleanText(source.baseUrl, defaultUserProviderConfig.baseUrl),
    apiKey: cleanText(source.apiKey),
    lastModelId: cleanText(source.lastModelId, cleanText((source as { model?: unknown }).model))
  };
}

export function isUserProviderReady(provider: UserProviderConfig) {
  return Boolean(/^https?:\/\//i.test(provider.baseUrl.trim()) && provider.apiKey.trim());
}

export function userConnectionPayload(provider: UserProviderConfig) {
  const sanitized = sanitizeUserProviderConfig(provider);
  return {
    baseUrl: sanitized.baseUrl,
    apiKey: sanitized.apiKey
  };
}

export function loadUserProviderConfig() {
  if (typeof window === "undefined") return defaultUserProviderConfig;

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? sanitizeUserProviderConfig(JSON.parse(raw)) : defaultUserProviderConfig;
  } catch {
    return defaultUserProviderConfig;
  }
}

export function saveUserProviderConfig(provider: UserProviderConfig) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(sanitizeUserProviderConfig(provider)));
  } catch {
    // Some browsers disable sessionStorage. In that case the in-memory state still works.
  }
}
