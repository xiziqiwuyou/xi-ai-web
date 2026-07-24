function booleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function positiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeBaseUrl(value) {
  const candidate = String(value || "").trim().replace(/\/+$/, "");
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) return "";
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizeWorkflowPath(value) {
  const candidate = String(value || "/api/v2/workflows").trim();
  if (!candidate.startsWith("/") || candidate.includes("\r") || candidate.includes("\n")) {
    return "/api/v2/workflows";
  }
  return candidate.slice(0, 240);
}

export function loadLangflowConfig(env = process.env) {
  const enabled = booleanEnv(env.LANGFLOW_ENABLED, false);
  const baseUrl = normalizeBaseUrl(env.LANGFLOW_BASE_URL);
  const apiKey = String(env.LANGFLOW_API_KEY || "").trim();
  const timeoutMs = positiveInt(env.LANGFLOW_REQUEST_TIMEOUT_MS, 120000, 600000);
  const workflowPath = normalizeWorkflowPath(env.LANGFLOW_WORKFLOW_PATH);
  const configured = Boolean(baseUrl && apiKey);

  return Object.freeze({
    enabled,
    baseUrl,
    apiKey,
    timeoutMs,
    workflowPath,
    configured,
    available: enabled && configured
  });
}

export function publicLangflowStatus(config) {
  const enabled = Boolean(config?.enabled);
  const available = Boolean(config?.available);
  return {
    enabled,
    available,
    state: available ? "ready" : enabled ? "unavailable" : "disabled",
    reasonCode: available
      ? null
      : enabled
        ? "LANGFLOW_NOT_CONFIGURED"
        : "LANGFLOW_DISABLED"
  };
}
