import {
  type ArtifactKind,
  type ArtifactRecord,
  type ArtifactVersion
} from "../../types";
import { createClientId } from "../../utils/clientId";

export const artifactMaxCount = 100;
export const artifactMaxVersions = 20;
export const artifactMaxTitleLength = 120;
export const artifactMaxLanguageLength = 40;
export const artifactMaxContentLength = 200_000;

export type ArtifactDraft = {
  title?: string;
  kind: ArtifactKind;
  language?: string;
  content: string;
  sourceConversationId?: string;
  sourceMessageId?: string;
};

const artifactKindValues: readonly ArtifactKind[] = ["html", "markdown", "text", "code"];
const artifactKindSet = new Set<ArtifactKind>(artifactKindValues);

function createArtifactId(prefix: string) {
  return createClientId(prefix);
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown, maxLength: number, trim = true) {
  const text = typeof value === "string" ? value : "";
  const normalized = trim ? text.trim() : text;
  return normalized.replace(/\u0000/gu, "").slice(0, maxLength);
}

function cleanIsoDate(value: unknown, fallback: string) {
  const text = cleanText(value, 80);
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : fallback;
}

function cleanKind(value: unknown): ArtifactKind {
  return artifactKindSet.has(value as ArtifactKind) ? value as ArtifactKind : "code";
}

function cleanLanguage(value: unknown, kind: ArtifactKind) {
  const language = cleanText(value, artifactMaxLanguageLength).toLowerCase();
  if (language) return language;
  return kind === "html" ? "html" : kind === "markdown" ? "markdown" : "text";
}

function cleanSourceId(value: unknown) {
  const text = cleanText(value, 120);
  return text || undefined;
}

function sanitizeArtifactVersion(value: unknown, fallbackVersion: number, fallbackDate: string): ArtifactVersion | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 120);
  const kind = cleanKind(source?.kind);
  const rawContent = cleanText(source?.content, artifactMaxContentLength, false)
    .replace(/\r\n?/gu, "\n");
  const content = kind === "html" ? sanitizeArtifactHtml(rawContent) : rawContent;
  if (!id || !content.trim()) return null;
  const versionValue = Number(source?.version);
  const version = Number.isSafeInteger(versionValue) && versionValue > 0
    ? versionValue
    : fallbackVersion;
  return {
    id,
    version,
    kind,
    language: cleanLanguage(source?.language, kind),
    content,
    createdAt: cleanIsoDate(source?.createdAt, fallbackDate),
    ...(cleanSourceId(source?.sourceConversationId) ? { sourceConversationId: cleanSourceId(source?.sourceConversationId) } : {}),
    ...(cleanSourceId(source?.sourceMessageId) ? { sourceMessageId: cleanSourceId(source?.sourceMessageId) } : {})
  };
}

export function sanitizeArtifact(value: unknown): ArtifactRecord | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 120);
  if (!id) return null;
  const fallbackDate = new Date().toISOString();
  const rawVersions = Array.isArray(source?.versions) ? source.versions : [];
  const seenVersionIds = new Set<string>();
  const seenVersionNumbers = new Set<number>();
  const versions = rawVersions
    .map((item, index) => sanitizeArtifactVersion(item, index + 1, fallbackDate))
    .filter((item): item is ArtifactVersion => Boolean(item))
    .sort((left, right) => left.version - right.version)
    .filter((item) => {
      if (seenVersionIds.has(item.id) || seenVersionNumbers.has(item.version)) return false;
      seenVersionIds.add(item.id);
      seenVersionNumbers.add(item.version);
      return true;
    })
    .slice(-artifactMaxVersions);
  if (!versions.length) return null;
  const createdAt = cleanIsoDate(source?.createdAt, versions[0].createdAt);
  const updatedAt = cleanIsoDate(source?.updatedAt, versions[versions.length - 1].createdAt);
  const currentValue = Number(source?.currentVersion);
  const currentVersion = Number.isSafeInteger(currentValue) && versions.some((version) => version.version === currentValue)
    ? currentValue
    : versions[versions.length - 1].version;
  return {
    id,
    title: cleanText(source?.title, artifactMaxTitleLength) || "未命名作品",
    versions,
    currentVersion,
    createdAt,
    updatedAt
  };
}

export function currentArtifactVersion(artifact: ArtifactRecord) {
  return artifact.versions.find((version) => version.version === artifact.currentVersion)
    || artifact.versions[artifact.versions.length - 1];
}

function normalizedDraft(draft: ArtifactDraft) {
  const kind = cleanKind(draft.kind);
  const rawContent = cleanText(draft.content, artifactMaxContentLength, false).replace(/\r\n?/gu, "\n");
  const normalized = {
    title: cleanText(draft.title, artifactMaxTitleLength) || "未命名作品",
    kind,
    language: cleanLanguage(draft.language, kind),
    content: kind === "html" ? sanitizeArtifactHtml(rawContent) : rawContent,
    sourceConversationId: cleanSourceId(draft.sourceConversationId),
    sourceMessageId: cleanSourceId(draft.sourceMessageId)
  };
  if (!normalized.content.trim()) throw new Error("作品内容不能为空。");
  return normalized;
}

export function createArtifact(
  draft: ArtifactDraft,
  options: { id?: string; versionId?: string; now?: string } = {}
): ArtifactRecord {
  const normalized = normalizedDraft(draft);
  const now = cleanIsoDate(options.now, new Date().toISOString());
  const version: ArtifactVersion = {
    id: options.versionId || createArtifactId("artifact-version"),
    version: 1,
    kind: normalized.kind,
    language: normalized.language,
    content: normalized.content,
    createdAt: now,
    ...(normalized.sourceConversationId ? { sourceConversationId: normalized.sourceConversationId } : {}),
    ...(normalized.sourceMessageId ? { sourceMessageId: normalized.sourceMessageId } : {})
  };
  return {
    id: options.id || createArtifactId("artifact"),
    title: normalized.title,
    versions: [version],
    currentVersion: 1,
    createdAt: now,
    updatedAt: now
  };
}

export function appendArtifactVersion(
  artifact: ArtifactRecord,
  draft: ArtifactDraft,
  options: { versionId?: string; now?: string } = {}
): ArtifactRecord {
  const source = sanitizeArtifact(artifact);
  if (!source) return createArtifact(draft, { versionId: options.versionId, now: options.now });
  const normalized = normalizedDraft(draft);
  const now = cleanIsoDate(options.now, new Date().toISOString());
  const nextVersionNumber = source.versions[source.versions.length - 1].version + 1;
  const nextVersion: ArtifactVersion = {
    id: options.versionId || createArtifactId("artifact-version"),
    version: nextVersionNumber,
    kind: normalized.kind,
    language: normalized.language,
    content: normalized.content,
    createdAt: now,
    ...(normalized.sourceConversationId ? { sourceConversationId: normalized.sourceConversationId } : {}),
    ...(normalized.sourceMessageId ? { sourceMessageId: normalized.sourceMessageId } : {})
  };
  const versions = [...source.versions, nextVersion].slice(-artifactMaxVersions);
  return {
    ...source,
    title: normalized.title,
    versions,
    currentVersion: nextVersionNumber,
    updatedAt: now
  };
}

export function artifactFromCodeLanguage(language: string): ArtifactKind {
  const normalized = language.trim().toLowerCase();
  if (["html", "htm", "xhtml"].includes(normalized)) return "html";
  if (["md", "markdown"].includes(normalized)) return "markdown";
  if (["text", "txt", "plain"].includes(normalized)) return "text";
  return "code";
}

export function sanitizeArtifactHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/giu, "")
    .replace(/<script\b[^>]*\/?>/giu, "")
    .replace(/<\/script\s*>/giu, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/giu, "")
    .replace(/<iframe\b[^>]*\/?>/giu, "")
    .replace(/<\/(?:iframe|object|embed|form|base|meta|link)>/giu, "")
    .replace(/<(?:object|embed|form|base|meta|link)\b[^>]*>/giu, "")
    .replace(/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\s+(?:src|href|action|formaction|xlink:href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\s+style\s*=\s*(?:"[^"]*url\([^\)]*\)[^"]*"|'[^']*url\([^\)]*\)[^']*')/giu, "")
    .replace(/\u0000/gu, "");
}

export function artifactPreviewDocument(value: string) {
  const safe = sanitizeArtifactHtml(value)
    .replace(/<!doctype[^>]*>/giu, "")
    .replace(/<\/?(?:html|head|body)\b[^>]*>/giu, "");
  const csp = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>${safe}</body></html>`;
}

export function artifactDownloadDetails(artifact: ArtifactRecord) {
  const version = currentArtifactVersion(artifact);
  const extension = version.kind === "html"
    ? "html"
    : version.kind === "markdown"
      ? "md"
      : version.kind === "text"
        ? "txt"
        : version.language || "txt";
  const mime = version.kind === "html"
    ? "text/html;charset=utf-8"
    : version.kind === "markdown"
      ? "text/markdown;charset=utf-8"
      : "text/plain;charset=utf-8";
  const safeTitle = artifact.title.replace(/[^\w\-\u4e00-\u9fff]+/gu, "-").replace(/^-+|-+$/gu, "") || "artifact";
  return {
    version,
    filename: `${safeTitle}-v${version.version}.${extension}`,
    mime
  };
}
