import type { KnowledgeDocument } from "../../types";
import { clearKnowledgeDocuments, loadKnowledgeDocuments, saveKnowledgeDocuments } from "./knowledgeStore";

const dbName = "cherry-web-knowledge-db";
const storeName = "documents";
const dbVersion = 1;

function openKnowledgeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
}

function transaction<T>(mode: IDBTransactionMode, runner: (store: IDBObjectStore) => IDBRequest<T> | void) {
  return openKnowledgeDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = runner(store);
        let result: T;
        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
        }
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("IndexedDB transaction failed"));
        };
      })
  );
}

export async function loadKnowledgeDocumentsAsync(): Promise<KnowledgeDocument[]> {
  try {
    const documents = await transaction<KnowledgeDocument[]>("readonly", (store) => store.getAll());
    if (documents?.length) return documents;
    const legacy = loadKnowledgeDocuments();
    if (legacy.length) {
      await saveKnowledgeDocumentsAsync(legacy);
      clearKnowledgeDocuments();
    }
    return legacy;
  } catch {
    return loadKnowledgeDocuments();
  }
}

export async function saveKnowledgeDocumentsAsync(documents: KnowledgeDocument[]) {
  try {
    await transaction<void>("readwrite", (store) => {
      store.clear();
      documents.forEach((document) => store.put(document));
    });
  } catch {
    saveKnowledgeDocuments(documents);
  }
}

export async function clearKnowledgeDocumentsAsync() {
  try {
    await transaction<void>("readwrite", (store) => {
      store.clear();
    });
  } catch {
    clearKnowledgeDocuments();
  }
}
