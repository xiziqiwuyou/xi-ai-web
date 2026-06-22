import type {
  AdminAuditEntry,
  AdminBackupItem,
  AdminBootstrapPayload,
  AdminOpsPayload,
  AdminStatus,
  AgentRunPayload,
  AudioTranscriptionResult,
  AppPreset,
  Assistant,
  ChatStreamEvent,
  ChatStreamPayload,
  GenerationModuleId,
  GenerationPayload,
  GenerationResult,
  MenuItem,
  ModelCatalogEntry,
  PromptPreset,
  PublicBootstrapPayload,
  SiteSettings,
  ToolSetting
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload.error || response.statusText);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type ModelCatalogPayload = Partial<ModelCatalogEntry>;
export type AppPresetPayload = Partial<AppPreset>;
export type PromptPresetPayload = Partial<PromptPreset>;

export const api = {
  publicBootstrap: () => apiJson<PublicBootstrapPayload>("/api/public/bootstrap"),
  bootstrap: () => apiJson<PublicBootstrapPayload>("/api/public/bootstrap"),

  adminStatus: () => apiJson<AdminStatus>("/api/admin/status"),
  adminLogin: (password: string) =>
    apiJson<{ ok: boolean }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    }),
  adminLogout: () =>
    apiJson<{ ok: boolean }>("/api/admin/logout", {
      method: "POST",
      body: JSON.stringify({})
    }),
  adminBootstrap: () => apiJson<AdminBootstrapPayload>("/api/admin/bootstrap"),
  updateSettings: (settings: Partial<SiteSettings>) =>
    apiJson<SiteSettings>("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(settings)
    }),
  updateMenuItems: (menuItems: MenuItem[]) =>
    apiJson<MenuItem[]>("/api/admin/menu-items", {
      method: "PATCH",
      body: JSON.stringify({ menuItems })
    }),

  generate: (moduleId: GenerationModuleId, payload: GenerationPayload) =>
    apiJson<GenerationResult>(`/api/generate/${moduleId}`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  videoStatus: (payload: {
    connection: GenerationPayload["connection"];
    modelId: string;
    endpointPath?: string;
    providerJobId?: string;
  }) =>
    apiJson<GenerationResult>("/api/media/video/status", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  embed: (payload: { connection: GenerationPayload["connection"]; modelId: string; input: string | string[] }) =>
    apiJson<{
      modelId: string;
      vendor: string;
      model: string;
      dimensions: number;
      embeddings: number[][];
      usage?: unknown;
    }>("/api/retrieval/embed", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createModelEntry: (entry: ModelCatalogPayload) =>
    apiJson<ModelCatalogEntry>("/api/admin/model-catalog", {
      method: "POST",
      body: JSON.stringify(entry)
    }),
  updateModelEntry: (id: string, entry: ModelCatalogPayload) =>
    apiJson<ModelCatalogEntry>(`/api/admin/model-catalog/${id}`, {
      method: "PATCH",
      body: JSON.stringify(entry)
    }),
  deleteModelEntry: (id: string) =>
    apiJson<void>(`/api/admin/model-catalog/${id}`, { method: "DELETE" }),

  createAssistant: (assistant: Partial<Assistant>) =>
    apiJson<Assistant>("/api/admin/assistants", {
      method: "POST",
      body: JSON.stringify(assistant)
    }),
  updateAssistant: (id: string, assistant: Partial<Assistant>) =>
    apiJson<Assistant>(`/api/admin/assistants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(assistant)
    }),
  deleteAssistant: (id: string) =>
    apiJson<void>(`/api/admin/assistants/${id}`, { method: "DELETE" }),

  createAppPreset: (preset: AppPresetPayload) =>
    apiJson<AppPreset>("/api/admin/apps", {
      method: "POST",
      body: JSON.stringify(preset)
    }),
  updateAppPreset: (id: string, preset: AppPresetPayload) =>
    apiJson<AppPreset>(`/api/admin/apps/${id}`, {
      method: "PATCH",
      body: JSON.stringify(preset)
    }),
  deleteAppPreset: (id: string) =>
    apiJson<void>(`/api/admin/apps/${id}`, { method: "DELETE" }),

  createPromptPreset: (preset: PromptPresetPayload) =>
    apiJson<PromptPreset>("/api/admin/prompt-presets", {
      method: "POST",
      body: JSON.stringify(preset)
    }),
  updatePromptPreset: (id: string, preset: PromptPresetPayload) =>
    apiJson<PromptPreset>(`/api/admin/prompt-presets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(preset)
    }),
  deletePromptPreset: (id: string) =>
    apiJson<void>(`/api/admin/prompt-presets/${id}`, { method: "DELETE" }),

  exportAdminMetadata: () => apiJson<AdminBootstrapPayload>("/api/admin/metadata-export"),
  importAdminMetadata: (payload: Partial<AdminBootstrapPayload>) =>
    apiJson<AdminBootstrapPayload>("/api/admin/metadata-import", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  previewAdminMetadataImport: (payload: Partial<AdminBootstrapPayload>) =>
    apiJson<{
      ok: boolean;
      dryRun: boolean;
      counts: Record<string, number>;
      changed: string[];
      warnings: string[];
    }>("/api/admin/metadata-import?dryRun=true", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  getAdminOps: () => apiJson<AdminOpsPayload>("/api/admin/ops"),
  getAdminBackups: () => apiJson<AdminBackupItem[]>("/api/admin/backups"),
  restoreAdminBackup: (name: string) =>
    apiJson<AdminBootstrapPayload & { restored: boolean; restoredBackup: string }>(
      `/api/admin/backups/${encodeURIComponent(name)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({})
      }
    ),
  getAdminAuditLog: (params: { action?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.action) search.set("action", params.action);
    if (params.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    return apiJson<AdminAuditEntry[]>(`/api/admin/audit-log${query ? `?${query}` : ""}`);
  },
  updateToolSettings: (toolSettings: ToolSetting[]) =>
    apiJson<ToolSetting[]>("/api/admin/tool-settings", {
      method: "PATCH",
      body: JSON.stringify({ toolSettings })
    }),
  runAgent: (payload: AgentRunPayload) =>
    apiJson<GenerationResult>("/api/agents/run", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  transcribeAudio: (payload: {
    connection: GenerationPayload["connection"];
    modelId: string;
    fileName: string;
    mimeType: string;
    dataUrl: string;
    endpointPath?: string;
  }) =>
    apiJson<AudioTranscriptionResult>("/api/audio/transcribe", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

export async function streamChat(
  payload: ChatStreamPayload,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error || "无法建立模型流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushEvent = (rawEvent: string) => {
    const lines = rawEvent.split(/\r?\n/);
    const eventName = lines
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!eventName || !data) return;
    onEvent({ type: eventName, ...JSON.parse(data) } as ChatStreamEvent);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\n\n/);
    buffer = events.pop() || "";
    events.filter(Boolean).forEach(flushEvent);
  }

  if (buffer.trim()) flushEvent(buffer);
}
