import type {
  AgentMemoryRecord,
  AgentSkillDefinition,
  AgentWorkflowDefinition,
  Conversation,
  GalleryItem,
  ImageGenerationTimingRecord,
  KnowledgeDocument,
  MediaJob,
  UserAgentDefinition,
  WorkspaceBackupRun,
  WorkspacePreferenceRecord,
  WorkspaceSnapshot
} from "../../types";

export const workspaceDbName = "xi-ai-web-workspace";
export const workspaceDbVersion = 3;

export type WorkspaceMetaRecord = {
  key: string;
  value: unknown;
};

type WorkspaceStoreMap = {
  meta: WorkspaceMetaRecord;
  conversations: Conversation;
  galleryItems: GalleryItem;
  imageGenerationHistory: ImageGenerationTimingRecord;
  knowledgeDocuments: KnowledgeDocument;
  mediaJobs: MediaJob;
  userAgents: UserAgentDefinition;
  agentSkills: AgentSkillDefinition;
  workflows: AgentWorkflowDefinition;
  agentMemories: AgentMemoryRecord;
  preferences: WorkspacePreferenceRecord;
  backupRuns: WorkspaceBackupRun;
};

export type WorkspaceStoreName = keyof WorkspaceStoreMap;
export type WorkspaceDataStoreName = Exclude<WorkspaceStoreName, "meta">;

export const workspaceDataStoreNames: readonly WorkspaceDataStoreName[] = [
  "conversations",
  "galleryItems",
  "imageGenerationHistory",
  "knowledgeDocuments",
  "mediaJobs",
  "userAgents",
  "agentSkills",
  "workflows",
  "agentMemories",
  "preferences",
  "backupRuns"
];

const storeKeyPaths: Record<WorkspaceStoreName, "id" | "key"> = {
  meta: "key",
  conversations: "id",
  galleryItems: "id",
  imageGenerationHistory: "id",
  knowledgeDocuments: "id",
  mediaJobs: "id",
  userAgents: "id",
  agentSkills: "id",
  workflows: "id",
  agentMemories: "id",
  preferences: "key",
  backupRuns: "id"
};

let workspaceDbPromise: Promise<IDBDatabase> | null = null;
let workspaceWriteQueue: Promise<void> = Promise.resolve();
let workspaceWritesSuspended = false;

function workspaceError(message: string, cause?: unknown) {
  const error = new Error(message);
  if (cause !== undefined) error.cause = cause;
  return error;
}

export function openWorkspaceDb(): Promise<IDBDatabase> {
  if (workspaceDbPromise) return workspaceDbPromise;
  workspaceDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(workspaceError("当前浏览器不可使用 IndexedDB。"));
      return;
    }
    const request = indexedDB.open(workspaceDbName, workspaceDbVersion);
    let settled = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      (Object.keys(storeKeyPaths) as WorkspaceStoreName[]).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: storeKeyPaths[storeName] });
        }
      });
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(workspaceError("另一个标签页阻止了工作区数据库升级，请关闭旧页面后重试。"));
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(workspaceError("无法打开工作区数据库。", request.error));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        workspaceDbPromise = null;
      };
      resolve(db);
    };
  }).catch((error) => {
    workspaceDbPromise = null;
    throw error;
  });
  return workspaceDbPromise;
}

function transactionFailure(tx: IDBTransaction, fallback: string) {
  if (tx.error?.name === "QuotaExceededError") {
    return workspaceError("工作区存储空间不足，请先导出备份或清理大型画廊资源。", tx.error);
  }
  return workspaceError(fallback, tx.error);
}

function waitForTransaction(tx: IDBTransaction, failureMessage: string) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(transactionFailure(tx, failureMessage));
    tx.onabort = () => reject(transactionFailure(tx, failureMessage));
  });
}

function enqueueWorkspaceWrite<T>(runner: () => Promise<T>, allowWhenSuspended = false): Promise<T> {
  if (workspaceWritesSuspended && !allowWhenSuspended) {
    return Promise.reject(workspaceError("工作区正在恢复，已暂停新的本地写入。"));
  }
  const task = workspaceWriteQueue.then(runner, runner);
  workspaceWriteQueue = task.then(() => undefined, () => undefined);
  return task;
}

export function suspendWorkspaceWrites() {
  workspaceWritesSuspended = true;
}

export function resumeWorkspaceWrites() {
  workspaceWritesSuspended = false;
}

export async function waitForWorkspaceWrites() {
  await workspaceWriteQueue;
}

export async function readWorkspaceRevision(): Promise<number> {
  const record = await getWorkspaceRecord("meta", "workspaceRevision");
  const revision = Number(record?.value);
  if (!Number.isSafeInteger(revision) || revision < 0) return 0;
  return Math.min(revision, Number.MAX_SAFE_INTEGER);
}

function incrementRevision(tx: IDBTransaction) {
  const meta = tx.objectStore("meta");
  const request = meta.get("workspaceRevision");
  request.onsuccess = () => {
    const current = request.result as WorkspaceMetaRecord | undefined;
    const revision = Number(current?.value);
    meta.put({ key: "workspaceRevision", value: Number.isFinite(revision) ? revision + 1 : 1 });
  };
}

export async function getAllWorkspaceRecords<Name extends WorkspaceDataStoreName>(
  storeName: Name
): Promise<WorkspaceStoreMap[Name][]> {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    let result: WorkspaceStoreMap[Name][] = [];
    request.onsuccess = () => {
      result = request.result as WorkspaceStoreMap[Name][];
    };
    request.onerror = () => reject(workspaceError(`无法读取工作区 ${storeName}。`, request.error));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(transactionFailure(tx, `无法读取工作区 ${storeName}。`));
    tx.onabort = () => reject(transactionFailure(tx, `无法读取工作区 ${storeName}。`));
  });
}

export async function replaceAllWorkspaceRecords<Name extends WorkspaceDataStoreName>(
  storeName: Name,
  records: WorkspaceStoreMap[Name][]
) {
  return enqueueWorkspaceWrite(async () => {
    const db = await openWorkspaceDb();
    const tx = db.transaction([storeName, "meta"], "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    records.forEach((record) => store.put(record));
    incrementRevision(tx);
    await waitForTransaction(tx, `无法保存工作区 ${storeName}。`);
  });
}

export async function putAllWorkspaceRecords<Name extends WorkspaceDataStoreName>(
  storeName: Name,
  records: WorkspaceStoreMap[Name][]
) {
  if (!records.length) return;
  return enqueueWorkspaceWrite(async () => {
    const db = await openWorkspaceDb();
    const tx = db.transaction([storeName, "meta"], "readwrite");
    const store = tx.objectStore(storeName);
    records.forEach((record) => store.put(record));
    incrementRevision(tx);
    await waitForTransaction(tx, `无法保存工作区 ${storeName}。`);
  });
}

export async function clearWorkspaceStore(storeName: WorkspaceDataStoreName) {
  await replaceAllWorkspaceRecords(storeName, []);
}

export async function getWorkspaceRecord<Name extends WorkspaceStoreName>(
  storeName: Name,
  key: IDBValidKey
): Promise<WorkspaceStoreMap[Name] | undefined> {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    let result: WorkspaceStoreMap[Name] | undefined;
    request.onsuccess = () => {
      result = request.result as WorkspaceStoreMap[Name] | undefined;
    };
    request.onerror = () => reject(workspaceError(`无法读取工作区 ${storeName} 记录。`, request.error));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(transactionFailure(tx, `无法读取工作区 ${storeName} 记录。`));
    tx.onabort = () => reject(transactionFailure(tx, `无法读取工作区 ${storeName} 记录。`));
  });
}

export async function putWorkspaceRecord<Name extends WorkspaceStoreName>(
  storeName: Name,
  record: WorkspaceStoreMap[Name]
) {
  return enqueueWorkspaceWrite(async () => {
    const db = await openWorkspaceDb();
    const storeNames: WorkspaceStoreName[] = storeName === "meta" ? ["meta"] : [storeName, "meta"];
    const tx = db.transaction(storeNames, "readwrite");
    tx.objectStore(storeName).put(record);
    if (storeName !== "meta") incrementRevision(tx);
    await waitForTransaction(tx, `无法保存工作区 ${storeName} 记录。`);
  });
}

export async function readWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...workspaceDataStoreNames], "readonly");
    const values = new Map<WorkspaceDataStoreName, unknown[]>();
    workspaceDataStoreNames.forEach((storeName) => {
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => values.set(storeName, request.result);
    });
    tx.oncomplete = () => resolve({
      conversations: values.get("conversations") as Conversation[] || [],
      galleryItems: values.get("galleryItems") as GalleryItem[] || [],
      imageGenerationHistory: values.get("imageGenerationHistory") as ImageGenerationTimingRecord[] || [],
      knowledgeDocuments: values.get("knowledgeDocuments") as KnowledgeDocument[] || [],
      mediaJobs: values.get("mediaJobs") as MediaJob[] || [],
      userAgents: values.get("userAgents") as UserAgentDefinition[] || [],
      agentSkills: values.get("agentSkills") as AgentSkillDefinition[] || [],
      workflows: values.get("workflows") as AgentWorkflowDefinition[] || [],
      agentMemories: values.get("agentMemories") as AgentMemoryRecord[] || [],
      preferences: values.get("preferences") as WorkspacePreferenceRecord[] || [],
      backupRuns: values.get("backupRuns") as WorkspaceBackupRun[] || []
    });
    tx.onerror = () => reject(transactionFailure(tx, "无法读取完整工作区。"));
    tx.onabort = () => reject(transactionFailure(tx, "无法读取完整工作区。"));
  });
}

function replaceSnapshotInTransaction(tx: IDBTransaction, snapshot: WorkspaceSnapshot) {
  workspaceDataStoreNames.forEach((storeName) => {
    const store = tx.objectStore(storeName);
    store.clear();
    snapshot[storeName].forEach((record) => store.put(record));
  });
}

export async function replaceWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  return enqueueWorkspaceWrite(async () => {
    const db = await openWorkspaceDb();
    const tx = db.transaction([...workspaceDataStoreNames, "meta"], "readwrite");
    replaceSnapshotInTransaction(tx, snapshot);
    incrementRevision(tx);
    await waitForTransaction(tx, "无法原子恢复完整工作区。");
  }, true);
}

export async function commitLegacyWorkspaceMigration(snapshot: WorkspaceSnapshot) {
  return enqueueWorkspaceWrite(async () => {
    const db = await openWorkspaceDb();
    const tx = db.transaction([...workspaceDataStoreNames, "meta"], "readwrite");
    replaceSnapshotInTransaction(tx, snapshot);
    const meta = tx.objectStore("meta");
    meta.put({ key: "legacyMigrationV1", value: true });
    incrementRevision(tx);
    await waitForTransaction(tx, "无法迁移旧工作区数据。");
  });
}
