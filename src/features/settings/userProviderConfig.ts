import type { UserProviderConfig } from "../../types";

const storageKey = "cherry-web-user-provider";
const maxShellJwtChars = 8_192;
const shellJwtRoutePrefix = "/jwt_auth?";
const repeatedShellJwtRoute = "/#/jwt_auth?";
const shellJwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const maxOneApiSettingsChars = 12_288;
const maxOneApiApiKeyChars = 4_096;
const maxOneApiUrlChars = 2_048;

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

function invalidShellJwtHandoff(): ShellJwtHandoff {
  return {
    present: true,
    token: "",
    error: "外部登录令牌无效，请手动填写 API Key"
  };
}

export type OneApiSettingsHandoffErrorCode =
  | ""
  | "ONEAPI_SETTINGS_MISSING"
  | "ONEAPI_SETTINGS_TOO_LARGE"
  | "ONEAPI_SETTINGS_INVALID"
  | "ONEAPI_KEY_MISSING"
  | "ONEAPI_KEY_TOO_LARGE"
  | "ONEAPI_KEY_INVALID"
  | "ONEAPI_URL_INVALID";

export type OneApiSettingsHandoff = {
  present: boolean;
  apiKey: string;
  error: string;
  code: OneApiSettingsHandoffErrorCode;
};

export const emptyOneApiSettingsHandoff: OneApiSettingsHandoff = {
  present: false,
  apiKey: "",
  error: "",
  code: ""
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

function invalidOneApiSettingsHandoff(
  code: Exclude<OneApiSettingsHandoffErrorCode, "">,
  error: string
): OneApiSettingsHandoff {
  return { present: true, apiKey: "", error, code };
}

function oneApiSettingsValue(query: string) {
  const prefix = "settings=";
  if (query.startsWith(prefix)) return query.slice(prefix.length);
  const params = new URLSearchParams(query);
  return params.has("settings") ? params.get("settings") : null;
}

function validIgnoredOneApiUrl(value: unknown) {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text || text.length > maxOneApiUrlChars) return false;
  try {
    const parsed = new URL(text);
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

export function parseOneApiSettingsHandoff(hash: string): OneApiSettingsHandoff {
  const fragment = String(hash || "").replace(/^#/u, "");
  const queryIndex = fragment.indexOf("?");
  const route = (queryIndex >= 0 ? fragment.slice(0, queryIndex) : fragment).replace(/\/+$/u, "") || "/";
  if (route !== "/" || queryIndex < 0) return emptyOneApiSettingsHandoff;

  const rawSettings = oneApiSettingsValue(fragment.slice(queryIndex + 1));
  if (rawSettings === null) {
    return invalidOneApiSettingsHandoff("ONEAPI_SETTINGS_MISSING", "OneAPI 跳转配置缺少 settings");
  }
  if (!rawSettings.trim()) {
    return invalidOneApiSettingsHandoff("ONEAPI_SETTINGS_MISSING", "OneAPI 跳转配置缺少 settings");
  }
  if (rawSettings.length > maxOneApiSettingsChars) {
    return invalidOneApiSettingsHandoff("ONEAPI_SETTINGS_TOO_LARGE", "OneAPI 跳转配置过长");
  }

  let serialized = rawSettings.trim();
  const looksLikeRawJson = serialized.startsWith("{") && serialized.includes('"');
  if (!looksLikeRawJson) {
    try {
      // Browsers commonly encode the quotes of an otherwise raw JSON fragment.
      serialized = decodeURIComponent(serialized);
    } catch {
      return invalidOneApiSettingsHandoff("ONEAPI_SETTINGS_INVALID", "OneAPI 跳转配置编码无效");
    }
  }
  if (serialized.length > maxOneApiSettingsChars) {
    return invalidOneApiSettingsHandoff("ONEAPI_SETTINGS_TOO_LARGE", "OneAPI 跳转配置过长");
  }

  let settings: Record<string, unknown>;
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid settings");
    settings = parsed as Record<string, unknown>;
  } catch {
    return invalidOneApiSettingsHandoff("ONEAPI_SETTINGS_INVALID", "OneAPI 跳转配置不是有效 JSON");
  }

  const apiKey = cleanText(settings.key);
  if (!apiKey) {
    return invalidOneApiSettingsHandoff("ONEAPI_KEY_MISSING", "OneAPI 跳转配置缺少 API Key");
  }
  if (apiKey.length > maxOneApiApiKeyChars) {
    return invalidOneApiSettingsHandoff("ONEAPI_KEY_TOO_LARGE", "OneAPI 跳转中的 API Key 过长");
  }
  if (!/^sk-[A-Za-z0-9._~+/=-]{4,}$/u.test(apiKey)) {
    return invalidOneApiSettingsHandoff("ONEAPI_KEY_INVALID", "OneAPI 跳转中的 API Key 格式无效");
  }
  if (!validIgnoredOneApiUrl(settings.url)) {
    return invalidOneApiSettingsHandoff("ONEAPI_URL_INVALID", "OneAPI 跳转中的 API 地址格式无效");
  }

  return { present: true, apiKey, error: "", code: "" };
}

export function parseShellJwtHandoff(hash: string): ShellJwtHandoff {
  const fragment = String(hash || "").replace(/^#/u, "");
  if (fragment === "/jwt_auth") return invalidShellJwtHandoff();
  if (!fragment.startsWith(shellJwtRoutePrefix)) return emptyShellJwtHandoff;

  const segments = fragment.split(repeatedShellJwtRoute);
  if (segments.length > 2) return invalidShellJwtHandoff();

  const query = segments.length === 2
    ? segments[1]
    : segments[0].slice(shellJwtRoutePrefix.length);
  const tokens = new URLSearchParams(query).getAll("x_s_token");
  if (tokens.length !== 1) return invalidShellJwtHandoff();

  const token = cleanText(tokens[0]);
  const valid = token.length >= 16
    && token.length <= maxShellJwtChars
    && !/[\u0000-\u001f\u007f]/u.test(token)
    && shellJwtPattern.test(token);
  return valid
    ? { present: true, token, error: "" }
    : invalidShellJwtHandoff();
}

function clearHandoffUrl(
  location: Pick<Location, "pathname" | "search">,
  history: Pick<History, "replaceState" | "state">
) {
  history.replaceState(history.state, "", `${location.pathname || "/"}${location.search || ""}`);
}

export function clearShellJwtHandoffUrl(
  location: Pick<Location, "pathname" | "search">,
  history: Pick<History, "replaceState" | "state">
) {
  clearHandoffUrl(location, history);
}

export function clearOneApiSettingsHandoffUrl(
  location: Pick<Location, "pathname" | "search">,
  history: Pick<History, "replaceState" | "state">
) {
  clearHandoffUrl(location, history);
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
  if (typeof window === "undefined") return false;

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(sanitizeUserProviderConfig(provider)));
    return true;
  } catch {
    // Some browsers disable sessionStorage. In that case the in-memory state still works.
    return false;
  }
}
