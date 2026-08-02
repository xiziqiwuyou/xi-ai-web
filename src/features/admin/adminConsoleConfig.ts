import {
  Activity,
  Bot,
  Database,
  FileText,
  Gauge,
  KeyRound,
  Layers3,
  ServerCog,
  Settings,
  ToggleLeft,
  Users,
  Workflow
} from "lucide-react";
import type { KnowledgeAdminSectionId } from "./KnowledgeAdminSection";
import type {
  AdminLangflowWorkflow,
  AppPreset,
  Assistant,
  ModelCapability,
  ModelCatalogEntry,
  ModelDefaultFor,
  ModelEndpointProtocol,
  ModuleId,
  PromptPreset,
  ProviderKind
} from "../../types";

export type ModelDraft = {
  vendorId: string;
  vendor: ProviderKind;
  endpointProtocol: ModelEndpointProtocol;
  model: string;
  label: string;
  capabilities: ModelCapability[];
  defaultFor: ModelDefaultFor[];
  enabled: boolean;
  contextWindowTokens: number;
  maxInputCharacters: number;
  mediaConfig?: ModelCatalogEntry["mediaConfig"];
};

export type AssistantDraft = {
  name: string;
  description: string;
  category: string;
  tags: string;
  starterPrompts: string;
  color: string;
  systemPrompt: string;
  enabled: boolean;
};

export type AppPresetDraft = {
  name: string;
  description: string;
  category: string;
  prompt: string;
  enabled: boolean;
};

export type PromptPresetDraft = {
  moduleId: ModuleId;
  title: string;
  prompt: string;
  enabled: boolean;
};

export type LangflowWorkflowDraft = {
  flowId: string;
  name: string;
  description: string;
  welcomeMessage: string;
  inputPlaceholder: string;
  tags: string;
  order: number;
  enabled: boolean;
};

export type AdminSectionId =
  | "overview"
  | "tools"
  | "site"
  | "menus"
  | "models"
  | "assistants"
  | "apps"
  | "prompts"
  | "workflows"
  | "audit"
  | KnowledgeAdminSectionId;

export type AdminNavigationGroupId = "overview" | "ai" | "content" | "knowledge" | "system";

export type AdminConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
};

export const adminNavigationGroups: Array<{
  id: AdminNavigationGroupId;
  label: string;
  icon: typeof Activity;
  items: Array<{
    id: AdminSectionId;
    label: string;
    icon: typeof Activity;
  }>;
}> = [
  {
    id: "overview",
    label: "运行总览",
    icon: Activity,
    items: [{ id: "overview", label: "运行概览", icon: Activity }]
  },
  {
    id: "ai",
    label: "AI 能力",
    icon: Layers3,
    items: [
      { id: "models", label: "模型目录", icon: Layers3 },
      { id: "tools", label: "工具权限", icon: ServerCog },
      { id: "workflows", label: "工作流发布", icon: Workflow }
    ]
  },
  {
    id: "content",
    label: "内容与展示",
    icon: Bot,
    items: [
      { id: "assistants", label: "助手库", icon: Bot },
      { id: "apps", label: "应用预设", icon: Layers3 },
      { id: "prompts", label: "提示词预设", icon: FileText },
      { id: "menus", label: "前台菜单", icon: ToggleLeft }
    ]
  },
  {
    id: "knowledge",
    label: "知识库",
    icon: Database,
    items: [
      { id: "knowledge-overview", label: "知识库概览", icon: Database },
      { id: "knowledge-accounts", label: "知识库账号", icon: Users },
      { id: "knowledge-registration", label: "注册与邀请码", icon: KeyRound },
      { id: "knowledge-limits", label: "运行限额", icon: Gauge },
      { id: "knowledge-jobs", label: "任务与存储", icon: Activity },
      { id: "knowledge-audit", label: "知识库审计", icon: FileText }
    ]
  },
  {
    id: "system",
    label: "系统与安全",
    icon: Settings,
    items: [
      { id: "site", label: "站点设置", icon: Settings },
      { id: "audit", label: "审计记录", icon: FileText }
    ]
  }
];

export const adminSectionDetails: Record<AdminSectionId, { title: string; description: string }> = {
  overview: {
    title: "运行概览",
    description: "检查服务状态、配置完整性和元数据备份。"
  },
  tools: {
    title: "工具权限",
    description: "控制应用工具、独立联网搜索和厂商托管工具。"
  },
  site: {
    title: "站点设置",
    description: "维护站点名称和访客使用策略。"
  },
  menus: {
    title: "前台菜单",
    description: "配置前台功能入口的名称、可见性和启用状态。"
  },
  models: {
    title: "模型目录",
    description: "维护前台显示名称、实际请求模型名和模型能力。"
  },
  assistants: {
    title: "助手库",
    description: "维护前台可使用的助手分类、提示词和开场问题。"
  },
  apps: {
    title: "应用预设",
    description: "维护可通过对话命令启动的应用提示词。"
  },
  prompts: {
    title: "提示词预设",
    description: "维护各功能页面可直接使用的提示词预设。"
  },
  workflows: {
    title: "工作流发布",
    description: "维护前台可运行的 Langflow 工作流目录；服务地址和密钥只通过服务器环境变量配置。"
  },
  audit: {
    title: "审计记录",
    description: "查询并导出后台操作记录。"
  },
  "knowledge-overview": {
    title: "知识库概览",
    description: "查看知识账号、容量、文档和任务的安全运营摘要。"
  },
  "knowledge-accounts": {
    title: "知识库账号",
    description: "搜索账号、管理冻结状态、会话和一次性重置流程。"
  },
  "knowledge-registration": {
    title: "注册与邀请码",
    description: "控制注册模式并维护只显示一次的邀请码。"
  },
  "knowledge-limits": {
    title: "运行限额",
    description: "调整全局容量、数量、并发和检索上限。"
  },
  "knowledge-jobs": {
    title: "任务与存储",
    description: "查看解析、清理、对账和索引任务状态。"
  },
  "knowledge-audit": {
    title: "知识库审计",
    description: "查询不可修改的知识库后台操作记录。"
  }
};

export const adminCapabilityLabels: Record<ModelCapability, string> = {
  chat: "对话",
  vision: "图片理解",
  image: "图片生成",
  imageEdit: "图片编辑",
  tts: "语音合成",
  stt: "语音识别",
  audio: "音频理解",
  video: "视频生成",
  embedding: "向量嵌入",
  fileSearch: "文件检索",
  toolCalling: "函数工具调用",
  webSearch: "联网搜索",
  urlContext: "网页读取",
  codeExecution: "代码执行"
};

export const vendorOptions: Array<{ value: ProviderKind; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "kimi", label: "Kimi" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "qwen", label: "通义千问（Qwen）" },
  { value: "botcf", label: "BotCF" },
  { value: "openai-compatible", label: "OpenAI Compatible" }
];

export const endpointProtocolOptions: Array<{
  value: ModelEndpointProtocol;
  label: string;
  path: string;
}> = [
  { value: "openai-chat", label: "OpenAI Chat Completions", path: "/v1/chat/completions" },
  { value: "openai-responses", label: "OpenAI Responses", path: "/v1/responses" },
  { value: "anthropic-messages", label: "Anthropic Messages", path: "/v1/messages" },
  {
    value: "gemini-generate-content",
    label: "Gemini generateContent",
    path: "/v1beta/models/{model}:generateContent"
  }
];

export function defaultEndpointProtocolForVendor(vendor: ProviderKind): ModelEndpointProtocol {
  if (vendor === "openai") return "openai-responses";
  if (vendor === "anthropic") return "anthropic-messages";
  if (vendor === "gemini") return "gemini-generate-content";
  return "openai-chat";
}

export function endpointProtocolDetails(protocol: ModelEndpointProtocol) {
  return endpointProtocolOptions.find((option) => option.value === protocol) || endpointProtocolOptions[0];
}

export const capabilityOptions: Array<{ value: ModelCapability; label: string }> = [
  { value: "chat", label: "对话" },
  { value: "vision", label: "多模态" },
  { value: "image", label: "画图" },
  { value: "imageEdit", label: "图片编辑" },
  { value: "tts", label: "语音合成" },
  { value: "stt", label: "语音识别" },
  { value: "audio", label: "音频" },
  { value: "video", label: "视频" },
  { value: "embedding", label: "向量" },
  { value: "fileSearch", label: "检索" },
  { value: "toolCalling", label: "工具" },
  { value: "webSearch", label: "托管搜索" },
  { value: "urlContext", label: "网页读取" },
  { value: "codeExecution", label: "代码执行" }
];

export const emptyModelDraft: ModelDraft = {
  vendorId: "openai",
  vendor: "openai",
  endpointProtocol: "openai-responses",
  model: "gpt-5.6-luna",
  label: "GPT-5.6 Luna",
  capabilities: ["chat", "vision", "toolCalling"],
  defaultFor: [],
  enabled: true,
  contextWindowTokens: 128000,
  maxInputCharacters: 100000,
  mediaConfig: {}
};

export const emptyAssistantDraft: AssistantDraft = {
  name: "新助手",
  description: "适合一个具体场景的助手。",
  category: "通用效率",
  tags: "问答, 效率",
  starterPrompts: "帮我开始处理这个任务",
  color: "#ff2442",
  systemPrompt: "你是一个可靠的中文 AI 助手。回答要清晰、准确、可执行。",
  enabled: true
};

export const emptyAppPresetDraft: AppPresetDraft = {
  name: "新应用",
  description: "描述这个应用适合解决什么问题。",
  category: "通用",
  prompt: "请根据用户输入完成任务，并给出结构化结果。",
  enabled: true
};

export const emptyPromptPresetDraft: PromptPresetDraft = {
  moduleId: "image",
  title: "新预设",
  prompt: "输入一段可直接使用的提示词。",
  enabled: true
};

export const emptyLangflowWorkflowDraft: LangflowWorkflowDraft = {
  flowId: "",
  name: "新工作流",
  description: "适合通过对话连续完成的任务。",
  welcomeMessage: "你好，请告诉我这次需要完成什么。",
  inputPlaceholder: "输入任务或继续追问...",
  tags: "对话, 工作流",
  order: 100,
  enabled: true
};

export const promptModuleOptions: Array<{ value: ModuleId; label: string }> = [
  { value: "chat", label: "对话" },
  { value: "image", label: "绘画" },
  { value: "mindmap", label: "思维导图" },
  { value: "agents", label: "智能体" },
  { value: "apps", label: "应用" },
  { value: "gallery", label: "画廊" }
];

export function modelDraft(entry?: ModelCatalogEntry): ModelDraft {
  if (!entry) return emptyModelDraft;
  return {
    vendorId: entry.vendorId || entry.vendor,
    vendor: entry.vendor,
    endpointProtocol: entry.endpointProtocol || defaultEndpointProtocolForVendor(entry.vendor),
    model: entry.model,
    label: entry.label,
    capabilities: entry.capabilities,
    defaultFor: entry.defaultFor,
    enabled: entry.enabled,
    contextWindowTokens: entry.contextWindowTokens || 128000,
    maxInputCharacters: entry.maxInputCharacters || 100000,
    mediaConfig: entry.mediaConfig || {}
  };
}

export function assistantDraft(entry?: Assistant): AssistantDraft {
  if (!entry) return emptyAssistantDraft;
  return {
    name: entry.name,
    description: entry.description,
    category: entry.category,
    tags: entry.tags.join(", "),
    starterPrompts: entry.starterPrompts.join("\n"),
    color: entry.color,
    systemPrompt: entry.systemPrompt,
    enabled: entry.enabled
  };
}

export function assistantPayload(draft: AssistantDraft): Partial<Assistant> {
  return {
    name: draft.name,
    description: draft.description,
    category: draft.category,
    tags: [...new Set(draft.tags.split(/[,，\r\n]+/).map((tag) => tag.trim()).filter(Boolean))],
    starterPrompts: [...new Set(draft.starterPrompts.split(/[\r\n]+/).map((prompt) => prompt.trim()).filter(Boolean))],
    color: draft.color,
    systemPrompt: draft.systemPrompt,
    enabled: draft.enabled
  };
}

export function appPresetDraft(entry?: AppPreset): AppPresetDraft {
  if (!entry) return emptyAppPresetDraft;
  return {
    name: entry.name,
    description: entry.description,
    category: entry.category,
    prompt: entry.prompt,
    enabled: entry.enabled
  };
}

export function promptPresetDraft(entry?: PromptPreset): PromptPresetDraft {
  if (!entry) return emptyPromptPresetDraft;
  return {
    moduleId: entry.moduleId,
    title: entry.title,
    prompt: entry.prompt,
    enabled: entry.enabled
  };
}

export function langflowWorkflowDraft(entry?: AdminLangflowWorkflow): LangflowWorkflowDraft {
  if (!entry) return emptyLangflowWorkflowDraft;
  return {
    flowId: entry.flowId,
    name: entry.name,
    description: entry.description,
    welcomeMessage: entry.welcomeMessage,
    inputPlaceholder: entry.inputPlaceholder,
    tags: entry.tags.join(", "),
    order: entry.order,
    enabled: entry.enabled
  };
}

export function langflowWorkflowPayload(draft: LangflowWorkflowDraft): Partial<AdminLangflowWorkflow> {
  return {
    flowId: draft.flowId.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    welcomeMessage: draft.welcomeMessage.trim(),
    inputPlaceholder: draft.inputPlaceholder.trim(),
    tags: [...new Set(draft.tags.split(/[,，\r\n]+/).map((tag) => tag.trim()).filter(Boolean))],
    order: draft.order,
    enabled: draft.enabled
  };
}

export function vendorLabel(vendor: ProviderKind) {
  return vendorOptions.find((option) => option.value === vendor)?.label || vendor;
}

export function toggleArrayValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function downloadJson(payload: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatBytes(size: number) {
  if (!Number.isFinite(size)) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatUptime(seconds: number) {
  if (!Number.isFinite(seconds)) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
