import type {
  KnowledgeCloudDocumentStatus,
  KnowledgeDocument
} from "../../types";
import {
  getWorkspaceRecord,
  putWorkspaceRecord
} from "../workspace/workspaceDb";
import {
  loadWorkspaceKnowledgeDocuments,
  saveWorkspaceKnowledgeDocuments
} from "../workspace/workspaceRepository";

export type KnowledgeMigrationStage =
  | "pending"
  | "uploading"
  | "processing"
  | "awaiting_embedding"
  | "embedding"
  | "ready"
  | "failed";

export type KnowledgeMigrationItem = {
  localDocumentId: string;
  name: string;
  bytes: number;
  targetBaseId: string;
  cloudDocumentId?: string;
  stage: KnowledgeMigrationStage;
  error?: string;
  updatedAt: string;
};

export type KnowledgeMigrationSnapshot = {
  version: 1;
  accountId: string;
  targetBaseId: string;
  items: KnowledgeMigrationItem[];
  updatedAt: string;
};

function migrationMetaKey(accountId: string) {
  return `knowledgeCloudMigrationV1:${accountId}`;
}

function cleanText(value: unknown, maximum: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(text) ? text : "";
}

function sanitizeMigrationItem(value: unknown): KnowledgeMigrationItem | null {
  const source = value && typeof value === "object"
    ? value as Partial<KnowledgeMigrationItem>
    : {};
  const localDocumentId = cleanText(source.localDocumentId, 180);
  const targetBaseId = cleanText(source.targetBaseId, 180);
  const name = cleanText(source.name, 512);
  const stages = new Set<KnowledgeMigrationStage>([
    "pending",
    "uploading",
    "processing",
    "awaiting_embedding",
    "embedding",
    "ready",
    "failed"
  ]);
  if (!localDocumentId || !targetBaseId || !name || !stages.has(source.stage as KnowledgeMigrationStage)) {
    return null;
  }
  return {
    localDocumentId,
    targetBaseId,
    name,
    bytes: Number.isSafeInteger(Number(source.bytes)) && Number(source.bytes) >= 0
      ? Number(source.bytes)
      : 0,
    cloudDocumentId: cleanText(source.cloudDocumentId, 180) || undefined,
    stage: source.stage as KnowledgeMigrationStage,
    error: cleanText(source.error, 500) || undefined,
    updatedAt: cleanText(source.updatedAt, 80) || new Date().toISOString()
  };
}

export async function loadKnowledgeMigrationSnapshot(accountId: string) {
  const record = await getWorkspaceRecord("meta", migrationMetaKey(accountId));
  const source = record?.value && typeof record.value === "object"
    ? record.value as Partial<KnowledgeMigrationSnapshot>
    : null;
  if (!source || source.version !== 1 || source.accountId !== accountId) return null;
  const targetBaseId = cleanText(source.targetBaseId, 180);
  const items = Array.isArray(source.items)
    ? source.items.map(sanitizeMigrationItem).filter((item): item is KnowledgeMigrationItem => Boolean(item))
    : [];
  if (!targetBaseId || !items.length) return null;
  return {
    version: 1 as const,
    accountId,
    targetBaseId,
    items,
    updatedAt: cleanText(source.updatedAt, 80) || new Date().toISOString()
  };
}

export async function saveKnowledgeMigrationSnapshot(snapshot: KnowledgeMigrationSnapshot) {
  const sanitized: KnowledgeMigrationSnapshot = {
    version: 1,
    accountId: snapshot.accountId,
    targetBaseId: snapshot.targetBaseId,
    items: snapshot.items.map(sanitizeMigrationItem).filter((item): item is KnowledgeMigrationItem => Boolean(item)),
    updatedAt: new Date().toISOString()
  };
  await putWorkspaceRecord("meta", {
    key: migrationMetaKey(snapshot.accountId),
    value: sanitized
  });
  return sanitized;
}

export function createKnowledgeMigrationSnapshot(
  accountId: string,
  targetBaseId: string,
  documents: KnowledgeDocument[],
  existing: KnowledgeMigrationSnapshot | null
): KnowledgeMigrationSnapshot {
  const previous = new Map(
    existing?.targetBaseId === targetBaseId
      ? existing.items.map((item) => [item.localDocumentId, item])
      : []
  );
  const now = new Date().toISOString();
  return {
    version: 1,
    accountId,
    targetBaseId,
    items: documents.map((document) => {
      const current = previous.get(document.id);
      return current || {
        localDocumentId: document.id,
        targetBaseId,
        name: document.name,
        bytes: new Blob([document.text]).size,
        stage: "pending" as const,
        updatedAt: now
      };
    }),
    updatedAt: now
  };
}

export function updateKnowledgeMigrationItem(
  snapshot: KnowledgeMigrationSnapshot,
  localDocumentId: string,
  patch: Partial<KnowledgeMigrationItem>
) {
  return {
    ...snapshot,
    items: snapshot.items.map((item) => item.localDocumentId === localDocumentId
      ? { ...item, ...patch, updatedAt: new Date().toISOString() }
      : item),
    updatedAt: new Date().toISOString()
  };
}

export function cloudStatusMigrationStage(
  status: KnowledgeCloudDocumentStatus
): KnowledgeMigrationStage {
  if (status === "ready") return "ready";
  if (status === "awaiting_embedding") return "awaiting_embedding";
  if (status === "embedding") return "embedding";
  if (status === "failed" || status === "needs_ocr" || status === "deleting") return "failed";
  if (status === "pending_upload") return "uploading";
  return "processing";
}

export function createLocalMigrationFile(document: KnowledgeDocument) {
  const stem = document.name.replace(/\.[^.]+$/u, "").trim() || "本地资料";
  const text = `# ${document.name}\n\n${document.text.trim()}\n`;
  return new File([text], `${stem}-本地迁移.txt`, {
    type: "text/plain",
    lastModified: Date.now()
  });
}

export function loadLocalKnowledgeDocuments() {
  return loadWorkspaceKnowledgeDocuments();
}

export async function removeLocalKnowledgeDocuments(documentIds: string[]) {
  const remove = new Set(documentIds);
  const current = await loadWorkspaceKnowledgeDocuments();
  const next = current.filter((document) => !remove.has(document.id));
  await saveWorkspaceKnowledgeDocuments(next);
  return next;
}
