import type { Conversation, Message } from "../../types";

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

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
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

export function sanitizeConversation(value: unknown): Conversation | null {
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
    preview: messages
      .slice()
      .reverse()
      .find((message) => message.content)
      ?.content.replace(/\s+/g, " ")
      .slice(0, 120) || "",
    messages,
    createdAt,
    updatedAt: cleanText(source.updatedAt, 80) || createdAt
  };
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
