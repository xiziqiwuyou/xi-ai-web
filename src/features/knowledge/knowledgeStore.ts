import type { KnowledgeChunk, KnowledgeDocument } from "../../types";
import type { ExtractedKnowledgeFile } from "./documentExtractors";

const storageKey = "cherry-web-knowledge-documents";
const maxDocuments = 18;
const maxTextLength = 160000;
const maxChunkTextLength = 2400;
const maxSerializedLength = 4200000;

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function chunkKnowledgeText(
  text: string,
  documentId: string,
  documentName: string,
  { maxChars = 900, overlapChars = 120 } = {}
): KnowledgeChunk[] {
  const normalized = cleanText(text, maxTextLength).replace(/[ \t]+/g, " ");
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: KnowledgeChunk[] = [];
  let buffer = "";

  const pushChunk = (value: string) => {
    const chunkText = cleanText(value, maxChunkTextLength);
    if (!chunkText) return;
    chunks.push({
      id: `${documentId}-${chunks.length}-${hashText(chunkText)}`,
      documentId,
      documentName,
      index: chunks.length,
      text: chunkText
    });
  };

  const flush = () => {
    const value = buffer.trim();
    if (!value) return;
    pushChunk(value);
    buffer = value.slice(Math.max(0, value.length - overlapChars));
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (let index = 0; index < paragraph.length; index += maxChars - overlapChars) {
        pushChunk(paragraph.slice(index, index + maxChars));
      }
      buffer = "";
      continue;
    }

    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars) flush();
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }

  flush();
  return chunks;
}

function sanitizeChunk(value: unknown, fallbackDocumentId: string, fallbackDocumentName: string): KnowledgeChunk | null {
  const source = value && typeof value === "object" ? (value as Partial<KnowledgeChunk>) : null;
  if (!source?.text) return null;

  return {
    id: cleanText(source.id, 160) || `${fallbackDocumentId}-${hashText(source.text)}`,
    documentId: cleanText(source.documentId, 160) || fallbackDocumentId,
    documentName: cleanText(source.documentName, 180) || fallbackDocumentName,
    index: Number.isFinite(Number(source.index)) ? Number(source.index) : 0,
    text: cleanText(source.text, maxChunkTextLength),
    score: typeof source.score === "number" ? source.score : undefined
  };
}

function sanitizeDocument(value: unknown): KnowledgeDocument | null {
  const source = value && typeof value === "object" ? (value as Partial<KnowledgeDocument>) : null;
  if (!source?.id || !source.name || !source.text) return null;

  const documentId = cleanText(source.id, 160);
  const documentName = cleanText(source.name, 180);
  const text = cleanText(source.text, maxTextLength);
  const chunks = Array.isArray(source.chunks)
    ? source.chunks
        .map((chunk) => sanitizeChunk(chunk, documentId, documentName))
        .filter((chunk): chunk is KnowledgeChunk => Boolean(chunk))
    : chunkKnowledgeText(text, documentId, documentName);

  return {
    id: documentId,
    name: documentName,
    type: cleanText(source.type, 120) || "text/plain",
    size: Number.isFinite(Number(source.size)) ? Number(source.size) : text.length,
    text,
    chunks,
    createdAt: cleanText(source.createdAt, 80) || new Date().toISOString(),
    updatedAt: cleanText(source.updatedAt, 80) || new Date().toISOString()
  };
}

export function createKnowledgeDocument(file: ExtractedKnowledgeFile): KnowledgeDocument {
  const documentId = `${Date.now().toString(36)}-${hashText(`${file.name}:${file.size}:${file.text.slice(0, 1000)}`)}`;
  const text = cleanText(file.text, maxTextLength);
  const now = new Date().toISOString();

  return {
    id: documentId,
    name: cleanText(file.name, 180) || "未命名资料",
    type: cleanText(file.type, 120) || "text/plain",
    size: file.size,
    text,
    chunks: chunkKnowledgeText(text, documentId, file.name),
    createdAt: now,
    updatedAt: now
  };
}

export function loadKnowledgeDocuments(): KnowledgeDocument[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map(sanitizeDocument).filter((item): item is KnowledgeDocument => Boolean(item)).slice(0, maxDocuments)
      : [];
  } catch {
    return [];
  }
}

export function saveKnowledgeDocuments(documents: KnowledgeDocument[]) {
  if (typeof window === "undefined") return;

  const sanitized = documents
    .map(sanitizeDocument)
    .filter((item): item is KnowledgeDocument => Boolean(item))
    .slice(0, maxDocuments);

  if (!sanitized.length) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  let nextDocuments = sanitized;
  while (nextDocuments.length) {
    const serialized = JSON.stringify(nextDocuments);
    if (serialized.length <= maxSerializedLength) {
      try {
        window.localStorage.setItem(storageKey, serialized);
        return;
      } catch {
        nextDocuments = nextDocuments.slice(0, -1);
        continue;
      }
    }
    nextDocuments = nextDocuments.slice(0, -1);
  }

  window.localStorage.removeItem(storageKey);
}

export function clearKnowledgeDocuments() {
  if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
}

