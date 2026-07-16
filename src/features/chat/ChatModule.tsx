import { Children, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  Edit3,
  FileText,
  Image,
  MoreHorizontal,
  MessageSquarePlus,
  Mic,
  PanelLeft,
  Paperclip,
  Pin,
  PinOff,
  PlugZap,
  Search,
  Send,
  Sparkles,
  Square,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  X
} from "lucide-react";
import { ApiError, api, streamChat } from "../../api";
import {
  ModelPicker,
  compactModelLabel,
  modelsForCapability,
  preferredModelFor
} from "../../components/workbench";
import { ConfirmationDialog } from "../../components/ui";
import { attachmentSummary, createChatAttachment } from "./attachmentUtils";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import {
  conversationSummary,
  createLocalConversation,
  loadLocalConversations,
  localSummaries,
  makeConversationTitle,
  saveLocalConversations,
  sortConversations
} from "./localConversationStore";
import {
  conversationToMarkdown,
  createConversationExport,
  createConversationSummaryArtifact,
  forkConversationBeforeUserMessage,
  mergeImportedConversations,
  previewConversationImport
} from "./conversationArchive";
import { buildChatMaskWorkflows, starterPromptFromMask } from "./maskWorkflow";
import type {
  Assistant,
  AppPreset,
  ChatAttachment,
  ChatStreamEvent,
  Conversation,
  ConversationSummary,
  ModelCatalogEntry,
  Message,
  PublicBootstrapPayload,
  PromptPreset,
  UserProviderConfig
} from "../../types";
import type { ComponentPropsWithoutRef } from "react";

type Notice = { tone: "good" | "bad"; message: string } | null;

type DeletedConversation = {
  conversation: Conversation;
  wasActive: boolean;
};

type ChatModuleProps = {
  enabled: boolean;
  assistants: Assistant[];
  appPresets: AppPreset[];
  promptPresets: PromptPreset[];
  conversations: ConversationSummary[];
  modelCatalog: ModelCatalogEntry[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onRequestApiConfig: () => void;
  onConversationsChange: (conversations: ConversationSummary[]) => void;
  onRefresh: () => Promise<PublicBootstrapPayload>;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("录音读取失败"));
    reader.readAsDataURL(blob);
  });
}

function downloadText(content: string, fileName: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function conversationShareHtml(conversation: Conversation) {
  const messages = conversation.messages
    .filter((message) => message.content)
    .map((message) => `
      <article class="message ${message.role}">
        <strong>${message.role === "user" ? "用户" : "助手"}</strong>
        <pre>${escapeHtml(message.content)}</pre>
      </article>
    `)
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(conversation.title)}</title>
  <style>
    body{margin:0;background:#fff8f9;color:#211d24;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}
    main{max-width:860px;margin:0 auto;padding:32px 18px;}
    h1{font-size:28px;margin:0 0 8px;}
    .meta{color:#6f6871;font-size:13px;margin-bottom:22px;}
    .message{border:1px solid #eee3e6;border-radius:18px;background:white;padding:14px 16px;margin:12px 0;box-shadow:0 8px 24px rgba(38,24,28,.04);}
    .message.user{background:#fff5f6;border-color:#ffc9d3;}
    strong{display:block;margin-bottom:8px;color:#d91f3a;}
    pre{white-space:pre-wrap;font:14px/1.75 inherit;margin:0;}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(conversation.title || "对话分享")}</h1>
    <div class="meta">导出自 xi-ai-web · ${new Date().toLocaleString("zh-CN")}</div>
    ${messages}
  </main>
</body>
</html>`;
}

function readJsonFile(file: File) {
  return new Promise<unknown>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || "")));
      } catch {
        reject(new Error("导入文件不是有效 JSON"));
      }
    };
    reader.onerror = () => reject(new Error("读取导入文件失败"));
    reader.readAsText(file);
  });
}

function ChatModule({
  enabled,
  assistants,
  appPresets,
  promptPresets,
  conversations: serverConversations,
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onRequestApiConfig,
  onConversationsChange,
  onRefresh
}: ChatModuleProps) {
  const [localConversationList, setLocalConversationList] = useState<Conversation[]>(loadLocalConversations);
  const conversations = useMemo(() => localSummaries(localConversationList), [localConversationList]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    conversations[0]?.id || serverConversations[0]?.id || null
  );
  const [selectedAssistantId, setSelectedAssistantId] = useState(assistants[0]?.id || "");
  const [temperature, setTemperature] = useState(0.7);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [activeSummary, setActiveSummary] = useState("");
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [recentlyDeleted, setRecentlyDeleted] = useState<DeletedConversation | null>(null);
  const localConversationsRef = useRef(localConversationList);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const conversationSearchRef = useRef<HTMLInputElement | null>(null);
  const conversationTriggerRef = useRef<HTMLButtonElement | null>(null);

  const assistantById = useMemo(() => {
    return new Map(assistants.map((assistant) => [assistant.id, assistant]));
  }, [assistants]);
  const maskWorkflows = useMemo(
    () => buildChatMaskWorkflows(assistants, appPresets, promptPresets),
    [assistants, appPresets, promptPresets]
  );

  const selectedAssistant = assistants.find((assistant) => assistant.id === selectedAssistantId);
  const chatModels = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const sttModels = useMemo(() => modelsForCapability(modelCatalog, "stt"), [modelCatalog]);
  const selectedModel =
    chatModels.find((entry) => entry.id === selectedModelId) ||
    preferredModelFor(chatModels, "chat", userProvider.lastModelId);
  const selectedSttModel = preferredModelFor(sttModels, "stt", userProvider.lastModelId);
  const selectedModelName = compactModelLabel(selectedModel);
  const selectedModelSupportsVision = Boolean(selectedModel?.capabilities.includes("vision"));
  const connectionReady = isUserProviderReady(userProvider);
  const providerReady = connectionReady && Boolean(selectedModel);
  const activeConversation =
    localConversationList.find((conversation) => conversation.id === activeConversationId) || null;
  const pendingDeleteConversation =
    localConversationList.find((conversation) => conversation.id === pendingDeleteId) || null;
  const localToolBadges = useMemo(() => {
    const tools = ["联网搜索", "文件分析", "图片理解", "语音输入", "代码整理"];
    return tools;
  }, []);

  const applyMaskWorkflow = useCallback(
    (maskId: string) => {
      const mask = maskWorkflows.find((item) => item.id === maskId);
      if (!mask) return;
      if (mask.type === "assistant") {
        setSelectedAssistantId(mask.assistantId);
        setNotice({ tone: "good", message: `已切换到 ${mask.title}` });
        return;
      }
      setDraft(starterPromptFromMask(mask));
      setNotice({ tone: "good", message: `已套用应用 ${mask.title}` });
    },
    [maskWorkflows]
  );

  const commitLocalConversations = useCallback(
    (updater: Conversation[] | ((current: Conversation[]) => Conversation[])) => {
      const current = localConversationsRef.current;
      const next = sortConversations(typeof updater === "function" ? updater(current) : updater);
      localConversationsRef.current = next;
      saveLocalConversations(next);
      setLocalConversationList(next);
      onConversationsChange(localSummaries(next));
    },
    [onConversationsChange]
  );

  useEffect(() => {
    localConversationsRef.current = localConversationList;
  }, [localConversationList]);

  useEffect(() => {
    if (!selectedAssistantId && assistants[0]) setSelectedAssistantId(assistants[0].id);
  }, [assistants, selectedAssistantId]);

  useEffect(() => {
      if (!chatModels.length) {
        setSelectedModelId("");
        return;
      }
      setSelectedModelId((current) => {
        if (chatModels.some((entry) => entry.id === current)) return current;
        const preferred = preferredModelFor(chatModels, "chat", userProvider.lastModelId);
        return preferred?.id || "";
      });
  }, [chatModels, userProvider.lastModelId]);

  useEffect(() => {
    if (!activeConversationId && conversations[0]) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (activeConversation) setSelectedAssistantId(activeConversation.assistantId);
  }, [activeConversation]);

  const closeMobileConversations = useCallback(() => {
    setMobileConversationsOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileConversationsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => conversationSearchRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => conversationTriggerRef.current?.focus());
    };
  }, [mobileConversationsOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 821px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileConversationsOpen(false);
    };
    desktopQuery.addEventListener("change", closeOnDesktop);
    return () => desktopQuery.removeEventListener("change", closeOnDesktop);
  }, []);

  const handleConversationSheetKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!mobileConversationsOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileConversations();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const filteredConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const assistant = assistantById.get(conversation.assistantId);
      return `${conversation.title} ${conversation.preview} ${assistant?.name || ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [assistantById, conversations, query]);

  const createConversation = useCallback(async () => {
    const assistantId = selectedAssistantId || assistants[0]?.id;
    if (!assistantId) return null;
    const assistant = assistants.find((item) => item.id === assistantId) || assistants[0];
    if (!assistant) return null;
    const conversation = createLocalConversation(assistant);
    setActiveConversationId(conversation.id);
    commitLocalConversations((current) => [conversation, ...current]);
    return conversation;
  }, [assistants, commitLocalConversations, selectedAssistantId]);

  const handleCreateConversation = useCallback(async () => {
    await createConversation();
    setMobileConversationsOpen(false);
  }, [createConversation]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setMobileConversationsOpen(false);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const nextConversations = localConversationList.filter((conversation) => conversation.id !== id);
      commitLocalConversations(nextConversations);
      if (activeConversationId === id) {
        setActiveConversationId(sortConversations(nextConversations)[0]?.id || null);
      }
    },
    [activeConversationId, commitLocalConversations, localConversationList]
  );

  const confirmDeleteConversation = useCallback(async () => {
    if (!pendingDeleteConversation) {
      setPendingDeleteId(null);
      return;
    }
    const deleted: DeletedConversation = {
      conversation: pendingDeleteConversation,
      wasActive: activeConversationId === pendingDeleteConversation.id
    };
    await deleteConversation(pendingDeleteConversation.id);
    setPendingDeleteId(null);
    setRecentlyDeleted(deleted);
  }, [activeConversationId, deleteConversation, pendingDeleteConversation]);

  const undoConversationDeletion = useCallback(() => {
    if (!recentlyDeleted) return;
    commitLocalConversations((current) => {
      if (current.some((conversation) => conversation.id === recentlyDeleted.conversation.id)) return current;
      return [recentlyDeleted.conversation, ...current];
    });
    if (recentlyDeleted.wasActive) setActiveConversationId(recentlyDeleted.conversation.id);
    setRecentlyDeleted(null);
    setNotice({ tone: "good", message: "会话已恢复" });
  }, [commitLocalConversations, recentlyDeleted]);

  const togglePin = useCallback(
    async (conversation: ConversationSummary) => {
      commitLocalConversations((current) =>
        current.map((item) =>
          item.id === conversation.id
            ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() }
            : item
        )
      );
    },
    [commitLocalConversations]
  );

  const toggleActivePin = useCallback(async () => {
    if (!activeConversation) return;
    commitLocalConversations((current) =>
      current.map((item) =>
        item.id === activeConversation.id
          ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() }
          : item
      )
    );
  }, [activeConversation, commitLocalConversations]);

  const handleStreamEvent = useCallback(
    (event: ChatStreamEvent) => {
      if (event.type === "meta") {
        streamingMessageIdRef.current = event.assistantMessageId;
        commitLocalConversations((current) =>
          current.map((conversation) => {
            if (conversation.id !== event.conversation.id) return conversation;
          const assistantPlaceholder: Message = {
            id: event.assistantMessageId,
            role: "assistant",
            content: "",
            providerId: selectedModel?.id || "user-direct",
            model: selectedModel?.model || selectedModelName,
            status: "streaming",
            createdAt: new Date().toISOString()
          };
          return {
            ...conversation,
            ...event.conversation,
            messages: [...conversation.messages, event.userMessage, assistantPlaceholder],
            updatedAt: event.conversation.updatedAt
          };
          })
        );
        return;
      }

      if (event.type === "token") {
        const messageId = streamingMessageIdRef.current;
        if (!messageId) return;
        commitLocalConversations((current) =>
          current.map((conversation) =>
            conversation.id === activeConversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                    message.id === messageId
                      ? { ...message, content: message.content + event.token }
                      : message
                  )
                }
              : conversation
          )
        );
        return;
      }

      if (event.type === "error") {
        setNotice({ tone: "bad", message: event.error });
        return;
      }

      commitLocalConversations((current) =>
        current.map((conversation) =>
          conversation.id === event.conversation.id
            ? {
                ...conversation,
                ...event.conversation,
                messages: conversation.messages.map((message) =>
                  message.id === event.message.id ? event.message : message
                )
              }
            : conversation
        )
      );
    },
    [activeConversationId, commitLocalConversations, selectedModel, selectedModelName]
  );

  const sendMessage = async (contentOverride?: string, baseConversation?: Conversation, options: { clearEdit?: boolean } = {}) => {
    const rawContent = (contentOverride ?? draft).trim();
    const content = activeSummary
      ? `以下是本地生成的历史摘要，请作为上下文参考，不要直接复述：\n${activeSummary}\n\n用户最新输入：\n${rawContent}`
      : rawContent;
    if (!rawContent || streaming) return;
    if (!enabled) {
      setNotice({ tone: "bad", message: "当前对话功能未启用" });
      return;
    }
    if (!selectedAssistantId) {
      setNotice({ tone: "bad", message: "没有可用助手，无法发送消息" });
      return;
    }
    if (!connectionReady) {
      setNotice({ tone: "bad", message: "请先填写 API URL 和 Key" });
      onRequestApiConfig();
      return;
    }
    if (!selectedModel) {
      setNotice({ tone: "bad", message: "请先在后台启用对话模型" });
      return;
    }
    if (attachments.some((attachment) => attachment.kind === "image") && !selectedModelSupportsVision) {
      setNotice({ tone: "bad", message: "当前模型未启用视觉能力，不能发送图片附件" });
      return;
    }

    if (!contentOverride) setDraft("");
    setStreaming(true);
    setNotice(null);

    let conversation = baseConversation || activeConversation;
    if (!conversation) {
      conversation = await createConversation();
      if (!conversation) {
        setStreaming(false);
        setNotice({ tone: "bad", message: "没有可用助手，无法创建会话" });
        return;
      }
    }
    const requestConversation: Conversation = {
      ...conversation,
      title:
        conversation.messages.length === 0 || conversation.title === "新对话"
          ? makeConversationTitle(rawContent)
          : conversation.title,
      assistantId: selectedAssistantId,
      updatedAt: new Date().toISOString()
    };
    if (requestConversation.title !== conversation.title || requestConversation.assistantId !== conversation.assistantId) {
      commitLocalConversations((current) =>
        current.map((item) => (item.id === requestConversation.id ? requestConversation : item))
      );
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        {
          conversation: conversationSummary(requestConversation),
      history: requestConversation.messages,
          assistantId: selectedAssistantId,
          modelId: selectedModel.id,
          temperature,
          content,
          displayContent: rawContent,
          attachments: contentOverride ? [] : attachments,
          connection: userConnectionPayload(userProvider)
        },
        handleStreamEvent,
        controller.signal
      );
      if (!contentOverride) setAttachments([]);
      if (options.clearEdit) setEditingMessageId("");
      if (activeSummary) setActiveSummary("");
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        setNotice({ tone: "good", message: "已停止生成" });
      } else {
        const message = err instanceof ApiError || err instanceof Error ? err.message : "发送失败";
        setNotice({ tone: "bad", message });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      streamingMessageIdRef.current = null;
      void onRefresh();
    }
  };

  const exportActiveJson = () => {
    if (!activeConversation) return;
    downloadText(
      JSON.stringify(createConversationExport([activeConversation]), null, 2),
      `${activeConversation.id}.json`,
      "application/json;charset=utf-8"
    );
    setNotice({ tone: "good", message: "已导出当前对话 JSON" });
  };

  const exportActiveMarkdown = () => {
    if (!activeConversation) return;
    downloadText(conversationToMarkdown(activeConversation), `${activeConversation.id}.md`, "text/markdown;charset=utf-8");
    setNotice({ tone: "good", message: "已导出当前对话 Markdown" });
  };

  const exportAllJson = () => {
    downloadText(
      JSON.stringify(createConversationExport(localConversationList), null, 2),
      `xi-ai-web-conversations-${Date.now()}.json`,
      "application/json;charset=utf-8"
    );
    setNotice({ tone: "good", message: "已批量导出全部本地对话" });
  };

  const exportShareCard = () => {
    if (!activeConversation) return;
    downloadText(conversationShareHtml(activeConversation), `${activeConversation.id}-share.html`, "text/html;charset=utf-8");
    setNotice({ tone: "good", message: "已导出本地分享卡片 HTML" });
  };

  const summarizeActiveConversation = () => {
    if (!activeConversation) return;
    const summary = createConversationSummaryArtifact(activeConversation);
    setActiveSummary(summary.summary);
    downloadText(summary.summary, `${activeConversation.id}-summary.md`, "text/markdown;charset=utf-8");
    setNotice({ tone: "good", message: "已生成本地摘要，并会附加到下一次请求上下文" });
  };

  const importConversationFile = async (file: File) => {
    try {
      const payload = await readJsonFile(file);
      const preview = previewConversationImport(payload);
      if (!preview.valid.length) {
        setNotice({ tone: "bad", message: "没有可导入的有效对话" });
        return;
      }
      const message = `检测到 ${preview.valid.length} 条有效对话，${preview.rejected.length} 条无效记录。是否合并导入？`;
      if (!window.confirm(message)) return;
      const next = mergeImportedConversations(localConversationList, preview.valid);
      commitLocalConversations(next);
      setActiveConversationId(next[0]?.id || activeConversationId);
      setNotice({ tone: "good", message: "已合并导入本地对话" });
    } catch (error) {
      setNotice({ tone: "bad", message: error instanceof Error ? error.message : "导入失败" });
    }
  };

  const retryFromUserMessage = async (messageId: string, content: string) => {
    if (!activeConversation) return;
    const nextConversation = forkConversationBeforeUserMessage(activeConversation, messageId);
    commitLocalConversations((current) =>
      current.map((conversation) => (conversation.id === nextConversation.id ? nextConversation : conversation))
    );
    await sendMessage(content, nextConversation);
  };

  const sendComposerMessage = async () => {
    if (editingMessageId && activeConversation) {
      const nextConversation = forkConversationBeforeUserMessage(activeConversation, editingMessageId);
      commitLocalConversations((current) =>
        current.map((conversation) => (conversation.id === nextConversation.id ? nextConversation : conversation))
      );
      await sendMessage(draft, nextConversation, { clearEdit: true });
      return;
    }
    await sendMessage();
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    const messageId = streamingMessageIdRef.current;
    if (messageId) {
      commitLocalConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? { ...message, status: "stopped" } : message
                )
              }
            : conversation
        )
      );
    }
  };

  const transcribeVoice = async (blob: Blob) => {
    if (!connectionReady) {
      setNotice({ tone: "bad", message: "请先填写 API URL 和 Key" });
      onRequestApiConfig();
      return;
    }
    if (!selectedSttModel) {
      setNotice({ tone: "bad", message: "后台未启用语音识别模型" });
      return;
    }
    setNotice({ tone: "good", message: "正在识别语音..." });
    try {
      const transcript = await api.transcribeAudio({
        connection: userConnectionPayload(userProvider),
        modelId: selectedSttModel.id,
        fileName: "chat-voice.webm",
        mimeType: blob.type || "audio/webm",
        dataUrl: await blobToDataUrl(blob)
      });
      if (!transcript.text?.trim()) {
        setNotice({ tone: "bad", message: "未识别到文本" });
        return;
      }
      setDraft((current) => (current ? `${current}\n${transcript.text.trim()}` : transcript.text.trim()));
      setNotice({ tone: "good", message: "语音已转写到输入框" });
    } catch (error) {
      setNotice({ tone: "bad", message: error instanceof Error ? error.message : "语音识别失败" });
    }
  };

  if (!enabled) {
    return (
      <section className="module-placeholder">
        <div className="placeholder-note">
          <strong>暂未开放</strong>
          <p>当前功能未启用。</p>
          <div className="placeholder-grid">
            <span>多模型</span>
            <span>流式回复</span>
            <span>助手切换</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={mobileConversationsOpen ? "chat-module conversation-sheet-open" : "chat-module"}
      data-testid="chat-module"
    >
      <input
        ref={importInputRef}
        type="file"
        hidden
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importConversationFile(file);
          event.currentTarget.value = "";
        }}
      />
      {mobileConversationsOpen ? (
        <button
          type="button"
          className="conversation-scrim"
          onClick={closeMobileConversations}
          aria-label="关闭会话列表"
          tabIndex={-1}
        />
      ) : null}
      <aside
        className={mobileConversationsOpen ? "conversation-panel mobile-open" : "conversation-panel"}
        role={mobileConversationsOpen ? "dialog" : undefined}
        aria-modal={mobileConversationsOpen ? "true" : undefined}
        aria-labelledby="conversation-panel-title"
        onKeyDown={handleConversationSheetKeyDown}
        inert={pendingDeleteConversation ? true : undefined}
      >
        <div className="conversation-panel-header">
          <div>
            <strong id="conversation-panel-title">会话</strong>
            <span>{conversations.length} 个本地会话</span>
          </div>
          <button
            type="button"
            className="icon-button conversation-panel-close"
            onClick={closeMobileConversations}
            aria-label="关闭会话列表"
          >
            <X size={17} />
          </button>
        </div>

        <button type="button" className="new-thread" onClick={() => void handleCreateConversation()}>
          <MessageSquarePlus size={18} />
          新建对话
        </button>

        <label className="thread-search">
          <Search size={16} />
          <input
            ref={conversationSearchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索会话"
            aria-label="搜索会话"
          />
        </label>

        <div
          className="thread-list"
          data-scroll-owner={mobileConversationsOpen ? "conversation-list" : undefined}
        >
          {filteredConversations.length ? (
            filteredConversations.map((conversation) => {
              const assistant = assistantById.get(conversation.assistantId);
              return (
                <article
                  key={conversation.id}
                  className={
                    conversation.id === activeConversationId ? "thread-card active" : "thread-card"
                  }
                >
                  <button
                    type="button"
                    className="thread-main"
                    onClick={() => handleSelectConversation(conversation.id)}
                    aria-current={conversation.id === activeConversationId ? "true" : undefined}
                  >
                    <strong>{conversation.title}</strong>
                    <span>{conversation.preview || assistant?.name || "空会话"}</span>
                  </button>
                  <div className="thread-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => void togglePin(conversation)}
                      title={conversation.pinned ? "取消置顶" : "置顶"}
                      aria-label={conversation.pinned ? "取消置顶" : "置顶"}
                    >
                      {conversation.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => setPendingDeleteId(conversation.id)}
                      title="删除"
                      aria-label={`删除会话 ${conversation.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="empty-copy">{conversations.length ? "没有匹配会话。" : "还没有会话。"}</p>
          )}
        </div>
      </aside>

      <div
        className="chat-stage"
        inert={mobileConversationsOpen || pendingDeleteConversation ? true : undefined}
      >
        <ChatHeader
          conversation={activeConversation}
          assistant={selectedAssistant}
          assistants={assistants}
          selectedAssistantId={selectedAssistantId}
          chatModels={chatModels}
          selectedModelId={selectedModel?.id || ""}
          selectedModel={selectedModel}
          connectionReady={connectionReady}
          temperature={temperature}
          onAssistantChange={setSelectedAssistantId}
          onModelChange={(modelId) => {
            setSelectedModelId(modelId);
            onUserProviderChange({ lastModelId: modelId });
          }}
          onRequestApiConfig={onRequestApiConfig}
          onTemperatureChange={setTemperature}
          onTogglePin={toggleActivePin}
          onExportJson={exportActiveJson}
          onExportMarkdown={exportActiveMarkdown}
          onExportAll={exportAllJson}
          onShareCard={exportShareCard}
          onImportClick={() => importInputRef.current?.click()}
          onSummarize={summarizeActiveConversation}
          onOpenConversations={() => setMobileConversationsOpen(true)}
          conversationTriggerRef={conversationTriggerRef}
        />

        {notice || activeSummary ? (
          <div className="chat-status-stack">
            {notice ? (
              <div className={`notice ${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>
                {notice.tone === "good" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{notice.message}</span>
                <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="关闭提示">
                  <X size={15} />
                </button>
              </div>
            ) : null}
            {activeSummary ? (
              <div className="summary-context-banner" role="status">
                <Sparkles size={15} />
                <span>本地摘要已加入下一次请求</span>
                <button type="button" onClick={() => setActiveSummary("")}>移除</button>
              </div>
            ) : null}
          </div>
        ) : null}

        <MessageList
          conversation={activeConversation}
          assistant={selectedAssistant}
          masks={maskWorkflows}
          tools={localToolBadges}
          onMaskPick={applyMaskWorkflow}
          onPromptPick={setDraft}
          onRetryPrompt={(messageId, content) => void retryFromUserMessage(messageId, content)}
          onEditPrompt={(messageId, content) => {
            setEditingMessageId(messageId);
            setDraft(content);
            setNotice({ tone: "good", message: "已放入输入框，发送或重试时才会生成新的分支" });
          }}
          scrollActive={!mobileConversationsOpen && !pendingDeleteConversation}
        />

        <Composer
          value={draft}
          streaming={streaming}
          model={selectedModelName || "选择模型"}
          connectionReady={providerReady}
          onChange={setDraft}
          onSend={sendComposerMessage}
          onStop={stopStreaming}
          onOpenConnection={onRequestApiConfig}
          attachments={attachments}
          supportsVision={selectedModelSupportsVision}
          onAttachmentsChange={setAttachments}
          onAttachmentError={(message) => setNotice({ tone: "bad", message })}
          voiceEnabled={Boolean(selectedSttModel)}
          onVoiceInput={transcribeVoice}
        />
      </div>
      {recentlyDeleted ? (
        <div className="chat-undo-toast" role="status" aria-live="polite">
          <span>已删除“{recentlyDeleted.conversation.title}”</span>
          <button type="button" onClick={undoConversationDeletion}>
            <Undo2 size={15} />
            撤销
          </button>
          <button type="button" className="icon-button" onClick={() => setRecentlyDeleted(null)} aria-label="关闭撤销提示">
            <X size={15} />
          </button>
        </div>
      ) : null}
      {pendingDeleteConversation ? (
        <ConfirmationDialog
          open
          title="删除这个会话？"
          description={`“${pendingDeleteConversation.title}”及其本地消息将被移除，删除后仍可立即撤销。`}
          confirmLabel="删除会话"
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => void confirmDeleteConversation()}
        />
      ) : null}
    </section>
  );
}

function ChatHeader({
  conversation,
  assistant,
  assistants,
  selectedAssistantId,
  chatModels,
  selectedModelId,
  selectedModel,
  connectionReady,
  temperature,
  onAssistantChange,
  onModelChange,
  onRequestApiConfig,
  onTemperatureChange,
  onTogglePin,
  onExportJson,
  onExportMarkdown,
  onExportAll,
  onShareCard,
  onImportClick,
  onSummarize,
  onOpenConversations,
  conversationTriggerRef
}: {
  conversation: Conversation | null;
  assistant?: Assistant;
  assistants: Assistant[];
  selectedAssistantId: string;
  chatModels: ModelCatalogEntry[];
  selectedModelId: string;
  selectedModel?: ModelCatalogEntry;
  connectionReady: boolean;
  temperature: number;
  onAssistantChange: (id: string) => void;
  onModelChange: (id: string) => void;
  onRequestApiConfig: () => void;
  onTemperatureChange: (value: number) => void;
  onTogglePin: () => Promise<void>;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onExportAll: () => void;
  onShareCard: () => void;
  onImportClick: () => void;
  onSummarize: () => void;
  onOpenConversations: () => void;
  conversationTriggerRef: { current: HTMLButtonElement | null };
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const title = conversation?.title || "新的对话";
  const subtitle = assistant?.description || "选择角色后开始创作";

  useEffect(() => {
    if (!actionsOpen) return;
    const focusFrame = window.requestAnimationFrame(() => {
      actionsRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not([disabled])')?.focus();
    });
    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActionsOpen(false);
      actionsTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [actionsOpen]);

  const runAction = (action: () => void) => {
    setActionsOpen(false);
    action();
    window.requestAnimationFrame(() => actionsTriggerRef.current?.focus());
  };

  return (
    <header className="chat-header">
      <div className="chat-title-row">
        <button
          ref={conversationTriggerRef}
          type="button"
          className="icon-button conversation-trigger"
          onClick={onOpenConversations}
          aria-label="打开会话列表"
          title="会话列表"
        >
          <PanelLeft size={18} />
        </button>
        <div className="chat-title-block">
          <h2 title={title}>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="chat-header-actions">
        <label className="assistant-chip">
          <Bot size={15} />
          <select
            aria-label="选择助手"
            value={selectedAssistantId}
            onChange={(event) => onAssistantChange(event.target.value)}
          >
            {assistants.map((assistant) => (
              <option key={assistant.id} value={assistant.id}>
                {assistant.name}
              </option>
            ))}
          </select>
        </label>
        <ModelPicker
          className="model-select-chip"
          models={chatModels}
          capability="chat"
          label=""
          value={selectedModelId}
          onChange={onModelChange}
          disabled={!chatModels.length}
        />
        <div className="connection-control">
          <button
            type="button"
            className={connectionReady ? "connection-pill ready" : "connection-pill"}
            onClick={onRequestApiConfig}
            data-testid="model-connection-button"
            title={connectionReady ? selectedModel?.model || "API 已连接" : "配置 API"}
          >
            <PlugZap size={16} />
            <span>{connectionReady ? "已连接" : "配置 API"}</span>
          </button>
        </div>
        <div className="chat-overflow" ref={actionsRef}>
          <button
            ref={actionsTriggerRef}
            type="button"
            className="icon-button chat-overflow-trigger"
            onClick={() => setActionsOpen((open) => !open)}
            aria-label="更多对话操作"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            title="更多操作"
          >
            <MoreHorizontal size={18} />
          </button>
          {actionsOpen ? (
            <div className="chat-overflow-menu" role="menu" aria-label="对话操作">
              <label className="overflow-temperature">
                <span>
                  回复温度
                  <strong>{temperature.toFixed(1)}</strong>
                </span>
                <input
                  aria-label="回复温度"
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.1"
                  value={temperature}
                  onChange={(event) => onTemperatureChange(Number(event.target.value))}
                />
              </label>
              <div className="overflow-menu-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                disabled={!conversation}
                onClick={() => runAction(() => void onTogglePin())}
              >
                {conversation?.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                {conversation?.pinned ? "取消置顶" : "置顶会话"}
              </button>
              <button type="button" role="menuitem" onClick={() => runAction(onImportClick)}>
                <Upload size={16} />
                导入对话
              </button>
              <button type="button" role="menuitem" disabled={!conversation} onClick={() => runAction(onExportJson)}>
                <Download size={16} />
                导出 JSON
              </button>
              <button type="button" role="menuitem" disabled={!conversation} onClick={() => runAction(onExportMarkdown)}>
                <FileText size={16} />
                导出 Markdown
              </button>
              <button type="button" role="menuitem" onClick={() => runAction(onExportAll)}>
                <Download size={16} />
                导出全部对话
              </button>
              <button type="button" role="menuitem" disabled={!conversation} onClick={() => runAction(onShareCard)}>
                <Copy size={16} />
                导出分享卡片
              </button>
              <button type="button" role="menuitem" disabled={!conversation} onClick={() => runAction(onSummarize)}>
                <Sparkles size={16} />
                生成本地摘要
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MessageList({
  conversation,
  assistant,
  masks,
  tools,
  onMaskPick,
  onPromptPick,
  onRetryPrompt,
  onEditPrompt,
  scrollActive
}: {
  conversation: Conversation | null;
  assistant?: Assistant;
  masks: ReturnType<typeof buildChatMaskWorkflows>;
  tools: string[];
  onMaskPick: (maskId: string) => void;
  onPromptPick: (prompt: string) => void;
  onRetryPrompt: (messageId: string, prompt: string) => void;
  onEditPrompt: (messageId: string, prompt: string) => void;
  scrollActive: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const promptStarters = [
    "梳理执行步骤",
    "对比三个方案",
    "润色这段内容"
  ];

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
  }, [conversation?.messages]);

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  };

  if (!conversation || conversation.messages.length === 0) {
    return (
      <section className="empty-chat" data-scroll-owner={scrollActive ? "chat-messages" : undefined}>
        <div className="empty-chat-intro">
          <div className="assistant-orbit" style={{ background: assistant?.color || "#ff2442" }}>
            <Bot size={22} />
          </div>
          <div>
            <h1>{assistant ? assistant.name : "选择助手开始"}</h1>
            <p>{assistant?.description || "选择一个角色后开始创作。"}</p>
          </div>
        </div>
        <div className="prompt-starters">
          {promptStarters.map((prompt) => (
            <button key={prompt} type="button" onClick={() => onPromptPick(prompt)}>
              <Sparkles size={15} />
              {prompt}
            </button>
          ))}
        </div>
        <MaskStrip masks={masks} onPick={onMaskPick} compact />
        <ToolStrip tools={tools} compact />
      </section>
    );
  }

  return (
    <section className="message-list" data-scroll-owner={scrollActive ? "chat-messages" : undefined}>
      <MaskStrip masks={masks.slice(0, 8)} onPick={onMaskPick} compact />
      <ToolStrip tools={tools} compact />
      {conversation.messages.map((message) => (
        <article key={message.id} className={`message ${message.role} ${message.status || ""}`}>
          <div className="message-avatar">
            {message.role === "user" ? <UserRound size={17} /> : <Bot size={17} />}
          </div>
          <div className="message-body">
            <div className="message-meta">
              <strong>{message.role === "user" ? "你" : assistant?.name || "助手"}</strong>
              <span>{formatTime(message.createdAt)}</span>
              {message.model ? <span>{message.model}</span> : null}
              {message.status === "streaming" ? <span>生成中</span> : null}
              {message.status === "stopped" ? <span>已停止</span> : null}
            </div>
            {message.content ? (
              <>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: MarkdownCode }}>
                  {message.content}
                </ReactMarkdown>
                <div className="message-actions">
                  <button type="button" onClick={() => void copyMessage(message.content)}>
                    <Copy size={14} />
                    复制
                  </button>
                  {message.role === "user" ? (
                    <>
                      <button type="button" onClick={() => onEditPrompt(message.id, message.content)}>
                        <Edit3 size={14} />
                        编辑
                      </button>
                      <button type="button" onClick={() => onRetryPrompt(message.id, message.content)}>
                        <RotateCcw size={14} />
                        重试
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="typing-line">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        </article>
      ))}
      <div ref={bottomRef} />
    </section>
  );
}

function MaskStrip({
  masks,
  compact = false,
  onPick
}: {
  masks: ReturnType<typeof buildChatMaskWorkflows>;
  compact?: boolean;
  onPick: (maskId: string) => void;
}) {
  if (!masks.length) return null;
  return (
    <div className={compact ? "mask-strip compact" : "mask-strip"} aria-label="工作流面具">
      {masks.slice(0, compact ? 8 : 12).map((mask) => (
        <button key={mask.id} type="button" onClick={() => onPick(mask.id)}>
          <span style={{ background: mask.color }} />
          <strong>{mask.title}</strong>
          <small>{mask.category}</small>
        </button>
      ))}
    </div>
  );
}

function ToolStrip({ tools, compact = false }: { tools: string[]; compact?: boolean }) {
  if (!tools.length) return null;
  return (
    <div className={compact ? "tool-strip compact" : "tool-strip"} aria-label="本地工具能力">
      {tools.map((tool) => (
        <span key={tool}>{tool}</span>
      ))}
    </div>
  );
}

function extensionForLanguage(language: string) {
  const normalized = language.toLowerCase();
  if (normalized === "typescript" || normalized === "ts") return "ts";
  if (normalized === "javascript" || normalized === "js" || normalized === "jsx") return "js";
  if (normalized === "tsx") return "tsx";
  if (normalized === "json") return "json";
  if (normalized === "css") return "css";
  if (normalized === "html") return "html";
  if (normalized === "bash" || normalized === "shell" || normalized === "sh") return "sh";
  if (normalized === "python" || normalized === "py") return "py";
  if (normalized === "mermaid") return "mmd";
  return "txt";
}

function MarkdownCode({ inline, className, children, ...props }: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
  const text = Children.toArray(children).join("");
  const language = /language-(\w+)/.exec(className || "")?.[1] || "";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  };

  if (inline) {
    return <code className={className} {...props}>{children}</code>;
  }

  return (
    <figure className="code-artifact">
      <header>
        <span>{language || "text"}</span>
        <div>
          <button type="button" onClick={() => void copyCode()}>复制</button>
          <button
            type="button"
            onClick={() => downloadText(text, `snippet.${extensionForLanguage(language)}`, "text/plain;charset=utf-8")}
          >
            下载
          </button>
        </div>
      </header>
      {language === "mermaid" ? <small>Mermaid 源码</small> : null}
      <pre>
        <code className={className} {...props}>{children}</code>
      </pre>
    </figure>
  );
}

function Composer({
  value,
  streaming,
  model,
  connectionReady,
  attachments,
  supportsVision,
  onChange,
  onSend,
  onStop,
  onOpenConnection,
  onAttachmentsChange,
  onAttachmentError,
  voiceEnabled,
  onVoiceInput
}: {
  value: string;
  streaming: boolean;
  model: string;
  connectionReady: boolean;
  attachments: ChatAttachment[];
  supportsVision: boolean;
  onChange: (value: string) => void;
  onSend: () => Promise<void>;
  onStop: () => void;
  onOpenConnection: () => void;
  onAttachmentsChange: (attachments: ChatAttachment[]) => void;
  onAttachmentError: (message: string) => void;
  voiceEnabled: boolean;
  onVoiceInput: (blob: Blob) => Promise<void>;
}) {
  const canSend = value.trim().length > 0 && connectionReady && !streaming;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (canSend) void onSend();
  };

  const addFiles = async (files: FileList | null, kind: "image" | "text") => {
    if (!files?.length) return;
    if (kind === "image" && !supportsVision) {
      onAttachmentError("当前模型未启用视觉能力，不能添加图片附件");
      return;
    }

    const nextAttachments: ChatAttachment[] = [];
    for (const file of Array.from(files).slice(0, 6 - attachments.length)) {
      try {
        nextAttachments.push(await createChatAttachment(file, kind));
      } catch (error) {
        onAttachmentError(error instanceof Error ? error.message : `${file.name} 添加失败`);
      }
    }
    if (nextAttachments.length) onAttachmentsChange([...attachments, ...nextAttachments].slice(0, 6));
  };

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter((attachment) => attachment.id !== id));
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!voiceEnabled) {
      onAttachmentError("后台未启用语音识别模型");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onAttachmentError("当前浏览器不支持录音");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) void onVoiceInput(blob);
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      onAttachmentError(error instanceof Error ? error.message : "无法开始录音");
    }
  };

  return (
    <footer className="composer">
      <div className="composer-box">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json"
          onChange={(event) => {
            void addFiles(event.currentTarget.files, "text");
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            void addFiles(event.currentTarget.files, "image");
            event.currentTarget.value = "";
          }}
        />
        <textarea
          ref={textareaRef}
          data-testid="composer-input"
          value={value}
          aria-label="消息内容"
          aria-describedby="composer-input-help"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="写点什么... Ctrl/⌘ + Enter 发送"
          rows={1}
        />
        <div className="composer-status-row" id="composer-input-help">
          <span>{value.trim().length ? `${value.trim().length} 字` : "Enter 换行"}</span>
          <span aria-live="polite" role="status">
            {streaming ? "回复生成中" : canSend ? "Ctrl/⌘ + Enter 发送" : "填写内容并完成 API 配置后可发送"}
          </span>
        </div>
        {attachments.length ? (
          <div className="attachment-tray" aria-label="附件列表">
            {attachments.map((attachment) => (
              <article key={attachment.id} className="attachment-chip">
                {attachment.kind === "image" && attachment.dataUrl ? (
                  <img src={attachment.dataUrl} alt="" />
                ) : (
                  <FileText size={15} />
                )}
                <span>
                  <strong>{attachment.name}</strong>
                  <small>{attachmentSummary(attachment)}</small>
                </span>
                <button type="button" className="icon-button" onClick={() => removeAttachment(attachment.id)} aria-label={`移除附件 ${attachment.name}`}>
                  <X size={13} />
                </button>
              </article>
            ))}
          </div>
        ) : null}
        <div className="composer-toolbar">
          <div className="composer-chips">
            <button type="button" className="model-chip" onClick={onOpenConnection} aria-label="配置 API 连接">
              <Cpu size={14} />
              {connectionReady ? model : "配置 API"}
            </button>
            <button
              type="button"
              className="tool-chip"
              title="文本附件"
              aria-label="文本附件"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={15} />
            </button>
          </div>
          <div className="composer-actions">
            <button
              type="button"
              className={recording ? "round-tool active-soft" : "round-tool"}
              title={voiceEnabled ? (recording ? "停止录音并转写" : "语音输入") : "后台未启用语音识别模型"}
              aria-label="语音"
              disabled={!voiceEnabled}
              onClick={() => void toggleRecording()}
            >
              <Mic size={17} />
            </button>
            <button
              type="button"
              className="round-tool"
              title={supportsVision ? "图片附件" : "当前模型未启用视觉能力"}
              aria-label="图片附件"
              disabled={!supportsVision}
              onClick={() => imageInputRef.current?.click()}
            >
              <Image size={17} />
            </button>
            {streaming ? (
              <button type="button" className="stop-button" onClick={onStop} aria-label="停止">
                <Square size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="send-button"
                disabled={!canSend}
                onClick={() => void onSend()}
                aria-label="发送"
              >
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default ChatModule;
