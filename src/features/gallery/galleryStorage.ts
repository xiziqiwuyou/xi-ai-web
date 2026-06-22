import type { GalleryItem } from "../../types";

const storageKey = "cherry-web-gallery-items";
const maxItems = 30;
const maxPromptLength = 4000;
const maxTextLength = 20000;
const maxAssetUrlLength = 900000;
const maxSerializedLength = 4200000;

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function sanitizeGalleryItem(value: unknown): GalleryItem | null {
  const source = value && typeof value === "object" ? (value as Partial<GalleryItem>) : null;
  if (!source?.id || !source.sourceModule || !source.module || !source.createdAt) return null;

  const assets = Array.isArray(source.assets)
    ? source.assets
        .filter((asset) => asset && typeof asset.url === "string" && asset.url.length <= maxAssetUrlLength)
        .slice(0, 4)
        .map((asset) => ({
          type: asset.type,
          url: asset.url,
          label: cleanText(asset.label, 120)
        }))
    : undefined;

  return {
    id: cleanText(source.id, 120),
    module: source.module,
    sourceModule: source.sourceModule,
    title: cleanText(source.title, 160) || "生成结果",
    status: source.status === "submitted" ? "submitted" : source.status === "failed" ? "failed" : "completed",
    text: cleanText(source.text, maxTextLength) || undefined,
    assets: assets?.length ? assets : undefined,
    createdAt: cleanText(source.createdAt, 80),
    prompt: cleanText(source.prompt, maxPromptLength),
    modelId: cleanText(source.modelId, 160),
    favorite: Boolean(source.favorite),
    tags: Array.isArray(source.tags) ? source.tags.map((tag) => cleanText(tag, 60)).filter(Boolean).slice(0, 8) : undefined
  };
}

export function loadGalleryItems() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map(sanitizeGalleryItem).filter((item): item is GalleryItem => Boolean(item)).slice(0, maxItems)
      : [];
  } catch {
    return [];
  }
}

export function saveGalleryItems(items: GalleryItem[]) {
  if (typeof window === "undefined") return;

  const sanitized = items
    .map(sanitizeGalleryItem)
    .filter((item): item is GalleryItem => Boolean(item))
    .slice(0, maxItems);

  if (!sanitized.length) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  let nextItems = sanitized;
  while (nextItems.length) {
    const serialized = JSON.stringify(nextItems);
    if (serialized.length <= maxSerializedLength) {
      try {
        window.localStorage.setItem(storageKey, serialized);
        return;
      } catch {
        nextItems = nextItems.slice(0, -1);
        continue;
      }
    }
    nextItems = nextItems.slice(0, -1);
  }

  window.localStorage.removeItem(storageKey);
}
