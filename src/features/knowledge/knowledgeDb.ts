import type { KnowledgeDocument } from "../../types";
import {
  clearWorkspaceKnowledgeDocuments,
  loadWorkspaceKnowledgeDocuments,
  saveWorkspaceKnowledgeDocuments
} from "../workspace/workspaceRepository";

export async function loadKnowledgeDocumentsAsync(): Promise<KnowledgeDocument[]> {
  return loadWorkspaceKnowledgeDocuments();
}

export async function saveKnowledgeDocumentsAsync(documents: KnowledgeDocument[]) {
  await saveWorkspaceKnowledgeDocuments(documents);
}

export async function clearKnowledgeDocumentsAsync() {
  await clearWorkspaceKnowledgeDocuments();
}
