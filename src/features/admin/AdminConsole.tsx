import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  Eye,
  FileText,
  Gauge,
  Home,
  KeyRound,
  Layers3,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  Settings,
  ShieldCheck,
  ToggleLeft,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import { api, type ModelCatalogPayload } from "../../api";
import { vendorLabels } from "../../components/workbench";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import {
  KnowledgeAdminSection,
  type KnowledgeAdminSectionId
} from "./KnowledgeAdminSection";
import { validateModelCatalog } from "./adminValidation";
import { modelCatalogPresets } from "./modelCatalogPresets";
import type {
  AdminAuditEntry,
  AdminBackupItem,
  AdminBootstrapPayload,
  AdminOpsPayload,
  AppPreset,
  Assistant,
  MenuItem,
  ModelCapability,
  ModelCatalogEntry,
  ModelDefaultFor,
  ModuleId,
  PromptPreset,
  ProviderKind,
  SiteSettings,
  ToolSetting
} from "../../types";

type ModelDraft = {
  vendor: ProviderKind;
  model: string;
  label: string;
  capabilities: ModelCapability[];
  defaultFor: ModelDefaultFor[];
  enabled: boolean;
  mediaConfig?: ModelCatalogEntry["mediaConfig"];
};

type AssistantDraft = {
  name: string;
  description: string;
  category: string;
  tags: string;
  starterPrompts: string;
  color: string;
  systemPrompt: string;
  enabled: boolean;
};

type AppPresetDraft = {
  name: string;
  description: string;
  category: string;
  prompt: string;
  enabled: boolean;
};

type PromptPresetDraft = {
  moduleId: ModuleId;
  title: string;
  prompt: string;
  enabled: boolean;
};

type AdminSectionId =
  | "overview"
  | "tools"
  | "site"
  | "menus"
  | "models"
  | "assistants"
  | "apps"
  | "prompts"
  | "audit"
  | KnowledgeAdminSectionId;

type AdminNavigationGroupId = "operations" | "configuration" | "models" | "content" | "knowledge" | "audit";

type AdminConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
};

const adminNavigationGroups: Array<{
  id: AdminNavigationGroupId;
  label: string;
  items: Array<{
    id: AdminSectionId;
    label: string;
    icon: typeof Activity;
  }>;
}> = [
  {
    id: "operations",
    label: "运行管理",
    items: [
      { id: "overview", label: "运行概览", icon: Activity },
      { id: "tools", label: "工具权限", icon: ServerCog }
    ]
  },
  {
    id: "configuration",
    label: "系统配置",
    items: [
      { id: "site", label: "站点设置", icon: Settings },
      { id: "menus", label: "前台菜单", icon: ToggleLeft }
    ]
  },
  {
    id: "models",
    label: "模型管理",
    items: [{ id: "models", label: "模型目录", icon: Layers3 }]
  },
  {
    id: "content",
    label: "内容管理",
    items: [
      { id: "assistants", label: "助手库", icon: Bot },
      { id: "apps", label: "应用预设", icon: Layers3 },
      { id: "prompts", label: "提示词预设", icon: FileText }
    ]
  },
  {
    id: "knowledge",
    label: "知识库运营",
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
    id: "audit",
    label: "审计",
    items: [{ id: "audit", label: "审计记录", icon: FileText }]
  }
];

const adminSectionDetails: Record<AdminSectionId, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "OVERVIEW",
    title: "运行概览",
    description: "检查服务状态、配置完整性和元数据备份。"
  },
  tools: {
    eyebrow: "TOOLS",
    title: "工具权限",
    description: "控制应用工具、独立联网搜索和厂商托管工具。"
  },
  site: {
    eyebrow: "SITE",
    title: "站点设置",
    description: "维护站点名称和访客使用策略。"
  },
  menus: {
    eyebrow: "NAVIGATION",
    title: "前台菜单",
    description: "配置前台功能入口的名称、可见性和启用状态。"
  },
  models: {
    eyebrow: "MODELS",
    title: "模型目录",
    description: "维护前台显示名称、实际请求模型名和模型能力。"
  },
  assistants: {
    eyebrow: "ASSISTANTS",
    title: "助手库",
    description: "维护前台可使用的助手分类、提示词和开场问题。"
  },
  apps: {
    eyebrow: "APPLICATIONS",
    title: "应用预设",
    description: "维护可通过对话命令启动的应用提示词。"
  },
  prompts: {
    eyebrow: "PROMPTS",
    title: "提示词预设",
    description: "维护各功能页面可直接使用的提示词预设。"
  },
  audit: {
    eyebrow: "AUDIT",
    title: "审计记录",
    description: "查询并导出后台操作记录。"
  },
  "knowledge-overview": {
    eyebrow: "KNOWLEDGE / OVERVIEW",
    title: "知识库概览",
    description: "查看知识账号、容量、文档和任务的安全运营摘要。"
  },
  "knowledge-accounts": {
    eyebrow: "KNOWLEDGE / ACCOUNTS",
    title: "知识库账号",
    description: "搜索账号、管理冻结状态、会话和一次性重置流程。"
  },
  "knowledge-registration": {
    eyebrow: "KNOWLEDGE / REGISTRATION",
    title: "注册与邀请码",
    description: "控制注册模式并维护只显示一次的邀请码。"
  },
  "knowledge-limits": {
    eyebrow: "KNOWLEDGE / LIMITS",
    title: "运行限额",
    description: "调整全局容量、数量、并发和检索上限。"
  },
  "knowledge-jobs": {
    eyebrow: "KNOWLEDGE / JOBS",
    title: "任务与存储",
    description: "查看解析、清理、对账和索引任务状态。"
  },
  "knowledge-audit": {
    eyebrow: "KNOWLEDGE / AUDIT",
    title: "知识库审计",
    description: "查询不可修改的知识库后台操作记录。"
  }
};

const adminCapabilityLabels: Record<ModelCapability, string> = {
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
  codeExecution: "代码执行",
  streaming: "流式输出"
};

const vendorOptions: Array<{ value: ProviderKind; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "kimi", label: "Kimi" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "qwen", label: "通义千问（Qwen）" },
  { value: "openai-compatible", label: "OpenAI Compatible" }
];

const capabilityOptions: Array<{ value: ModelCapability; label: string }> = [
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
  { value: "codeExecution", label: "代码执行" },
  { value: "streaming", label: "流式" }
];

const defaultForOptions: Array<{ value: ModelDefaultFor; label: string }> = [
  { value: "chat", label: "对话默认" },
  { value: "image", label: "画图默认" },
  { value: "tts", label: "语音默认" },
  { value: "stt", label: "识别默认" },
  { value: "video", label: "视频默认" },
  { value: "embedding", label: "向量默认" }
];

const emptyModelDraft: ModelDraft = {
  vendor: "openai",
  model: "gpt-5.6-luna",
  label: "GPT-5.6 Luna",
  capabilities: ["chat", "vision", "toolCalling", "streaming"],
  defaultFor: [],
  enabled: true,
  mediaConfig: {}
};

const emptyAssistantDraft: AssistantDraft = {
  name: "新助手",
  description: "适合一个具体场景的助手。",
  category: "通用效率",
  tags: "问答, 效率",
  starterPrompts: "帮我开始处理这个任务",
  color: "#ff2442",
  systemPrompt: "你是一个可靠的中文 AI 助手。回答要清晰、准确、可执行。",
  enabled: true
};

const emptyAppPresetDraft: AppPresetDraft = {
  name: "新应用",
  description: "描述这个应用适合解决什么问题。",
  category: "通用",
  prompt: "请根据用户输入完成任务，并给出结构化结果。",
  enabled: true
};

const emptyPromptPresetDraft: PromptPresetDraft = {
  moduleId: "image",
  title: "新预设",
  prompt: "输入一段可直接使用的提示词。",
  enabled: true
};

const promptModuleOptions: Array<{ value: ModuleId; label: string }> = [
  { value: "chat", label: "对话" },
  { value: "image", label: "绘画" },
  { value: "mindmap", label: "思维导图" },
  { value: "agents", label: "智能体" },
  { value: "apps", label: "应用" },
  { value: "gallery", label: "画廊" }
];

function modelDraft(entry?: ModelCatalogEntry): ModelDraft {
  if (!entry) return emptyModelDraft;
  return {
    vendor: entry.vendor,
    model: entry.model,
    label: entry.label,
    capabilities: entry.capabilities,
    defaultFor: entry.defaultFor,
    enabled: entry.enabled,
    mediaConfig: entry.mediaConfig || {}
  };
}

function assistantDraft(entry?: Assistant): AssistantDraft {
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

function assistantPayload(draft: AssistantDraft): Partial<Assistant> {
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

function appPresetDraft(entry?: AppPreset): AppPresetDraft {
  if (!entry) return emptyAppPresetDraft;
  return {
    name: entry.name,
    description: entry.description,
    category: entry.category,
    prompt: entry.prompt,
    enabled: entry.enabled
  };
}

function promptPresetDraft(entry?: PromptPreset): PromptPresetDraft {
  if (!entry) return emptyPromptPresetDraft;
  return {
    moduleId: entry.moduleId,
    title: entry.title,
    prompt: entry.prompt,
    enabled: entry.enabled
  };
}

function vendorLabel(vendor: ProviderKind) {
  return vendorOptions.find((option) => option.value === vendor)?.label || vendor;
}

function toggleArrayValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function downloadJson(payload: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatBytes(size: number) {
  if (!Number.isFinite(size)) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatUptime(seconds: number) {
  if (!Number.isFinite(seconds)) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function AdminConsole({
  bootstrap,
  notice,
  error,
  onNotice,
  onError,
  onBootstrapChange,
  onPublicRefresh,
  onLogout
}: {
  bootstrap: AdminBootstrapPayload;
  notice: string;
  error: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onBootstrapChange: (payload: AdminBootstrapPayload) => void;
  onPublicRefresh: () => Promise<unknown>;
  onLogout: () => Promise<void>;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSectionId>("overview");
  const [expandedNavigationGroups, setExpandedNavigationGroups] = useState<AdminNavigationGroupId[]>([
    "operations"
  ]);
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SiteSettings>(bootstrap.settings);
  const [menuDraft, setMenuDraft] = useState<MenuItem[]>(bootstrap.menuItems);
  const [selectedModelId, setSelectedModelId] = useState<string | "new">(
    bootstrap.modelCatalog[0]?.id || "new"
  );
  const selectedModel = bootstrap.modelCatalog.find((entry) => entry.id === selectedModelId);
  const [modelForm, setModelForm] = useState<ModelDraft>(modelDraft(selectedModel));
  const [showModelFieldErrors, setShowModelFieldErrors] = useState(false);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | "new">(
    bootstrap.assistants[0]?.id || "new"
  );
  const selectedAssistant = bootstrap.assistants.find((entry) => entry.id === selectedAssistantId);
  const [assistantForm, setAssistantForm] = useState<AssistantDraft>(assistantDraft(selectedAssistant));
  const [selectedAppId, setSelectedAppId] = useState<string | "new">(
    bootstrap.appPresets[0]?.id || "new"
  );
  const selectedApp = bootstrap.appPresets.find((entry) => entry.id === selectedAppId);
  const [appForm, setAppForm] = useState<AppPresetDraft>(appPresetDraft(selectedApp));
  const [selectedPromptId, setSelectedPromptId] = useState<string | "new">(
    bootstrap.promptPresets[0]?.id || "new"
  );
  const selectedPrompt = bootstrap.promptPresets.find((entry) => entry.id === selectedPromptId);
  const [promptForm, setPromptForm] = useState<PromptPresetDraft>(promptPresetDraft(selectedPrompt));
  const [toolDraft, setToolDraft] = useState<ToolSetting[]>(bootstrap.toolSettings || []);
  const [opsSummary, setOpsSummary] = useState<AdminOpsPayload | null>(null);
  const [backups, setBackups] = useState<AdminBackupItem[]>([]);
  const [auditLog, setAuditLog] = useState<AdminAuditEntry[]>([]);
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditLimit, setAuditLimit] = useState(80);
  const [opsLoading, setOpsLoading] = useState(false);

  useEffect(() => {
    setSettingsDraft(bootstrap.settings);
    setMenuDraft(bootstrap.menuItems);
    setToolDraft(bootstrap.toolSettings || []);
  }, [bootstrap]);

  useEffect(() => {
    if (selectedModelId === "new") return;
    setModelForm(modelDraft(selectedModel));
    setShowModelFieldErrors(false);
  }, [selectedModel, selectedModelId]);

  useEffect(() => {
    setAssistantForm(assistantDraft(selectedAssistant));
  }, [selectedAssistant]);

  useEffect(() => {
    setAppForm(appPresetDraft(selectedApp));
  }, [selectedApp]);

  useEffect(() => {
    setPromptForm(promptPresetDraft(selectedPrompt));
  }, [selectedPrompt]);

  useEffect(() => {
    void loadOperations();
  }, []);

  const sortedMenus = useMemo(() => [...menuDraft].sort((a, b) => a.order - b.order), [menuDraft]);
  const sortedCatalog = useMemo(
    () =>
      [...bootstrap.modelCatalog].sort((a, b) =>
        `${a.vendor}-${a.label}`.localeCompare(`${b.vendor}-${b.label}`)
      ),
    [bootstrap.modelCatalog]
  );
  const modelIssues = useMemo(
    () => validateModelCatalog(bootstrap.modelCatalog, bootstrap.menuItems),
    [bootstrap.menuItems, bootstrap.modelCatalog]
  );
  const publicCapabilityPreview = useMemo(() => {
    const groups = new Map<string, ModelCatalogEntry[]>();
    bootstrap.modelCatalog
      .filter((entry) => entry.enabled)
      .forEach((entry) => {
        entry.capabilities.forEach((capability) => {
          groups.set(capability, [...(groups.get(capability) || []), entry]);
        });
      });
    return [...groups.entries()];
  }, [bootstrap.modelCatalog]);
  const sortedAssistants = useMemo(
    () => [...bootstrap.assistants].sort((a, b) =>
      `${a.category}-${a.name}`.localeCompare(`${b.category}-${b.name}`, "zh-CN")
    ),
    [bootstrap.assistants]
  );
  const sortedApps = useMemo(
    () => [...bootstrap.appPresets].sort((a, b) => `${a.category}-${a.name}`.localeCompare(`${b.category}-${b.name}`)),
    [bootstrap.appPresets]
  );
  const sortedPromptPresets = useMemo(
    () =>
      [...bootstrap.promptPresets].sort((a, b) =>
        `${a.moduleId}-${a.title}`.localeCompare(`${b.moduleId}-${b.title}`)
      ),
    [bootstrap.promptPresets]
  );
  const activeSectionDetails = adminSectionDetails[activeSection];
  const modelDisplayNameMissing = !modelForm.label.trim();
  const modelRequestNameMissing = !modelForm.model.trim();

  const openSection = (sectionId: AdminSectionId) => {
    const group = adminNavigationGroups.find((item) =>
      item.items.some((navigationItem) => navigationItem.id === sectionId)
    );
    if (group) {
      setExpandedNavigationGroups((current) =>
        current.includes(group.id) ? current : [...current, group.id]
      );
    }
    setActiveSection(sectionId);
    window.requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const toggleNavigationGroup = (groupId: AdminNavigationGroupId) => {
    setExpandedNavigationGroups((current) =>
      current.includes(groupId)
        ? current.filter((item) => item !== groupId)
        : [...current, groupId]
    );
  };

  const requestConfirmation = (nextConfirmation: AdminConfirmation) => {
    setConfirmation(nextConfirmation);
  };

  const closeConfirmation = () => {
    if (!confirmationBusy) setConfirmation(null);
  };

  const runConfirmedAction = async () => {
    if (!confirmation || confirmationBusy) return;
    setConfirmationBusy(true);
    try {
      await confirmation.action();
      setConfirmation(null);
    } finally {
      setConfirmationBusy(false);
    }
  };

  const saveSettings = async () => {
    onError("");
    onNotice("");
    try {
      const settings = await api.updateSettings(settingsDraft);
      onBootstrapChange({ ...bootstrap, settings });
      await onPublicRefresh();
      onNotice("系统设置已保存");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "系统设置保存失败");
    }
  };

  const saveMenus = async () => {
    onError("");
    onNotice("");
    try {
      const menuItems = await api.updateMenuItems(sortedMenus);
      onBootstrapChange({ ...bootstrap, menuItems });
      await onPublicRefresh();
      onNotice("菜单开关已保存");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "菜单保存失败");
    }
  };

  const applyModelPreset = (presetId: string) => {
    const preset = modelCatalogPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedModelId("new");
    setShowModelFieldErrors(false);
    setModelForm({
      vendor: preset.vendor,
      model: preset.model,
      label: preset.label,
      capabilities: preset.capabilities,
      defaultFor: preset.defaultFor,
      enabled: true,
      mediaConfig: preset.mediaConfig || {}
    });
  };

  const exportMetadata = async () => {
    onError("");
    onNotice("");
    try {
      const payload = await api.exportAdminMetadata();
      downloadJson(payload, `cherry-web-metadata-${Date.now()}.json`);
      onNotice("后台元数据已导出");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "元数据导出失败");
    }
  };

  const importMetadataFile = async (file: File) => {
    onError("");
    onNotice("");
    try {
      const payload = JSON.parse(await file.text()) as Partial<AdminBootstrapPayload>;
      const preview = await api.previewAdminMetadataImport(payload);
      requestConfirmation({
        title: "应用导入数据？",
        description: [
          `将导入菜单 ${preview.counts.menuItems || 0} 项、模型 ${preview.counts.modelCatalog || 0} 项、助手 ${preview.counts.assistants || 0} 项。`,
          preview.changed.length ? `变化：${preview.changed.join("；")}` : "数量无明显变化。",
          preview.warnings.length ? `警告：${preview.warnings.join("；")}` : "应用前会自动创建备份。"
        ].join("\n"),
        confirmLabel: "确认导入",
        action: async () => {
          try {
            const nextBootstrap = await api.importAdminMetadata(payload);
            onBootstrapChange(nextBootstrap);
            await onPublicRefresh();
            onNotice("后台元数据已导入");
          } catch (err: unknown) {
            onError(err instanceof Error ? err.message : "元数据导入失败");
          }
        }
      });
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "元数据导入失败");
    }
  };

  const saveToolSettings = async () => {
    onError("");
    onNotice("");
    try {
      const toolSettings = await api.updateToolSettings(toolDraft);
      onBootstrapChange({ ...bootstrap, toolSettings });
      await onPublicRefresh();
      onNotice("工具权限已保存");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "工具权限保存失败");
    }
  };

  const loadAuditLog = async () => {
    onError("");
    try {
      setAuditLog(
        await api.getAdminAuditLog({
          action: auditActionFilter.trim() || undefined,
          limit: auditLimit
        })
      );
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "审计记录读取失败");
    }
  };

  const loadOperations = async () => {
    onError("");
    setOpsLoading(true);
    try {
      const [ops, backupItems, auditItems] = await Promise.all([
        api.getAdminOps(),
        api.getAdminBackups(),
        api.getAdminAuditLog({ action: auditActionFilter.trim() || undefined, limit: auditLimit })
      ]);
      setOpsSummary(ops);
      setBackups(backupItems);
      setAuditLog(auditItems);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "运营数据读取失败");
    } finally {
      setOpsLoading(false);
    }
  };

  const restoreBackup = async (backup: AdminBackupItem) => {
    onError("");
    onNotice("");
    try {
      const nextBootstrap = await api.restoreAdminBackup(backup.name);
      const { restored, restoredBackup, ...metadata } = nextBootstrap;
      void restored;
      onBootstrapChange(metadata);
      await onPublicRefresh();
      await loadOperations();
      onNotice(`已恢复备份：${restoredBackup}`);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "备份恢复失败");
    }
  };

  const requestBackupRestore = (backup: AdminBackupItem) => {
    requestConfirmation({
      title: "恢复此备份？",
      description: `将使用“${backup.name}”覆盖当前后台配置，并立即影响前台菜单和模型。系统会先创建一份 pre-restore 备份。`,
      confirmLabel: "恢复备份",
      action: () => restoreBackup(backup)
    });
  };

  const exportVisibleAuditLog = () => {
    downloadJson(
      {
        exportedAt: new Date().toISOString(),
        filter: { action: auditActionFilter.trim() || null, limit: auditLimit },
        records: auditLog
      },
      `cherry-web-audit-${Date.now()}.json`
    );
  };

  const saveModelEntry = async (event: FormEvent) => {
    event.preventDefault();
    onError("");
    onNotice("");
    setShowModelFieldErrors(true);
    const label = modelForm.label.trim();
    const model = modelForm.model.trim();
    if (!label || !model) {
      onError(
        !label && !model
          ? "请填写前台显示名称和实际请求模型名"
          : !label
            ? "请填写前台显示名称"
            : "请填写实际请求模型名"
      );
      return;
    }
    const payload: ModelCatalogPayload = {
      ...modelForm,
      label,
      model,
      capabilities: modelForm.capabilities.length ? modelForm.capabilities : ["chat"],
      defaultFor: modelForm.defaultFor
    };

    try {
      const entry =
        selectedModelId === "new"
          ? await api.createModelEntry(payload)
          : await api.updateModelEntry(selectedModelId, payload);
      const modelCatalog =
        selectedModelId === "new"
          ? [entry, ...bootstrap.modelCatalog]
          : bootstrap.modelCatalog.map((item) => (item.id === entry.id ? entry : item));
      onBootstrapChange({ ...bootstrap, modelCatalog });
      setSelectedModelId(entry.id);
      setShowModelFieldErrors(false);
      await onPublicRefresh();
      onNotice("模型目录已保存");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "模型目录保存失败");
    }
  };

  const deleteModelEntry = async (modelId: string) => {
    onError("");
    onNotice("");
    try {
      await api.deleteModelEntry(modelId);
      const modelCatalog = bootstrap.modelCatalog.filter((entry) => entry.id !== modelId);
      onBootstrapChange({ ...bootstrap, modelCatalog });
      setSelectedModelId(modelCatalog[0]?.id || "new");
      await onPublicRefresh();
      onNotice("模型已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "模型删除失败");
    }
  };

  const requestModelDelete = () => {
    if (selectedModelId === "new" || !selectedModel) return;
    requestConfirmation({
      title: `删除模型“${selectedModel.label}”？`,
      description: "删除后，该模型会立即从前台模型选择器移除，且无法在后台直接撤销。",
      confirmLabel: "删除模型",
      action: () => deleteModelEntry(selectedModel.id)
    });
  };

  const saveAssistant = async (event: FormEvent) => {
    event.preventDefault();
    onError("");
    onNotice("");
    try {
      const assistant =
        selectedAssistantId === "new"
          ? await api.createAssistant(assistantPayload(assistantForm))
          : await api.updateAssistant(selectedAssistantId, assistantPayload(assistantForm));
      const assistants =
        selectedAssistantId === "new"
          ? [assistant, ...bootstrap.assistants]
          : bootstrap.assistants.map((item) => (item.id === assistant.id ? assistant : item));
      onBootstrapChange({ ...bootstrap, assistants });
      setSelectedAssistantId(assistant.id);
      await onPublicRefresh();
      onNotice("助手已保存");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "助手保存失败");
    }
  };

  const deleteAssistant = async (assistantId: string) => {
    onError("");
    onNotice("");
    try {
      await api.deleteAssistant(assistantId);
      const assistants = bootstrap.assistants.filter((entry) => entry.id !== assistantId);
      onBootstrapChange({ ...bootstrap, assistants });
      setSelectedAssistantId(assistants[0]?.id || "new");
      await onPublicRefresh();
      onNotice("助手已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "助手删除失败");
    }
  };

  const requestAssistantDelete = () => {
    if (selectedAssistantId === "new" || !selectedAssistant) return;
    requestConfirmation({
      title: `删除助手“${selectedAssistant.name}”？`,
      description: "删除后，该助手将不再出现在前台助手选择中，且无法在后台直接撤销。",
      confirmLabel: "删除助手",
      action: () => deleteAssistant(selectedAssistant.id)
    });
  };

  const saveAppPreset = async (event: FormEvent) => {
    event.preventDefault();
    onError("");
    onNotice("");
    try {
      const preset =
        selectedAppId === "new"
          ? await api.createAppPreset(appForm)
          : await api.updateAppPreset(selectedAppId, appForm);
      const appPresets =
        selectedAppId === "new"
          ? [preset, ...bootstrap.appPresets]
          : bootstrap.appPresets.map((item) => (item.id === preset.id ? preset : item));
      onBootstrapChange({ ...bootstrap, appPresets });
      setSelectedAppId(preset.id);
      await onPublicRefresh();
      onNotice("应用已保存");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "应用保存失败");
    }
  };

  const deleteAppPreset = async (appId: string) => {
    onError("");
    onNotice("");
    try {
      await api.deleteAppPreset(appId);
      const appPresets = bootstrap.appPresets.filter((entry) => entry.id !== appId);
      onBootstrapChange({ ...bootstrap, appPresets });
      setSelectedAppId(appPresets[0]?.id || "new");
      await onPublicRefresh();
      onNotice("应用已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "应用删除失败");
    }
  };

  const requestAppPresetDelete = () => {
    if (selectedAppId === "new" || !selectedApp) return;
    requestConfirmation({
      title: `删除应用“${selectedApp.name}”？`,
      description: "删除后，该应用预设会立即从前台应用列表移除，且无法在后台直接撤销。",
      confirmLabel: "删除应用",
      action: () => deleteAppPreset(selectedApp.id)
    });
  };

  const savePromptPreset = async (event: FormEvent) => {
    event.preventDefault();
    onError("");
    onNotice("");
    try {
      const preset =
        selectedPromptId === "new"
          ? await api.createPromptPreset(promptForm)
          : await api.updatePromptPreset(selectedPromptId, promptForm);
      const promptPresets =
        selectedPromptId === "new"
          ? [preset, ...bootstrap.promptPresets]
          : bootstrap.promptPresets.map((item) => (item.id === preset.id ? preset : item));
      onBootstrapChange({ ...bootstrap, promptPresets });
      setSelectedPromptId(preset.id);
      await onPublicRefresh();
      onNotice("提示词预设已保存");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "提示词预设保存失败");
    }
  };

  const deletePromptPreset = async (promptId: string) => {
    onError("");
    onNotice("");
    try {
      await api.deletePromptPreset(promptId);
      const promptPresets = bootstrap.promptPresets.filter((entry) => entry.id !== promptId);
      onBootstrapChange({ ...bootstrap, promptPresets });
      setSelectedPromptId(promptPresets[0]?.id || "new");
      await onPublicRefresh();
      onNotice("提示词预设已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "提示词预设删除失败");
    }
  };

  const requestPromptPresetDelete = () => {
    if (selectedPromptId === "new" || !selectedPrompt) return;
    requestConfirmation({
      title: `删除提示词“${selectedPrompt.title}”？`,
      description: "删除后，该提示词预设会立即从对应前台功能移除，且无法在后台直接撤销。",
      confirmLabel: "删除预设",
      action: () => deletePromptPreset(selectedPrompt.id)
    });
  };

  return (
    <div className="admin-console-shell">
      <header className="admin-console-header">
        <div className="admin-console-brand">
          <span className="admin-brand-mark" aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <span>
            <strong>xi-ai-web</strong>
            <small>开发者后台</small>
          </span>
        </div>
        <div className="admin-console-header-actions">
          <a href="/" className="admin-home-link" aria-label="返回前台" title="返回前台">
            <Home size={16} />
            <span className="admin-action-label">返回前台</span>
          </a>
          <button
            type="button"
            className="secondary-action admin-logout-button"
            onClick={() => void onLogout()}
            aria-label="退出后台"
            title="退出后台"
          >
            <LogOut size={16} />
            <span className="admin-action-label">退出</span>
          </button>
        </div>
      </header>

      <div className="admin-console-layout">
        <aside className="admin-sidebar">
          <nav className="admin-sidebar-nav" aria-label="后台管理分区">
            {adminNavigationGroups.map((group) => {
              const expanded = expandedNavigationGroups.includes(group.id);
              const containsActiveSection = group.items.some((item) => item.id === activeSection);
              const groupItemsId = `admin-nav-items-${group.id}`;
              return (
                <div key={group.id} className="admin-nav-group">
                  <button
                    type="button"
                    className={`admin-nav-group-toggle${containsActiveSection ? " has-active" : ""}`}
                    aria-expanded={expanded}
                    aria-controls={groupItemsId}
                    onClick={() => toggleNavigationGroup(group.id)}
                  >
                    <span>{group.label}</span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  <div id={groupItemsId} className="admin-nav-items" hidden={!expanded}>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={activeSection === item.id ? "is-active" : undefined}
                          aria-current={activeSection === item.id ? "page" : undefined}
                          onClick={() => openSection(item.id)}
                        >
                          <Icon size={17} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </aside>

        <div ref={contentScrollRef} className="admin-console" data-scroll-owner>
          <div className="admin-console-inner">
            <label className="admin-mobile-section-picker">
              <span>管理分区</span>
              <select
                value={activeSection}
                onChange={(event) => openSection(event.target.value as AdminSectionId)}
              >
                {adminNavigationGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <header className="admin-page-header">
              <span>{activeSectionDetails.eyebrow}</span>
              <h1>{activeSectionDetails.title}</h1>
              <p>{activeSectionDetails.description}</p>
            </header>

            {notice ? (
              <p className="admin-notice" role="status" aria-live="polite">
                <CheckCircle2 size={15} />
                {notice}
              </p>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}

      {activeSection.startsWith("knowledge-") ? (
        <KnowledgeAdminSection
          section={activeSection as KnowledgeAdminSectionId}
          onNotice={onNotice}
          onError={onError}
          requestConfirmation={requestConfirmation}
        />
      ) : null}

      {activeSection === "overview" ? (
      <section id="admin-section-overview" className="admin-section admin-ops-panel">
        <div className="section-title">
          <ServerCog size={17} />
          <h2>运营工具</h2>
        </div>
        <input
          ref={importInputRef}
          type="file"
          hidden
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importMetadataFile(file);
            event.currentTarget.value = "";
          }}
        />
        <div className="admin-form-actions">
          <button type="button" className="secondary-action" onClick={exportMetadata}>
            <Download size={16} />
            导出元数据
          </button>
          <button type="button" className="secondary-action" onClick={() => importInputRef.current?.click()}>
            <Upload size={16} />
            导入元数据
          </button>
        </div>
        <p className="admin-mini-copy">导入会先预检，确认后自动创建 `data/backups` 备份并写入审计记录。</p>
        <div className="admin-form-actions">
          <button type="button" className="secondary-action compact-action" onClick={() => void loadOperations()} disabled={opsLoading}>
            <RefreshCw size={16} />
            {opsLoading ? "刷新中" : "刷新运营状态"}
          </button>
        </div>
        {opsSummary ? (
          <>
            <div className="admin-ops-grid">
              <article>
                <Activity size={16} />
                <strong>{opsSummary.runtime.mode}</strong>
                <span>运行模式 · {formatUptime(opsSummary.runtime.uptimeSeconds)}</span>
                <span>元数据 · {opsSummary.runtime.metadataFile}</span>
              </article>
              <article>
                <Layers3 size={16} />
                <strong>{opsSummary.counts.enabledModels}/{opsSummary.counts.modelCatalog}</strong>
                <span>启用模型 / 模型总数</span>
              </article>
              <article>
                <ShieldCheck size={16} />
                <strong>{opsSummary.checklist.filter((item) => item.ok).length}/{opsSummary.checklist.length}</strong>
                <span>上线清单通过项</span>
              </article>
              <article>
                <FileText size={16} />
                <strong>{opsSummary.counts.backups}</strong>
                <span>数据备份 · 审计 {opsSummary.counts.auditRecords}</span>
              </article>
            </div>
            <div className="admin-checklist">
              {opsSummary.checklist.map((item) => (
                <p key={item.id} className={item.ok ? "ok" : "warn"}>
                  {item.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </p>
              ))}
            </div>
            {opsSummary.modelCoverage.some((item) => !item.covered) ? (
              <div className="admin-validation">
                <AlertCircle size={16} />
                <div>
                  <strong>模型能力缺口</strong>
                  {opsSummary.modelCoverage
                    .filter((item) => !item.covered)
                    .map((item) => (
                      <span key={item.moduleId}>
                        {item.label}: 缺少 {item.missing.join(", ")}
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="admin-backup-list">
          {(backups.length ? backups : opsSummary?.backups || []).slice(0, 8).map((backup) => (
            <article key={backup.name}>
              <div>
                <strong>{backup.name}</strong>
                <span>
                  {formatBytes(backup.size)} · {new Date(backup.modifiedAt).toLocaleString("zh-CN")}
                </span>
              </div>
              <button type="button" className="secondary-action compact-action" onClick={() => requestBackupRestore(backup)}>
                <RotateCcw size={15} />
                恢复
              </button>
            </article>
          ))}
        </div>
      </section>
      ) : null}

      {activeSection === "tools" ? (
      <section id="admin-section-tools" className="admin-section admin-tools-section">
        <div className="section-title">
          <ServerCog size={17} />
          <h2>工具权限</h2>
        </div>
        <fieldset className="admin-option-fieldset">
          <legend>可用工具</legend>
          <div className="admin-tool-grid">
            {toolDraft.map((tool) => (
              <label key={tool.name} className="admin-tool-card">
                <input
                  type="checkbox"
                  checked={tool.enabled}
                  onChange={(event) =>
                    setToolDraft((current) =>
                      current.map((item) =>
                        item.name === tool.name ? { ...item, enabled: event.target.checked } : item
                      )
                    )
                  }
                />
                <span className="admin-tool-card-copy">
                  <span className="admin-tool-card-heading">
                    <strong>{tool.label}</strong>
                    <b>{tool.execution === "search" ? "独立搜索" : tool.execution === "provider" ? "厂商托管" : "应用执行"}</b>
                  </span>
                  <small>{tool.description}</small>
                  <span className="admin-tool-card-meta">
                    <em>{tool.execution === "search" ? "不依赖主模型能力" : adminCapabilityLabels[tool.requiredCapability || "toolCalling"]}</em>
                    <em>{tool.execution === "search" ? "独立搜索服务" : (tool.supportedVendors || []).map((vendor) => vendorLabels[vendor] || vendor).join(" / ") || "全部厂商"}</em>
                    {tool.requiresContext ? <em>需要请求上下文</em> : null}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" className="primary-action" onClick={() => void saveToolSettings()} disabled={!toolDraft.length}>
          <Save size={16} />
          保存工具权限
        </button>
      </section>
      ) : null}

      {activeSection === "site" ? (
      <section id="admin-section-site" className="admin-section">
        <div className="section-title">
          <ServerCog size={17} />
          <h2>系统设置</h2>
        </div>
        <label>
          站点名称
          <input
            value={settingsDraft.siteName}
            onChange={(event) =>
              setSettingsDraft((current) => ({ ...current, siteName: event.target.value }))
            }
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={settingsDraft.allowGuestChat}
            onChange={(event) =>
              setSettingsDraft((current) => ({
                ...current,
                allowGuestChat: event.target.checked
              }))
            }
          />
          允许访客直接使用对话
        </label>
        <button type="button" className="primary-action" onClick={() => void saveSettings()}>
          <Save size={16} />
          保存系统设置
        </button>
      </section>
      ) : null}

      {activeSection === "menus" ? (
      <section id="admin-section-menus" className="admin-section admin-menu-section">
        <div className="section-title">
          <ToggleLeft size={17} />
          <h2>菜单管理</h2>
        </div>
        <div className="menu-editor">
          {sortedMenus.map((item) => (
            <article key={item.id} className="menu-edit-row">
              <label className="menu-name-field">
                <span>
                  菜单名称 <code>{item.id}</code>
                </span>
                <input
                  value={item.label}
                  onChange={(event) =>
                    setMenuDraft((current) =>
                      current.map((menu) =>
                        menu.id === item.id ? { ...menu, label: event.target.value } : menu
                      )
                    )
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={item.visible}
                  onChange={(event) =>
                    setMenuDraft((current) =>
                      current.map((menu) =>
                        menu.id === item.id ? { ...menu, visible: event.target.checked } : menu
                      )
                    )
                  }
                />
                显示
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(event) =>
                    setMenuDraft((current) =>
                      current.map((menu) =>
                        menu.id === item.id ? { ...menu, enabled: event.target.checked } : menu
                      )
                    )
                  }
                />
                启用
              </label>
            </article>
          ))}
        </div>
        <button type="button" className="primary-action" onClick={() => void saveMenus()}>
          <Save size={16} />
          保存菜单
        </button>
      </section>
      ) : null}

      {activeSection === "models" ? (
      <section id="admin-section-models" className="admin-section">
        <div className="section-title">
          <Layers3 size={17} />
          <h2>模型目录</h2>
        </div>
        {modelIssues.length ? (
          <div className="admin-validation">
            <AlertCircle size={16} />
            <div>
              <strong>目录检查</strong>
              {modelIssues.map((issue) => (
                <span key={issue}>{issue}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="admin-validation good">
            <CheckCircle2 size={16} />
            <span>模型目录校验通过</span>
          </div>
        )}
        <details className="admin-model-presets">
          <summary>
            <Plus size={15} />
            添加模型预设
            <span>{modelCatalogPresets.length}</span>
          </summary>
          <div className="model-preset-strip">
            {modelCatalogPresets.map((preset) => (
              <button key={preset.id} type="button" onClick={() => applyModelPreset(preset.id)}>
                <Plus size={14} />
                {preset.label}
              </button>
            ))}
          </div>
        </details>
        <details className="admin-public-preview">
          <summary>
            <Eye size={15} />
            前台可见模型预览
          </summary>
          <div>
            {publicCapabilityPreview.map(([capability, entries]) => (
              <p key={capability}>
                <strong>{capability}</strong>
                <span>{entries.map((entry) => entry.label).join("、")}</span>
              </p>
            ))}
          </div>
        </details>
        <div className="provider-picker">
          <label htmlFor="admin-model-picker">
            <span>选择模型</span>
            <select
              id="admin-model-picker"
              value={selectedModelId}
              onChange={(event) => {
                const modelId = event.target.value;
                setSelectedModelId(modelId);
                setShowModelFieldErrors(false);
                if (modelId === "new") setModelForm(emptyModelDraft);
              }}
            >
              {sortedCatalog.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {vendorLabel(entry.vendor)} · {entry.label}
                </option>
              ))}
              <option value="new">新增模型</option>
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="新增模型"
            title="新增模型"
            onClick={() => {
              setSelectedModelId("new");
              setShowModelFieldErrors(false);
              setModelForm(emptyModelDraft);
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        <form className="provider-form" onSubmit={saveModelEntry} noValidate>
          <label className="admin-model-vendor-field">
            模型厂商
            <select
              value={modelForm.vendor}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  vendor: event.target.value as ProviderKind
                }))
              }
            >
              {vendorOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="admin-model-display-name">
            前台显示名称
            <input
              id="admin-model-display-name"
              aria-label="前台显示名称"
              value={modelForm.label}
              onChange={(event) =>
                setModelForm((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="例如 GPT-5.6 Luna"
              required
              aria-invalid={showModelFieldErrors && modelDisplayNameMissing}
              aria-describedby={showModelFieldErrors && modelDisplayNameMissing ? "admin-model-label-error" : undefined}
            />
            {showModelFieldErrors && modelDisplayNameMissing ? (
              <small id="admin-model-label-error" className="admin-field-error">
                前台显示名称不能为空
              </small>
            ) : null}
          </label>
          <label htmlFor="admin-model-request-name">
            实际请求模型名
            <input
              id="admin-model-request-name"
              aria-label="实际请求模型名"
              value={modelForm.model}
              onChange={(event) =>
                setModelForm((current) => ({ ...current, model: event.target.value }))
              }
              placeholder="例如 gpt-5.6-luna"
              required
              aria-invalid={showModelFieldErrors && modelRequestNameMissing}
              aria-describedby={showModelFieldErrors && modelRequestNameMissing ? "admin-model-name-error" : undefined}
            />
            {showModelFieldErrors && modelRequestNameMissing ? (
              <small id="admin-model-name-error" className="admin-field-error">
                实际请求模型名不能为空
              </small>
            ) : null}
          </label>

          <div className="admin-model-mapping-preview" aria-label="模型名称映射预览">
            <span>
              <small>前台显示</small>
              <strong>{modelForm.label.trim() || "未填写"}</strong>
            </span>
            <ArrowRight size={17} aria-hidden="true" />
            <span>
              <small>实际请求</small>
              <strong>
                {vendorLabel(modelForm.vendor)} / <code>{modelForm.model.trim() || "未填写"}</code>
              </strong>
            </span>
          </div>

          <fieldset className="admin-option-fieldset">
            <legend>模型能力</legend>
            <div className="admin-chip-group">
              {capabilityOptions.map((option) => (
                <label key={option.value} className="admin-chip-check">
                  <input
                    type="checkbox"
                    checked={modelForm.capabilities.includes(option.value)}
                    onChange={() =>
                      setModelForm((current) => ({
                        ...current,
                        capabilities: toggleArrayValue(current.capabilities, option.value)
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="admin-option-fieldset">
            <legend>默认用途</legend>
            <div className="admin-chip-group">
              {defaultForOptions.map((option) => (
                <label key={option.value} className="admin-chip-check">
                  <input
                    type="checkbox"
                    checked={modelForm.defaultFor.includes(option.value)}
                    onChange={() =>
                      setModelForm((current) => ({
                        ...current,
                        defaultFor: toggleArrayValue(current.defaultFor, option.value)
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={modelForm.enabled}
              onChange={(event) =>
                setModelForm((current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            启用模型
          </label>

          {modelForm.capabilities.includes("video") ? (
            <div className="admin-media-config">
              <strong>视频端点模板</strong>
              <label>
                生成路径
                <input
                  value={modelForm.mediaConfig?.generatePath || ""}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      mediaConfig: { ...(current.mediaConfig || {}), generatePath: event.target.value }
                    }))
                  }
                  placeholder="/video/generations"
                />
              </label>
              <label>
                状态路径
                <input
                  value={modelForm.mediaConfig?.statusPath || ""}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      mediaConfig: { ...(current.mediaConfig || {}), statusPath: event.target.value }
                    }))
                  }
                  placeholder="/video/generations/status"
                />
              </label>
              <label>
                任务 ID 路径
                <input
                  value={modelForm.mediaConfig?.idJsonPath || ""}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      mediaConfig: { ...(current.mediaConfig || {}), idJsonPath: event.target.value }
                    }))
                  }
                  placeholder="id 或 data.id"
                />
              </label>
              <label>
                状态字段路径
                <input
                  value={modelForm.mediaConfig?.statusJsonPath || ""}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      mediaConfig: { ...(current.mediaConfig || {}), statusJsonPath: event.target.value }
                    }))
                  }
                  placeholder="status"
                />
              </label>
              <label>
                资产 URL 路径
                <input
                  value={modelForm.mediaConfig?.assetJsonPath || ""}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      mediaConfig: { ...(current.mediaConfig || {}), assetJsonPath: event.target.value }
                    }))
                  }
                  placeholder="data[0].url"
                />
              </label>
            </div>
          ) : null}

          <div className="admin-form-actions">
            <button type="submit" className="primary-action">
              <Save size={16} />
              保存模型
            </button>
            {selectedModelId !== "new" ? (
              <button
                type="button"
                className="secondary-action danger-action"
                onClick={requestModelDelete}
              >
                <Trash2 size={16} />
                删除
              </button>
            ) : null}
          </div>
        </form>
      </section>
      ) : null}

      {activeSection === "assistants" ? (
      <section id="admin-section-assistants" className="admin-section">
        <div className="section-title">
          <Bot size={17} />
          <h2>助手库</h2>
        </div>
        <div className="provider-picker">
          <label htmlFor="admin-assistant-picker">
            <span>选择助手</span>
            <select
              id="admin-assistant-picker"
              value={selectedAssistantId}
              onChange={(event) => setSelectedAssistantId(event.target.value)}
            >
              {sortedAssistants.map((assistant) => (
                <option key={assistant.id} value={assistant.id}>
                  {assistant.category} / {assistant.name}{assistant.enabled ? "" : "（停用）"}
                </option>
              ))}
              <option value="new">新增助手</option>
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="新增助手"
            title="新增助手"
            onClick={() => {
              setSelectedAssistantId("new");
              setAssistantForm(emptyAssistantDraft);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <form className="provider-form" onSubmit={saveAssistant}>
          <label>
            助手名称
            <input
              value={assistantForm.name}
              onChange={(event) => setAssistantForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            描述
            <input
              value={assistantForm.description}
              onChange={(event) => setAssistantForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label>
            分类
            <input
              aria-label="助手分类"
              value={assistantForm.category}
              onChange={(event) => setAssistantForm((current) => ({ ...current, category: event.target.value }))}
            />
          </label>
          <label>
            标签
            <input
              aria-label="助手标签"
              value={assistantForm.tags}
              onChange={(event) => setAssistantForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="写作, 营销, 润色"
            />
          </label>
          <label>
            颜色
            <input
              type="color"
              value={assistantForm.color}
              onChange={(event) => setAssistantForm((current) => ({ ...current, color: event.target.value }))}
            />
          </label>
          <label>
            系统提示词
            <textarea
              value={assistantForm.systemPrompt}
              onChange={(event) => setAssistantForm((current) => ({ ...current, systemPrompt: event.target.value }))}
              rows={5}
            />
          </label>
          <label>
            开场问题
            <textarea
              aria-label="助手开场问题"
              value={assistantForm.starterPrompts}
              onChange={(event) => setAssistantForm((current) => ({ ...current, starterPrompts: event.target.value }))}
              rows={4}
              placeholder="每行一个可直接使用的问题"
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={assistantForm.enabled}
              onChange={(event) => setAssistantForm((current) => ({ ...current, enabled: event.target.checked }))}
            />
            前台启用
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="primary-action">
              <Save size={16} />
              保存助手
            </button>
            {selectedAssistantId !== "new" ? (
              <button type="button" className="secondary-action danger-action" onClick={requestAssistantDelete}>
                <Trash2 size={16} />
                删除
              </button>
            ) : null}
          </div>
        </form>
      </section>
      ) : null}

      {activeSection === "apps" ? (
      <section id="admin-section-apps" className="admin-section admin-app-section">
        <div className="section-title">
          <Layers3 size={17} />
          <h2>应用预设</h2>
        </div>
        <div className="provider-picker">
          <label htmlFor="admin-app-picker">
            <span>选择应用</span>
            <select id="admin-app-picker" value={selectedAppId} onChange={(event) => setSelectedAppId(event.target.value)}>
              {sortedApps.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.category} / {preset.name}
                </option>
              ))}
              <option value="new">新增应用</option>
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="新增应用"
            title="新增应用"
            onClick={() => {
              setSelectedAppId("new");
              setAppForm(emptyAppPresetDraft);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <form className="provider-form" onSubmit={saveAppPreset}>
          <label>
            应用名称
            <input value={appForm.name} onChange={(event) => setAppForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            分类
            <input value={appForm.category} onChange={(event) => setAppForm((current) => ({ ...current, category: event.target.value }))} />
          </label>
          <label>
            描述
            <input
              value={appForm.description}
              onChange={(event) => setAppForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label>
            应用提示词
            <textarea
              value={appForm.prompt}
              onChange={(event) => setAppForm((current) => ({ ...current, prompt: event.target.value }))}
              rows={5}
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={appForm.enabled}
              onChange={(event) => setAppForm((current) => ({ ...current, enabled: event.target.checked }))}
            />
            前台启用
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="primary-action">
              <Save size={16} />
              保存应用
            </button>
            {selectedAppId !== "new" ? (
              <button type="button" className="secondary-action danger-action" onClick={requestAppPresetDelete}>
                <Trash2 size={16} />
                删除
              </button>
            ) : null}
          </div>
        </form>
      </section>
      ) : null}

      {activeSection === "prompts" ? (
      <section id="admin-section-prompts" className="admin-section admin-prompt-section">
        <div className="section-title">
          <FileText size={17} />
          <h2>提示词预设</h2>
        </div>
        <div className="provider-picker">
          <label htmlFor="admin-prompt-picker">
            <span>选择提示词</span>
            <select
              id="admin-prompt-picker"
              value={selectedPromptId}
              onChange={(event) => setSelectedPromptId(event.target.value)}
            >
              {sortedPromptPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.moduleId} / {preset.title}
                </option>
              ))}
              <option value="new">新增预设</option>
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="新增提示词预设"
            title="新增提示词预设"
            onClick={() => {
              setSelectedPromptId("new");
              setPromptForm(emptyPromptPresetDraft);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <form className="provider-form" onSubmit={savePromptPreset}>
          <label>
            所属功能
            <select
              value={promptForm.moduleId}
              onChange={(event) =>
                setPromptForm((current) => ({ ...current, moduleId: event.target.value as ModuleId }))
              }
            >
              {promptModuleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            按钮标题
            <input
              value={promptForm.title}
              onChange={(event) => setPromptForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            提示词内容
            <textarea
              value={promptForm.prompt}
              onChange={(event) => setPromptForm((current) => ({ ...current, prompt: event.target.value }))}
              rows={4}
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={promptForm.enabled}
              onChange={(event) => setPromptForm((current) => ({ ...current, enabled: event.target.checked }))}
            />
            前台启用
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="primary-action">
              <Save size={16} />
              保存预设
            </button>
            {selectedPromptId !== "new" ? (
              <button type="button" className="secondary-action danger-action" onClick={requestPromptPresetDelete}>
                <Trash2 size={16} />
                删除
              </button>
            ) : null}
          </div>
        </form>
      </section>
      ) : null}

      {activeSection === "audit" ? (
      <section id="admin-section-audit" className="admin-section">
        <div className="section-title">
          <FileText size={17} />
          <h2>审计记录</h2>
        </div>
        <div className="admin-filter-row">
          <label>
            操作类型
            <input
              value={auditActionFilter}
              placeholder="model-update"
              onChange={(event) => setAuditActionFilter(event.target.value)}
            />
          </label>
          <label>
            记录数量
            <input
              type="number"
              min={1}
              max={1000}
              value={auditLimit}
              onChange={(event) => setAuditLimit(Number(event.target.value) || 80)}
            />
          </label>
          <button type="button" className="secondary-action compact-action" onClick={() => void loadAuditLog()}>
            查询
          </button>
          <button type="button" className="secondary-action compact-action" onClick={exportVisibleAuditLog} disabled={!auditLog.length}>
            <Download size={15} />
            导出
          </button>
        </div>
        {auditLog.length ? (
          <div className="admin-audit-list">
            {auditLog.slice(0, 12).map((item) => (
              <p key={item.id}>
                <strong>{item.action}</strong>
                <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                <code>{JSON.stringify(item.details).slice(0, 120)}</code>
              </p>
            ))}
          </div>
        ) : null}
      </section>
      ) : null}

          </div>
        </div>
      </div>

      <AdminConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.title || ""}
        description={confirmation?.description || ""}
        confirmLabel={confirmation?.confirmLabel || "确认"}
        busy={confirmationBusy}
        onCancel={closeConfirmation}
        onConfirm={() => void runConfirmedAction()}
      />
    </div>
  );
}

export default AdminConsole;
