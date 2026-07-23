import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Globe2,
  Image as ImageIcon,
  LayoutGrid,
  Plus,
  Puzzle,
  Send,
  Settings2,
  Square,
  Trash2,
  X
} from "lucide-react";
import { ApiError, streamChat } from "../../api";
import {
  Dialog,
  getFloatingHorizontalOffset,
  getFloatingVerticalPlacement
} from "../../components/ui";
import {
  compactModelLabel,
  modelsForCapability,
  preferredModelFor
} from "../../components/workbench";
import { createChatAttachment } from "./attachmentUtils";
import ChatCommandPalette, { type ChatCommandOption } from "./ChatCommandPalette";
import { activeChatCommand, chatCommandMatches, removeChatCommand } from "./chatCommands";
import ChatSkillManagerDialog from "../automation/ChatSkillManagerDialog";
import { loadAutomationSkills, saveAgentSkills } from "../automation/automationRepository";
import {
  skillCompatibility,
  toolCompatibility,
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
import SearchServiceDialog from "../settings/SearchServiceDialog";
import {
  isSearchServiceReady,
  searchServicePayload
} from "../settings/searchServiceConfig";
import CloudKnowledgeSelector from "../knowledge-cloud/CloudKnowledgeSelector";
import KnowledgeCitationList from "../knowledge-cloud/KnowledgeCitationList";
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
  KnowledgeBase,
  PromptPreset,
  PublicBootstrapPayload,
  SearchServiceConfig,
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
  searchService: SearchServiceConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onSearchServiceChange: (config: SearchServiceConfig) => void;
  onRequestApiConfig: () => void;
  onConversationsChange: (conversations: ConversationSummary[]) => void;
  onRefresh: () => Promise<PublicBootstrapPayload>;
};

type SessionUiState = {
  collapsed: boolean;
  draft: string;
  modelId: string;
  attachments: ChatAttachment[];
  skillIds: string[];
  appId: string;
  search: boolean;
  knowledgeBaseIds: string[];
  notice: string;
};

type ModelVendorTab = "OpenAI" | "Claude" | "Gemini" | "Kimi" | "DeepSeek" | "通义千问";

type SessionSettingsSnapshot = {
  assistantAvatarId: string;
  userAvatar: string | null;
  messageStyle: "bubble" | "list";
  temperature: number;
  topP: number;
  contextSize: string;
  maxTokens: string;
  streamOutput: boolean;
  toolMode: string;
  skillIds: string[];
};

const assistantAvatarPresets = [
  { id: "akira", name: "霓虹主角", image: "/assets/figma/avatar-akira.jpg" },
  { id: "mika", name: "蓝发旅人", image: "/assets/figma/avatar-mika.jpg" },
  { id: "ren", name: "声波少年", image: "/assets/figma/avatar-ren.jpg" },
  { id: "yuki", name: "靛蓝观察者", image: "/assets/figma/avatar-yuki.jpg" }
] as const;

const modelVendorTabs: ModelVendorTab[] = ["OpenAI", "Claude", "Gemini", "Kimi", "DeepSeek", "通义千问"];

function vendorTabForModel(model?: ModelCatalogEntry): ModelVendorTab {
  if (model?.vendor === "openai" || model?.vendor === "openai-compatible") return "OpenAI";
  if (model?.vendor === "anthropic") return "Claude";
  if (model?.vendor === "gemini") return "Gemini";
  if (model?.vendor === "kimi") return "Kimi";
  if (model?.vendor === "deepseek") return "DeepSeek";
  return "通义千问";
}

function modelCapabilityNote(model: ModelCatalogEntry) {
  if (model.capabilities.includes("vision")) return "图像理解 · 多模态";
  if (model.capabilities.includes("toolCalling")) return "代码与工具调用";
  if (model.capabilities.includes("streaming")) return "深度推理 · 流式响应";
  return "通用对话 · 稳定输出";
}

function moveRovingFocus(event: KeyboardEvent<HTMLElement>, selector: string) {
  if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector));
  if (!items.length) return;
  event.preventDefault();
  const currentIndex = items.findIndex((item) => item === document.activeElement);
  const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? items.length - 1
      : forward
        ? currentIndex < 0 || currentIndex === items.length - 1 ? 0 : currentIndex + 1
        : currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  items[nextIndex]?.focus();
}

function defaultSessionUi(collapsed: boolean, knowledgeBaseIds: string[] = []): SessionUiState {
  return {
    collapsed,
    draft: "",
    modelId: "",
    attachments: [],
    skillIds: [],
    appId: "",
    search: false,
    knowledgeBaseIds: normalizeKnowledgeBaseIds(knowledgeBaseIds),
    notice: ""
  };
}

function sortSessionStack(conversations: Conversation[]) {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function uniqueLocalMessageId(existing: Message[], candidate: string) {
  if (!existing.some((message) => message.id === candidate)) return candidate;
  return `${candidate}-${crypto.randomUUID()}`;
}

function ChatModule({
  enabled,
  assistants,
  appPresets,
  modelCatalog,
  toolSettings,
  userProvider,
  searchService,
  onUserProviderChange,
  onSearchServiceChange,
  onRequestApiConfig,
  onConversationsChange,
  onRefresh
}: ChatModuleProps) {
  const [conversationList, setConversationList] = useState<Conversation[]>([]);
  const [sessionUi, setSessionUi] = useState<Record<string, SessionUiState>>({});
  const [conversationsHydrated, setConversationsHydrated] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [messageStyle, setMessageStyle] = useState<"bubble" | "list">("bubble");
  const [contextSize, setContextSize] = useState("16");
  const [maxTokens, setMaxTokens] = useState("4096");
  const [streamOutput, setStreamOutput] = useState(true);
  const [toolMode, setToolMode] = useState("自动");
  const [chatSkills, setChatSkills] = useState<AgentSkillDefinition[]>([]);
  const [settingsSkillIds, setSettingsSkillIds] = useState<string[]>([]);
  const [settingsConversationId, setSettingsConversationId] = useState("");
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillManagerOpen, setSkillManagerOpen] = useState(false);
  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);
  const [pendingSearchConversationId, setPendingSearchConversationId] = useState("");
  const [assistantAvatarId, setAssistantAvatarId] = useState("akira");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [defaultAssistantId, setDefaultAssistantId] = useState(assistants[0]?.id || "");
  const [streamingConversationId, setStreamingConversationId] = useState("");
  const knowledgeCatalog = useKnowledgeCatalog();
  const conversationsRef = useRef(conversationList);
  const initializedRef = useRef(false);
  const pendingAssistantHandledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef("");
  const userAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const settingsSnapshotRef = useRef<SessionSettingsSnapshot | null>(null);

  const chatModels = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const connectionReady = isUserProviderReady(userProvider);
  const searchReady = isSearchServiceReady(searchService);
  const assistantAvatarUrl = assistantAvatarPresets.find((preset) => preset.id === assistantAvatarId)?.image || assistantAvatarPresets[0].image;

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

  const patchSessionUi = useCallback((id: string, patch: Partial<SessionUiState>) => {
    if (patch.knowledgeBaseIds !== undefined) {
      saveChatKnowledgeSelection(id, patch.knowledgeBaseIds);
    }
    setSessionUi((current) => ({
      ...current,
      [id]: { ...(current[id] || defaultSessionUi(false)), ...patch }
    }));
  }, []);

  const createConversation = useCallback(() => {
    const assistant = assistants.find((item) => item.id === defaultAssistantId) || assistants[0];
    if (!assistant) return null;
    const conversation = createLocalConversation(assistant);
    commitConversations((current) => [conversation, ...current]);
    setSessionUi((current) => {
      const collapsed = Object.fromEntries(
        Object.entries(current).map(([id, value]) => [id, { ...value, collapsed: true }])
      );
      return { ...collapsed, [conversation.id]: defaultSessionUi(false) };
    });
    return conversation;
  }, [assistants, commitConversations, defaultAssistantId]);

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
      })
      .finally(() => {
        if (alive) setSkillsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!defaultAssistantId && assistants[0]) setDefaultAssistantId(assistants[0].id);
  }, [assistants, defaultAssistantId]);

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
    setDefaultAssistantId(assistant.id);
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
      conversationList.length ||
      !assistants.length
    ) return;
    initializedRef.current = true;
    createConversation();
  }, [assistants.length, conversationList.length, conversationsHydrated, createConversation]);

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
  const settingsModel = modelForSession(
    settingsConversationId ||
      conversationList.find((conversation) => !sessionUi[conversation.id]?.collapsed)?.id ||
      conversationList[0]?.id ||
      ""
  );

  const handleStreamEvent = useCallback(
    (conversationId: string, selectedModel: ModelCatalogEntry, event: ChatStreamEvent) => {
      if (event.type === "meta") {
        commitConversations((current) =>
          current.map((conversation) =>
            conversation.id !== conversationId
              ? conversation
              : (() => {
                  const userMessage = {
                    ...event.userMessage,
                    id: uniqueLocalMessageId(conversation.messages, event.userMessage.id)
                  };
                  const assistantMessageId = uniqueLocalMessageId([...conversation.messages, userMessage], event.assistantMessageId);
                  streamingMessageIdRef.current = assistantMessageId;
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
        if (!streamOutput) return;
        const messageId = streamingMessageIdRef.current;
        if (!messageId) return;
        commitConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                    message.id === messageId ? { ...message, content: message.content + event.token } : message
                  )
                }
              : conversation
          )
        );
        return;
      }

      if (event.type === "error") {
        patchSessionUi(conversationId, { notice: event.error });
        return;
      }

      commitConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                ...event.conversation,
                messages: conversation.messages.map((message) =>
                  message.id === streamingMessageIdRef.current
                    ? { ...event.message, id: streamingMessageIdRef.current }
                    : message
                )
              }
            : conversation
        )
      );
    },
    [commitConversations, patchSessionUi, streamOutput]
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
      patchSessionUi(conversation.id, { notice: "请先填写 API URL 和 Key。" });
      onRequestApiConfig();
      return;
    }
    const selectedModel = modelForSession(conversation.id);
    if (!selectedModel) {
      patchSessionUi(conversation.id, { notice: "当前没有可用的对话模型。" });
      return;
    }
    if (ui.attachments.length && !selectedModel.capabilities.includes("vision")) {
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
    const compatibilityOptions = { searchReady };
    const incompatibleSkill = selectedSkills.find((skill) => !skillCompatibility(skill, toolSettings, selectedModel, compatibilityOptions).compatible);
    if (incompatibleSkill) {
      const compatibility = skillCompatibility(incompatibleSkill, toolSettings, selectedModel, compatibilityOptions);
      patchSessionUi(conversation.id, { notice: `Skill“${incompatibleSkill.name}”不可用：${compatibility.reason}` });
      return;
    }
    const allowedTools = [...new Set([
      ...selectedSkills.flatMap((skill) => skill.allowedTools),
      ...(ui.search ? ["web_search"] : [])
    ])];
    if (toolMode === "禁用" && allowedTools.length) {
      patchSessionUi(conversation.id, { notice: "当前会话已禁用工具调用，请关闭相关 Skill 或切换工具调用方式。" });
      return;
    }
    const toolsCompatibility = toolSetCompatibility(allowedTools, toolSettings, selectedModel, compatibilityOptions);
    if (!toolsCompatibility.compatible) {
      patchSessionUi(conversation.id, { notice: toolsCompatibility.reason });
      return;
    }
    const assistant = assistants.find((item) => item.id === conversation.assistantId && item.enabled !== false);
    if (!assistant) {
      patchSessionUi(conversation.id, { notice: "当前没有可用助手。" });
      return;
    }

    const displayContent = rawContent || "请分析我上传的图片。";
    const appAwareContent = selectedApp
      ? `${selectedApp.prompt}\n\n用户输入：\n${displayContent}`
      : displayContent;
    const content = toolMode === "禁用"
      ? `请勿调用任何外部工具，直接基于当前上下文回答。\n\n${appAwareContent}`
      : toolMode === "询问后调用"
        ? `如需调用外部工具，请先说明原因并征得确认。\n\n${appAwareContent}`
        : appAwareContent;
    const requestConversation: Conversation = {
      ...conversation,
      title: conversation.messages.length ? conversation.title : makeConversationTitle(displayContent),
      assistantId: assistant.id,
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
    setStreamingConversationId(conversation.id);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        {
          conversation: conversationSummary(requestConversation),
          history: requestConversation.messages.slice(-Math.max(1, Number(contextSize) || 16)),
          assistantId: assistant.id,
          modelId: selectedModel.id,
          temperature,
          topP,
          maxTokens: Math.max(1, Number(maxTokens) || 4096),
          content,
          displayContent,
          attachments: ui.attachments,
          skillInstructions: selectedSkills.map((skill) => `${skill.name}: ${skill.instructions}`),
          allowedTools,
          searchService: allowedTools.includes("web_search")
            ? searchServicePayload(searchService)
            : undefined,
          ...(knowledgeBaseIds.length ? { knowledgeBaseIds, embeddingConnections } : {}),
          connection: userConnectionPayload(userProvider)
        },
        (event) => handleStreamEvent(conversation.id, selectedModel, event),
        controller.signal,
        knowledgeBaseIds.length ? knowledgeCatalog.csrfToken : ""
      );
      patchSessionUi(conversation.id, { attachments: [] });
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof ApiError || error instanceof Error ? error.message : "发送失败";
        patchSessionUi(conversation.id, { notice: message, draft: rawContent, appId: selectedApp?.id || "" });
      }
    } finally {
      setStreamingConversationId("");
      abortRef.current = null;
      streamingMessageIdRef.current = "";
      void onRefresh();
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreamingConversationId("");
  };

  const clearContext = (conversation: Conversation) => {
    commitConversations((current) =>
      current.map((item) =>
        item.id === conversation.id
          ? { ...item, messages: [], title: "新对话", updatedAt: new Date().toISOString() }
          : item
      )
    );
    patchSessionUi(conversation.id, { notice: "", attachments: [] });
  };

  const attachImage = async (conversationId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const attachment = await createChatAttachment(file, "image");
      patchSessionUi(conversationId, { attachments: [attachment], notice: "" });
    } catch (error) {
      patchSessionUi(conversationId, {
        notice: error instanceof Error ? error.message : "图片读取失败"
      });
    }
  };

  const changeModel = (conversationId: string, modelId: string) => {
    patchSessionUi(conversationId, { modelId });
    onUserProviderChange({ lastModelId: modelId });
  };

  const openSettings = (conversationId?: string) => {
    const targetConversationId = conversationId ||
      conversationList.find((conversation) => !sessionUi[conversation.id]?.collapsed)?.id ||
      conversationList[0]?.id ||
      "";
    const targetSkillIds = targetConversationId
      ? sessionUi[targetConversationId]?.skillIds || []
      : [];
    setSettingsConversationId(targetConversationId);
    setSettingsSkillIds([...targetSkillIds]);
    settingsSnapshotRef.current = {
      assistantAvatarId,
      userAvatar,
      messageStyle,
      temperature,
      topP,
      contextSize,
      maxTokens,
      streamOutput,
      toolMode,
      skillIds: [...targetSkillIds]
    };
    setSettingsOpen(true);
  };

  const cancelSettings = () => {
    const snapshot = settingsSnapshotRef.current;
    if (snapshot) {
      setAssistantAvatarId(snapshot.assistantAvatarId);
      setUserAvatar(snapshot.userAvatar);
      setMessageStyle(snapshot.messageStyle);
      setTemperature(snapshot.temperature);
      setTopP(snapshot.topP);
      setContextSize(snapshot.contextSize);
      setMaxTokens(snapshot.maxTokens);
      setStreamOutput(snapshot.streamOutput);
      setToolMode(snapshot.toolMode);
      setSettingsSkillIds(snapshot.skillIds);
    }
    settingsSnapshotRef.current = null;
    setSettingsConversationId("");
    setSettingsOpen(false);
  };

  const saveSettings = () => {
    if (settingsConversationId) {
      patchSessionUi(settingsConversationId, { skillIds: [...settingsSkillIds] });
    }
    settingsSnapshotRef.current = null;
    setSettingsConversationId("");
    setSettingsOpen(false);
  };

  const uploadUserAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setUserAvatar(reader.result);
    });
    reader.readAsDataURL(file);
  };

  const topModel = conversationList[0] ? modelForSession(conversationList[0].id) : undefined;

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
          <button type="button" onClick={() => setSkillManagerOpen(true)} disabled={skillsLoading} aria-label="管理对话 Skill" title="管理对话 Skill">
            <Puzzle size={15} />
            <span className="figma-heading-action-label">Skill</span>
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
        {conversationList.map((conversation) => {
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
              searchReady={searchReady}
              knowledgeAuthenticated={knowledgeCatalog.status === "authenticated"}
              knowledgeBases={knowledgeCatalog.bases}
              apps={appPresets.filter((app) => app.enabled)}
              assistant={boundAssistant}
              selectedModel={selectedModel}
              messageStyle={messageStyle}
              assistantAvatarUrl={assistantAvatarUrl}
              userAvatarUrl={userAvatar}
              streaming={streamingConversationId === conversation.id}
              onCreateConversation={createConversation}
              onOpenSkillManager={() => setSkillManagerOpen(true)}
              onOpenSettings={() => openSettings(conversation.id)}
              onToggle={() => patchSessionUi(conversation.id, { collapsed: !ui.collapsed })}
              onDraftChange={(draft) => patchSessionUi(conversation.id, { draft })}
              onAddSkill={(skillId) => patchSessionUi(conversation.id, { skillIds: [...new Set([...(ui.skillIds || []), skillId])] })}
              onRemoveSkill={(skillId) => patchSessionUi(conversation.id, { skillIds: (ui.skillIds || []).filter((id) => id !== skillId) })}
              onSelectApp={(appId) => patchSessionUi(conversation.id, { appId })}
              onClearApp={() => patchSessionUi(conversation.id, { appId: "" })}
              onModelChange={(modelId) => changeModel(conversation.id, modelId)}
              onSearchToggle={() => {
                if (ui.search) {
                  patchSessionUi(conversation.id, { search: false, notice: "" });
                  return;
                }
                const searchTool = toolSettings.find((tool) => tool.name === "web_search");
                if (!searchTool?.enabled) {
                  patchSessionUi(conversation.id, { notice: searchTool ? "联网搜索已由后台关闭。" : "联网搜索工具不存在。" });
                  return;
                }
                if (!searchReady) {
                  setPendingSearchConversationId(conversation.id);
                  setSearchSettingsOpen(true);
                  return;
                }
                patchSessionUi(conversation.id, { search: true, notice: "" });
              }}
              onOpenSearchSettings={() => {
                setPendingSearchConversationId("");
                setSearchSettingsOpen(true);
              }}
              onKnowledgeChange={(knowledgeBaseIds) => patchSessionUi(conversation.id, {
                knowledgeBaseIds,
                notice: ""
              })}
              onImageInput={(event) => void attachImage(conversation.id, event)}
              onRemoveImage={() => patchSessionUi(conversation.id, { attachments: [] })}
              onClear={() => clearContext(conversation)}
              onSend={() => void sendMessage(conversation)}
              onStop={stopStreaming}
            />
          );
        })}
      </div>

      <Dialog
        open={settingsOpen}
        labelledBy="figma-session-settings-title"
        describedBy="figma-session-settings-description"
        className="figma-session-settings"
        onClose={cancelSettings}
      >
        <header>
          <div>
            <small>SESSION CONFIGURATION</small>
            <h2 id="figma-session-settings-title">会话设置</h2>
            <p id="figma-session-settings-description">调整模型的生成倾向和响应行为。</p>
          </div>
          <button type="button" className="figma-settings-close" onClick={cancelSettings} aria-label="关闭会话设置">
            <X size={17} />
          </button>
        </header>

        <section className="figma-settings-profile">
          <div>
            <strong>AI 对话头像</strong>
            <p>选择在消息中显示的助手形象</p>
            <div className="figma-avatar-presets" aria-label="AI 对话头像">
              {assistantAvatarPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={assistantAvatarId === preset.id ? "active" : ""}
                  onClick={() => setAssistantAvatarId(preset.id)}
                  aria-pressed={assistantAvatarId === preset.id}
                  title={preset.name}
                >
                  <img src={preset.image} alt={`${preset.name} 动漫风格 AI 头像预设`} />
                  {assistantAvatarId === preset.id ? <span><Check size={10} /></span> : null}
                </button>
              ))}
            </div>
          </div>
          <div>
            <strong>个人头像</strong>
            <p>仅显示在你发送的对话消息中</p>
            <div className="figma-personal-avatar">
              <button type="button" onClick={() => userAvatarInputRef.current?.click()} aria-label="上传个人头像">
                {userAvatar ? <img src={userAvatar} alt="个人头像预览" /> : <Plus size={16} />}
              </button>
              <div>
                <button type="button" onClick={() => userAvatarInputRef.current?.click()}>上传个人头像</button>
                <small>PNG、JPG，建议 1:1 比例</small>
                {userAvatar ? <button type="button" className="remove" onClick={() => setUserAvatar(null)}>移除头像</button> : null}
              </div>
              <input ref={userAvatarInputRef} type="file" hidden accept="image/png,image/jpeg" onChange={uploadUserAvatar} />
            </div>
          </div>
          <div>
            <strong>对话列表方式</strong>
            <p>选择聊天内容的视觉组织方式</p>
            <div className="figma-segmented">
              <button type="button" className={messageStyle === "bubble" ? "active" : ""} onClick={() => setMessageStyle("bubble")} aria-pressed={messageStyle === "bubble"}>气泡式</button>
              <button type="button" className={messageStyle === "list" ? "active" : ""} onClick={() => setMessageStyle("list")} aria-pressed={messageStyle === "list"}>列表式</button>
            </div>
          </div>
        </section>

        <fieldset className="figma-chat-skill-selection">
          <legend>对话 Skill</legend>
          <div className="figma-chat-skill-selection-list">
            {skillsLoading ? <p>正在读取本地 Skill…</p> : chatSkills.length ? chatSkills.map((skill) => {
              const compatibility = skillCompatibility(skill, toolSettings, settingsModel, { searchReady });
              const checked = settingsSkillIds.includes(skill.id);
              return (
                <label key={skill.id} className={!compatibility.compatible ? "disabled" : ""}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!compatibility.compatible && !checked}
                    onChange={(event) => setSettingsSkillIds((current) => event.target.checked
                      ? [...new Set([...current, skill.id])]
                      : current.filter((id) => id !== skill.id))}
                  />
                  <span><strong>{skill.name}</strong><small>{compatibility.compatible ? skill.description || "对话指令" : compatibility.reason}</small></span>
                </label>
              );
            }) : <p>暂无 Skill</p>}
          </div>
        </fieldset>

        <section className="figma-settings-grid">
          <label className="figma-range-control">
            <span id="figma-temperature-label">模型温度 · Temperature</span>
            <div
              className="figma-range-track"
              style={{ "--range-progress": `${temperature * 100}%` } as CSSProperties}
            >
              <i aria-hidden="true" />
              <input
                id="figma-temperature-range"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                aria-labelledby="figma-temperature-label"
                aria-describedby="figma-temperature-low figma-temperature-high"
                onChange={(event) => setTemperature(Number(event.target.value))}
              />
            </div>
            <small>
              <span id="figma-temperature-low">严谨</span>
              <output htmlFor="figma-temperature-range">{temperature.toFixed(1)}</output>
              <span id="figma-temperature-high">发散</span>
            </small>
          </label>
          <label className="figma-range-control">
            <span id="figma-top-p-label">TOP-P</span>
            <div
              className="figma-range-track"
              style={{ "--range-progress": `${((topP - 0.1) / 0.9) * 100}%` } as CSSProperties}
            >
              <i aria-hidden="true" />
              <input
                id="figma-top-p-range"
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={topP}
                aria-labelledby="figma-top-p-label"
                aria-describedby="figma-top-p-low figma-top-p-high"
                onChange={(event) => setTopP(Number(event.target.value))}
              />
            </div>
            <small>
              <span id="figma-top-p-low">聚焦</span>
              <output htmlFor="figma-top-p-range">{topP.toFixed(1)}</output>
              <span id="figma-top-p-high">多样</span>
            </small>
          </label>
          <label>
            <span>上下文数</span>
            <select value={contextSize} onChange={(event) => setContextSize(event.target.value)}>
              <option value="4">4K tokens</option>
              <option value="16">16K tokens</option>
              <option value="32">32K tokens</option>
              <option value="128">128K tokens</option>
            </select>
          </label>
          <label>
            <span>最大 Token 数</span>
            <select value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)}>
              <option value="1024">1,024</option>
              <option value="2048">2,048</option>
              <option value="4096">4,096</option>
              <option value="8192">8,192</option>
            </select>
          </label>
          <div className="figma-setting-toggle">
            <span><strong>流式输出</strong><small>实时显示生成内容</small></span>
            <button type="button" className={streamOutput ? "active" : ""} onClick={() => setStreamOutput((value) => !value)} aria-pressed={streamOutput} aria-label="流式输出"><i /></button>
          </div>
          <fieldset className="figma-tool-mode">
            <legend>工具调用方式</legend>
            <div className="figma-segmented">
              {["自动", "询问后调用", "禁用"].map((mode) => (
                <button key={mode} type="button" className={toolMode === mode ? "active" : ""} onClick={() => setToolMode(mode)} aria-pressed={toolMode === mode}>{mode}</button>
              ))}
            </div>
          </fieldset>
        </section>

        <footer>
          <button type="button" onClick={cancelSettings}>取消</button>
          <button type="button" className="primary" onClick={saveSettings}>保存设置</button>
        </footer>
      </Dialog>

      <SearchServiceDialog
        open={searchSettingsOpen}
        config={searchService}
        onSave={(nextConfig) => {
          onSearchServiceChange(nextConfig);
          if (pendingSearchConversationId) {
            patchSessionUi(pendingSearchConversationId, { search: true, notice: "" });
          }
          setPendingSearchConversationId("");
        }}
        onClose={() => {
          setSearchSettingsOpen(false);
          setPendingSearchConversationId("");
        }}
      />

      <ChatSkillManagerDialog
        open={skillManagerOpen}
        skills={chatSkills}
        tools={toolSettings}
        onClose={() => setSkillManagerOpen(false)}
        onSave={async (skills) => {
          await saveAgentSkills(skills);
          setChatSkills(skills);
          setSettingsSkillIds((current) => current.filter((id) => skills.some((skill) => skill.id === id)));
          setSessionUi((current) => Object.fromEntries(Object.entries(current).map(([id, ui]) => [
            id,
            { ...ui, skillIds: (ui.skillIds || []).filter((skillId) => skills.some((skill) => skill.id === skillId)) }
          ])));
        }}
      />
    </section>
  );
}

type ChatSessionBlockProps = {
  conversation: Conversation;
  ui: SessionUiState;
  models: ModelCatalogEntry[];
  skills: AgentSkillDefinition[];
  tools: ToolSetting[];
  searchReady: boolean;
  knowledgeAuthenticated: boolean;
  knowledgeBases: KnowledgeBase[];
  apps: AppPreset[];
  assistant?: Assistant;
  selectedModel?: ModelCatalogEntry;
  messageStyle: "bubble" | "list";
  assistantAvatarUrl: string;
  userAvatarUrl: string | null;
  streaming: boolean;
  onCreateConversation: () => Conversation | null;
  onOpenSkillManager: () => void;
  onOpenSettings: () => void;
  onToggle: () => void;
  onDraftChange: (value: string) => void;
  onAddSkill: (skillId: string) => void;
  onRemoveSkill: (skillId: string) => void;
  onSelectApp: (appId: string) => void;
  onClearApp: () => void;
  onModelChange: (modelId: string) => void;
  onSearchToggle: () => void;
  onOpenSearchSettings: () => void;
  onKnowledgeChange: (knowledgeBaseIds: string[]) => void;
  onImageInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onClear: () => void;
  onSend: () => void;
  onStop: () => void;
};

function ChatSessionBlock({
  conversation,
  ui,
  models,
  skills,
  tools,
  searchReady,
  knowledgeAuthenticated,
  knowledgeBases,
  apps,
  assistant,
  selectedModel,
  messageStyle,
  assistantAvatarUrl,
  userAvatarUrl,
  streaming,
  onCreateConversation,
  onOpenSkillManager,
  onOpenSettings,
  onToggle,
  onDraftChange,
  onAddSkill,
  onRemoveSkill,
  onSelectApp,
  onClearApp,
  onModelChange,
  onSearchToggle,
  onOpenSearchSettings,
  onKnowledgeChange,
  onImageInput,
  onRemoveImage,
  onClear,
  onSend,
  onStop
}: ChatSessionBlockProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const vendorListScrollTimerRef = useRef<number | null>(null);
  const modelListScrollTimerRef = useRef<number | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerPlacement, setModelPickerPlacement] = useState<"down" | "up">("down");
  const [modelPickerOffset, setModelPickerOffset] = useState(0);
  const [vendorListScrolling, setVendorListScrolling] = useState(false);
  const [modelListScrolling, setModelListScrolling] = useState(false);
  const modelPopoverId = useId();
  const commandListId = useId();
  const modelListId = `${modelPopoverId}-list`;
  const modelValueDescriptionId = `${modelPopoverId}-value`;
  const [activeModelVendor, setActiveModelVendor] = useState<ModelVendorTab>(() => vendorTabForModel(selectedModel));
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);
  const [dismissedCommand, setDismissedCommand] = useState("");
  const focusAfterVendorChangeRef = useRef<"list" | "tab">("list");
  const vendorModels = useMemo(
    () => models.filter((model) => vendorTabForModel(model) === activeModelVendor),
    [activeModelVendor, models]
  );
  const selectedModelInVendor = vendorModels.some((model) => model.id === selectedModel?.id);
  const command = activeChatCommand(ui.draft);
  const searchTool = tools.find((tool) => tool.name === "web_search");
  const searchCompatibility = toolCompatibility(searchTool, selectedModel, { searchReady });
  const canConfigureSearch = Boolean(searchTool?.enabled && !searchReady);
  const commandIdentity = command ? `${command.kind}:${command.start}:${command.token}` : "";
  const commandOptions = useMemo<ChatCommandOption[]>(() => {
    if (!command) return [];
    if (command.kind === "app") {
      return apps
        .filter((app) => chatCommandMatches(command.query, app.name, app.description, app.category))
        .map((app) => ({
          id: app.id,
          name: app.name,
          description: app.category || app.description,
          selected: ui.appId === app.id
        }));
    }
    return skills
      .filter((skill) => chatCommandMatches(command.query, skill.name, skill.description))
      .map((skill) => {
        const compatibility = skillCompatibility(skill, tools, selectedModel, { searchReady });
        return {
          id: skill.id,
          name: skill.name,
          description: compatibility.compatible ? skill.description || "对话 Skill" : compatibility.reason,
          disabled: !compatibility.compatible,
          selected: (ui.skillIds || []).includes(skill.id)
        };
      });
  }, [apps, command, searchReady, selectedModel, skills, tools, ui.appId, ui.skillIds]);
  const commandOpen = Boolean(command && commandIdentity !== dismissedCommand);
  const visibleVendorModelCount = Math.min(3, vendorModels.length);
  const displayMessages: Message[] = conversation.messages.length
    ? conversation.messages
    : [
        {
          id: `${conversation.id}-welcome`,
          role: "assistant",
          content: "你好，我是 **AiStudio** 助手。连接知识、想法与成果——现在想创作什么？",
          createdAt: conversation.createdAt,
          status: "done"
        },
        {
          id: `${conversation.id}-sample-user`,
          role: "user",
          content: "帮我梳理一份关于生成式 AI 在企业落地的简短介绍。",
          createdAt: conversation.createdAt,
          status: "done"
        },
        {
          id: `${conversation.id}-sample-answer`,
          role: "assistant",
          content: "当然可以。\n\n**生成式 AI 正在成为企业的创造力基础设施。**\n\n它将重复性知识工作转化为可编排的智能流程：从市场洞察、内容生产到客户支持。关键不在于替代人，而是让每一位员工都能以更短路径完成高价值决策。\n\n要不要我继续为这段内容生成一个 6 页的演示文稿？",
          createdAt: conversation.createdAt,
          status: "done"
        }
      ];
  const lastMessage = [...displayMessages].reverse().find((message) => message.content);

  useEffect(() => {
    if (ui.collapsed) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [displayMessages.length, streaming, ui.collapsed]);

  useEffect(() => {
    if (!modelPickerOpen) setActiveModelVendor(vendorTabForModel(selectedModel));
  }, [modelPickerOpen, selectedModel]);

  useEffect(() => {
    if (!ui.collapsed) return;
    setModelPickerOpen(false);
  }, [ui.collapsed]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    const updatePlacement = () => {
      const anchor = modelPickerRef.current;
      const popover = anchor?.querySelector<HTMLElement>(".figma-model-popover");
      if (!anchor || !popover) return;
      setModelPickerPlacement(getFloatingVerticalPlacement(anchor, popover));
      setModelPickerOffset(getFloatingHorizontalOffset(anchor, popover));
    };
    const closeOnOutside = (event: PointerEvent) => {
      if (modelPickerRef.current?.contains(event.target as Node)) return;
      setModelPickerOpen(false);
      if (!(event.target instanceof HTMLElement) || !event.target.closest("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])")) {
        requestAnimationFrame(() => modelTriggerRef.current?.focus());
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setModelPickerOpen(false);
      modelTriggerRef.current?.focus();
    };
    const frame = requestAnimationFrame(updatePlacement);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelPickerOpen]);

  useEffect(() => {
    if (modelPickerOpen) return;
    setModelPickerOffset(0);
    setVendorListScrolling(false);
    setModelListScrolling(false);
    if (vendorListScrollTimerRef.current !== null) {
      window.clearTimeout(vendorListScrollTimerRef.current);
      vendorListScrollTimerRef.current = null;
    }
    if (modelListScrollTimerRef.current !== null) {
      window.clearTimeout(modelListScrollTimerRef.current);
      modelListScrollTimerRef.current = null;
    }
  }, [modelPickerOpen]);

  useEffect(() => () => {
    if (vendorListScrollTimerRef.current !== null) {
      window.clearTimeout(vendorListScrollTimerRef.current);
    }
    if (modelListScrollTimerRef.current !== null) {
      window.clearTimeout(modelListScrollTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!modelPickerOpen) return;
    const frame = requestAnimationFrame(() => {
      if (focusAfterVendorChangeRef.current === "tab") {
        modelPickerRef.current
          ?.querySelector<HTMLElement>(`[role="tab"][data-vendor="${activeModelVendor}"]`)
          ?.focus();
        focusAfterVendorChangeRef.current = "list";
        return;
      }
      const list = modelPickerRef.current?.querySelector<HTMLElement>('[role="listbox"]');
      const selectedOption = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
      const firstOption = list?.querySelector<HTMLElement>('[role="option"]:not(:disabled)');
      (selectedOption || firstOption)?.focus();
      focusAfterVendorChangeRef.current = "list";
    });
    return () => cancelAnimationFrame(frame);
  }, [activeModelVendor, modelPickerOpen]);

  useEffect(() => {
    setCommandActiveIndex(Math.max(0, commandOptions.findIndex((option) => !option.disabled)));
  }, [commandIdentity, commandOptions.length]);

  useEffect(() => {
    if (!commandIdentity) setDismissedCommand("");
  }, [commandIdentity]);

  const selectCommandOption = (option: ChatCommandOption) => {
    if (!command || option.disabled) return;
    onDraftChange(removeChatCommand(ui.draft, command));
    if (command.kind === "skill") onAddSkill(option.id);
    else onSelectApp(option.id);
    setDismissedCommand("");
  };

  const moveCommandSelection = (direction: 1 | -1) => {
    const enabledIndices = commandOptions.flatMap((option, index) => option.disabled ? [] : [index]);
    if (!enabledIndices.length) return;
    const current = enabledIndices.indexOf(commandActiveIndex);
    const next = current < 0
      ? enabledIndices[0]
      : enabledIndices[(current + direction + enabledIndices.length) % enabledIndices.length];
    setCommandActiveIndex(next);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (commandOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveCommandSelection(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedCommand(commandIdentity);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        const option = commandOptions[commandActiveIndex];
        if (option && !option.disabled) {
          event.preventDefault();
          selectCommandOption(option);
          return;
        }
      }
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSend();
  };

  const handleModelListScroll = () => {
    setModelListScrolling(true);
    if (modelListScrollTimerRef.current !== null) {
      window.clearTimeout(modelListScrollTimerRef.current);
    }
    modelListScrollTimerRef.current = window.setTimeout(() => {
      setModelListScrolling(false);
      modelListScrollTimerRef.current = null;
    }, 650);
  };

  const handleVendorListScroll = () => {
    setVendorListScrolling(true);
    if (vendorListScrollTimerRef.current !== null) {
      window.clearTimeout(vendorListScrollTimerRef.current);
    }
    vendorListScrollTimerRef.current = window.setTimeout(() => {
      setVendorListScrolling(false);
      vendorListScrollTimerRef.current = null;
    }, 650);
  };

  const handleVendorKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    vendor: ModelVendorTab
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const currentIndex = modelVendorTabs.indexOf(vendor);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? modelVendorTabs.length - 1
        : event.key === "ArrowLeft"
          ? currentIndex <= 0 ? modelVendorTabs.length - 1 : currentIndex - 1
          : currentIndex >= modelVendorTabs.length - 1 ? 0 : currentIndex + 1;
    event.preventDefault();
    focusAfterVendorChangeRef.current = "tab";
    setActiveModelVendor(modelVendorTabs[nextIndex]);
  };

  const handleSessionHeaderClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    onToggle();
  };

  const handleSessionHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onToggle();
  };

  return (
    <article className={ui.collapsed ? "figma-chat-session collapsed" : "figma-chat-session"}>
      <div
        className="figma-session-header"
        data-testid="session-header-toggle-area"
        tabIndex={0}
        aria-label={ui.collapsed ? "点击展开对话" : "点击折叠对话"}
        onClick={handleSessionHeaderClick}
        onKeyDown={handleSessionHeaderKeyDown}
      >
        <div className="figma-session-identity">
          <div ref={modelPickerRef} className="figma-session-model" onClick={(event) => event.stopPropagation()}>
          <span id={modelValueDescriptionId} className="figma-visually-hidden">
            当前模型：{compactModelLabel(selectedModel) || "未选择"}
          </span>
          <button
            ref={modelTriggerRef}
            type="button"
            className="figma-model-trigger"
            aria-label="选择对话模型"
            aria-haspopup="listbox"
            aria-expanded={modelPickerOpen}
            aria-controls={modelPopoverId}
            aria-describedby={modelValueDescriptionId}
            onClick={() => {
              focusAfterVendorChangeRef.current = "list";
              setModelPickerOpen((open) => !open);
            }}
          >
            <i />
            <span>{compactModelLabel(selectedModel) || "选择模型"}</span>
            <ChevronDown size={12} />
          </button>
          {modelPickerOpen ? (
            <div
              id={modelPopoverId}
              className="figma-model-popover"
              data-placement={modelPickerPlacement}
              style={modelPickerOffset ? { transform: `translateX(${modelPickerOffset}px)` } : undefined}
              aria-label="对话模型菜单"
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !modelPickerRef.current?.contains(nextTarget)) {
                  setModelPickerOpen(false);
                }
              }}
            >
              <div
                className="figma-model-vendors"
                role="tablist"
                aria-label="模型厂商"
                data-scroll-active={vendorListScrolling ? "true" : "false"}
                onScroll={handleVendorListScroll}
              >
                <span className="figma-model-vendor-label">厂商</span>
                {modelVendorTabs.map((vendor) => (
                <button
                  key={vendor}
                  type="button"
                  role="tab"
                  aria-selected={activeModelVendor === vendor}
                  aria-controls={modelListId}
                  data-vendor={vendor}
                  tabIndex={activeModelVendor === vendor ? 0 : -1}
                  className={activeModelVendor === vendor ? "active" : ""}
                  onClick={() => {
                    focusAfterVendorChangeRef.current = "list";
                    setActiveModelVendor(vendor);
                  }}
                  onKeyDown={(event) => handleVendorKeyDown(event, vendor)}
                >
                    {vendor}
                  </button>
                ))}
              </div>
              <div className="figma-model-popover-heading">
                <strong>{activeModelVendor} · 模型</strong>
                <span>{vendorModels.length ? `显示 ${visibleVendorModelCount} 个` : "暂无模型"}</span>
              </div>
              <div
                className="figma-model-list"
                id={modelListId}
                role="listbox"
                aria-label={`${activeModelVendor} 模型`}
                data-scroll-active={modelListScrolling ? "true" : "false"}
                onScroll={handleModelListScroll}
                onKeyDown={(event) => moveRovingFocus(event, '[role="option"]:not(:disabled)')}
              >
                {vendorModels.length ? vendorModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={selectedModel?.id === model.id}
                    tabIndex={selectedModel?.id === model.id || (!selectedModelInVendor && model === vendorModels[0]) ? 0 : -1}
                    className={selectedModel?.id === model.id ? "active" : ""}
                    onClick={() => {
                      onModelChange(model.id);
                      setModelPickerOpen(false);
                      setModelPickerOffset(0);
                      requestAnimationFrame(() => modelTriggerRef.current?.focus());
                    }}
                  >
                    <span><strong>{compactModelLabel(model)}</strong><small>{modelCapabilityNote(model)}</small></span>
                    {selectedModel?.id === model.id
                      ? <Check size={14} aria-hidden="true" />
                      : <span className="figma-model-option-mark" aria-hidden="true" />}
                  </button>
                )) : <p>暂无可用模型</p>}
              </div>
            </div>
          ) : null}
          </div>
          <span
            className={assistant ? "figma-session-assistant" : "figma-session-assistant missing"}
            aria-label={`当前助手：${assistant?.name || "已失效"}`}
            title={assistant?.name || "助手已失效"}
          >
            <Bot size={13} aria-hidden="true" />
            <span>{assistant?.name || "助手已失效"}</span>
          </span>
        </div>
        <div className="figma-session-mobile-actions">
          <button
            type="button"
            className="figma-session-action-mobile"
            onClick={onCreateConversation}
            aria-label="新对话"
            title="新对话"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="figma-session-action-mobile"
            onClick={onOpenSkillManager}
            aria-label="管理对话 Skill"
            title="管理对话 Skill"
          >
            <Puzzle size={14} />
          </button>
          <button
            type="button"
            className="figma-session-action-mobile"
            onClick={onOpenSettings}
            aria-label="会话设置"
            title="会话设置"
          >
            <Settings2 size={14} />
          </button>
        </div>
        <div className="figma-session-header-actions">
          <button
            type="button"
            className="figma-session-toggle"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-expanded={!ui.collapsed}
            aria-label={ui.collapsed ? "点击展开" : "点击折叠"}
          >
            <span>{ui.collapsed ? "点击展开" : "点击折叠"}</span>
            {ui.collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>

      {ui.collapsed ? (
        <button type="button" className="figma-session-preview" onClick={onToggle}>
          <img src={assistantAvatarUrl} alt="" />
          <span>
            <strong>{conversation.title || selectedModel?.label || "新对话"}</strong>
            <small>{lastMessage?.content.replace(/[*#`]/g, "").slice(0, 90)}</small>
          </span>
        </button>
      ) : (
        <>
          <div className={messageStyle === "list" ? "figma-message-history list" : "figma-message-history"}>
            <div className="figma-message-track">
              {displayMessages.map((message) => (
                <article key={message.id} className={`figma-message ${message.role}`}>
                  {message.role === "assistant" ? (
                    <img className="figma-message-avatar" src={assistantAvatarUrl} alt="AiStudio" />
                  ) : null}
                  <div className="figma-message-bubble">
                    {message.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    ) : (
                      <span className="figma-typing"><i /><i /><i /></span>
                    )}
                    <KnowledgeCitationList citations={message.knowledgeCitations} />
                  </div>
                  {message.role === "user" ? (
                    userAvatarUrl
                      ? <img className="figma-user-avatar image" src={userAvatarUrl} alt="个人头像" />
                      : <span className="figma-user-avatar">我</span>
                  ) : null}
                </article>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="figma-session-controls">
            <div className="figma-session-controls-track">
              <div className="figma-session-tools">
                <button
                  type="button"
                  className={ui.search ? "active" : ""}
                  onClick={onSearchToggle}
                  aria-pressed={ui.search}
                  disabled={!searchCompatibility.compatible && !ui.search && !canConfigureSearch}
                  title={searchCompatibility.compatible ? "网络搜索" : canConfigureSearch ? "配置联网搜索服务" : searchCompatibility.reason}
                >
                  <Globe2 size={14} />
                  网络搜索
                </button>
                <button
                  type="button"
                  className="figma-search-settings-action"
                  onClick={onOpenSearchSettings}
                  aria-label="配置联网搜索服务"
                  title="配置联网搜索服务"
                >
                  <Settings2 size={14} />
                </button>
                {knowledgeAuthenticated ? (
                  <CloudKnowledgeSelector
                    compact
                    bases={knowledgeBases}
                    selectedIds={ui.knowledgeBaseIds}
                    onChange={onKnowledgeChange}
                    disabled={streaming}
                  />
                ) : null}
                <button type="button" onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon size={14} />
                  图片输入
                </button>
                <input ref={imageInputRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={onImageInput} />
                <button type="button" className="clear" onClick={onClear}>
                  <Trash2 size={14} />
                  清除此对话上下文
                </button>
              </div>

              <div className="figma-composer">
                {commandOpen && command ? (
                  <ChatCommandPalette
                    id={commandListId}
                    kind={command.kind}
                    query={command.query}
                    options={commandOptions}
                    activeIndex={commandActiveIndex}
                    onHover={setCommandActiveIndex}
                    onSelect={selectCommandOption}
                  />
                ) : null}
                {ui.attachments.length ? (
                  <div className="figma-image-attachment">
                    <img src={ui.attachments[0].dataUrl} alt={ui.attachments[0].name} />
                    <span>{ui.attachments[0].name}</span>
                    <button type="button" onClick={onRemoveImage} aria-label="移除图片"><X size={13} /></button>
                  </div>
                ) : null}
                {(ui.skillIds.length || ui.appId) ? (
                  <div className="figma-chat-command-tags" aria-label="已选择的对话能力">
                    {ui.skillIds.map((skillId) => {
                      const skill = skills.find((item) => item.id === skillId);
                      return skill ? (
                        <span key={skill.id}><Puzzle size={12} />${skill.name}<button type="button" onClick={() => onRemoveSkill(skill.id)} aria-label={`移除 Skill ${skill.name}`}><X size={11} /></button></span>
                      ) : null;
                    })}
                    {ui.appId ? (() => {
                      const app = apps.find((item) => item.id === ui.appId);
                      return app ? <span className="app"><LayoutGrid size={12} />/{app.name}<button type="button" onClick={onClearApp} aria-label={`移除应用 ${app.name}`}><X size={11} /></button></span> : null;
                    })() : null}
                  </div>
                ) : null}
                {ui.notice ? <p className="figma-session-notice" role="alert">{ui.notice}</p> : null}
                <textarea
                  value={ui.draft}
                  aria-label="消息内容"
                  aria-controls={commandOpen ? commandListId : undefined}
                  aria-activedescendant={commandOpen && commandOptions[commandActiveIndex] ? `${commandListId}-${commandOptions[commandActiveIndex].id}` : undefined}
                  aria-autocomplete="list"
                  onChange={(event) => onDraftChange(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="在此输入你想探讨的想法、分析的内容，或者向 AI 提问... (Shift + Enter 换行，Enter 发送)"
                  rows={2}
                />
                <div className="figma-composer-footer">
                  {streaming ? (
                    <button type="button" className="figma-send-button" onClick={onStop} aria-label="停止生成"><Square size={16} /></button>
                  ) : (
                    <button type="button" className="figma-send-button" onClick={onSend} disabled={!ui.draft.trim() && !ui.attachments.length} aria-label="发送"><Send size={17} /></button>
                  )}
                </div>
              </div>
              <p className="figma-generation-note">AI 生成内容仅供参考，请核验关键结论。</p>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

export default ChatModule;
