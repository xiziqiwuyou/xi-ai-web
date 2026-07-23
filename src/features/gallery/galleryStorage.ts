import type { GalleryItem } from "../../types";
import { sanitizeWorkspaceGalleryItem } from "../workspace/workspaceArchive";
import {
  loadWorkspaceGalleryItems,
  saveWorkspaceGalleryItems
} from "../workspace/workspaceRepository";

export async function loadGalleryItems() {
  return loadWorkspaceGalleryItems();
}

export async function saveGalleryItems(items: GalleryItem[]) {
  const sanitized = items
    .map(sanitizeWorkspaceGalleryItem)
    .filter((item): item is GalleryItem => Boolean(item));
  await saveWorkspaceGalleryItems(sanitized);
}
