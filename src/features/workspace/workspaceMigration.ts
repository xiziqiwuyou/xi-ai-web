import type {
  Conversation,
  GalleryItem,
  KnowledgeDocument,
  MediaJob,
  WorkspacePreferenceRecord,
  WorkspaceSnapshot
} from "../../types";
import {
  emptyWorkspaceSnapshot,
  mergeWorkspaceSnapshots,
  sanitizeWorkspaceConversation,
  sanitizeWorkspaceGalleryItem,
  sanitizeWorkspaceKnowledgeDocument,
  sanitizeWorkspaceMediaJob
} from "./workspaceArchive";
import {
  commitLegacyWorkspaceMigration,
  getWorkspaceRecord,
  openWorkspaceDb,
  readWorkspaceSnapshot
} from "./workspaceDb";

export const legacyConversationStorageKey = "cherry-web-local-conversations";
export const legacyGalleryStorageKey = "cherry-web-gallery-items";
export const legacyKnowledgeStorageKey = "cherry-web-knowledge-documents";
export const legacyMediaJobStorageKey = "cherry-web-media-jobs";
export const themeStorageKey = "aistudio-theme";

const legacyKnowledgeDbName = "cherry-web-knowledge-db";
const legacyKnowledgeStoreName = "documents";
let initializationPromise: Promise<void> | null = null;

function readLegacyArray<T>(key: string, sanitizer: (value: unknown) => T | null): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map(sanitizer).filter((item): item is T => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

export function readLegacyConversations(): Conversation[] {
  return readLegacyArray(legacyConversationStorageKey, sanitizeWorkspaceConversation);
}

export function readLegacyGalleryItems(): GalleryItem[] {
  return readLegacyArray(legacyGalleryStorageKey, sanitizeWorkspaceGalleryItem);
}

export function readLegacyKnowledgeDocuments(): KnowledgeDocument[] {
  return readLegacyArray(legacyKnowledgeStorageKey, sanitizeWorkspaceKnowledgeDocument);
}

export function readLegacyMediaJobs(): MediaJob[] {
  return readLegacyArray(legacyMediaJobStorageKey, sanitizeWorkspaceMediaJob);
}

export function readLegacyThemePreference(): WorkspacePreferenceRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    if (value !== "dark" && value !== "light") return [];
    return [{ key: "theme", value, updatedAt: new Date().toISOString() }];
  } catch {
    return [];
  }
}

async function legacyKnowledgeDatabaseExists() {
  if (typeof indexedDB === "undefined" || !("databases" in indexedDB)) return undefined;
  try {
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === legacyKnowledgeDbName);
  } catch {
    return undefined;
  }
}

function openLegacyKnowledgeDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return legacyKnowledgeDatabaseExists().then((exists) => {
    if (exists === false) return null;
    return new Promise<IDBDatabase | null>((resolve, reject) => {
      const request = indexedDB.open(legacyKnowledgeDbName, 1);
      request.onupgradeneeded = () => {
        request.transaction?.abort();
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(legacyKnowledgeStoreName)) {
          db.close();
          resolve(null);
          return;
        }
        resolve(db);
      };
      request.onerror = () => {
        if (request.error?.name === "AbortError") {
          resolve(null);
          return;
        }
        reject(request.error || new Error("无法读取旧知识库数据库。"));
      };
    });
  }).catch((error) => {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return null;
    throw error;
  });
}

export async function readLegacyKnowledgeDbDocuments(): Promise<KnowledgeDocument[]> {
  const db = await openLegacyKnowledgeDb();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(legacyKnowledgeStoreName, "readonly");
    const request = tx.objectStore(legacyKnowledgeStoreName).getAll();
    request.onsuccess = () => resolve(
      request.result
        .map(sanitizeWorkspaceKnowledgeDocument)
        .filter((item): item is KnowledgeDocument => Boolean(item))
    );
    request.onerror = () => reject(request.error || new Error("无法读取旧知识库记录。"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("无法读取旧知识库记录。"));
    };
  });
}

export async function loadLegacyKnowledgeFallback() {
  const indexed = await readLegacyKnowledgeDbDocuments().catch(() => []);
  const local = readLegacyKnowledgeDocuments();
  return mergeWorkspaceSnapshots(
    { ...emptyWorkspaceSnapshot(), knowledgeDocuments: local },
    { ...emptyWorkspaceSnapshot(), knowledgeDocuments: indexed }
  ).knowledgeDocuments;
}

async function clearLegacyKnowledgeDbDocuments() {
  const db = await openLegacyKnowledgeDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(legacyKnowledgeStoreName, "readwrite");
    tx.objectStore(legacyKnowledgeStoreName).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("无法清理旧知识库记录。"));
    };
  });
}

function removeLegacyLocalStorage() {
  if (typeof window === "undefined") return;
  [
    legacyConversationStorageKey,
    legacyGalleryStorageKey,
    legacyKnowledgeStorageKey,
    legacyMediaJobStorageKey
  ].forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // The committed workspace remains authoritative even when legacy cleanup is denied.
    }
  });
}

async function migrateLegacyWorkspace() {
  await openWorkspaceDb();
  const marker = await getWorkspaceRecord("meta", "legacyMigrationV1");
  if (marker?.value === true) return;

  const [legacyKnowledgeIndexedDb, current] = await Promise.all([
    readLegacyKnowledgeDbDocuments(),
    readWorkspaceSnapshot()
  ]);
  const legacyLocalKnowledge = readLegacyKnowledgeDocuments();
  const knowledgeDocuments = mergeWorkspaceSnapshots(
    { ...emptyWorkspaceSnapshot(), knowledgeDocuments: legacyLocalKnowledge },
    { ...emptyWorkspaceSnapshot(), knowledgeDocuments: legacyKnowledgeIndexedDb }
  ).knowledgeDocuments;
  const legacy: WorkspaceSnapshot = {
    ...emptyWorkspaceSnapshot(),
    conversations: readLegacyConversations(),
    galleryItems: readLegacyGalleryItems(),
    knowledgeDocuments,
    mediaJobs: readLegacyMediaJobs(),
    preferences: readLegacyThemePreference()
  };
  await commitLegacyWorkspaceMigration(mergeWorkspaceSnapshots(current, legacy));
  removeLegacyLocalStorage();
  await clearLegacyKnowledgeDbDocuments().catch(() => undefined);
}

export function initializeWorkspace() {
  if (!initializationPromise) {
    initializationPromise = migrateLegacyWorkspace().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}
