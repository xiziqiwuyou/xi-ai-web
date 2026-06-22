import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Layers3,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
  ToggleLeft,
  Trash2,
  Upload
} from "lucide-react";
import { api, type ModelCatalogPayload } from "../../api";
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
      const confirmed = window.confirm(
        [
          "导入预检已通过，是否应用？",
          `菜单 ${preview.counts.menuItems || 0}、模型 ${preview.counts.modelCatalog || 0}、助手 ${preview.counts.assistants || 0}`,
          preview.changed.length ? `变化：${preview.changed.join("；")}` : "数量无明显变化",
          preview.warnings.length ? `警告：${preview.warnings.join("；")}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      );
      if (!confirmed) {
        onNotice("已取消导入，当前数据未改变");
        return;
      }
      const nextBootstrap = await api.importAdminMetadata(payload);
      onBootstrapChange(nextBootstrap);
      await onPublicRefresh();
      onNotice("后台元数据已导入");
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
    const confirmed = window.confirm(`确认恢复备份 ${backup.name}？当前数据会先自动保存一份 pre-restore 备份。`);
    if (!confirmed) return;
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

  const deleteModelEntry = async () => {
    if (selectedModelId === "new") return;
    onError("");
    onNotice("");
    try {
      await api.deleteModelEntry(selectedModelId);
      const modelCatalog = bootstrap.modelCatalog.filter((entry) => entry.id !== selectedModelId);
      onBootstrapChange({ ...bootstrap, modelCatalog });
      setSelectedModelId(modelCatalog[0]?.id || "new");
      await onPublicRefresh();
      onNotice("模型已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "模型删除失败");
    }
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

  const deleteAssistant = async () => {
    if (selectedAssistantId === "new") return;
    onError("");
    onNotice("");
    try {
      await api.deleteAssistant(selectedAssistantId);
      const assistants = bootstrap.assistants.filter((entry) => entry.id !== selectedAssistantId);
      onBootstrapChange({ ...bootstrap, assistants });
      setSelectedAssistantId(assistants[0]?.id || "new");
      await onPublicRefresh();
      onNotice("助手已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "助手删除失败");
    }
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

  const deleteAppPreset = async () => {
    if (selectedAppId === "new") return;
    onError("");
    onNotice("");
    try {
      await api.deleteAppPreset(selectedAppId);
      const appPresets = bootstrap.appPresets.filter((entry) => entry.id !== selectedAppId);
      onBootstrapChange({ ...bootstrap, appPresets });
      setSelectedAppId(appPresets[0]?.id || "new");
      await onPublicRefresh();
      onNotice("应用已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "应用删除失败");
    }
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

  const deletePromptPreset = async () => {
    if (selectedPromptId === "new") return;
    onError("");
    onNotice("");
    try {
      await api.deletePromptPreset(selectedPromptId);
      const promptPresets = bootstrap.promptPresets.filter((entry) => entry.id !== selectedPromptId);
      onBootstrapChange({ ...bootstrap, promptPresets });
      setSelectedPromptId(promptPresets[0]?.id || "new");
      await onPublicRefresh();
      onNotice("提示词预设已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "提示词预设删除失败");
    }
  };

  return (
    <div className="admin-console">
      <section className="admin-section admin-ops-panel">
        <div className="section-title">
          <ServerCog size={17} />
          <strong>运营工具</strong>
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
              <button type="button" className="secondary-action compact-action" onClick={() => void restoreBackup(backup)}>
                <RotateCcw size={15} />
                恢复
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <div className="section-title">
          <ServerCog size={17} />
          <strong>工具权限</strong>
        </div>
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
        <button type="button" className="primary-action" onClick={() => void saveToolSettings()} disabled={!toolDraft.length}>
          <Save size={16} />
          保存工具权限
        </button>
      </section>

      <section className="admin-section">
        <div className="section-title">
          <FileText size={17} />
          <strong>审计记录</strong>
        </div>
        <div className="admin-filter-row">
          <label>
            Action
            <input
              value={auditActionFilter}
              placeholder="model-update"
              onChange={(event) => setAuditActionFilter(event.target.value)}
            />
          </label>
          <label>
            Limit
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

      <section className="admin-section">
        <div className="section-title">
          <ServerCog size={17} />
          <strong>系统设置</strong>
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

      <section className="admin-section">
        <div className="section-title">
          <ToggleLeft size={17} />
          <strong>菜单管理</strong>
        </div>
        <div className="menu-editor">
          {sortedMenus.map((item) => (
            <article key={item.id} className="menu-edit-row">
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

      <section className="admin-section">
        <div className="section-title">
          <Layers3 size={17} />
          <strong>模型目录</strong>
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
          <select
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
          <button
            type="button"
            className="icon-button"
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

          <div className="admin-chip-group" aria-label="模型能力">
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

          <div className="admin-chip-group" aria-label="默认用途">
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
                onClick={() => void deleteModelEntry()}
              >
                <Trash2 size={16} />
                删除
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-section">
        <div className="section-title">
          <Bot size={17} />
          <strong>助手库</strong>
        </div>
        <div className="provider-picker">
          <select value={selectedAssistantId} onChange={(event) => setSelectedAssistantId(event.target.value)}>
            {sortedAssistants.map((assistant) => (
              <option key={assistant.id} value={assistant.id}>
                {assistant.name}
              </option>
            ))}
            <option value="new">新增助手</option>
          </select>
          <button
            type="button"
            className="icon-button"
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
              <button type="button" className="secondary-action danger-action" onClick={() => void deleteAssistant()}>
                <Trash2 size={16} />
                删除
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-section">
        <div className="section-title">
          <Layers3 size={17} />
          <strong>应用预设</strong>
        </div>
        <div className="provider-picker">
          <select value={selectedAppId} onChange={(event) => setSelectedAppId(event.target.value)}>
            {sortedApps.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.category} / {preset.name}
              </option>
            ))}
            <option value="new">新增应用</option>
          </select>
          <button
            type="button"
            className="icon-button"
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
              <button type="button" className="secondary-action danger-action" onClick={() => void deleteAppPreset()}>
                <Trash2 size={16} />
                删除
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-section">
        <div className="section-title">
          <FileText size={17} />
          <strong>提示词预设</strong>
        </div>
        <div className="provider-picker">
          <select value={selectedPromptId} onChange={(event) => setSelectedPromptId(event.target.value)}>
            {sortedPromptPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.moduleId} / {preset.title}
              </option>
            ))}
            <option value="new">新增预设</option>
          </select>
          <button
            type="button"
            className="icon-button"
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
              <button type="button" className="secondary-action danger-action" onClick={() => void deletePromptPreset()}>
                <Trash2 size={16} />
                删除
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {notice ? (
        <p className="admin-notice">
          <CheckCircle2 size={15} />
          {notice}
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      <button type="button" className="secondary-action" onClick={() => void onLogout()}>
        退出后台
      </button>
    </div>
  );
}

export default AdminConsole;
