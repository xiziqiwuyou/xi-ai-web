import type { KnowledgeEmbeddingConnection } from "../../types";

export const knowledgeEmbeddingConnectionStorageKey = "xi-ai-web-knowledge-embedding-connections";

type KnowledgeEmbeddingVendor = KnowledgeEmbeddingConnection["vendor"];
export type KnowledgeEmbeddingConnectionMap = Partial<Record<KnowledgeEmbeddingVendor, KnowledgeEmbeddingConnection>>;

const vendors = new Set<KnowledgeEmbeddingVendor>(["openai", "qwen"]);

function cleanText(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > maximum || /[\u0000-\u001f\u007f]/u.test(text)) return "";
  return text;
}

function sanitizeConnection(value: unknown): KnowledgeEmbeddingConnection | null {
  const source = value && typeof value === "object"
    ? value as Partial<KnowledgeEmbeddingConnection>
    : {};
  const vendor = vendors.has(source.vendor as KnowledgeEmbeddingVendor)
    ? source.vendor as KnowledgeEmbeddingVendor
    : null;
  const baseUrl = cleanText(source.baseUrl, 2048).replace(/\/+$/u, "");
  const apiKey = cleanText(source.apiKey, 4096);
  if (!vendor || !/^https?:\/\//iu.test(baseUrl) || !apiKey) return null;
  return { vendor, baseUrl, apiKey };
}

export function sanitizeKnowledgeEmbeddingConnections(value: unknown): KnowledgeEmbeddingConnectionMap {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as { connections?: unknown }
    : {};
  const records = source.connections && typeof source.connections === "object" && !Array.isArray(source.connections)
    ? source.connections as Record<string, unknown>
    : {};
  const result: KnowledgeEmbeddingConnectionMap = {};
  for (const vendor of vendors) {
    const connection = sanitizeConnection(records[vendor]);
    if (connection) result[vendor] = connection;
  }
  return result;
}

export function loadKnowledgeEmbeddingConnections(): KnowledgeEmbeddingConnectionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(knowledgeEmbeddingConnectionStorageKey);
    return raw ? sanitizeKnowledgeEmbeddingConnections(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveKnowledgeEmbeddingConnections(connections: KnowledgeEmbeddingConnectionMap) {
  if (typeof window === "undefined") return;
  const sanitized = sanitizeKnowledgeEmbeddingConnections({ connections });
  try {
    window.sessionStorage.setItem(
      knowledgeEmbeddingConnectionStorageKey,
      JSON.stringify({ version: 1, connections: sanitized })
    );
  } catch {
    // React state remains usable when sessionStorage is unavailable.
  }
}

export function clearKnowledgeEmbeddingConnections() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(knowledgeEmbeddingConnectionStorageKey);
  } catch {
    // Storage may be disabled; clearing live React state still removes the credentials.
  }
}

export function isKnowledgeEmbeddingConnectionReady(
  connection: KnowledgeEmbeddingConnection | undefined
) {
  return Boolean(connection && /^https?:\/\//iu.test(connection.baseUrl) && connection.apiKey);
}
