import type { Conversation } from "../../types";
import { sanitizeWorkspaceConversationArchivedAt } from "../workspace/workspaceArchive";

const maxConversationQueryLength = 240;
const maxConversationSearchResults = 50;

export type ConversationSearchResult = Pick<
  Conversation,
  "id" | "title" | "preview" | "pinned" | "messageCount" | "createdAt" | "updatedAt" | "archivedAt"
> & {
  score: number;
};

function normalizedSearchText(value: string) {
  return value.replace(/\s+/gu, " ").toLowerCase();
}

function conversationRecency(conversation: Conversation) {
  const timestamp = Date.parse(conversation.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function boundedResultLimit(limit: number) {
  if (!Number.isFinite(limit)) return maxConversationSearchResults;
  return Math.max(0, Math.min(maxConversationSearchResults, Math.trunc(limit)));
}

function projectSearchResult(conversation: Conversation, score: number): ConversationSearchResult {
  return {
    id: conversation.id,
    title: conversation.title,
    preview: conversation.preview,
    pinned: Boolean(conversation.pinned),
    messageCount: conversation.messageCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    ...(conversation.archivedAt ? { archivedAt: conversation.archivedAt } : {}),
    score
  };
}

export function normalizeConversationQuery(value: unknown) {
  if (typeof value !== "string") return "";
  return normalizedSearchText(value.trim()).slice(0, maxConversationQueryLength);
}

export function searchConversations(
  conversations: readonly Conversation[],
  query: string,
  limit = maxConversationSearchResults
): ConversationSearchResult[] {
  const normalizedQuery = normalizeConversationQuery(query);
  const resultLimit = boundedResultLimit(limit);
  if (!resultLimit) return [];

  return conversations
    .map((conversation, index) => {
      let score = 0;
      if (normalizedQuery) {
        if (normalizedSearchText(conversation.title).includes(normalizedQuery)) {
          score = 300;
        } else if (normalizedSearchText(conversation.preview).includes(normalizedQuery)) {
          score = 200;
        } else if (conversation.messages.some((message) =>
          normalizedSearchText(message.content).includes(normalizedQuery)
        )) {
          score = 100;
        } else {
          return null;
        }
      }
      return { conversation, index, score };
    })
    .filter((item): item is { conversation: Conversation; index: number; score: number } => Boolean(item))
    .sort((left, right) =>
      right.score - left.score ||
      conversationRecency(right.conversation) - conversationRecency(left.conversation) ||
      left.index - right.index
    )
    .slice(0, resultLimit)
    .map(({ conversation, score }) => projectSearchResult(conversation, score));
}

export function activeConversations(conversations: readonly Conversation[]) {
  return conversations.filter((conversation) =>
    !sanitizeWorkspaceConversationArchivedAt(conversation.archivedAt)
  );
}

export function archivedConversations(conversations: readonly Conversation[]) {
  return conversations.filter((conversation) =>
    Boolean(sanitizeWorkspaceConversationArchivedAt(conversation.archivedAt))
  );
}

function canonicalArchiveTimestamp(now?: string) {
  return sanitizeWorkspaceConversationArchivedAt(now) || new Date().toISOString();
}

export function archiveConversation(conversation: Conversation, now?: string): Conversation {
  return {
    ...conversation,
    pinned: false,
    archivedAt: canonicalArchiveTimestamp(now)
  };
}

export function restoreConversation(conversation: Conversation, now?: string): Conversation {
  const restored = { ...conversation };
  delete restored.archivedAt;
  return {
    ...restored,
    pinned: false,
    updatedAt: canonicalArchiveTimestamp(now)
  };
}
