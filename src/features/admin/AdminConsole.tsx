import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Home,
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
  Upload
} from "lucide-react";
import { api, type ModelCatalogPayload } from "../../api";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
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
  color: string;
  systemPrompt: string;
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

type AdminSectionId = "overview" | "site" | "models" | "content" | "audit";

type AdminConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
};

const adminNavigationGroups: Array<{
  label: string;
  items: Array<{
    id: AdminSectionId;
    label: string;
    icon: typeof Activity;
  }>;
}> = [
  {
    label: "运营",
    items: [{ id: "overview", label: "概览与运维", icon: Activity }]
  },
  {
    label: "配置",
    items: [
      { id: "site", label: "站点与菜单", icon: Settings },
      { id: "models", label: "模型目录", icon: Layers3 }
    ]
  },
  {
    label: "内容",
    items: [{ id: "content", label: "助手与预设", icon: Bot }]
  },
  {
    label: "记录",
    items: [{ id: "audit", label: "审计记录", icon: FileText }]
  }
];

const adminSectionDetails: Record<AdminSectionId, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "OVERVIEW",
    title: "概览与运维",
    description: "检查运行状态、备份和工具权限。"
  },
  site: {
    eyebrow: "SITE",
    title: "站点与菜单",
    description: "维护站点名称和前台功能入口。"
  },
  models: {
    eyebrow: "MODELS",
    title: "模型目录",
    description: "配置前台可选择的厂商、模型与能力。"
  },
  content: {
    eyebrow: "CONTENT",
    title: "助手与预设",
    description: "维护助手、应用和提示词内容。"
  },
  audit: {
    eyebrow: "AUDIT",
    title: "审计记录",
    description: "查询并导出后台操作记录。"
  }
};

const adminSectionElementIds: Record<AdminSectionId, string> = {
  overview: "admin-section-overview",
  site: "admin-section-site",
  models: "admin-section-models",
  content: "admin-section-content",
  audit: "admin-section-audit"
};

const vendorOptions: Array<{ value: ProviderKind; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "openai-compatible", label: "OpenAI Compatible" }
];

const capabilityOptions: Array<{ value: ModelCapability; label: string }> = [
  { value: "chat", label: "对话" },
  { value: "vision", label: "多模态" },
  { value: "image", label: "画图" },
  { value: "tts", label: "语音合成" },
  { value: "stt", label: "语音识别" },
  { value: "audio", label: "音频" },
  { value: "video", label: "视频" },
  { value: "embedding", label: "向量" },
  { value: "fileSearch", label: "检索" },
  { value: "toolCalling", label: "工具" },
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
  model: "gpt-4.1-mini",
  label: "GPT-4.1 Mini",
  capabilities: ["chat", "vision", "toolCalling", "streaming"],
  defaultFor: [],
  enabled: true,
  mediaConfig: {}
};

const emptyAssistantDraft: AssistantDraft = {
  name: "新助手",
  description: "适合一个具体场景的助手。",
  color: "#ff2442",
  systemPrompt: "你是一个可靠的中文 AI 助手。回答要清晰、准确、可执行。"
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
    color: entry.color,
    systemPrompt: entry.systemPrompt
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
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SiteSettings>(bootstrap.settings);
  const [menuDraft, setMenuDraft] = useState<MenuItem[]>(bootstrap.menuItems);
  const [selectedModelId, setSelectedModelId] = useState<string | "new">(
    bootstrap.modelCatalog[0]?.id || "new"
  );
  const selectedModel = bootstrap.modelCatalog.find((entry) => entry.id === selectedModelId);
  const [modelForm, setModelForm] = useState<ModelDraft>(modelDraft(selectedModel));
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
    setModelForm(modelDraft(selectedModel));
  }, [selectedModel]);

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
    () => [...bootstrap.assistants].sort((a, b) => a.name.localeCompare(b.name)),
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

  const openSection = (sectionId: AdminSectionId) => {
    setActiveSection(sectionId);
    window.requestAnimationFrame(() => {
      document.getElementById(adminSectionElementIds[sectionId])?.scrollIntoView({ block: "start" });
    });
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
    const payload: ModelCatalogPayload = {
      ...modelForm,
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
          ? await api.createAssistant(assistantForm)
          : await api.updateAssistant(selectedAssistantId, assistantForm);
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
            {adminNavigationGroups.map((group) => (
              <div key={group.label} className="admin-nav-group">
                <p>{group.label}</p>
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
            ))}
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

      <section className="admin-section admin-tools-section">
        <div className="section-title">
          <ServerCog size={17} />
          <h2>工具权限</h2>
        </div>
        <fieldset className="admin-option-fieldset">
          <legend>可用工具</legend>
          <div className="admin-chip-group">
            {toolDraft.map((tool) => (
              <label key={tool.name} className="admin-chip-check">
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
                {tool.label}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" className="primary-action" onClick={() => void saveToolSettings()} disabled={!toolDraft.length}>
          <Save size={16} />
          保存工具权限
        </button>
      </section>

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

      <section className="admin-section admin-menu-section">
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
        <div className="model-preset-strip">
          {modelCatalogPresets.map((preset) => (
            <button key={preset.id} type="button" onClick={() => applyModelPreset(preset.id)}>
              <Plus size={14} />
              {preset.label}
            </button>
          ))}
        </div>
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
              onChange={(event) => setSelectedModelId(event.target.value)}
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
              setModelForm(emptyModelDraft);
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        <form className="provider-form" onSubmit={saveModelEntry}>
          <label>
            厂商协议
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
          <label>
            展示名称
            <input
              value={modelForm.label}
              onChange={(event) =>
                setModelForm((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="例如 GPT-4.1 Mini"
            />
          </label>
          <label>
            模型名称
            <input
              value={modelForm.model}
              onChange={(event) =>
                setModelForm((current) => ({ ...current, model: event.target.value }))
              }
              placeholder="例如 gpt-4.1-mini"
            />
          </label>

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

      <section id="admin-section-content" className="admin-section">
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
                  {assistant.name}
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

      <section className="admin-section admin-app-section">
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

      <section className="admin-section admin-prompt-section">
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
