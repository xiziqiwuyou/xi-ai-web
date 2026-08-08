import type { ChatAttachment, Conversation, ConversationBranchMode, Message } from "../../types";
import {
  sanitizeWorkspaceConversationBranch,
  sanitizeWorkspaceMessage
} from "../workspace/workspaceArchive";

export const conversationExportSchema = "xi-ai-web.conversation-export";
export const conversationExportVersion = 1;

const maxConversations = 40;
const maxMessagesPerConversation = 80;
const maxMessageLength = 24000;

export type ConversationSummaryArtifact = {
  conversationId: string;
  title: string;
  generatedAt: string;
  messageCount: number;
  summary: string;
};

export type ConversationExportEnvelope = {
  schema: typeof conversationExportSchema;
  version: typeof conversationExportVersion;
  exportedAt: string;
  conversations: Conversation[];
  summaries?: ConversationSummaryArtifact[];
};

export type ImportRejectedItem = {
  index: number;
  reason: string;
};

export type ConversationImportPreview = {
  valid: Conversation[];
  rejected: ImportRejectedItem[];
  canReplace: boolean;
};

export type ConversationBranchSeed = {
  conversation: Conversation;
  draft: string;
  attachments: ChatAttachment[];
};

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function cleanIdentifier(value: unknown, maxLength = 120) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= maxLength ? text : "";
}

function sanitizeMessage(value: unknown): Message | null {
  const message = sanitizeWorkspaceMessage(value);
  return message ? { ...message, content: cleanText(message.content, maxMessageLength) } : null;
}

export function sanitizeConversation(value: unknown): Conversation | null {
  const source = value && typeof value === "object" ? (value as Partial<Conversation>) : null;
  if (!source?.id) return null;
  const id = cleanText(source.id, 120);
  if (!id) return null;
  const messages = Array.isArray(source.messages)
    ? source.messages
        .map(sanitizeMessage)
        .filter((message): message is Message => Boolean(message))
        .slice(-maxMessagesPerConversation)
    : [];
  const createdAt = cleanText(source.createdAt, 80) || new Date().toISOString();
  return {
    id,
    title: cleanText(source.title, 120) || "新对话",
    assistantId: cleanText(source.assistantId, 120),
    pinned: Boolean(source.pinned),
    messageCount: messages.length,
    preview: messages
      .slice()
      .reverse()
      .find((message) => message.content)
      ?.content.replace(/\s+/g, " ")
      .slice(0, 120) || "",
    messages,
    titleSummaryAt: cleanText(source.titleSummaryAt, 80) || undefined,
    branch: sanitizeWorkspaceConversationBranch(source.branch, id),
    createdAt,
    updatedAt: cleanText(source.updatedAt, 80) || createdAt
  };
}

function branchTitle(title: string) {
  const suffix = " · 分支";
  const base = cleanText(title, 120 - suffix.length) || "新对话";
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

function branchPreview(messages: Message[]) {
  return messages
    .slice()
    .reverse()
    .find((message) => message.content)
    ?.content.replace(/\s+/g, " ")
    .slice(0, 120) || "";
}

function cloneAttachments(attachments?: ChatAttachment[]) {
  return attachments?.map((attachment) => ({ ...attachment })) || [];
}

function cloneMessages(messages: Message[]) {
  return messages.map((message): Message => ({
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.attachments?.length ? { attachments: cloneAttachments(message.attachments) } : {}),
    ...(message.model ? { model: message.model } : {}),
    ...(message.providerId ? { providerId: message.providerId } : {}),
    ...(message.knowledgeCitations?.length ? {
      knowledgeCitations: message.knowledgeCitations.map((citation) => ({
        ...citation,
        locator: { ...citation.locator },
        source: { ...citation.source }
      }))
    } : {}),
    ...(message.usage ? { usage: { ...message.usage } } : {}),
    ...(message.status ? { status: message.status } : {}),
    createdAt: message.createdAt
  }));
}

export function createConversationBranchSeed(
  source: Conversation,
  sourceMessageId: string,
  mode: ConversationBranchMode,
  options: {
    branchId: string;
    editedContent?: string;
    now?: string;
  }
): ConversationBranchSeed | null {
  const messageIndex = source.messages.findIndex((message) => message.id === sourceMessageId);
  const branchId = cleanIdentifier(options.branchId);
  if (messageIndex < 0 || !branchId || branchId === source.id) return null;

  const sourceMessage = source.messages[messageIndex];
  if (sourceMessage.status === "streaming") return null;

  let messages: Message[];
  let draft = "";
  let attachments: ChatAttachment[] = [];

  if (mode === "continue") {
    messages = cloneMessages(source.messages.slice(0, messageIndex + 1));
  } else if (mode === "edit") {
    if (sourceMessage.role !== "user") return null;
    messages = cloneMessages(source.messages.slice(0, messageIndex));
    draft = cleanText(options.editedContent, maxMessageLength);
    attachments = cloneAttachments(sourceMessage.attachments);
    if (!draft && !attachments.length) return null;
  } else {
    if (sourceMessage.role !== "assistant") return null;
    const precedingUserIndex = source.messages
      .slice(0, messageIndex)
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.role === "user" && message.status !== "streaming")
      ?.index;
    if (precedingUserIndex === undefined) return null;
    const precedingUserMessage = source.messages[precedingUserIndex];
    messages = cloneMessages(source.messages.slice(0, precedingUserIndex));
    draft = cleanText(precedingUserMessage.content, maxMessageLength);
    attachments = cloneAttachments(precedingUserMessage.attachments);
    if (!draft && !attachments.length) return null;
  }

  const now = cleanText(options.now, 80) || new Date().toISOString();
  const conversation: Conversation = {
    id: branchId,
    title: branchTitle(source.title),
    assistantId: source.assistantId,
    pinned: false,
    messageCount: messages.length,
    preview: branchPreview(messages),
    messages,
    titleSummaryAt: undefined,
    branch: {
      parentConversationId: source.id,
      sourceMessageId,
      mode
    },
    createdAt: now,
    updatedAt: now
  };

  return { conversation, draft, attachments };
}

export function createConversationExport(
  conversations: Conversation[],
  summaries: ConversationSummaryArtifact[] = []
): ConversationExportEnvelope {
  const sanitized = conversations
    .map(sanitizeConversation)
    .filter((conversation): conversation is Conversation => Boolean(conversation))
    .slice(0, maxConversations);

  return {
    schema: conversationExportSchema,
    version: conversationExportVersion,
    exportedAt: new Date().toISOString(),
    conversations: sanitized,
    ...(summaries.length ? { summaries } : {})
  };
}

export function previewConversationImport(payload: unknown): ConversationImportPreview {
  const source = payload && typeof payload === "object" ? payload as Partial<ConversationExportEnvelope> : null;
  const rawConversations =
    source?.schema === conversationExportSchema &&
    source.version === conversationExportVersion &&
    Array.isArray(source.conversations)
      ? source.conversations
      : Array.isArray(payload)
        ? payload
        : null;

  if (!rawConversations) {
    return {
      valid: [],
      rejected: [{ index: -1, reason: "文件不是有效的对话导出格式" }],
      canReplace: false
    };
  }

  const rejected: ImportRejectedItem[] = [];
  const valid = rawConversations
    .map((item, index) => {
      const conversation = sanitizeConversation(item);
      if (!conversation) {
        rejected.push({ index, reason: "对话结构不完整" });
        return null;
      }
      return conversation;
    })
    .filter((conversation): conversation is Conversation => Boolean(conversation));

  return {
    valid,
    rejected,
    canReplace: valid.length > 0 && rejected.length === 0
  };
}

export function mergeImportedConversations(
  current: Conversation[],
  imported: Conversation[],
  options: { idFactory?: (conversation: Conversation, index: number) => string; now?: string } = {}
) {
  const now = options.now || new Date().toISOString();
  const existingIds = new Set(current.map((conversation) => conversation.id));
  const normalizedImported = imported.map((conversation, index) => {
    if (!existingIds.has(conversation.id)) {
      existingIds.add(conversation.id);
      return conversation;
    }
    let suffix = 1;
    let id = options.idFactory?.(conversation, index) || `${conversation.id}-import-${suffix}`;
    while (existingIds.has(id)) {
      suffix += 1;
      id = `${conversation.id}-import-${suffix}`;
    }
    existingIds.add(id);
    return {
      ...conversation,
      id,
      updatedAt: now
    };
  });
  return [...normalizedImported, ...current].slice(0, maxConversations);
}

export function replaceImportedConversations(preview: ConversationImportPreview) {
  return preview.canReplace ? preview.valid.slice(0, maxConversations) : null;
}

export function conversationToMarkdown(conversation: Conversation) {
  const lines = [
    `# ${conversation.title || "新对话"}`,
    "",
    `- 导出时间: ${new Date().toLocaleString("zh-CN")}`,
    `- 消息数: ${conversation.messages.length}`,
    ""
  ];

  conversation.messages.forEach((message) => {
    lines.push(`## ${message.role === "user" ? "用户" : "助手"}`);
    lines.push("");
    lines.push(message.content || "");
    lines.push("");
  });

  return lines.join("\n").trimEnd() + "\n";
}

export function createConversationSummaryArtifact(conversation: Conversation): ConversationSummaryArtifact {
  const userMessages = conversation.messages.filter((message) => message.role === "user" && message.content);
  const assistantMessages = conversation.messages.filter((message) => message.role === "assistant" && message.content);
  const summaryLines = [
    `主题: ${conversation.title || "新对话"}`,
    `用户问题数: ${userMessages.length}`,
    `助手回复数: ${assistantMessages.length}`,
    "关键内容:",
    ...conversation.messages
      .filter((message) => message.content)
      .slice(-8)
      .map((message) => `- ${message.role === "user" ? "用户" : "助手"}: ${message.content.replace(/\s+/g, " ").slice(0, 180)}`)
  ];

  return {
    conversationId: conversation.id,
    title: conversation.title,
    generatedAt: new Date().toISOString(),
    messageCount: conversation.messages.length,
    summary: summaryLines.join("\n")
  };
}

export function editConversationFromUserMessage(
  conversation: Conversation,
  messageId: string,
  nextContent: string,
  now = new Date().toISOString()
): Conversation {
  const index = conversation.messages.findIndex((message) => message.id === messageId && message.role === "user");
  if (index < 0) return conversation;
  const messages = conversation.messages.slice(0, index + 1).map((message, messageIndex) =>
    messageIndex === index
      ? {
          ...message,
          content: nextContent.trim(),
          createdAt: now
        }
      : message
  );

  return {
    ...conversation,
    messages,
    messageCount: messages.length,
    preview: nextContent.trim().replace(/\s+/g, " ").slice(0, 120),
    updatedAt: now
  };
}

export function forkConversationBeforeUserMessage(
  conversation: Conversation,
  messageId: string,
  now = new Date().toISOString()
): Conversation {
  const index = conversation.messages.findIndex((message) => message.id === messageId && message.role === "user");
  if (index < 0) return conversation;
  const messages = conversation.messages.slice(0, index);
  const preview = messages
    .slice()
    .reverse()
    .find((message) => message.content)
    ?.content.replace(/\s+/g, " ")
    .slice(0, 120) || "";

  return {
    ...conversation,
    messages,
    messageCount: messages.length,
    preview,
    updatedAt: now
  };
}
