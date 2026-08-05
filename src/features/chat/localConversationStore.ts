import type { Assistant, Conversation, ConversationSummary, Message } from "../../types";
import { createClientId } from "../../utils/clientId";
import { sanitizeWorkspaceConversation } from "../workspace/workspaceArchive";
import {
  loadWorkspaceConversations,
  saveWorkspaceConversations
} from "../workspace/workspaceRepository";

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function makeConversationTitle(content: string) {
  const title = cleanText(content, 36).replace(/\s+/g, " ");
  return title || "新对话";
}

export function conversationSummary(conversation: Conversation): ConversationSummary {
  const lastMessage = [...conversation.messages].reverse().find((message) => message.content);
  return {
    id: conversation.id,
    title: conversation.title,
    assistantId: conversation.assistantId,
    pinned: Boolean(conversation.pinned),
    messageCount: conversation.messages.length,
    preview: lastMessage?.content.replace(/\s+/g, " ").slice(0, 120) || "",
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

export function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function loadLocalConversations(): Promise<Conversation[]> {
  return sortConversations(await loadWorkspaceConversations());
}

export async function saveLocalConversations(conversations: Conversation[]) {
  const sanitized = sortConversations(
    conversations
      .map(sanitizeWorkspaceConversation)
      .filter((item): item is Conversation => Boolean(item))
  );
  await saveWorkspaceConversations(sanitized);
}

export function createLocalConversation(assistant?: Assistant, title = "新对话"): Conversation {
  const createdAt = new Date().toISOString();
  return {
    id: createClientId(),
    title,
    assistantId: assistant?.id || "",
    pinned: false,
    messageCount: 0,
    preview: "",
    messages: [],
    createdAt,
    updatedAt: createdAt
  };
}

export function localSummaries(conversations: Conversation[]) {
  return sortConversations(conversations).map(conversationSummary);
}
