import type { Assistant, Conversation, ConversationSummary, Message } from "../../types";

const storageKey = "cherry-web-local-conversations";
const maxConversations = 40;
const maxMessagesPerConversation = 80;
const maxMessageLength = 24000;
const maxSerializedLength = 4_200_000;

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function makeConversationTitle(content: string) {
  const title = cleanText(content, 36).replace(/\s+/g, " ");
  return title || "新对话";
}

function sanitizeMessage(value: unknown): Message | null {
  const source = value && typeof value === "object" ? (value as Partial<Message>) : null;
  if (!source?.id || !source.role) return null;
  if (source.role !== "user" && source.role !== "assistant") return null;
  return {
    id: cleanText(source.id, 120),
    role: source.role,
    content: cleanText(source.content, maxMessageLength),
    model: cleanText(source.model, 180) || undefined,
    providerId: cleanText(source.providerId, 180) || undefined,
    status:
      source.status === "streaming" ||
      source.status === "done" ||
      source.status === "error" ||
      source.status === "stopped"
        ? source.status
        : undefined,
    createdAt: cleanText(source.createdAt, 80) || new Date().toISOString()
  };
}

function sanitizeConversation(value: unknown): Conversation | null {
  const source = value && typeof value === "object" ? (value as Partial<Conversation>) : null;
  if (!source?.id || !source.assistantId) return null;
  const messages = Array.isArray(source.messages)
    ? source.messages
        .map(sanitizeMessage)
        .filter((message): message is Message => Boolean(message))
        .slice(-maxMessagesPerConversation)
    : [];
  const createdAt = cleanText(source.createdAt, 80) || new Date().toISOString();
  return {
    id: cleanText(source.id, 120),
    title: cleanText(source.title, 120) || "新对话",
    assistantId: cleanText(source.assistantId, 120),
    pinned: Boolean(source.pinned),
    messageCount: messages.length,
    preview: "",
    messages,
    createdAt,
    updatedAt: cleanText(source.updatedAt, 80) || createdAt
  };
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

export function loadLocalConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? sortConversations(parsed.map(sanitizeConversation).filter((item): item is Conversation => Boolean(item)))
          .slice(0, maxConversations)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalConversations(conversations: Conversation[]) {
  if (typeof window === "undefined") return;
  const sanitized = sortConversations(
    conversations.map(sanitizeConversation).filter((item): item is Conversation => Boolean(item))
  ).slice(0, maxConversations);

  if (!sanitized.length) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  let next = sanitized;
  while (next.length) {
    const serialized = JSON.stringify(next);
    if (serialized.length <= maxSerializedLength) {
      try {
        window.localStorage.setItem(storageKey, serialized);
        return;
      } catch {
        next = next.slice(0, -1);
        continue;
      }
    }
    next = next.slice(0, -1);
  }

  window.localStorage.removeItem(storageKey);
}

export function createLocalConversation(assistant: Assistant, title = "新对话"): Conversation {
  const createdAt = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    title,
    assistantId: assistant.id,
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
