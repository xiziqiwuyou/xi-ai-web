import type { UserProviderConfig } from "../../types";

const storageKey = "cherry-web-user-provider";
const maxShellJwtChars = 8_192;

export type ShellJwtHandoff = {
  present: boolean;
  token: string;
  error: string;
};

export const emptyShellJwtHandoff: ShellJwtHandoff = {
  present: false,
  token: "",
  error: ""
};

export const connectionPresets = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "botcf", label: "BotCF" },
  { id: "compatible", label: "兼容接口" }
];

export const defaultUserProviderConfig: UserProviderConfig = {
  apiKey: "",
  lastModelId: ""
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function parseShellJwtHandoff(hash: string): ShellJwtHandoff {
  const fragment = String(hash || "").replace(/^#/u, "");
  const queryIndex = fragment.indexOf("?");
  const route = (queryIndex >= 0 ? fragment.slice(0, queryIndex) : fragment).replace(/\/+$/u, "") || "/";
  if (route !== "/jwt_auth") return emptyShellJwtHandoff;

  const query = queryIndex >= 0 ? fragment.slice(queryIndex + 1) : "";
  const token = cleanText(new URLSearchParams(query).get("x_s_token"));
  const valid = token.length >= 16
    && token.length <= maxShellJwtChars
    && !/[\u0000-\u001f\u007f]/u.test(token);
  return valid
    ? { present: true, token, error: "" }
    : {
        present: true,
        token: "",
        error: "外部登录令牌无效，请手动填写 API Key"
      };
}

export function clearShellJwtHandoffUrl(
  location: Pick<Location, "pathname" | "search">,
  history: Pick<History, "replaceState" | "state">
) {
  history.replaceState(history.state, "", `${location.pathname || "/"}${location.search || ""}`);
}

export function sanitizeUserProviderConfig(value: unknown): UserProviderConfig {
  const source = value && typeof value === "object" ? (value as Partial<UserProviderConfig>) : {};
  return {
    apiKey: cleanText(source.apiKey),
    lastModelId: cleanText(source.lastModelId, cleanText((source as { model?: unknown }).model))
  };
}

export function isUserProviderReady(provider: UserProviderConfig) {
  return Boolean(provider.apiKey.trim());
}

export function maskUserProviderKey(value: string) {
  const apiKey = value.trim();
  if (!apiKey) return "未配置";
  if (apiKey.length < 4) return "••••";
  return `••••${apiKey.slice(-4)}`;
}

export function userConnectionPayload(provider: UserProviderConfig) {
  const sanitized = sanitizeUserProviderConfig(provider);
  return {
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
