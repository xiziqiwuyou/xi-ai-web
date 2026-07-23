export const ASSISTANT_LAUNCH_STORAGE_KEY = "xi-ai-web-assistant-launch";
export const LEGACY_ASSISTANT_LAUNCH_STORAGE_KEY = "aistudio-selected-assistant";
export const ASSISTANT_LAUNCH_EVENT = "xi-ai-web:assistant-launch";

const assistantLaunchVersion = 1 as const;
const assistantLaunchMaxAgeMs = 30 * 60 * 1000;

export type PendingAssistantLaunch = {
  version: typeof assistantLaunchVersion;
  assistantId: string;
  starterPrompt?: string;
  requestedAt: string;
};

export type AssistantLaunchConsumption = {
  intent: PendingAssistantLaunch | null;
  error?: string;
};

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function parseLaunchIntent(value: unknown): PendingAssistantLaunch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const assistantId = cleanText(source.assistantId, 140);
  const requestedAt = cleanText(source.requestedAt, 80);
  const requestedTime = Date.parse(requestedAt);
  if (
    source.version !== assistantLaunchVersion ||
    !assistantId ||
    !Number.isFinite(requestedTime) ||
    Date.now() - requestedTime > assistantLaunchMaxAgeMs ||
    requestedTime - Date.now() > 60_000
  ) {
    return null;
  }
  const starterPrompt = cleanText(source.starterPrompt, 4000);
  return {
    version: assistantLaunchVersion,
    assistantId,
    starterPrompt: starterPrompt || undefined,
    requestedAt: new Date(requestedTime).toISOString()
  };
}

export function queueAssistantLaunch(assistantId: string, starterPrompt?: string) {
  const cleanAssistantId = cleanText(assistantId, 140);
  if (!cleanAssistantId) throw new Error("助手标识无效。");
  const intent: PendingAssistantLaunch = {
    version: assistantLaunchVersion,
    assistantId: cleanAssistantId,
    starterPrompt: cleanText(starterPrompt, 4000) || undefined,
    requestedAt: new Date().toISOString()
  };
  window.sessionStorage.setItem(ASSISTANT_LAUNCH_STORAGE_KEY, JSON.stringify(intent));
  window.sessionStorage.removeItem(LEGACY_ASSISTANT_LAUNCH_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent<PendingAssistantLaunch>(ASSISTANT_LAUNCH_EVENT, { detail: intent }));
}

export function consumeAssistantLaunch(): AssistantLaunchConsumption {
  const serialized = window.sessionStorage.getItem(ASSISTANT_LAUNCH_STORAGE_KEY);
  const legacyAssistantId = cleanText(
    window.sessionStorage.getItem(LEGACY_ASSISTANT_LAUNCH_STORAGE_KEY),
    140
  );
  window.sessionStorage.removeItem(ASSISTANT_LAUNCH_STORAGE_KEY);
  window.sessionStorage.removeItem(LEGACY_ASSISTANT_LAUNCH_STORAGE_KEY);

  if (serialized) {
    try {
      const intent = parseLaunchIntent(JSON.parse(serialized));
      return intent ? { intent } : { intent: null, error: "助手启动请求已失效，请重新选择助手。" };
    } catch {
      return { intent: null, error: "助手启动请求格式无效，请重新选择助手。" };
    }
  }

  if (legacyAssistantId) {
    return {
      intent: {
        version: assistantLaunchVersion,
        assistantId: legacyAssistantId,
        requestedAt: new Date().toISOString()
      }
    };
  }

  return { intent: null };
}
