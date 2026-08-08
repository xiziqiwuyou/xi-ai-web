import type {
  Conversation,
  ArtifactRecord,
  GalleryItem,
  ImageGenerationTimingRecord,
  KnowledgeDocument,
  MediaJob,
  WorkspaceDataCounts,
  WorkspaceExportEnvelope,
  WorkspaceSnapshot
} from "../../types";
import {
  createWorkspaceExportBlob,
  mergeWorkspaceSnapshots,
  sanitizeWorkspaceConversation,
  sanitizeWorkspaceGalleryItem,
  sanitizeImageGenerationTimingRecord,
  sanitizeWorkspaceKnowledgeDocument,
  sanitizeWorkspaceMediaJob,
  sanitizeWorkspaceSnapshot,
  workspaceDataCounts
} from "./workspaceArchive";
import { artifactMaxCount, sanitizeArtifact } from "../chat/artifactWorkspace";
import {
  getAllWorkspaceRecords,
  putWorkspaceRecord,
  readWorkspaceRevision,
  readWorkspaceSnapshot,
  replaceAllWorkspaceRecords,
  replaceWorkspaceSnapshot,
  resumeWorkspaceWrites,
  suspendWorkspaceWrites,
  waitForWorkspaceWrites,
  workspaceDbName
} from "./workspaceDb";
import {
  initializeWorkspace,
  loadLegacyKnowledgeFallback,
  readLegacyConversations,
  readLegacyGalleryItems,
  readLegacyMediaJobs,
  themeStorageKey
} from "./workspaceMigration";

export type WorkspaceStorageSummary = {
  available: boolean;
  database: string;
  counts: WorkspaceDataCounts;
  usage?: number;
  quota?: number;
  persisted?: boolean;
  error?: string;
};

function sanitizeList<T>(items: T[], sanitizer: (value: unknown) => T | null) {
  return items.map(sanitizer).filter((item): item is T => Boolean(item));
}

export async function loadWorkspaceConversations(): Promise<Conversation[]> {
  try {
    await initializeWorkspace();
    return sanitizeList(await getAllWorkspaceRecords("conversations"), sanitizeWorkspaceConversation);
  } catch {
    return readLegacyConversations();
  }
}

export async function saveWorkspaceConversations(conversations: Conversation[]) {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords("conversations", sanitizeList(conversations, sanitizeWorkspaceConversation));
}

export async function loadWorkspaceArtifacts(): Promise<ArtifactRecord[]> {
  await initializeWorkspace();
  return sanitizeList(await getAllWorkspaceRecords("artifacts"), sanitizeArtifact).slice(0, artifactMaxCount);
}

export async function saveWorkspaceArtifacts(artifacts: ArtifactRecord[]) {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords(
    "artifacts",
    sanitizeList(artifacts, sanitizeArtifact).slice(0, artifactMaxCount)
  );
}

export async function loadWorkspaceGalleryItems(): Promise<GalleryItem[]> {
  try {
    await initializeWorkspace();
    return sanitizeList(await getAllWorkspaceRecords("galleryItems"), sanitizeWorkspaceGalleryItem);
  } catch {
    return readLegacyGalleryItems();
  }
}

export async function saveWorkspaceGalleryItems(items: GalleryItem[]) {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords("galleryItems", sanitizeList(items, sanitizeWorkspaceGalleryItem));
}

export async function loadImageGenerationHistory(): Promise<ImageGenerationTimingRecord[]> {
  try {
    await initializeWorkspace();
    return sanitizeList(
      await getAllWorkspaceRecords("imageGenerationHistory"),
      sanitizeImageGenerationTimingRecord
    ).sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
  } catch {
    return [];
  }
}

export async function saveImageGenerationTiming(record: ImageGenerationTimingRecord) {
  await initializeWorkspace();
  const current = await loadImageGenerationHistory();
  const next = [
    sanitizeImageGenerationTimingRecord(record),
    ...current.filter((item) => item.id !== record.id)
  ].filter((item): item is ImageGenerationTimingRecord => Boolean(item)).slice(0, 60);
  await replaceAllWorkspaceRecords("imageGenerationHistory", next);
}

export async function loadWorkspaceKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  try {
    await initializeWorkspace();
    return sanitizeList(await getAllWorkspaceRecords("knowledgeDocuments"), sanitizeWorkspaceKnowledgeDocument);
  } catch {
    return loadLegacyKnowledgeFallback();
  }
}

export async function saveWorkspaceKnowledgeDocuments(documents: KnowledgeDocument[]) {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords(
    "knowledgeDocuments",
    sanitizeList(documents, sanitizeWorkspaceKnowledgeDocument)
  );
}

export async function clearWorkspaceKnowledgeDocuments() {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords("knowledgeDocuments", []);
}

export async function loadWorkspaceMediaJobs(): Promise<MediaJob[]> {
  try {
    await initializeWorkspace();
    return sanitizeList(await getAllWorkspaceRecords("mediaJobs"), sanitizeWorkspaceMediaJob);
  } catch {
    return readLegacyMediaJobs();
  }
}

export async function saveWorkspaceMediaJobs(jobs: MediaJob[]) {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords("mediaJobs", sanitizeList(jobs, sanitizeWorkspaceMediaJob));
}

export async function saveWorkspaceThemePreference(value: "dark" | "light") {
  await initializeWorkspace();
  await putWorkspaceRecord("preferences", {
    key: "theme",
    value,
    updatedAt: new Date().toISOString()
  });
}

export async function getWorkspaceStorageSummary(): Promise<WorkspaceStorageSummary> {
  try {
    await initializeWorkspace();
    const snapshot = sanitizeWorkspaceSnapshot(await readWorkspaceSnapshot(), true);
    const estimate = typeof navigator !== "undefined" && navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : undefined;
    const persisted = typeof navigator !== "undefined" && navigator.storage?.persisted
      ? await navigator.storage.persisted()
      : undefined;
    return {
      available: true,
      database: workspaceDbName,
      counts: workspaceDataCounts(snapshot),
      usage: estimate?.usage,
      quota: estimate?.quota,
      persisted
    };
  } catch (error) {
    return {
      available: false,
      database: workspaceDbName,
      counts: workspaceDataCounts({
        conversations: readLegacyConversations(),
        galleryItems: readLegacyGalleryItems(),
        imageGenerationHistory: [],
        artifacts: [],
        knowledgeDocuments: await loadLegacyKnowledgeFallback(),
        mediaJobs: readLegacyMediaJobs(),
        userAgents: [],
        agentSkills: [],
        workflows: [],
        agentMemories: [],
        preferences: [],
        backupRuns: []
      }),
      error: error instanceof Error ? error.message : "工作区存储不可用。"
    };
  }
}

export async function exportWorkspaceArchive() {
  await initializeWorkspace();
  return createWorkspaceExportBlob(await readWorkspaceSnapshot());
}

export type StableWorkspaceCapture = {
  envelope: WorkspaceExportEnvelope;
  revision: number;
};

export async function captureStableWorkspaceArchive(maxAttempts = 2): Promise<StableWorkspaceCapture> {
  await initializeWorkspace();
  const attempts = Math.max(1, Math.min(3, Math.trunc(maxAttempts)));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await waitForWorkspaceWrites();
    const revisionBefore = await readWorkspaceRevision();
    const snapshot = await readWorkspaceSnapshot();
    const envelope = await createWorkspaceExportBlob(snapshot).then((result) => result.envelope);
    const revisionAfter = await readWorkspaceRevision();
    if (revisionBefore === revisionAfter) {
      return { envelope, revision: revisionAfter };
    }
  }

  throw new Error("工作区在捕获期间发生了变化，请停止编辑后重试。");
}

function syncThemeMirror(snapshot: WorkspaceSnapshot) {
  const theme = snapshot.preferences.find((item) => item.key === "theme")?.value;
  if (!theme || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // IndexedDB remains authoritative; the mirror is only for first-paint theme selection.
  }
}

export async function restoreWorkspaceArchive(
  envelope: WorkspaceExportEnvelope,
  mode: "merge" | "replace",
  expectedRevision?: number
) {
  await initializeWorkspace();
  suspendWorkspaceWrites();
  try {
    await waitForWorkspaceWrites();
    if (expectedRevision !== undefined) {
      const currentRevision = await readWorkspaceRevision();
      if (currentRevision !== expectedRevision) {
        throw new Error("本机工作区在预览后发生了变化，请重新获取同步内容后再恢复。");
      }
    }
    const incoming = sanitizeWorkspaceSnapshot(envelope.workspace, true);
    const snapshot = mode === "merge"
      ? mergeWorkspaceSnapshots(await readWorkspaceSnapshot(), incoming)
      : incoming;
    await replaceWorkspaceSnapshot(snapshot);
    syncThemeMirror(snapshot);
  } finally {
    resumeWorkspaceWrites();
  }
}
