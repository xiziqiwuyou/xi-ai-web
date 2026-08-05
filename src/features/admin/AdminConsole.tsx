import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Home,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { api, type ModelCatalogPayload } from "../../api";
import { sortModelsByOrder } from "../../components/workbench/model-utils";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import AdminNavigation from "./AdminNavigation";
import { AdminMenusSection, AdminSiteSection, AdminToolsSection } from "./AdminBasicSections";
import { AdminAppsSection } from "./AdminAppsSection";
import { AdminAssistantsSection } from "./AdminAssistantsSection";
import { AdminAuditSection } from "./AdminAuditSection";
import { AdminLangflowSection } from "./AdminLangflowSection";
import { AdminModelsSection } from "./AdminModelsSection";
import { AdminOverviewSection } from "./AdminOverviewSection";
import { AdminPromptsSection } from "./AdminPromptsSection";
import {
  KnowledgeAdminSection,
  type KnowledgeAdminSectionId
} from "./KnowledgeAdminSection";
import { validateModelCatalog } from "./adminValidation";
import { modelCatalogPresets } from "./modelCatalogPresets";
import {
  adminNavigationGroups,
  adminSectionDetails,
  appPresetDraft,
  assistantDraft,
  assistantPayload,
  defaultEndpointProtocolForVendor,
  downloadJson,
  emptyAppPresetDraft,
  emptyAssistantDraft,
  emptyLangflowWorkflowDraft,
  emptyModelDraft,
  emptyPromptPresetDraft,
  langflowWorkflowDraft,
  langflowWorkflowPayload,
  modelDraft,
  promptPresetDraft,
  toggleArrayValue,
  type AdminConfirmation,
  type AdminNavigationGroupId,
  type AdminSectionId,
  type AppPresetDraft,
  type AssistantDraft,
  type LangflowWorkflowDraft,
  type ModelDraft,
  type PromptPresetDraft
} from "./adminConsoleConfig";
import type {
  AdminAuditEntry,
  AdminBackupItem,
  AdminBootstrapPayload,
  AdminLangflowWorkflow,
  AdminOpsPayload,
  AppPreset,
  Assistant,
  MenuItem,
  ModelCapability,
  ModelVendorEntry,
  ModuleId,
  PromptPreset,
  ProviderKind,
  SiteSettings,
  ToolSetting
} from "../../types";
import type { AdminCredentialUpdate } from "../../types";


export function AdminConsole({
  bootstrap,
  notice,
  error,
  onNotice,
  onError,
  onBootstrapChange,
  onPublicRefresh,
  onLogout,
  onCredentialsChanged
}: {
  bootstrap: AdminBootstrapPayload;
  notice: string;
  error: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onBootstrapChange: (payload: AdminBootstrapPayload) => void;
  onPublicRefresh: () => Promise<unknown>;
  onLogout: () => Promise<void>;
  onCredentialsChanged: (username: string) => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSectionId>("overview");
  const [expandedNavigationGroups, setExpandedNavigationGroups] = useState<AdminNavigationGroupId[]>([
    "overview"
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
  const [selectedLangflowWorkflowId, setSelectedLangflowWorkflowId] = useState<string | "new">(
    bootstrap.langflowWorkflows[0]?.id || "new"
  );
  const selectedLangflowWorkflow = bootstrap.langflowWorkflows.find(
    (entry) => entry.id === selectedLangflowWorkflowId
  );
  const [langflowWorkflowForm, setLangflowWorkflowForm] = useState<LangflowWorkflowDraft>(
    langflowWorkflowDraft(selectedLangflowWorkflow)
  );
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
    setLangflowWorkflowForm(langflowWorkflowDraft(selectedLangflowWorkflow));
  }, [selectedLangflowWorkflow]);

  useEffect(() => {
    void loadOperations();
  }, []);

  const sortedMenus = useMemo(() => [...menuDraft].sort((a, b) => a.order - b.order), [menuDraft]);
  const sortedCatalog = useMemo(() => sortModelsByOrder(bootstrap.modelCatalog), [bootstrap.modelCatalog]);
  const sortedModelVendors = useMemo(
    () => [...bootstrap.modelVendors].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN")),
    [bootstrap.modelVendors]
  );
  const modelIssues = useMemo(
    () => validateModelCatalog(bootstrap.modelCatalog, bootstrap.menuItems),
    [bootstrap.menuItems, bootstrap.modelCatalog]
  );
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
  const sortedLangflowWorkflows = useMemo(
    () => [...bootstrap.langflowWorkflows].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh-CN")),
    [bootstrap.langflowWorkflows]
  );
  const activeSectionDetails = adminSectionDetails[activeSection];
  const activeNavigationGroup = adminNavigationGroups.find((group) =>
    group.items.some((item) => item.id === activeSection)
  );
  const modelDisplayNameMissing = !modelForm.label.trim();
  const modelRequestNameMissing = !modelForm.model.trim();
  const modelContextWindowInvalid = !Number.isFinite(modelForm.contextWindowTokens) || modelForm.contextWindowTokens < 4096;
  const modelMaxInputCharactersInvalid = !Number.isFinite(modelForm.maxInputCharacters) || modelForm.maxInputCharacters < 1000;

  const openSection = (sectionId: AdminSectionId) => {
    const group = adminNavigationGroups.find((item) =>
      item.items.some((navigationItem) => navigationItem.id === sectionId)
    );
    if (group) {
      setExpandedNavigationGroups([group.id]);
    }
    setActiveSection(sectionId);
    window.requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const toggleNavigationGroup = (groupId: AdminNavigationGroupId) => {
    setExpandedNavigationGroups((current) =>
      current.includes(groupId)
        ? []
        : [groupId]
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

  const applyModelPreset = (presetId: string, vendor: ModelVendorEntry) => {
    const preset = modelCatalogPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedModelId("new");
    setShowModelFieldErrors(false);
    setModelForm({
      vendorId: vendor.id,
      vendor: vendor.adapter,
      endpointProtocol: preset.endpointProtocol,
      model: preset.model,
      label: preset.label,
      capabilities: preset.capabilities,
      defaultFor: preset.defaultFor,
      enabled: true,
      contextWindowTokens: preset.contextWindowTokens || 128000,
      maxInputCharacters: preset.maxInputCharacters || 100000,
      mediaConfig: preset.mediaConfig || {}
    });
  };

  const createModelVendor = async (label: string, adapter: ProviderKind): Promise<ModelVendorEntry> => {
    onError("");
    onNotice("");
    try {
      const vendor = await api.createModelVendor({ label, adapter });
      onBootstrapChange({ ...bootstrap, modelVendors: [...bootstrap.modelVendors, vendor] });
      setSelectedModelId("new");
      setShowModelFieldErrors(false);
      setModelForm({
        ...emptyModelDraft,
        vendorId: vendor.id,
        vendor: vendor.adapter,
        endpointProtocol: defaultEndpointProtocolForVendor(vendor.adapter)
      });
      onNotice("模型厂商已新增");
      return vendor;
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "模型厂商新增失败");
      throw err;
    }
  };

  const deleteModelVendor = async (vendorId: string) => {
    onError("");
    onNotice("");
    try {
      await api.deleteModelVendor(vendorId);
      const modelVendors = bootstrap.modelVendors.filter((vendor) => vendor.id !== vendorId);
      onBootstrapChange({ ...bootstrap, modelVendors });
      if (modelForm.vendorId === vendorId && modelVendors[0]) {
        const nextVendor = modelVendors[0];
        setSelectedModelId("new");
        setShowModelFieldErrors(false);
        setModelForm({
          ...emptyModelDraft,
          vendorId: nextVendor.id,
          vendor: nextVendor.adapter,
          endpointProtocol: defaultEndpointProtocolForVendor(nextVendor.adapter)
        });
      }
      onNotice("模型厂商已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "模型厂商删除失败");
    }
  };

  const reorderModelVendors = async (vendorIds: string[]) => {
    onError("");
    onNotice("");
    try {
      const modelVendors = await api.reorderModelVendors(vendorIds);
      onBootstrapChange({ ...bootstrap, modelVendors });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "模型厂商排序保存失败";
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const requestModelVendorDelete = (vendor: ModelVendorEntry) => {
    const count = bootstrap.modelCatalog.filter((entry) => entry.vendorId === vendor.id).length;
    if (count || bootstrap.modelVendors.length <= 1) return;
    requestConfirmation({
      title: `删除模型厂商“${vendor.label}”？`,
      description: "删除后该厂商会从模型目录移除，且无法在后台直接撤销。",
      confirmLabel: "删除厂商",
      action: () => deleteModelVendor(vendor.id)
    });
  };

  const applyBootstrapReplacement = (nextBootstrap: AdminBootstrapPayload) => {
    const retainedModel = selectedModelId === "new"
      ? undefined
      : nextBootstrap.modelCatalog.find((entry) => entry.id === selectedModelId);
    const nextModel = retainedModel || nextBootstrap.modelCatalog[0];

    onBootstrapChange(nextBootstrap);
    setShowModelFieldErrors(false);
    if (nextModel) {
      setSelectedModelId(nextModel.id);
      setModelForm(modelDraft(nextModel));
      return;
    }

    const firstVendor = nextBootstrap.modelVendors[0];
    setSelectedModelId("new");
    setModelForm(firstVendor
      ? {
          ...emptyModelDraft,
          vendorId: firstVendor.id,
          vendor: firstVendor.adapter,
          endpointProtocol: defaultEndpointProtocolForVendor(firstVendor.adapter)
        }
      : { ...emptyModelDraft });
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
          `将导入菜单 ${preview.counts.menuItems || 0} 项、厂商 ${preview.counts.modelVendors || 0} 项、模型 ${preview.counts.modelCatalog || 0} 项、助手 ${preview.counts.assistants || 0} 项。`,
          preview.changed.length ? `变化：${preview.changed.join("；")}` : "数量无明显变化。",
          preview.warnings.length ? `警告：${preview.warnings.join("；")}` : "应用前会自动创建备份。"
        ].join("\n"),
        confirmLabel: "确认导入",
        action: async () => {
          try {
            const nextBootstrap = await api.importAdminMetadata(payload);
            applyBootstrapReplacement(nextBootstrap);
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
      applyBootstrapReplacement(metadata);
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
    if (!label || !model || modelContextWindowInvalid || modelMaxInputCharactersInvalid) {
      onError(
        modelMaxInputCharactersInvalid
          ? "模型最大输入字符数不能小于 1,000"
          : modelContextWindowInvalid
          ? "模型上下文窗口不能小于 4,096 Token"
          : !label && !model
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
      contextWindowTokens: Math.trunc(modelForm.contextWindowTokens),
      maxInputCharacters: Math.trunc(modelForm.maxInputCharacters),
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

  const reorderModelCatalog = async (modelIds: string[]) => {
    onError("");
    onNotice("");
    try {
      const modelCatalog = await api.reorderModelCatalog(modelIds);
      onBootstrapChange({ ...bootstrap, modelCatalog });
      await onPublicRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "模型排序保存失败";
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const deleteModelEntry = async (modelId: string) => {
    onError("");
    onNotice("");
    try {
      await api.deleteModelEntry(modelId);
      const deletedModel = bootstrap.modelCatalog.find((entry) => entry.id === modelId);
      const modelCatalog = bootstrap.modelCatalog.filter((entry) => entry.id !== modelId);
      onBootstrapChange({ ...bootstrap, modelCatalog });
      const deletedVendorId = deletedModel?.vendorId || modelForm.vendorId;
      const deletedVendor = bootstrap.modelVendors.find((vendor) => vendor.id === deletedVendorId);
      const nextVendorModel = modelCatalog.find((entry) => entry.vendorId === deletedVendorId);
      if (nextVendorModel) {
        setSelectedModelId(nextVendorModel.id);
      } else {
        setSelectedModelId("new");
        setModelForm({
          ...emptyModelDraft,
          vendorId: deletedVendorId,
          vendor: deletedVendor?.adapter || modelForm.vendor,
          endpointProtocol: defaultEndpointProtocolForVendor(deletedVendor?.adapter || modelForm.vendor)
        });
      }
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

  const saveLangflowWorkflow = async (event: FormEvent) => {
    event.preventDefault();
    onError("");
    onNotice("");
    const payload = langflowWorkflowPayload(langflowWorkflowForm);
    if (!payload.flowId || !payload.name) {
      onError("请填写 Langflow Flow ID 和前台显示名称");
      return;
    }
    try {
      const workflow = selectedLangflowWorkflowId === "new"
        ? await api.createLangflowWorkflow(payload)
        : await api.updateLangflowWorkflow(selectedLangflowWorkflowId, payload);
      const langflowWorkflows = selectedLangflowWorkflowId === "new"
        ? [workflow, ...bootstrap.langflowWorkflows]
        : bootstrap.langflowWorkflows.map((item) => (item.id === workflow.id ? workflow : item));
      onBootstrapChange({ ...bootstrap, langflowWorkflows });
      setSelectedLangflowWorkflowId(workflow.id);
      await onPublicRefresh();
      onNotice("Langflow 工作流已保存");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Langflow 工作流保存失败");
    }
  };

  const deleteLangflowWorkflow = async (workflowId: string) => {
    onError("");
    onNotice("");
    try {
      await api.deleteLangflowWorkflow(workflowId);
      const langflowWorkflows = bootstrap.langflowWorkflows.filter((item) => item.id !== workflowId);
      onBootstrapChange({ ...bootstrap, langflowWorkflows });
      setSelectedLangflowWorkflowId(langflowWorkflows[0]?.id || "new");
      await onPublicRefresh();
      onNotice("Langflow 工作流已删除");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Langflow 工作流删除失败");
    }
  };

  const requestLangflowWorkflowDelete = () => {
    if (selectedLangflowWorkflowId === "new" || !selectedLangflowWorkflow) return;
    requestConfirmation({
      title: `删除工作流“${selectedLangflowWorkflow.name}”？`,
      description: "只会取消 xi-ai-web 的发布映射，不会删除 Langflow 中的原始 Flow。",
      confirmLabel: "删除发布映射",
      action: () => deleteLangflowWorkflow(selectedLangflowWorkflow.id)
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
        <AdminNavigation
          activeSection={activeSection}
          expandedGroups={expandedNavigationGroups}
          onToggleGroup={toggleNavigationGroup}
          onOpenSection={openSection}
        />

        <div
          ref={contentScrollRef}
          className={`admin-console ${activeSection === "models" ? "is-models-active" : ""}`}
          data-scroll-owner
        >
          <div className={`admin-console-inner ${activeSection === "models" ? "is-models-active" : ""}`}>
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
              <span>{activeNavigationGroup?.label || "后台管理"}</span>
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
        <AdminOverviewSection
          importInputRef={importInputRef}
          opsSummary={opsSummary}
          backups={backups}
          opsLoading={opsLoading}
          onExportMetadata={exportMetadata}
          onImportFile={importMetadataFile}
          onReload={loadOperations}
          onRestoreBackup={requestBackupRestore}
        />
      ) : null}

{activeSection === "tools" ? (
        <AdminToolsSection
          tools={toolDraft}
          onEnabledChange={(name, enabled) => setToolDraft((current) => current.map((item) => item.name === name ? { ...item, enabled } : item))}
          onSave={() => void saveToolSettings()}
        />
      ) : null}

{activeSection === "site" ? (
        <AdminSiteSection
          adminUsername={bootstrap.adminUsername}
          settings={settingsDraft}
          onChange={(patch) => setSettingsDraft((current) => ({ ...current, ...patch }))}
          onSave={() => void saveSettings()}
          onCredentialsSave={async (credentials: AdminCredentialUpdate) => {
            const result = await api.updateAdminCredentials(credentials);
            onCredentialsChanged(result.username);
          }}
        />
      ) : null}

{activeSection === "menus" ? (
        <AdminMenusSection
          items={sortedMenus}
          onChange={(id, patch) => setMenuDraft((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))}
          onSave={() => void saveMenus()}
        />
      ) : null}

      {activeSection === "models" ? (
        <AdminModelsSection
          catalog={sortedCatalog}
          vendors={sortedModelVendors}
          modelIssues={modelIssues}
          selectedModelId={selectedModelId}
          form={modelForm}
          showFieldErrors={showModelFieldErrors}
          displayNameMissing={modelDisplayNameMissing}
          requestNameMissing={modelRequestNameMissing}
          contextWindowInvalid={modelContextWindowInvalid}
          maxInputCharactersInvalid={modelMaxInputCharactersInvalid}
          onApplyPreset={applyModelPreset}
          onCreateVendor={createModelVendor}
          onDeleteVendor={requestModelVendorDelete}
          onReorderVendors={reorderModelVendors}
          onReorder={reorderModelCatalog}
          onSelect={(modelId) => {
            setSelectedModelId(modelId);
            setShowModelFieldErrors(false);
            if (modelId === "new") setModelForm(emptyModelDraft);
          }}
          onCreate={(vendor) => {
            setSelectedModelId("new");
            setShowModelFieldErrors(false);
            setModelForm({
              ...emptyModelDraft,
              vendorId: vendor.id,
              vendor: vendor.adapter,
              endpointProtocol: defaultEndpointProtocolForVendor(vendor.adapter)
            });
          }}
          onChange={(patch) => setModelForm((current) => ({ ...current, ...patch }))}
          onCapabilityToggle={(capability) =>
            setModelForm((current) => ({
              ...current,
              capabilities: toggleArrayValue(current.capabilities, capability)
            }))
          }
          onMediaConfigChange={(patch) =>
            setModelForm((current) => ({
              ...current,
              mediaConfig: { ...(current.mediaConfig || {}), ...patch }
            }))
          }
          onSubmit={saveModelEntry}
          onDelete={requestModelDelete}
        />
      ) : null}

      {activeSection === "assistants" ? (
        <AdminAssistantsSection
          assistants={sortedAssistants}
          selectedAssistantId={selectedAssistantId}
          form={assistantForm}
          onSelect={setSelectedAssistantId}
          onCreate={() => {
            setSelectedAssistantId("new");
            setAssistantForm(emptyAssistantDraft);
          }}
          onChange={(patch) => setAssistantForm((current) => ({ ...current, ...patch }))}
          onSubmit={saveAssistant}
          onDelete={requestAssistantDelete}
        />
      ) : null}

      {activeSection === "apps" ? (
        <AdminAppsSection
          apps={sortedApps}
          selectedAppId={selectedAppId}
          form={appForm}
          onSelect={setSelectedAppId}
          onCreate={() => {
            setSelectedAppId("new");
            setAppForm(emptyAppPresetDraft);
          }}
          onChange={(patch) => setAppForm((current) => ({ ...current, ...patch }))}
          onSubmit={saveAppPreset}
          onDelete={requestAppPresetDelete}
        />
      ) : null}

      {activeSection === "prompts" ? (
        <AdminPromptsSection
          prompts={sortedPromptPresets}
          selectedPromptId={selectedPromptId}
          form={promptForm}
          onSelect={setSelectedPromptId}
          onCreate={() => {
            setSelectedPromptId("new");
            setPromptForm(emptyPromptPresetDraft);
          }}
          onChange={(patch) => setPromptForm((current) => ({ ...current, ...patch }))}
          onSubmit={savePromptPreset}
          onDelete={requestPromptPresetDelete}
        />
      ) : null}

      {activeSection === "workflows" ? (
        <AdminLangflowSection
          langflow={bootstrap.langflow}
          workflows={sortedLangflowWorkflows}
          selectedWorkflowId={selectedLangflowWorkflowId}
          form={langflowWorkflowForm}
          onSelect={setSelectedLangflowWorkflowId}
          onCreate={() => {
            setSelectedLangflowWorkflowId("new");
            setLangflowWorkflowForm(emptyLangflowWorkflowDraft);
          }}
          onChange={(patch) => setLangflowWorkflowForm((current) => ({ ...current, ...patch }))}
          onSubmit={saveLangflowWorkflow}
          onDelete={requestLangflowWorkflowDelete}
        />
      ) : null}

      {activeSection === "audit" ? (
        <AdminAuditSection
          auditLog={auditLog}
          actionFilter={auditActionFilter}
          limit={auditLimit}
          onActionFilterChange={setAuditActionFilter}
          onLimitChange={setAuditLimit}
          onLoad={loadAuditLog}
          onExport={exportVisibleAuditLog}
        />
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
