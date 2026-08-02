import type { ChatAttachment, Conversation, Message } from "../../types";

const serverImageAttachmentLimit = 6;
const serverTextAttachmentLimit = 4;

type AttachmentLimits = {
  imageLimit: number;
  includeImages: boolean;
};

function normalizedImageLimit(value: number) {
  if (!Number.isFinite(value)) return serverImageAttachmentLimit;
  return Math.max(0, Math.min(serverImageAttachmentLimit, Math.trunc(value)));
}

export function boundedChatAttachments(
  attachments: readonly ChatAttachment[],
  { imageLimit, includeImages }: AttachmentLimits
) {
  const bounded: ChatAttachment[] = [];
  let imageCount = 0;
  let textCount = 0;
  const maximumImages = normalizedImageLimit(imageLimit);

  for (const attachment of attachments) {
    if (attachment.kind === "image") {
      if (!includeImages || imageCount >= maximumImages) continue;
      imageCount += 1;
      bounded.push(attachment);
    } else if (attachment.kind === "text") {
      if (textCount >= serverTextAttachmentLimit) continue;
      textCount += 1;
      bounded.push(attachment);
    }
    if (bounded.length >= serverImageAttachmentLimit + serverTextAttachmentLimit) break;
  }
  return bounded;
}

export function chatAttachmentsForRequest(
  history: readonly Message[],
  currentAttachments: readonly ChatAttachment[],
  limits: AttachmentLimits
) {
  const selected = boundedChatAttachments(currentAttachments, limits);
  const seenIds = new Set(selected.map((attachment) => attachment.id));
  let imageCount = selected.filter((attachment) => attachment.kind === "image").length;
  let textCount = selected.filter((attachment) => attachment.kind === "text").length;
  const maximumImages = normalizedImageLimit(limits.imageLimit);

  for (let messageIndex = history.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const attachments = history[messageIndex].attachments || [];
    for (let attachmentIndex = attachments.length - 1; attachmentIndex >= 0; attachmentIndex -= 1) {
      const attachment = attachments[attachmentIndex];
      if (seenIds.has(attachment.id)) continue;
      if (attachment.kind === "image") {
        if (!limits.includeImages || imageCount >= maximumImages) continue;
        imageCount += 1;
      } else if (attachment.kind === "text") {
        if (textCount >= serverTextAttachmentLimit) continue;
        textCount += 1;
      } else {
        continue;
      }
      seenIds.add(attachment.id);
      selected.push(attachment);
      if (imageCount >= maximumImages && textCount >= serverTextAttachmentLimit) return selected;
    }
  }
  return selected;
}

export function chatHistoryWithoutAttachments(messages: readonly Message[]) {
  return messages.map(({ attachments: _attachments, ...message }) => message);
}

export function settleStreamingMessage(
  conversations: readonly Conversation[],
  conversationId: string,
  messageId: string,
  status: "error" | "stopped"
) {
  if (!messageId) return [...conversations];
  return conversations.map((conversation) => conversation.id === conversationId
    ? {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId && message.status === "streaming"
            ? { ...message, status }
            : message
        )
      }
    : conversation);
}
