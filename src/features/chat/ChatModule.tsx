import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import {
  Plus,
  Settings2
} from "lucide-react";
import { ApiError, generateChatTitle, streamChat } from "../../api";
import {
  ConfirmationDialog,
} from "../../components/ui";
import {
  compactModelLabel,
  modelsForCapability,
  preferredModelFor
} from "../../components/workbench";
import { createChatAttachment } from "./attachmentUtils";
import { supportsChatImageInput } from "./chatCapabilities";
import {
  boundedChatAttachments,
  chatAttachmentsForRequest,
  chatHistoryWithoutAttachments,
  settleStreamingMessage
} from "./chatAttachmentContext";
import ChatSessionSettingsDialog from "./ChatSessionSettingsDialog";
import {
  attachmentsWithinImageLimit,
  defaultSessionUi,
  displayedSessionStack,
  imageAttachmentCount,
  sortSessionStack,
  uniqueLocalMessageId,
  ChatSessionBlock,
  type SessionUiState
} from "./ChatSessionBlock";
import {
  assistantAvatarPresets,
  defaultChatSessionSettings,
  loadChatSessionSettings,
  personalAvatarPresets,
  saveChatSessionSettings,
  selectChatHistory,
  type ChatSessionSettings
} from "./chatSessionSettings";
import { loadAutomationSkills } from "../automation/automationRepository";
import {
  skillCompatibility,
  toolSetCompatibility
} from "../automation/toolCompatibility";
import {
  ASSISTANT_LAUNCH_EVENT,
  consumeAssistantLaunch
} from "../assistants/assistantLaunch";
import {
  conversationSummary,
  createLocalConversation,
  loadLocalConversations,
  localSummaries,
  makeConversationTitle,
  saveLocalConversations,
} from "./localConversationStore";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import { searchServiceForUserProvider } from "../settings/searchServiceConfig";
import {
  knowledgeEmbeddingConnectionsForBases,
  knowledgeLogoutEvent,
  loadChatKnowledgeSelections,
  missingKnowledgeEmbeddingVendors,
  normalizeKnowledgeBaseIds,
  saveChatKnowledgeSelection
} from "../knowledge-cloud/integrationState";
import { useKnowledgeCatalog } from "../knowledge-cloud/useKnowledgeCatalog";
import type {
  Assistant,
  AgentSkillDefinition,
  AppPreset,
  ChatAttachment,
  ChatStreamEvent,
  Conversation,
  ConversationSummary,
  Message,
  ModelCatalogEntry,
  PromptPreset,
  PublicBootstrapPayload,
  ToolSetting,
  UserProviderConfig
} from "../../types";

type ChatModuleProps = {
  enabled: boolean;
  assistants: Assistant[];
  appPresets: AppPreset[];
  promptPresets: PromptPreset[];
  conversations: ConversationSummary[];
  modelCatalog: ModelCatalogEntry[];
  toolSettings: ToolSetting[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onRequestApiConfig: () => void;
  onConversationsChange: (conversations: ConversationSummary[]) => void;
  onRefresh: () => Promise<PublicBootstrapPayload>;
};

type StreamingRenderState = {
  conversationId: string;
  messageId: string;
  content: string;
};

type PendingModelChange = {
  conversationId: string;
  targetModelId: string;
  imageCount: number;
};

const STREAMING_PERSIST_INTERVAL_MS = 300;

function withStreamingMessageContent(
  conversations: Conversation[],
  stream: StreamingRenderState
) {
  return conversations.map((conversation) =>
    conversation.id !== stream.conversationId
      ? conversation
      : {
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === stream.messageId
              ? { ...message, content: stream.content }
              : message
          )
        }
  );
}


function ChatModule({
  enabled,
  assistants,
  appPresets,
  modelCatalog,
  toolSettings,
  userProvider,
  onUserProviderChange,
  onRequestApiConfig,
  onConversationsChange,
  onRefresh
}: ChatModuleProps) {
  const [conversationList, setConversationList] = useState<Conversation[]>([]);
  const [sessionUi, setSessionUi] = useState<Record<string, SessionUiState>>({});
  const [conversationsHydrated, setConversationsHydrated] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatSessionSettings>(loadChatSessionSettings);
  const [settingsDraft, setSettingsDraft] = useState<ChatSessionSettings>(chatSettings);
  const [chatSkills, setChatSkills] = useState<AgentSkillDefinition[]>([]);
  const [streamingConversationId, setStreamingConversationId] = useState("");
  const [clearConversationId, setClearConversationId] = useState("");
  const [pendingModelChange, setPendingModelChange] = useState<PendingModelChange | null>(null);
  const knowledgeCatalog = useKnowledgeCatalog();
  const conversationsRef = useRef(conversationList);
  const initializedRef = useRef(false);
  const pendingAssistantHandledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef("");
  const streamingRenderRef = useRef<StreamingRenderState | null>(null);
  const streamingFrameRef = useRef<number | null>(null);
  const streamingPersistTimerRef = useRef<number | null>(null);
  const titleSummariesInFlightRef = useRef(new Set<string>());
  const chatModelsRef = useRef<ModelCatalogEntry[]>([]);
  const lastModelIdRef = useRef("");

  useEffect(() => () => {
    abortRef.current?.abort();
    if (streamingFrameRef.current !== null) cancelAnimationFrame(streamingFrameRef.current);
    if (streamingPersistTimerRef.current !== null) clearTimeout(streamingPersistTimerRef.current);
    const stream = streamingRenderRef.current;
    if (stream) {
      const next = sortSessionStack(withStreamingMessageContent(conversationsRef.current, stream));
      conversationsRef.current = next;
      void saveLocalConversations(next).catch(() => undefined);
    }
  }, []);

  const chatModels = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  chatModelsRef.current = chatModels;
  lastModelIdRef.current = userProvider.lastModelId || "";
  const displayedConversations = useMemo(
    () => displayedSessionStack(conversationList, sessionUi),
    [conversationList, sessionUi]
  );
  const connectionReady = isUserProviderReady(userProvider);
  const searchConfigured = connectionReady;
  const independentSearchEnabled = Boolean(toolSettings.find((tool) => tool.name === "web_search")?.enabled);
  const assistantAvatarUrl = assistantAvatarPresets.find((preset) => preset.id === chatSettings.assistantAvatarId)?.image || assistantAvatarPresets[0].image;
  const userAvatarUrl = chatSettings.userAvatar ||
    personalAvatarPresets.find((preset) => preset.id === chatSettings.userAvatarPresetId)?.image ||
    personalAvatarPresets[0].image;

  const commitConversations = useCallback(
    (updater: Conversation[] | ((current: Conversation[]) => Conversation[])) => {
      const current = conversationsRef.current;
      const next = sortSessionStack(typeof updater === "function" ? updater(current) : updater);
      conversationsRef.current = next;
      void saveLocalConversations(next).catch((error: unknown) => {
        setPersistenceError(error instanceof Error ? error.message : "无法保存本地对话。");
      });
      setConversationList(next);
      onConversationsChange(localSummaries(next));
    },
    [onConversationsChange]
  );

  const renderStreamingConversation = useCallback((persist = false) => {
    const stream = streamingRenderRef.current;
    if (!stream) return;
    const next = sortSessionStack(withStreamingMessageContent(conversationsRef.current, stream));
    conversationsRef.current = next;
    if (persist) {
      void saveLocalConversations(next).catch((error: unknown) => {
        setPersistenceError(error instanceof Error ? error.message : "无法保存本地对话。");
      });
    }
    setConversationList(next);
  }, []);

  const clearStreamingSchedules = useCallback(() => {
    if (streamingFrameRef.current !== null) {
      cancelAnimationFrame(streamingFrameRef.current);
      streamingFrameRef.current = null;
    }
    if (streamingPersistTimerRef.current !== null) {
      clearTimeout(streamingPersistTimerRef.current);
      streamingPersistTimerRef.current = null;
    }
  }, []);

  const scheduleStreamingRender = useCallback(() => {
    if (streamingFrameRef.current !== null) return;
    streamingFrameRef.current = requestAnimationFrame(() => {
      streamingFrameRef.current = null;
      renderStreamingConversation(false);
    });
  }, [renderStreamingConversation]);

  const scheduleStreamingPersistence = useCallback(() => {
    if (streamingPersistTimerRef.current !== null) return;
    streamingPersistTimerRef.current = window.setTimeout(() => {
      streamingPersistTimerRef.current = null;
      renderStreamingConversation(true);
    }, STREAMING_PERSIST_INTERVAL_MS);
  }, [renderStreamingConversation]);

  const patchSessionUi = useCallback((id: string, patch: Partial<SessionUiState>) => {
    if (patch.knowledgeBaseIds !== undefined) {
      saveChatKnowledgeSelection(id, patch.knowledgeBaseIds);
    }
    setSessionUi((current) => ({
      ...current,
      [id]: { ...(current[id] || defaultSessionUi(false)), ...patch }
    }));
  }, []);

  const setRequestPhase = useCallback((id: string, requestPhase: SessionUiState["requestPhase"]) => {
    setSessionUi((current) => {
      const ui = current[id] || defaultSessionUi(false);
      if (ui.requestPhase === requestPhase) return current;
      return { ...current, [id]: { ...ui, requestPhase } };
    });
  }, []);

  const createConversation = useCallback(() => {
    const conversation = createLocalConversation();
    commitConversations((current) => [conversation, ...current]);
    setSessionUi((current) => {
      const collapsed = Object.fromEntries(
        Object.entries(current).map(([id, value]) => [id, { ...value, collapsed: true }])
      );
      return { ...collapsed, [conversation.id]: defaultSessionUi(false) };
    });
    return conversation;
  }, [commitConversations]);

  useEffect(() => {
    conversationsRef.current = conversationList;
  }, [conversationList]);

  useEffect(() => {
    let alive = true;
    loadLocalConversations()
      .then((loaded) => {
        if (!alive) return;
        const storedKnowledgeSelections = loadChatKnowledgeSelections();
        const currentById = new Map(conversationsRef.current.map((conversation) => [conversation.id, conversation]));
        loaded.forEach((conversation) => {
          if (!currentById.has(conversation.id)) currentById.set(conversation.id, conversation);
        });
        const next = sortSessionStack([...currentById.values()]);
        conversationsRef.current = next;
        setConversationList(next);
        setSessionUi((current) => ({
          ...Object.fromEntries(next.map((conversation, index) => [
            conversation.id,
            current[conversation.id] || defaultSessionUi(index > 0, storedKnowledgeSelections[conversation.id])
          ]))
        }));
        onConversationsChange(localSummaries(next));
      })
      .catch((error: unknown) => {
        if (alive) setPersistenceError(error instanceof Error ? error.message : "无法读取本地对话。");
      })
      .finally(() => {
        if (alive) setConversationsHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [onConversationsChange]);

  useEffect(() => {
    const clearKnowledgeSelections = () => {
      setSessionUi((current) => Object.fromEntries(
        Object.entries(current).map(([id, ui]) => [id, { ...ui, knowledgeBaseIds: [] }])
      ));
    };
    window.addEventListener(knowledgeLogoutEvent, clearKnowledgeSelections);
    return () => window.removeEventListener(knowledgeLogoutEvent, clearKnowledgeSelections);
  }, []);

  useEffect(() => {
    let alive = true;
    loadAutomationSkills()
      .then((skills) => {
        if (!alive) return;
        setChatSkills(skills);
      })
      .catch((error: unknown) => {
        if (alive) setPersistenceError(error instanceof Error ? error.message : "无法读取本地 Skill。");
      });
    return () => {
      alive = false;
    };
  }, []);

  const consumePendingAssistantLaunch = useCallback(() => {
    if (!conversationsHydrated) return false;
    const { intent, error: launchError } = consumeAssistantLaunch();
    if (launchError) {
      setPersistenceError(launchError);
      return false;
    }
    if (!intent) return false;
    const assistant = assistants.find((item) => item.id === intent.assistantId && item.enabled !== false);
    if (!assistant) {
      setPersistenceError("所选助手已停用或不存在，请返回助手库重新选择。");
      return false;
    }
    pendingAssistantHandledRef.current = true;
    const conversation = createLocalConversation(assistant);
    commitConversations((current) => [conversation, ...current]);
    setSessionUi((current) => ({
      ...Object.fromEntries(Object.entries(current).map(([id, value]) => [id, { ...value, collapsed: true }])),
      [conversation.id]: {
        ...defaultSessionUi(false),
        draft: intent.starterPrompt || ""
      }
    }));
    return true;
  }, [assistants, commitConversations, conversationsHydrated]);

  useEffect(() => {
    void consumePendingAssistantLaunch();
  }, [consumePendingAssistantLaunch]);

  useEffect(() => {
    const handleAssistantLaunch = () => {
      void consumePendingAssistantLaunch();
    };
    window.addEventListener(ASSISTANT_LAUNCH_EVENT, handleAssistantLaunch);
    return () => window.removeEventListener(ASSISTANT_LAUNCH_EVENT, handleAssistantLaunch);
  }, [consumePendingAssistantLaunch]);

  useEffect(() => {
    if (
      initializedRef.current ||
      !conversationsHydrated ||
      pendingAssistantHandledRef.current ||
      conversationList.length
    ) return;
    initializedRef.current = true;
    createConversation();
  }, [conversationList.length, conversationsHydrated, createConversation]);

  useEffect(() => {
    setSessionUi((current) => {
      let changed = false;
      const next = { ...current };
      conversationList.forEach((conversation, index) => {
        if (!next[conversation.id]) {
          next[conversation.id] = defaultSessionUi(index > 0);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [conversationList]);

  useEffect(() => {
    if (connectionReady && independentSearchEnabled) return;
    setSessionUi((current) => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(current).map(([id, ui]) => {
        if (!ui.searchProvider) return [id, ui];
        changed = true;
        return [id, {
          ...ui,
          searchProvider: "" as const,
          requestPhase: "idle" as const,
          notice: independentSearchEnabled
            ? "API Key 已移除，联网搜索已关闭。"
            : "联网搜索已由后台关闭。"
        }];
      }));
      return changed ? next : current;
    });
  }, [connectionReady, independentSearchEnabled]);

  const modelForSession = useCallback(
    (conversationId: string) => {
      const requestedId = sessionUi[conversationId]?.modelId;
      return (
        chatModels.find((model) => model.id === requestedId) ||
        preferredModelFor(chatModels, "chat", userProvider.lastModelId)
      );
    },
    [chatModels, sessionUi, userProvider.lastModelId]
  );
  const handleStreamEvent = useCallback(
    (
      conversationId: string,
      selectedModel: ModelCatalogEntry,
      messageAttachments: ChatAttachment[],
      event: ChatStreamEvent
    ) => {
      if (event.type === "meta") {
        commitConversations((current) =>
          current.map((conversation) =>
            conversation.id !== conversationId
              ? conversation
              : (() => {
                  const userMessage = {
                    ...event.userMessage,
                    id: uniqueLocalMessageId(conversation.messages, event.userMessage.id),
                    attachments: messageAttachments.length ? messageAttachments : undefined
                  };
                  const assistantMessageId = uniqueLocalMessageId([...conversation.messages, userMessage], event.assistantMessageId);
                  streamingMessageIdRef.current = assistantMessageId;
                  streamingRenderRef.current = {
                    conversationId,
                    messageId: assistantMessageId,
                    content: ""
                  };
                  const assistantPlaceholder: Message = {
                    id: assistantMessageId,
                    role: "assistant",
                    content: "",
                    providerId: selectedModel.id,
                    model: selectedModel.model,
                    status: "streaming",
                    createdAt: new Date().toISOString()
                  };
                  return {
                  ...conversation,
                  ...event.conversation,
                  messages: [...conversation.messages, userMessage, assistantPlaceholder]
                  };
                })()
          )
        );
        return;
      }

      if (event.type === "token") {
        setRequestPhase(conversationId, "generating");
        if (!chatSettings.streamOutput) return;
        const stream = streamingRenderRef.current;
        if (!stream || stream.conversationId !== conversationId) return;
        stream.content += event.token;
        scheduleStreamingRender();
        scheduleStreamingPersistence();
        return;
      }

      if (event.type === "error") {
        setRequestPhase(conversationId, "failed");
        patchSessionUi(conversationId, { notice: event.error });
        return;
      }

      setRequestPhase(conversationId, "idle");
      const finalMessageId = streamingMessageIdRef.current;
      clearStreamingSchedules();
      streamingRenderRef.current = null;
      commitConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                ...event.conversation,
                messages: conversation.messages.map((message) =>
                  message.id === finalMessageId
                    ? { ...event.message, id: finalMessageId }
                    : message
                )
              }
            : conversation
        )
      );
    },
    [
      chatSettings.streamOutput,
      clearStreamingSchedules,
      commitConversations,
      patchSessionUi,
      scheduleStreamingPersistence,
      scheduleStreamingRender,
      setRequestPhase
    ]
  );

  const sendMessage = async (conversation: Conversation) => {
    const ui = sessionUi[conversation.id] || defaultSessionUi(false);
    const rawContent = ui.draft.trim();
    if ((!rawContent && !ui.attachments.length) || streamingConversationId) return;
    if (!enabled) {
      patchSessionUi(conversation.id, { notice: "当前对话服务暂未开放。" });
      return;
    }
    if (!connectionReady) {
      patchSessionUi(conversation.id, { notice: "请先填写 API Key。" });
      onRequestApiConfig();
      return;
    }
    const selectedModel = modelForSession(conversation.id);
    if (!selectedModel) {
      patchSessionUi(conversation.id, { notice: "当前没有可用的对话模型。" });
      return;
    }
    if (ui.searchProvider && !rawContent) {
      patchSessionUi(conversation.id, { notice: "启用联网搜索时，请先输入要搜索的问题。" });
      return;
    }
    if (ui.attachments.some((attachment) => attachment.kind === "image") && !supportsChatImageInput(selectedModel)) {
      patchSessionUi(conversation.id, { notice: "当前模型不支持图片输入。" });
      return;
    }
    const knowledgeBaseIds = normalizeKnowledgeBaseIds(ui.knowledgeBaseIds);
    let embeddingConnections;
    if (knowledgeBaseIds.length) {
      if (knowledgeCatalog.status !== "authenticated" || !knowledgeCatalog.csrfToken) {
        patchSessionUi(conversation.id, { notice: "知识库账号已退出，请重新登录后再引用云知识库。" });
        return;
      }
      const visibleIds = new Set(knowledgeCatalog.bases.map((base) => base.id));
      const missingIds = knowledgeBaseIds.filter((id) => !visibleIds.has(id));
      if (missingIds.length) {
        patchSessionUi(conversation.id, {
          knowledgeBaseIds: knowledgeBaseIds.filter((id) => visibleIds.has(id)),
          notice: "部分知识库已不存在或无权访问，请重新选择。"
        });
        return;
      }
      const missingVendors = missingKnowledgeEmbeddingVendors(knowledgeBaseIds, knowledgeCatalog.bases);
      if (missingVendors.length) {
        const labels = missingVendors.map((vendor) => vendor === "qwen" ? "Qwen" : "OpenAI");
        patchSessionUi(conversation.id, { notice: `请先在知识库页面配置 ${labels.join("、")} Embedding 连接。` });
        return;
      }
      embeddingConnections = knowledgeEmbeddingConnectionsForBases(knowledgeBaseIds, knowledgeCatalog.bases);
    }
    const selectedSkills = chatSkills.filter((skill) => (ui.skillIds || []).includes(skill.id));
    const selectedApp = appPresets.find((app) => app.enabled && app.id === ui.appId);
    const compatibilityOptions = {
      searchReady: searchConfigured,
      invocationMode: chatSettings.toolInvocationMode
    };
    const incompatibleSkill = selectedSkills.find((skill) => !skillCompatibility(skill, toolSettings, selectedModel, compatibilityOptions).compatible);
    if (incompatibleSkill) {
      const compatibility = skillCompatibility(incompatibleSkill, toolSettings, selectedModel, compatibilityOptions);
      patchSessionUi(conversation.id, { notice: `Skill“${incompatibleSkill.name}”不可用：${compatibility.reason}` });
      return;
    }
    const selectedSkillTools = selectedSkills.flatMap((skill) => skill.allowedTools);
    if (selectedSkillTools.includes("web_search") && !ui.searchProvider) {
      patchSessionUi(conversation.id, { notice: "当前 Skill 需要联网搜索，请先选择智谱 GLM 或 Kimi。" });
      return;
    }
    const allowedTools = [...new Set([
      ...selectedSkillTools,
      ...(ui.searchProvider ? ["web_search"] : [])
    ])];
    const toolsCompatibility = toolSetCompatibility(allowedTools, toolSettings, selectedModel, compatibilityOptions);
    if (!toolsCompatibility.compatible) {
      patchSessionUi(conversation.id, { notice: toolsCompatibility.reason });
      return;
    }
    const requestedSearchService = allowedTools.includes("web_search") && ui.searchProvider
      ? searchServiceForUserProvider(ui.searchProvider, userProvider)
      : undefined;
    if (allowedTools.includes("web_search") && !requestedSearchService) {
      patchSessionUi(conversation.id, { notice: "当前 API Key 无法用于联网搜索，请先更新访问配置。" });
      onRequestApiConfig();
      return;
    }
    const assistant = assistants.find((item) =>
      item.id === conversation.assistantId &&
      Boolean(conversation.assistantId && item.enabled !== false)
    );
    if (conversation.assistantId && !assistant) {
      patchSessionUi(conversation.id, { notice: "当前会话绑定的助手已停用或不存在。" });
      return;
    }

    const hasImageAttachment = ui.attachments.some((attachment) => attachment.kind === "image");
    const hasTextAttachment = ui.attachments.some((attachment) => attachment.kind === "text");
    const displayContent = rawContent || (hasImageAttachment && hasTextAttachment
      ? "请分析我上传的附件。"
      : hasTextAttachment
        ? "请分析我上传的文本附件。"
        : "请分析我上传的图片。");
    const appAwareContent = selectedApp
      ? `${selectedApp.prompt}\n\n用户输入：\n${displayContent}`
      : displayContent;
    const content = appAwareContent;
    const requestConversation: Conversation = {
      ...conversation,
      title: conversation.messages.length ? conversation.title : makeConversationTitle(displayContent),
      assistantId: assistant?.id || "",
      updatedAt: new Date().toISOString()
    };
    if (
      requestConversation.title !== conversation.title ||
      requestConversation.assistantId !== conversation.assistantId
    ) {
      commitConversations((current) =>
        current.map((item) => (item.id === conversation.id ? requestConversation : item))
      );
    }

    patchSessionUi(conversation.id, { draft: "", appId: "", notice: "" });
    setRequestPhase(conversation.id, ui.searchProvider ? "searching" : "generating");
    setStreamingConversationId(conversation.id);
    const controller = new AbortController();
    abortRef.current = controller;
    const selectedHistory = selectChatHistory(requestConversation.messages, chatSettings);
    const attachmentLimits = {
      imageLimit: chatSettings.maxImageAttachments,
      includeImages: supportsChatImageInput(selectedModel)
    };
    const messageAttachments = boundedChatAttachments(ui.attachments, attachmentLimits);
    const requestAttachments = chatAttachmentsForRequest(selectedHistory, messageAttachments, attachmentLimits);
    try {
      await streamChat(
        {
          conversation: conversationSummary(requestConversation),
          history: chatHistoryWithoutAttachments(selectedHistory),
          ...(assistant ? { assistantId: assistant.id } : {}),
          modelId: selectedModel.id,
          temperature: chatSettings.temperature,
          topP: chatSettings.topP,
          reasoningEffort: ui.reasoningEffort,
          maxTokens: chatSettings.maxTokensEnabled ? chatSettings.maxTokens : undefined,
          toolInvocationMode: chatSettings.toolInvocationMode,
          responseVerbosity: chatSettings.responseVerbosity === "default" ? undefined : chatSettings.responseVerbosity,
          includeUsage: chatSettings.showUsage,
          content,
          displayContent,
          attachments: requestAttachments,
          skillInstructions: selectedSkills.map((skill) => `${skill.name}: ${skill.instructions}`),
          allowedTools,
          searchService: requestedSearchService,
          ...(knowledgeBaseIds.length ? { knowledgeBaseIds, embeddingConnections } : {}),
          connection: userConnectionPayload(userProvider)
        },
        (event) => handleStreamEvent(conversation.id, selectedModel, messageAttachments, event),
        controller.signal,
        knowledgeBaseIds.length ? knowledgeCatalog.csrfToken : ""
      );
      patchSessionUi(conversation.id, { attachments: [] });
      setRequestPhase(conversation.id, "idle");
    } catch (error) {
      renderStreamingConversation(true);
      clearStreamingSchedules();
      streamingRenderRef.current = null;
      const aborted = controller.signal.aborted;
      setRequestPhase(conversation.id, aborted ? "cancelled" : "failed");
      const messageId = abortRef.current === controller ? streamingMessageIdRef.current : "";
      if (messageId) {
        commitConversations((current) => settleStreamingMessage(
          current,
          conversation.id,
          messageId,
          aborted ? "stopped" : "error"
        ));
      }
      if (!aborted) {
        const message = error instanceof ApiError || error instanceof Error ? error.message : "发送失败";
        patchSessionUi(conversation.id, { notice: message, draft: rawContent, appId: selectedApp?.id || "" });
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        streamingMessageIdRef.current = "";
        streamingRenderRef.current = null;
        clearStreamingSchedules();
        setStreamingConversationId((current) => current === conversation.id ? "" : current);
      }
      void onRefresh();
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const clearMessages = (conversationId: string) => {
    commitConversations((current) =>
      current.map((item) =>
        item.id === conversationId
          ? { ...item, messages: [], title: "新对话", updatedAt: new Date().toISOString() }
          : item
      )
    );
    patchSessionUi(conversationId, { notice: "", attachments: [] });
    setClearConversationId("");
  };

  const attachImage = async (conversationId: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    if (!supportsChatImageInput(modelForSession(conversationId))) {
      patchSessionUi(conversationId, { notice: "当前模型不支持图片输入。" });
      return;
    }

    const currentCount = imageAttachmentCount(sessionUi[conversationId]?.attachments || []);
    const availableSlots = Math.max(0, chatSettings.maxImageAttachments - currentCount);
    if (!availableSlots) {
      patchSessionUi(conversationId, {
        notice: `一次最多上传 ${chatSettings.maxImageAttachments} 张图片，请先移除已有图片。`
      });
      return;
    }

    const attachments: ChatAttachment[] = [];
    const errors: string[] = [];
    let processedCount = 0;
    for (const file of files) {
      if (attachments.length >= availableSlots) break;
      processedCount += 1;
      try {
        attachments.push(await createChatAttachment(file, "image"));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${file.name} 读取失败`);
      }
    }

    setSessionUi((current) => {
      const ui = current[conversationId] || defaultSessionUi(false);
      const latestModels = chatModelsRef.current;
      const latestModel = latestModels.find((model) => model.id === ui.modelId)
        || preferredModelFor(latestModels, "chat", lastModelIdRef.current);
      if (!supportsChatImageInput(latestModel)) {
        return {
          ...current,
          [conversationId]: { ...ui, notice: "当前模型不支持图片输入。" }
        };
      }
      const remainingSlots = Math.max(0, chatSettings.maxImageAttachments - imageAttachmentCount(ui.attachments));
      const accepted = attachments.slice(0, remainingSlots);
      const overflowCount = Math.max(
        0,
        files.length - processedCount + attachments.length - accepted.length
      );
      const notices = [...errors];
      if (overflowCount) {
        notices.push(`一次最多上传 ${chatSettings.maxImageAttachments} 张图片，超出的 ${overflowCount} 张未添加。`);
      }
      return {
        ...current,
        [conversationId]: {
          ...ui,
          attachments: [...ui.attachments, ...accepted],
          notice: notices.join("；")
        }
      };
    });
  };

  const attachPastedText = async (conversationId: string, text: string) => {
    try {
      const attachment = await createChatAttachment(
        new File([text], `粘贴内容-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`, { type: "text/plain" }),
        "text"
      );
      setSessionUi((current) => {
        const ui = current[conversationId] || defaultSessionUi(false);
        return {
          ...current,
          [conversationId]: {
            ...ui,
            attachments: [...ui.attachments, attachment],
            notice: "长文本已转换为文本附件。"
          }
        };
      });
    } catch (error) {
      patchSessionUi(conversationId, {
        notice: error instanceof Error ? error.message : "无法创建文本附件。"
      });
    }
  };

  const applyModelChange = (conversationId: string, modelId: string) => {
    patchSessionUi(conversationId, { modelId, notice: "", requestPhase: "idle" });
    onUserProviderChange({ lastModelId: modelId });
  };

  const changeModel = (conversationId: string, modelId: string) => {
    const targetModel = chatModels.find((model) => model.id === modelId);
    if (!targetModel) {
      patchSessionUi(conversationId, { notice: "所选模型已不可用，请重新选择。" });
      return;
    }
    const ui = sessionUi[conversationId] || defaultSessionUi(false);
    const imageCount = imageAttachmentCount(ui.attachments);
    if (imageCount && !supportsChatImageInput(targetModel)) {
      setPendingModelChange({ conversationId, targetModelId: modelId, imageCount });
      return;
    }
    applyModelChange(conversationId, modelId);
  };

  const confirmPendingModelChange = () => {
    if (!pendingModelChange) return;
    const { conversationId, targetModelId, imageCount } = pendingModelChange;
    setSessionUi((current) => {
      const ui = current[conversationId] || defaultSessionUi(false);
      return {
        ...current,
        [conversationId]: {
          ...ui,
          modelId: targetModelId,
          attachments: ui.attachments.filter((attachment) => attachment.kind !== "image"),
          requestPhase: "idle",
          notice: `已移除 ${imageCount} 张图片并切换模型。`
        }
      };
    });
    onUserProviderChange({ lastModelId: targetModelId });
    setPendingModelChange(null);
  };

  const summarizeConversationTitle = async (conversation: Conversation) => {
    if (!chatSettings.titleSummaryEnabled || !conversation.messages.length) return;
    const summarizedAt = Date.parse(conversation.titleSummaryAt || "");
    const updatedAt = Date.parse(conversation.updatedAt);
    if (Number.isFinite(summarizedAt) && Number.isFinite(updatedAt) && summarizedAt >= updatedAt) return;
    if (titleSummariesInFlightRef.current.has(conversation.id)) return;
    const titleModel = chatModels.find((item) =>
      item.id === chatSettings.titleSummaryModelId || item.model === chatSettings.titleSummaryModelId
    );
    if (!titleModel) {
      patchSessionUi(conversation.id, {
        notice: `标题总结模型 ${chatSettings.titleSummaryModelId} 尚未在后台启用，请在会话设置中更换。`
      });
      return;
    }
    if (!connectionReady) {
      patchSessionUi(conversation.id, { notice: "请先填写 API Key，才能自动总结对话标题。" });
      return;
    }
    const history = conversation.messages
      .filter((message) => message.content.trim())
      .slice(-chatSettings.titleSummaryMessageCount);
    if (!history.length) return;
    const sourceUpdatedAt = conversation.updatedAt;
    titleSummariesInFlightRef.current.add(conversation.id);
    try {
      const result = await generateChatTitle({
        connection: userConnectionPayload(userProvider),
        modelId: titleModel.id,
        history
      });
      commitConversations((current) => current.map((item) => item.id === conversation.id
        ? { ...item, title: result.title, titleSummaryAt: sourceUpdatedAt }
        : item));
      patchSessionUi(conversation.id, { notice: "" });
    } catch (error) {
      patchSessionUi(conversation.id, {
        notice: error instanceof Error ? `标题总结失败：${error.message}` : "标题总结失败，请稍后重试。"
      });
    } finally {
      titleSummariesInFlightRef.current.delete(conversation.id);
    }
  };

  const toggleConversation = (conversation: Conversation, ui: SessionUiState) => {
    const collapsed = !ui.collapsed;
    if (!collapsed) {
      const automaticallyCollapsed = conversationList.filter((item) =>
        item.id !== conversation.id && sessionUi[item.id] && !sessionUi[item.id].collapsed
      );
      const openedAt = Date.now();
      setSessionUi((current) => ({
        ...Object.fromEntries(Object.entries(current).map(([id, value]) => [
          id,
          id === conversation.id || value.collapsed ? value : { ...value, collapsed: true }
        ])),
        [conversation.id]: {
          ...(current[conversation.id] || defaultSessionUi(false)),
          collapsed: false,
          openedAt
        }
      }));
      automaticallyCollapsed.forEach((item) => {
        if (streamingConversationId !== item.id) void summarizeConversationTitle(item);
      });
      return;
    }
    patchSessionUi(conversation.id, {
      collapsed,
      openedAt: ui.openedAt
    });
    if (collapsed && streamingConversationId !== conversation.id) {
      void summarizeConversationTitle(conversation);
    }
  };

  const toggleConversationPinned = (conversation: Conversation) => {
    commitConversations((current) => current.map((item) => item.id === conversation.id
      ? { ...item, pinned: !item.pinned }
      : item));
  };

  const openSettings = () => {
    setSettingsDraft(chatSettings);
    setSettingsOpen(true);
  };

  const cancelSettings = () => {
    setSettingsDraft(chatSettings);
    setSettingsOpen(false);
  };

  const saveSettings = () => {
    setSessionUi((current) => Object.fromEntries(
      Object.entries(current).map(([conversationId, ui]) => {
        if (imageAttachmentCount(ui.attachments) <= settingsDraft.maxImageAttachments) return [conversationId, ui];
        return [conversationId, {
          ...ui,
          attachments: attachmentsWithinImageLimit(ui.attachments, settingsDraft.maxImageAttachments),
          notice: `图片上限已调整为 ${settingsDraft.maxImageAttachments} 张，超出的待发送图片已移除。`
        }];
      })
    ));
    setChatSettings(settingsDraft);
    saveChatSessionSettings(settingsDraft);
    setSettingsOpen(false);
  };

  const updateContextMessageCount = (contextMessageCount: ChatSessionSettings["contextMessageCount"]) => {
    const nextSettings = { ...chatSettings, contextMessageCount };
    setChatSettings(nextSettings);
    setSettingsDraft((current) => ({ ...current, contextMessageCount }));
    saveChatSessionSettings(nextSettings);
  };

  const topModel = displayedConversations[0] ? modelForSession(displayedConversations[0].id) : undefined;

  return (
    <section className="figma-chat-view" data-testid="chat-module">
      <header className="figma-workspace-heading">
        <div>
          <p>
            <span>01 / INTELLIGENCE</span>
            <i />
            <small>{compactModelLabel(topModel) || "AI"} 对话空间</small>
          </p>
          <h1>AI 对话工作台</h1>
        </div>
        <div className="figma-heading-actions">
          <button type="button" onClick={createConversation} disabled={!conversationsHydrated} aria-label="新对话" title="新对话">
            <Plus size={15} />
            <span className="figma-heading-action-label">新对话</span>
          </button>
          <button type="button" onClick={() => openSettings()} aria-label="会话设置" title="会话设置">
            <Settings2 size={15} />
            <span className="figma-heading-action-label">会话设置</span>
          </button>
        </div>
      </header>

      {persistenceError ? (
        <p className="figma-chat-storage-error" role="alert">
          {persistenceError}
          <button type="button" onClick={() => setPersistenceError("")} aria-label="关闭存储错误">×</button>
        </p>
      ) : null}

      <div className="figma-session-stack">
        {!conversationsHydrated ? <p className="figma-chat-storage-loading">正在读取本地对话…</p> : null}
        {displayedConversations.map((conversation) => {
          const ui = sessionUi[conversation.id] || defaultSessionUi(false);
          const selectedModel = modelForSession(conversation.id);
          const boundAssistant = assistants.find((assistant) => assistant.id === conversation.assistantId);
          return (
            <ChatSessionBlock
              key={conversation.id}
              conversation={conversation}
              ui={ui}
              models={chatModels}
              skills={chatSkills}
              tools={toolSettings}
              searchConfigured={searchConfigured}
              knowledgeAuthenticated={knowledgeCatalog.status === "authenticated"}
              knowledgeBases={knowledgeCatalog.bases}
              apps={appPresets.filter((app) => app.enabled)}
              assistant={boundAssistant}
              selectedModel={selectedModel}
              settings={chatSettings}
              assistantAvatarUrl={assistantAvatarUrl}
              userAvatarUrl={userAvatarUrl}
              streaming={streamingConversationId === conversation.id}
              onCreateConversation={createConversation}
              onOpenSettings={openSettings}
              onToggle={() => toggleConversation(conversation, ui)}
              onTogglePinned={() => toggleConversationPinned(conversation)}
              onDraftChange={(draft) => patchSessionUi(conversation.id, {
                draft,
                requestPhase: ui.requestPhase === "failed" || ui.requestPhase === "cancelled"
                  ? "idle"
                  : ui.requestPhase
              })}
              onAddSkill={(skillId) => patchSessionUi(conversation.id, { skillIds: [...new Set([...(ui.skillIds || []), skillId])] })}
              onRemoveSkill={(skillId) => patchSessionUi(conversation.id, { skillIds: (ui.skillIds || []).filter((id) => id !== skillId) })}
              onSelectApp={(appId) => patchSessionUi(conversation.id, { appId })}
              onClearApp={() => patchSessionUi(conversation.id, { appId: "" })}
              onModelChange={(modelId) => changeModel(conversation.id, modelId)}
              onSearchProviderChange={(searchProvider) => {
                if (!searchProvider) {
                  patchSessionUi(conversation.id, { searchProvider: "", requestPhase: "idle", notice: "" });
                  return;
                }
                const searchTool = toolSettings.find((tool) => tool.name === "web_search");
                if (!searchTool?.enabled) {
                  patchSessionUi(conversation.id, { notice: searchTool ? "联网搜索已由后台关闭。" : "联网搜索工具不存在。" });
                  return;
                }
                if (!connectionReady) {
                  patchSessionUi(conversation.id, { notice: "请先填写 API Key。" });
                  onRequestApiConfig();
                  return;
                }
                patchSessionUi(conversation.id, { searchProvider, requestPhase: "idle", notice: "" });
              }}
              onKnowledgeChange={(knowledgeBaseIds) => patchSessionUi(conversation.id, {
                knowledgeBaseIds,
                notice: ""
              })}
              onReasoningEffortChange={(reasoningEffort) => patchSessionUi(conversation.id, {
                reasoningEffort,
                notice: ""
              })}
              onContextMessageCountChange={updateContextMessageCount}
              onImageInput={(event) => void attachImage(conversation.id, event)}
              onImageInputBlocked={() => patchSessionUi(conversation.id, {
                notice: "当前模型不支持图片输入。"
              })}
              onLongPaste={(text) => void attachPastedText(conversation.id, text)}
              onRemoveImage={(attachmentId) => patchSessionUi(conversation.id, {
                attachments: ui.attachments.filter((attachment) => attachment.id !== attachmentId),
                notice: ""
              })}
              onRemoveAllImages={() => patchSessionUi(conversation.id, {
                attachments: ui.attachments.filter((attachment) => attachment.kind !== "image"),
                notice: "已移除不兼容的图片附件。"
              })}
              onClear={() => setClearConversationId(conversation.id)}
              onSend={() => void sendMessage(conversation)}
              onStop={stopStreaming}
            />
          );
        })}
      </div>

      <ChatSessionSettingsDialog
        open={settingsOpen}
        settings={settingsDraft}
        models={chatModels}
        onSettingsChange={(patch) => setSettingsDraft((current) => ({ ...current, ...patch }))}
        onCancel={cancelSettings}
        onSave={saveSettings}
      />

      <ConfirmationDialog
        open={Boolean(clearConversationId)}
        title="清除当前对话消息？"
        description="此操作会清除当前对话中的全部消息和待发送图片，且无法撤销。"
        confirmLabel="清除消息"
        onCancel={() => setClearConversationId("")}
        onConfirm={() => clearConversationId && clearMessages(clearConversationId)}
      />
      <ConfirmationDialog
        open={Boolean(pendingModelChange)}
        title="切换到不支持图片的模型？"
        description={pendingModelChange
          ? `当前有 ${pendingModelChange.imageCount} 张待发送图片。继续切换到 ${compactModelLabel(chatModels.find((model) => model.id === pendingModelChange.targetModelId)) || "所选模型"} 将移除这些图片。`
          : "继续切换将移除待发送图片。"}
        confirmLabel="切换并移除图片"
        onCancel={() => setPendingModelChange(null)}
        onConfirm={confirmPendingModelChange}
      />
    </section>
  );
}

export default ChatModule;
