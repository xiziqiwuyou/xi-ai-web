import type { ModelCatalogEntry } from "../../types";

/** Chat image input is a vision capability, not an image-generation capability. */
export function supportsChatImageInput(model?: ModelCatalogEntry) {
  return Boolean(model?.capabilities.includes("vision"));
}

export function countIncompatibleChatImages(
  attachments: readonly { kind: string }[],
  model?: ModelCatalogEntry
) {
  if (supportsChatImageInput(model)) return 0;
  return attachments.filter((attachment) => attachment.kind === "image").length;
}
