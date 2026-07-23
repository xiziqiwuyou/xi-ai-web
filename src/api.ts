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
  KnowledgeAuthResponse,
  KnowledgeBase,
  KnowledgeCleanupJob,
  KnowledgeCloudDocument,
  KnowledgeEmbeddingBatchResult,
  KnowledgeEmbeddingConnection,
  KnowledgeEmbeddingProfile,
  KnowledgeSourceResponse,
  KnowledgeAdminAccount,
  KnowledgeAdminAccountDeletionResult,
  KnowledgeAdminAuditEntry,
  KnowledgeAdminInvite,
  KnowledgeAdminJob,
  KnowledgeAdminLimits,
  KnowledgeAdminMaintenanceResult,
  KnowledgeAdminOverview,
  KnowledgeAdminPage,
  KnowledgeAdminReadiness,
  KnowledgeAdminReconcileResult,
  KnowledgeAdminSettings,
  KnowledgePublicConfig,
  KnowledgeReindexResult,
  KnowledgeRetrievalRequest,
  KnowledgeRetrievalResult,
  KnowledgeUploadGrant,
  MenuItem,
  ModelCatalogEntry,
  PromptPreset,
  PublicBootstrapPayload,
  SiteSettings,
  ToolSetting
} from "./types";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(
    status: number,
    message: string,
    metadata: { code?: string; details?: Record<string, unknown>; requestId?: string } = {}
  ) {
    super(message);
    this.status = status;
    this.code = metadata.code;
    this.details = metadata.details;
    this.requestId = metadata.requestId;
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
    const error = payload?.error;
    if (error && typeof error === "object") {
      throw new ApiError(response.status, error.message || response.statusText, {
        code: error.code,
        details: error.details,
        requestId: error.requestId
      });
    }
    throw new ApiError(response.status, error || response.statusText);
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

  knowledgePublicConfig: () =>
    apiJson<KnowledgePublicConfig>("/api/kb/public-config", { credentials: "same-origin" }),
  knowledgeSession: () =>
    apiJson<KnowledgeAuthResponse>("/api/kb/auth/session", { credentials: "same-origin" }),
  knowledgeRegister: (payload: { username: string; password: string; inviteCode?: string }) =>
    apiJson<KnowledgeAuthResponse>("/api/kb/auth/register", {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify(payload)
    }),
  knowledgeLogin: (payload: { username: string; password: string }) =>
    apiJson<KnowledgeAuthResponse>("/api/kb/auth/login", {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify(payload)
    }),
  knowledgeRecover: (payload: { username: string; recoveryCode: string; newPassword: string }) =>
    apiJson<KnowledgeAuthResponse>("/api/kb/auth/recover", {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify(payload)
    }),
  knowledgeAdminReset: (payload: { username: string; resetCode: string; newPassword: string }) =>
    apiJson<KnowledgeAuthResponse>("/api/kb/auth/admin-reset", {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify(payload)
    }),
  knowledgeLogout: (csrfToken: string) =>
    apiJson<{ ok: boolean }>("/api/kb/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Knowledge-CSRF": csrfToken },
      body: JSON.stringify({})
    }),
  knowledgeSourceUrl: (
    documentId: string,
    chunkId: string,
    disposition: "inline" | "attachment" = "inline"
  ) => {
    const search = new URLSearchParams({ chunkId, disposition });
    return apiJson<KnowledgeSourceResponse>(
      `/api/kb/documents/${encodeURIComponent(documentId)}/source-url?${search.toString()}`,
      { credentials: "same-origin" }
    );
  },
  retrieveKnowledge: (
    csrfToken: string,
    payload: KnowledgeRetrievalRequest & { query: string }
  ) => apiJson<KnowledgeRetrievalResult>("/api/kb/retrieve", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Knowledge-CSRF": csrfToken },
    body: JSON.stringify(payload)
  }),
  knowledgeRegenerateRecoveryCode: (csrfToken: string) =>
    apiJson<{ account: KnowledgeAuthResponse["account"]; recoveryCode: string; requestId?: string }>(
      "/api/kb/auth/recovery-code",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-Knowledge-CSRF": csrfToken },
        body: JSON.stringify({})
      }
    ),

  knowledgeEmbeddingProfiles: () =>
    apiJson<{ items: KnowledgeEmbeddingProfile[]; requestId?: string }>(
      "/api/kb/embedding-profiles",
      { credentials: "same-origin" }
    ),
  knowledgeBases: () =>
    apiJson<{ items: KnowledgeBase[]; requestId?: string }>("/api/kb/bases", {
      credentials: "same-origin"
    }),
  knowledgeBase: (baseId: string) =>
    apiJson<{ base: KnowledgeBase; requestId?: string }>(
      `/api/kb/bases/${encodeURIComponent(baseId)}`,
      { credentials: "same-origin" }
    ),
  createKnowledgeBase: (
    csrfToken: string,
    payload: { name: string; description?: string; embeddingProfileId: string }
  ) =>
    apiJson<{ base: KnowledgeBase; requestId?: string }>("/api/kb/bases", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Knowledge-CSRF": csrfToken },
      body: JSON.stringify(payload)
    }),
  updateKnowledgeBase: (
    csrfToken: string,
    baseId: string,
    payload: {
      expectedVersion: number;
      name?: string;
      description?: string;
      status?: "active" | "archived";
      embeddingProfileId?: string;
    }
  ) =>
    apiJson<{ base: KnowledgeBase; requestId?: string }>(
      `/api/kb/bases/${encodeURIComponent(baseId)}`,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "X-Knowledge-CSRF": csrfToken },
        body: JSON.stringify(payload)
      }
    ),
  deleteKnowledgeBase: (
    csrfToken: string,
    baseId: string,
    expectedVersion: number
  ) =>
    apiJson<{ accepted: true; job: KnowledgeCleanupJob; requestId?: string }>(
      `/api/kb/bases/${encodeURIComponent(baseId)}`,
      {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-Knowledge-CSRF": csrfToken },
        body: JSON.stringify({ expectedVersion })
      }
    ),
  knowledgeDocuments: (baseId: string) =>
    apiJson<{ items: KnowledgeCloudDocument[]; requestId?: string }>(
      `/api/kb/bases/${encodeURIComponent(baseId)}/documents`,
      { credentials: "same-origin" }
    ),
  createKnowledgeUploadGrant: (
    csrfToken: string,
    baseId: string,
    payload: {
      displayName: string;
      declaredMimeType: string;
      declaredBytes: number;
      checksumSha256?: string;
    }
  ) =>
    apiJson<{
      document: KnowledgeCloudDocument;
      upload: KnowledgeUploadGrant;
      requestId?: string;
    }>(`/api/kb/bases/${encodeURIComponent(baseId)}/documents/upload-grant`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Knowledge-CSRF": csrfToken },
      body: JSON.stringify(payload)
    }),
  finalizeKnowledgeUpload: (
    csrfToken: string,
    documentId: string,
    payload: { etag?: string; versionId?: string } = {}
  ) =>
    apiJson<{
      document: KnowledgeCloudDocument;
      job?: KnowledgeCleanupJob;
      idempotent: boolean;
      requestId?: string;
    }>(`/api/kb/documents/${encodeURIComponent(documentId)}/finalize`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Knowledge-CSRF": csrfToken },
      body: JSON.stringify(payload)
    }),
  deleteKnowledgeDocument: (
    csrfToken: string,
    documentId: string,
    expectedVersion: number
  ) =>
    apiJson<{ accepted: true; job: KnowledgeCleanupJob; requestId?: string }>(
      `/api/kb/documents/${encodeURIComponent(documentId)}`,
      {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-Knowledge-CSRF": csrfToken },
        body: JSON.stringify({ expectedVersion })
      }
    ),
  nextKnowledgeEmbeddingBatch: (
    csrfToken: string,
    documentId: string,
    payload: {
      embeddingProfileId: string;
      idempotencyKey: string;
      connection: KnowledgeEmbeddingConnection;
    }
  ) =>
    apiJson<KnowledgeEmbeddingBatchResult>(
      `/api/kb/documents/${encodeURIComponent(documentId)}/embedding-batches/next`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-Knowledge-CSRF": csrfToken },
        body: JSON.stringify({
          embeddingProfileId: payload.embeddingProfileId,
          idempotencyKey: payload.idempotencyKey,
          connection: {
            baseUrl: payload.connection.baseUrl,
            apiKey: payload.connection.apiKey
          }
        })
      }
    ),
  reindexKnowledgeBase: (
    csrfToken: string,
    baseId: string,
    payload: { expectedVersion: number; embeddingProfileId: string }
  ) =>
    apiJson<KnowledgeReindexResult>(`/api/kb/bases/${encodeURIComponent(baseId)}/reindex`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Knowledge-CSRF": csrfToken },
      body: JSON.stringify(payload)
    }),

  knowledgeAdminSettings: () =>
    apiJson<KnowledgeAdminSettings>("/api/admin/knowledge/settings"),
  updateKnowledgeAdminSettings: (payload: {
    expectedVersion: number;
    registrationMode: KnowledgeAdminSettings["registrationMode"];
    limits: KnowledgeAdminLimits;
    reason: string;
  }) =>
    apiJson<KnowledgeAdminSettings>("/api/admin/knowledge/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  knowledgeAdminOverview: () =>
    apiJson<KnowledgeAdminOverview & { requestId?: string }>("/api/admin/knowledge/overview"),
  knowledgeAdminReadiness: () =>
    apiJson<KnowledgeAdminReadiness>("/api/admin/knowledge/readiness"),
  knowledgeAdminAccounts: (params: { search?: string; status?: string; cursor?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.search) search.set("search", params.search);
    if (params.status) search.set("status", params.status);
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    return apiJson<KnowledgeAdminPage<KnowledgeAdminAccount>>(
      `/api/admin/knowledge/accounts${query ? `?${query}` : ""}`
    );
  },
  updateKnowledgeAdminAccount: (
    accountId: string,
    payload: {
      expectedVersion: number;
      status?: "active" | "frozen";
      limitOverrides?: Record<string, number | null>;
      reason: string;
    }
  ) =>
    apiJson<KnowledgeAdminAccount>(`/api/admin/knowledge/accounts/${encodeURIComponent(accountId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  revokeKnowledgeAdminSessions: (accountId: string, reason: string) =>
    apiJson<{ accountId: string; revokedSessions: number }>(
      `/api/admin/knowledge/accounts/${encodeURIComponent(accountId)}/revoke-sessions`,
      { method: "POST", body: JSON.stringify({ reason }) }
    ),
  deleteKnowledgeAdminAccount: (
    accountId: string,
    payload: { expectedVersion: number; reason: string }
  ) =>
    apiJson<KnowledgeAdminAccountDeletionResult>(
      `/api/admin/knowledge/accounts/${encodeURIComponent(accountId)}`,
      {
        method: "DELETE",
        body: JSON.stringify(payload)
      }
    ),
  issueKnowledgeAdminReset: (accountId: string, reason: string) =>
    apiJson<{
      accountId: string;
      resetId: string;
      resetCode: string;
      expiresAt: string;
      revokedSessions: number;
    }>(`/api/admin/knowledge/accounts/${encodeURIComponent(accountId)}/reset`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),
  knowledgeAdminInvites: (params: { status?: string; cursor?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    return apiJson<KnowledgeAdminPage<KnowledgeAdminInvite>>(
      `/api/admin/knowledge/invites${query ? `?${query}` : ""}`
    );
  },
  createKnowledgeAdminInvite: (payload: {
    expiresInHours: number;
    initialLimitOverrides?: Record<string, number>;
    reason: string;
  }) =>
    apiJson<{
      invite: KnowledgeAdminInvite;
      inviteCode: string;
    }>("/api/admin/knowledge/invites", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  revokeKnowledgeAdminInvite: (inviteId: string, reason: string) =>
    apiJson<{ invite: KnowledgeAdminInvite }>(`/api/admin/knowledge/invites/${encodeURIComponent(inviteId)}`, {
      method: "DELETE",
      body: JSON.stringify({ reason })
    }),
  knowledgeAdminJobs: (params: { status?: string; kind?: string; cursor?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.kind) search.set("kind", params.kind);
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    return apiJson<KnowledgeAdminPage<KnowledgeAdminJob>>(
      `/api/admin/knowledge/jobs${query ? `?${query}` : ""}`
    );
  },
  retryKnowledgeAdminJob: (jobId: string, reason: string) =>
    apiJson<{ job: KnowledgeAdminJob }>(
      `/api/admin/knowledge/jobs/${encodeURIComponent(jobId)}/retry`,
      {
        method: "POST",
        body: JSON.stringify({ reason })
      }
    ),
  cancelKnowledgeAdminJob: (jobId: string, reason: string) =>
    apiJson<{ job: KnowledgeAdminJob }>(
      `/api/admin/knowledge/jobs/${encodeURIComponent(jobId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ reason })
      }
    ),
  queueKnowledgeAdminReconcile: (payload: { accountId?: string; limit?: number; reason: string }) =>
    apiJson<KnowledgeAdminReconcileResult>("/api/admin/knowledge/maintenance/reconcile", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  runKnowledgeAdminMaintenance: (payload: { limit?: number; reason: string }) =>
    apiJson<KnowledgeAdminMaintenanceResult>("/api/admin/knowledge/maintenance/cleanup-stale", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  knowledgeAdminAudit: (params: {
    operation?: string;
    targetType?: string;
    result?: string;
    cursor?: string;
    limit?: number;
  } = {}) => {
    const search = new URLSearchParams();
    if (params.operation) search.set("operation", params.operation);
    if (params.targetType) search.set("targetType", params.targetType);
    if (params.result) search.set("result", params.result);
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    return apiJson<KnowledgeAdminPage<KnowledgeAdminAuditEntry>>(
      `/api/admin/knowledge/audit${query ? `?${query}` : ""}`
    );
  },

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
  runAgent: (payload: AgentRunPayload, knowledgeCsrfToken = "") =>
    apiJson<GenerationResult>("/api/agents/run", {
      method: "POST",
      credentials: "same-origin",
      headers: knowledgeCsrfToken ? { "X-Knowledge-CSRF": knowledgeCsrfToken } : undefined,
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
  signal?: AbortSignal,
  knowledgeCsrfToken = ""
) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(knowledgeCsrfToken ? { "X-Knowledge-CSRF": knowledgeCsrfToken } : {})
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    const error = body?.error;
    if (error && typeof error === "object") {
      throw new ApiError(response.status, error.message || "无法建立模型流", {
        code: error.code,
        details: error.details,
        requestId: error.requestId
      });
    }
    throw new ApiError(response.status, error || "无法建立模型流");
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
