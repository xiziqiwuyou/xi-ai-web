import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  BrainCircuit,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe2,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Pin,
  Plus,
  Puzzle,
  Send,
  Settings2,
  Square,
  Trash2,
  X
} from "lucide-react";
import { AssistantAvatar } from "../assistants/AssistantAvatar";
import { FigmaMenu, getFloatingHorizontalOffset, getFloatingVerticalPlacement } from "../../components/ui";
import { compactModelLabel } from "../../components/workbench";
import { createClientId } from "../../utils/clientId";
import ChatMessageContent from "./ChatMessageContent";
import {
  chatContextMessageCountValues,
  cleanSettingChoice,
  estimatedTokenCount,
  selectChatHistory,
  type ChatContextMessageCount,
  type ChatSessionSettings
} from "./chatSessionSettings";
import ChatCommandPalette, { type ChatCommandOption } from "./ChatCommandPalette";
import { activeChatCommand, chatCommandMatches, removeChatCommand } from "./chatCommands";
import { skillCompatibility, toolCompatibility } from "../automation/toolCompatibility";
import CloudKnowledgeSelector from "../knowledge-cloud/CloudKnowledgeSelector";
import KnowledgeCitationList from "../knowledge-cloud/KnowledgeCitationList";
import { normalizeKnowledgeBaseIds } from "../knowledge-cloud/integrationState";
import type {
  Assistant,
  AgentSkillDefinition,
  AppPreset,
  ChatAttachment,
  Conversation,
  KnowledgeBase,
  Message,
  ModelCatalogEntry,
  ReasoningEffort,
  SearchProviderKind,
  ToolSetting
} from "../../types";

export type SessionUiState = {
  collapsed: boolean;
  openedAt: number;
  draft: string;
  modelId: string;
  attachments: ChatAttachment[];
  skillIds: string[];
  appId: string;
  searchProvider: SearchProviderKind | "";
  knowledgeBaseIds: string[];
  reasoningEffort: ReasoningEffort;
  notice: string;
};

type ModelVendorTab = "OpenAI" | "Claude" | "Gemini" | "Kimi" | "DeepSeek" | "通义千问";

export const modelVendorTabs: ModelVendorTab[] = ["OpenAI", "Claude", "Gemini", "Kimi", "DeepSeek", "通义千问"];
export const reasoningEffortValues = ["default", "off", "low", "medium", "high", "xhigh"] as const satisfies readonly ReasoningEffort[];
export const reasoningEffortOptions = [
  { value: "default", label: "默认", detail: "依赖模型默认行为，不作额外配置" },
  { value: "off", label: "关闭", detail: "禁用推理" },
  { value: "low", label: "浅想", detail: "低强度推理" },
  { value: "medium", label: "斟酌", detail: "中强度推理" },
  { value: "high", label: "沉思", detail: "高强度推理" },
  { value: "xhigh", label: "穷究", detail: "超高强度推理" }
] as const;
export const searchProviderOptions = [
  { value: "glm", label: "智谱 GLM", detail: "结构化搜索 API" },
  { value: "kimi", label: "Kimi", detail: "$web_search 联网能力" },
  { value: "off", label: "关闭联网搜索", detail: "本次会话不执行搜索" }
] as const;
const contextMessageCountOptions = [
  ...chatContextMessageCountValues.map((value) => ({ value: String(value), label: `最近 ${value} 条` })),
  { value: "unlimited", label: "不限" }
] as const;

export function vendorTabForModel(model?: ModelCatalogEntry): ModelVendorTab {
  if (model?.vendor === "openai" || model?.vendor === "openai-compatible") return "OpenAI";
  if (model?.vendor === "anthropic") return "Claude";
  if (model?.vendor === "gemini") return "Gemini";
  if (model?.vendor === "kimi") return "Kimi";
  if (model?.vendor === "deepseek") return "DeepSeek";
  return "通义千问";
}

export function modelCapabilityNote(model: ModelCatalogEntry) {
  if (model.capabilities.includes("vision")) return "图像理解 · 多模态";
  if (model.capabilities.includes("toolCalling")) return "代码与工具调用";
  return "通用对话 · 稳定输出";
}

export function moveRovingFocus(event: KeyboardEvent<HTMLElement>, selector: string) {
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

export function defaultSessionUi(collapsed: boolean, knowledgeBaseIds: string[] = []): SessionUiState {
  return {
    collapsed,
    openedAt: collapsed ? 0 : Date.now(),
    draft: "",
    modelId: "",
    attachments: [],
    skillIds: [],
    appId: "",
    searchProvider: "",
    knowledgeBaseIds: normalizeKnowledgeBaseIds(knowledgeBaseIds),
    reasoningEffort: "default",
    notice: ""
  };
}

export function sortSessionStack(conversations: Conversation[]) {
  return [...conversations].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function displayedSessionStack(conversations: Conversation[], sessionUi: Record<string, SessionUiState>) {
  return [...conversations].sort((a, b) => {
    const aUi = sessionUi[a.id];
    const bUi = sessionUi[b.id];
    const aExpanded = aUi ? !aUi.collapsed : false;
    const bExpanded = bUi ? !bUi.collapsed : false;
    if (aExpanded !== bExpanded) return aExpanded ? -1 : 1;
    if (aExpanded && bExpanded && aUi.openedAt !== bUi.openedAt) return bUi.openedAt - aUi.openedAt;
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function uniqueLocalMessageId(existing: Message[], candidate: string) {
  if (!existing.some((message) => message.id === candidate)) return candidate;
  return createClientId(candidate);
}

export function imageAttachmentCount(attachments: ChatAttachment[]) {
  return attachments.filter((attachment) => attachment.kind === "image").length;
}

export function attachmentsWithinImageLimit(attachments: ChatAttachment[], limit: number) {
  let imageCount = 0;
  return attachments.filter((attachment) => {
    if (attachment.kind !== "image") return true;
    imageCount += 1;
    return imageCount <= limit;
  });
}

export type ChatSessionBlockProps = {
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
  settings: ChatSessionSettings;
  assistantAvatarUrl: string;
  userAvatarUrl: string | null;
  streaming: boolean;
  onCreateConversation: () => Conversation | null;
  onOpenSettings: () => void;
  onToggle: () => void;
  onTogglePinned: () => void;
  onDraftChange: (value: string) => void;
  onAddSkill: (skillId: string) => void;
  onRemoveSkill: (skillId: string) => void;
  onSelectApp: (appId: string) => void;
  onClearApp: () => void;
  onModelChange: (modelId: string) => void;
  onSearchProviderChange: (provider: SearchProviderKind | "") => void;
  onKnowledgeChange: (knowledgeBaseIds: string[]) => void;
  onReasoningEffortChange: (value: ReasoningEffort) => void;
  onContextMessageCountChange: (value: ChatContextMessageCount) => void;
  onImageInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onLongPaste: (text: string) => void;
  onRemoveImage: (attachmentId: string) => void;
  onClear: () => void;
  onSend: () => void;
  onStop: () => void;
};

export function ChatSessionBlock({
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
  settings,
  assistantAvatarUrl,
  userAvatarUrl,
  streaming,
  onCreateConversation,
  onOpenSettings,
  onToggle,
  onTogglePinned,
  onDraftChange,
  onAddSkill,
  onRemoveSkill,
  onSelectApp,
  onClearApp,
  onModelChange,
  onSearchProviderChange,
  onKnowledgeChange,
  onReasoningEffortChange,
  onContextMessageCountChange,
  onImageInput,
  onLongPaste,
  onRemoveImage,
  onClear,
  onSend,
  onStop
}: ChatSessionBlockProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messageHistoryRef = useRef<HTMLDivElement | null>(null);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const messageHistoryScrollTimerRef = useRef<number | null>(null);
  const vendorListScrollTimerRef = useRef<number | null>(null);
  const modelListScrollTimerRef = useRef<number | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerPlacement, setModelPickerPlacement] = useState<"down" | "up">("down");
  const [modelPickerOffset, setModelPickerOffset] = useState(0);
  const [vendorListScrolling, setVendorListScrolling] = useState(false);
  const [modelListScrolling, setModelListScrolling] = useState(false);
  const [messageHistoryScrolling, setMessageHistoryScrolling] = useState(false);
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
  const command = settings.enableCommandMenu ? activeChatCommand(ui.draft) : null;
  const searchTool = tools.find((tool) => tool.name === "web_search");
  const searchCompatibility = toolCompatibility(searchTool, selectedModel, { searchReady });
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
        const compatibility = skillCompatibility(skill, tools, selectedModel, {
          searchReady,
          invocationMode: settings.toolInvocationMode
        });
        return {
          id: skill.id,
          name: skill.name,
          description: compatibility.compatible ? skill.description || "对话 Skill" : compatibility.reason,
          disabled: !compatibility.compatible,
          selected: (ui.skillIds || []).includes(skill.id)
        };
      });
  }, [apps, command, searchReady, selectedModel, settings.toolInvocationMode, skills, tools, ui.appId, ui.skillIds]);
  const commandOpen = Boolean(command && commandIdentity !== dismissedCommand);
  const visibleVendorModelCount = Math.min(3, vendorModels.length);
  const displayMessages: Message[] = conversation.messages.length
    ? conversation.messages
    : [
        {
          id: `${conversation.id}-welcome`,
          role: "assistant",
          content: "你好，今天想从哪里开始？可以直接提问、整理资料，或一起完成一项具体任务。",
          createdAt: conversation.createdAt,
          status: "done"
        }
      ];
  const visibleMessages = settings.showUserPrompts
    ? displayMessages
    : displayMessages.filter((message) => message.role !== "user");
  const lastMessage = [...displayMessages].reverse().find((message) => message.content);
  const latestMessageContent = displayMessages[displayMessages.length - 1]?.content || "";
  const latestAssistantMessage = [...conversation.messages].reverse().find((message) => message.role === "assistant");
  const selectedContextMessages = selectChatHistory(conversation.messages, settings);
  const estimatedContextTokens = selectedContextMessages.reduce(
    (total, message) => total + estimatedTokenCount(message.content) + 8,
    0
  );
  const usageLabel = latestAssistantMessage?.usage
    ? `本轮 输入 ${latestAssistantMessage.usage.inputTokens.toLocaleString("zh-CN")} · 输出 ${latestAssistantMessage.usage.outputTokens.toLocaleString("zh-CN")} · 总计 ${latestAssistantMessage.usage.totalTokens.toLocaleString("zh-CN")}`
    : `上下文估算 ${estimatedContextTokens.toLocaleString("zh-CN")} Token`;
  const contextMessageCountLabel = settings.contextMessageCount === null
    ? "不限"
    : `最近 ${settings.contextMessageCount} 条`;

  useLayoutEffect(() => {
    if (ui.collapsed) return;
    const history = messageHistoryRef.current;
    if (!history) return;
    history.scrollTop = history.scrollHeight;
  }, [displayMessages.length, latestMessageContent, streaming, ui.collapsed]);

  useEffect(() => {
    if (!modelPickerOpen) setActiveModelVendor(vendorTabForModel(selectedModel));
  }, [modelPickerOpen, selectedModel]);

  useEffect(() => {
    if (!ui.collapsed) return;
    setModelPickerOpen(false);
    setMessageHistoryScrolling(false);
    if (messageHistoryScrollTimerRef.current !== null) {
      window.clearTimeout(messageHistoryScrollTimerRef.current);
      messageHistoryScrollTimerRef.current = null;
    }
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
    if (messageHistoryScrollTimerRef.current !== null) {
      window.clearTimeout(messageHistoryScrollTimerRef.current);
      messageHistoryScrollTimerRef.current = null;
    }
    if (vendorListScrollTimerRef.current !== null) {
      window.clearTimeout(vendorListScrollTimerRef.current);
      vendorListScrollTimerRef.current = null;
    }
    if (modelListScrollTimerRef.current !== null) {
      window.clearTimeout(modelListScrollTimerRef.current);
      modelListScrollTimerRef.current = null;
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
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const sendWithEnter = settings.sendShortcut === "enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey;
    const sendWithControl = settings.sendShortcut === "ctrl-enter" && (event.ctrlKey || event.metaKey);
    if (!sendWithEnter && !sendWithControl) return;
    event.preventDefault();
    onSend();
  };

  const handleComposerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!settings.longPasteAsFile) return;
    const text = event.clipboardData.getData("text/plain");
    if (text.length < 2000) return;
    event.preventDefault();
    onLongPaste(text);
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

  const handleMessageHistoryScroll = () => {
    setMessageHistoryScrolling(true);
    if (messageHistoryScrollTimerRef.current !== null) {
      window.clearTimeout(messageHistoryScrollTimerRef.current);
    }
    messageHistoryScrollTimerRef.current = window.setTimeout(() => {
      setMessageHistoryScrolling(false);
      messageHistoryScrollTimerRef.current = null;
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
    <article
      className={ui.collapsed ? "figma-chat-session collapsed" : "figma-chat-session"}
      data-conversation-id={conversation.id}
      data-pinned={conversation.pinned ? "true" : "false"}
    >
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
          {conversation.assistantId ? (
            <span
              className={assistant ? "figma-session-assistant" : "figma-session-assistant missing"}
              aria-label={`当前助手：${assistant?.name || "已失效"}`}
              title={assistant?.name || "助手已失效"}
            >
              <Bot size={13} aria-hidden="true" />
              <span>{assistant?.name || "助手已失效"}</span>
            </span>
          ) : null}
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
            className={conversation.pinned ? "figma-session-pin active" : "figma-session-pin"}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePinned();
            }}
            aria-label={conversation.pinned ? "取消置顶对话" : "置顶对话"}
            aria-pressed={conversation.pinned}
            title={conversation.pinned ? "取消置顶" : "置顶"}
          >
            <Pin size={14} aria-hidden="true" />
          </button>
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
          <AssistantAvatar
            assistant={assistant}
            fallbackImageUrl={assistantAvatarUrl}
            className="figma-session-avatar"
          />
          <span>
            <strong>{conversation.title || selectedModel?.label || "新对话"}</strong>
            <small>{lastMessage?.content.replace(/[*#`]/g, "").slice(0, 90)}</small>
          </span>
        </button>
      ) : (
        <>
          <div
            ref={messageHistoryRef}
            className={`${settings.messageStyle === "list" ? "figma-message-history list" : "figma-message-history"}${settings.useSerifFont ? " serif" : ""}`}
            style={{ "--figma-message-font-size": `${settings.messageFontSize}px` } as CSSProperties}
            data-scroll-active={messageHistoryScrolling ? "true" : "false"}
            onScroll={handleMessageHistoryScroll}
          >
            {settings.showMessageOutline ? (
              <nav className="figma-message-outline" aria-label="消息大纲">
                {visibleMessages.map((message, index) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => document.getElementById(`chat-message-${message.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  >
                    <span>{message.role === "assistant" ? "AI" : "我"}</span>
                    <strong>{message.content.replace(/[*#`<>]/g, "").slice(0, 24) || `消息 ${index + 1}`}</strong>
                  </button>
                ))}
              </nav>
            ) : null}
            <div className="figma-message-track">
              {visibleMessages.map((message) => (
                <article id={`chat-message-${message.id}`} key={message.id} className={`figma-message ${message.role}`}>
                  {message.role === "assistant" ? (
                    <AssistantAvatar
                      assistant={assistant}
                      fallbackImageUrl={assistantAvatarUrl}
                      className="figma-message-avatar"
                    />
                  ) : null}
                  <div className="figma-message-bubble">
                    {message.content ? (
                      <ChatMessageContent
                        content={message.content}
                        plainText={message.role === "user" && !settings.renderUserMarkdown}
                        collapseThinking={settings.collapseThinking}
                        renderMath={settings.renderMath}
                        enableSingleDollarMath={settings.enableSingleDollarMath}
                        codeTheme={settings.codeTheme}
                        styledCodeBlocks={settings.styledCodeBlocks}
                        showCodeLineNumbers={settings.showCodeLineNumbers}
                        collapseCodeBlocks={settings.collapseCodeBlocks}
                        wrapCode={settings.wrapCode}
                        enableCodePreview={settings.enableCodePreview}
                      />
                    ) : message.status === "streaming" ? (
                      <span className="figma-typing"><i /><i /><i /></span>
                    ) : (
                      <small role="status">
                        {message.status === "stopped" ? "已停止生成" : "生成失败"}
                      </small>
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
              <div />
            </div>
          </div>

          <div className="figma-session-controls">
            <div className="figma-session-controls-track">
              <div className="figma-session-tools">
                <FigmaMenu
                  className={`figma-search-provider-menu${ui.searchProvider ? " active" : ""}`}
                  label="网络搜索厂商"
                  value={ui.searchProvider || "off"}
                  options={searchProviderOptions}
                  onChange={(value) => onSearchProviderChange(
                    value === "glm" || value === "kimi" ? value : ""
                  )}
                  ariaLabel="网络搜索"
                  disabled={streaming || !searchCompatibility.compatible}
                  triggerIcon={<Globe2 size={14} aria-hidden="true" />}
                  triggerText={ui.searchProvider
                    ? `网络搜索 · ${ui.searchProvider === "glm" ? "智谱 GLM" : "Kimi"}`
                    : "网络搜索"}
                />
                {knowledgeAuthenticated ? (
                  <CloudKnowledgeSelector
                    compact
                    bases={knowledgeBases}
                    selectedIds={ui.knowledgeBaseIds}
                    onChange={onKnowledgeChange}
                    disabled={streaming}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  title={`图片输入，单次最多 ${settings.maxImageAttachments} 张`}
                >
                  <ImageIcon size={14} />
                  图片输入
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  hidden
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={onImageInput}
                />
                <FigmaMenu
                  className="figma-reasoning-menu"
                  label="思维链长度"
                  triggerPrefix="思维链"
                  value={ui.reasoningEffort}
                  options={reasoningEffortOptions}
                  onChange={(value) => onReasoningEffortChange(cleanSettingChoice(
                    value,
                    reasoningEffortValues,
                    "default"
                  ))}
                  ariaLabel="思维链长度"
                  triggerIcon={<BrainCircuit size={14} aria-hidden="true" />}
                />
                <FigmaMenu
                  className="figma-context-count-menu"
                  label="引用上下文条数"
                  value={settings.contextMessageCount === null ? "unlimited" : String(settings.contextMessageCount)}
                  options={contextMessageCountOptions}
                  onChange={(value) => onContextMessageCountChange(
                    value === "unlimited"
                      ? null
                      : cleanSettingChoice(Number(value), chatContextMessageCountValues, 16)
                  )}
                  ariaLabel="引用上下文条数"
                  disabled={streaming}
                  triggerIcon={<History size={14} aria-hidden="true" />}
                  triggerText={`上下文 · ${contextMessageCountLabel}`}
                />
                {settings.showUsage ? (
                  <output
                    className="figma-token-usage-summary"
                    aria-label="Token 统计"
                    title={latestAssistantMessage?.usage ? "最新一次模型响应的接口用量" : `当前实际引用 ${selectedContextMessages.length} 条消息的本地估算`}
                  >
                    {usageLabel}
                  </output>
                ) : null}
                <button type="button" className="clear" onClick={onClear}>
                  <Trash2 size={14} />
                  清除消息
                </button>
              </div>

              {ui.attachments.length ? (
                <div className="figma-image-attachments" aria-label="待发送附件">
                  <div className="figma-image-attachments-summary">
                    <span>{ui.attachments.every((attachment) => attachment.kind === "image")
                      ? `已选择 ${imageAttachmentCount(ui.attachments)} / ${settings.maxImageAttachments}`
                      : `已添加 ${ui.attachments.length} 个附件 · 图片 ${imageAttachmentCount(ui.attachments)} / ${settings.maxImageAttachments}`}</span>
                  </div>
                  <div className="figma-image-attachments-list">
                    {ui.attachments.map((attachment) => (
                      <div key={attachment.id} className={`figma-image-attachment ${attachment.kind}`} data-testid="chat-image-attachment">
                        {attachment.kind === "image"
                          ? <img src={attachment.dataUrl} alt={attachment.name} />
                          : <span className="figma-text-attachment-icon"><FileText size={15} /></span>}
                        <span title={attachment.name}>{attachment.name}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveImage(attachment.id)}
                          aria-label={`${attachment.kind === "image" ? "移除图片" : "移除附件"} ${attachment.name}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

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
                  onPaste={handleComposerPaste}
                  placeholder={settings.sendShortcut === "enter"
                    ? "在此输入你想探讨的想法、分析的内容，或者向 AI 提问... (Shift + Enter 换行，Enter 发送)"
                    : "在此输入你想探讨的想法、分析的内容，或者向 AI 提问... (Enter 换行，Ctrl + Enter 发送)"}
                  rows={2}
                />
                <div className="figma-composer-footer">
                  {settings.showTokenEstimate ? <small>预估 {estimatedTokenCount(ui.draft).toLocaleString("zh-CN")} Token</small> : <span />}
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
