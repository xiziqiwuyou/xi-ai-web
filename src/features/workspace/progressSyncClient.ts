import type {
  ProgressSyncCreateResult,
  ProgressSyncJoinResult,
  ProgressSyncPublicMaterial,
  ProgressSyncRole,
  ProgressSyncStatus
} from "./progressSyncTypes";

export class ProgressSyncApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as {
    error?: string | { message?: string; code?: string };
  } | null;
  if (typeof payload?.error === "string") return new ProgressSyncApiError(response.status, payload.error);
  return new ProgressSyncApiError(
    response.status,
    payload?.error?.message || response.statusText || "临时同步请求失败。",
    payload?.error?.code
  );
}

async function jsonRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

export const progressSyncClient = {
  config: () => jsonRequest<{
    enabled: boolean;
    ttlSeconds: number;
    maxPayloadBytes: number;
  }>("/api/progress-sync/status"),

  create: (
    material: ProgressSyncPublicMaterial,
    deviceLabel: string,
    creatorRole: ProgressSyncRole = "sender"
  ) =>
    jsonRequest<ProgressSyncCreateResult>("/api/progress-sync/sessions", {
      method: "POST",
      body: JSON.stringify({ creatorRole, [creatorRole]: material, deviceLabel })
    }),

  join: (
    code: string,
    material: ProgressSyncPublicMaterial,
    deviceLabel: string,
    joinRole: ProgressSyncRole = "receiver"
  ) =>
    jsonRequest<ProgressSyncJoinResult>("/api/progress-sync/sessions/join", {
      method: "POST",
      body: JSON.stringify({ code, joinRole, [joinRole]: material, deviceLabel })
    }),

  status: (sessionId: string, token: string, signal?: AbortSignal) =>
    jsonRequest<ProgressSyncStatus>(`/api/progress-sync/sessions/${encodeURIComponent(sessionId)}/status`, {
      method: "POST",
      body: JSON.stringify({ token }),
      signal
    }),

  approve: (
    sessionId: string,
    token: string,
    receiver: ProgressSyncPublicMaterial
  ) => jsonRequest<ProgressSyncStatus>(
    `/api/progress-sync/sessions/${encodeURIComponent(sessionId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ token, receiver })
    }
  ),

  reject: (sessionId: string, token: string) =>
    jsonRequest<ProgressSyncStatus>(`/api/progress-sync/sessions/${encodeURIComponent(sessionId)}/reject`, {
      method: "POST",
      body: JSON.stringify({ token })
    }),

  upload: async (sessionId: string, token: string, packet: Uint8Array) => {
    const response = await fetch(`/api/progress-sync/sessions/${encodeURIComponent(sessionId)}/payload`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "X-Progress-Sync-Token": token,
        "Content-Type": "application/octet-stream"
      },
      body: packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength) as ArrayBuffer
    });
    if (!response.ok) throw await readError(response);
    return response.json() as Promise<ProgressSyncStatus>;
  },

  claim: async (sessionId: string, token: string) => {
    const response = await fetch(`/api/progress-sync/sessions/${encodeURIComponent(sessionId)}/claim`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    if (!response.ok) throw await readError(response);
    return new Uint8Array(await response.arrayBuffer());
  },

  cancel: async (sessionId: string, token: string) => {
    const response = await fetch(`/api/progress-sync/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw await readError(response);
  }
};
