import type { GalleryItem, ModuleId } from "../../types";

const storageKey = "cherry-web-replay-draft";

export type ReplayDraft = {
  moduleId: ModuleId;
  prompt: string;
  modelId?: string;
};

export function saveReplayDraft(item: GalleryItem) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      moduleId: item.sourceModule,
      prompt: item.prompt,
      modelId: item.modelId
    } satisfies ReplayDraft)
  );
}

export function consumeReplayDraft(moduleId: ModuleId): ReplayDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReplayDraft;
    if (parsed.moduleId !== moduleId) return null;
    window.sessionStorage.removeItem(storageKey);
    return parsed;
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
}
