import type {
  KnowledgeBase,
  KnowledgeEmbeddingConnection,
  KnowledgeRetrievalRequest
} from "../../types";
import {
  clearKnowledgeEmbeddingConnections,
  loadKnowledgeEmbeddingConnections
} from "./embeddingConnections";

export const knowledgeSessionChangedEvent = "xi-ai-web:knowledge-session-changed";
export const knowledgeLogoutEvent = "xi-ai-web:knowledge-logout";
export const chatKnowledgeSelectionStorageKey = "xi-ai-web-chat-knowledge-selections";

export const maximumSelectedKnowledgeBases = 3;

export type KnowledgeBaseReadiness = "ready" | "partial" | "not-ready";
export type KnowledgeSessionChangeReason = "expired";
export type KnowledgeChatIssue =
  | "missing-key"
  | "no-match"
  | "session-expired"
  | "unavailable"
  | "not-ready"
  | "unknown";

function cleanId(value: unknown) {
  if (typeof value !== "string") return "";
  const id = value.trim();
  return id && id.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(id) ? id : "";
}

export function normalizeKnowledgeBaseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanId).filter(Boolean))].slice(0, maximumSelectedKnowledgeBases);
}

type StoredChatKnowledgeSelections = {
  version: 1;
  conversations: Record<string, string[]>;
};

export function loadChatKnowledgeSelections(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(chatKnowledgeSelectionStorageKey);
    const parsed = raw ? JSON.parse(raw) as Partial<StoredChatKnowledgeSelections> : null;
    if (parsed?.version !== 1 || !parsed.conversations || typeof parsed.conversations !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed.conversations)
        .map(([conversationId, ids]) => [cleanId(conversationId), normalizeKnowledgeBaseIds(ids)] as const)
        .filter(([conversationId, ids]) => conversationId && ids.length)
    );
  } catch {
    return {};
  }
}

export function saveChatKnowledgeSelection(conversationId: string, ids: string[]) {
  if (typeof window === "undefined") return;
  const id = cleanId(conversationId);
  if (!id) return;
  const conversations = loadChatKnowledgeSelections();
  const normalized = normalizeKnowledgeBaseIds(ids);
  if (normalized.length) conversations[id] = normalized;
  else delete conversations[id];
  try {
    window.sessionStorage.setItem(
      chatKnowledgeSelectionStorageKey,
      JSON.stringify({ version: 1, conversations } satisfies StoredChatKnowledgeSelections)
    );
  } catch {
    // The live React state remains usable when sessionStorage is unavailable.
  }
}

export function clearChatKnowledgeSelections() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(chatKnowledgeSelectionStorageKey);
  } catch {
    // Storage can be disabled without affecting the live logout event.
  }
}

export function emitKnowledgeSessionChanged(
  authenticated: boolean,
  reason?: KnowledgeSessionChangeReason
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(knowledgeSessionChangedEvent, {
    detail: { authenticated, reason }
  }));
}

export function clearLiveKnowledgeClientState() {
  clearKnowledgeEmbeddingConnections();
  clearChatKnowledgeSelections();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(knowledgeLogoutEvent));
  emitKnowledgeSessionChanged(false);
}

export function knowledgeEmbeddingConnectionsForBases(
  selectedIds: string[],
  bases: KnowledgeBase[]
): KnowledgeRetrievalRequest["embeddingConnections"] {
  const selected = new Set(normalizeKnowledgeBaseIds(selectedIds));
  const vendors = new Set<KnowledgeEmbeddingConnection["vendor"]>();
  bases.forEach((base) => {
    if (selected.has(base.id) && base.embeddingProfile?.vendor) vendors.add(base.embeddingProfile.vendor);
  });
  const saved = loadKnowledgeEmbeddingConnections();
  const connections: NonNullable<KnowledgeRetrievalRequest["embeddingConnections"]> = {};
  vendors.forEach((vendor) => {
    const connection = saved[vendor];
    if (connection) connections[vendor] = {
      apiKey: connection.apiKey
    };
  });
  return connections;
}

export function missingKnowledgeEmbeddingVendors(selectedIds: string[], bases: KnowledgeBase[]) {
  const selected = new Set(normalizeKnowledgeBaseIds(selectedIds));
  const saved = loadKnowledgeEmbeddingConnections();
  return [...new Set(
    bases
      .filter((base) => selected.has(base.id))
      .map((base) => base.embeddingProfile?.vendor)
      .filter((vendor): vendor is KnowledgeEmbeddingConnection["vendor"] => Boolean(vendor && !saved[vendor]))
  )];
}

export function knowledgeBaseReadiness(base: KnowledgeBase): KnowledgeBaseReadiness {
  if (
    base.status !== "active" ||
    base.activeIndexVersion === null ||
    base.readyDocumentCount < 1
  ) return "not-ready";
  if (
    base.readyDocumentCount < base.documentCount ||
    base.pendingIndexVersion !== null
  ) return "partial";
  return "ready";
}

export function isKnowledgeBaseReady(base: KnowledgeBase) {
  return knowledgeBaseReadiness(base) !== "not-ready";
}

function errorMetadata(value: unknown) {
  const source = value && typeof value === "object"
    ? value as { code?: unknown; status?: unknown; message?: unknown }
    : {};
  return {
    code: typeof source.code === "string" ? source.code : "",
    status: Number.isInteger(source.status) ? Number(source.status) : 0,
    message: typeof source.message === "string" ? source.message : ""
  };
}

export function knowledgeChatIssue(error: unknown): { kind: KnowledgeChatIssue; message: string } {
  const { code, status, message } = errorMetadata(error);
  if (status === 401 || code === "KB_AUTH_REQUIRED" || code === "KB_SESSION_EXPIRED") {
    return { kind: "session-expired", message: "知识库会话已过期，请重新登录后再试。" };
  }
  if (code === "KB_EMBEDDING_CONNECTION_REQUIRED") {
    return { kind: "missing-key", message: "所选知识库缺少 Embedding API Key，请前往知识库页面配置。" };
  }
  if (["KB_NO_MATCH", "KB_RETRIEVAL_NO_MATCH", "KB_RETRIEVAL_EMPTY"].includes(code)) {
    return { kind: "no-match", message: "未检索到可靠匹配，未使用知识库内容生成回答。" };
  }
  if (code === "KB_INDEX_NOT_READY") {
    return { kind: "not-ready", message: "所选知识库还没有可检索的已就绪文档。" };
  }
  if (status === 503 || code === "KB_UNAVAILABLE" || code === "KB_DISABLED") {
    return { kind: "unavailable", message: "云知识库当前不可用，普通对话仍可继续使用。" };
  }
  return { kind: "unknown", message: message || "知识库请求失败，请稍后重试。" };
}
