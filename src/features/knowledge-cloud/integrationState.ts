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

const maximumSelectedKnowledgeBases = 3;

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

export function emitKnowledgeSessionChanged(authenticated: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(knowledgeSessionChangedEvent, {
    detail: { authenticated }
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
      baseUrl: connection.baseUrl,
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

export function isKnowledgeBaseReady(base: KnowledgeBase) {
  return base.status === "active" &&
    base.activeIndexVersion !== null &&
    base.documentCount === base.readyDocumentCount;
}
