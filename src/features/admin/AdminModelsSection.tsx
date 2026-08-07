import { useEffect, useMemo, useRef, useState, type FormEventHandler, type UIEventHandler } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CirclePlus,
  Cpu,
  GripVertical,
  Plus,
  Save,
  Trash2
} from "lucide-react";
import { modelCatalogPresets } from "./modelCatalogPresets";
import {
  capabilityOptions,
  endpointProtocolDetails,
  endpointProtocolOptions,
  vendorOptions,
  type ModelDraft
} from "./adminConsoleConfig";
import type {
  ModelCapability,
  ModelCatalogEntry,
  ModelEndpointProtocol,
  ModelVendorEntry,
  ProviderKind
} from "../../types";

type AdminModelsSectionProps = {
  catalog: ModelCatalogEntry[];
  vendors: ModelVendorEntry[];
  modelIssues: string[];
  selectedModelId: string | "new";
  form: ModelDraft;
  showFieldErrors: boolean;
  displayNameMissing: boolean;
  requestNameMissing: boolean;
  contextWindowInvalid: boolean;
  maxOutputTokensInvalid: boolean;
  maxInputCharactersInvalid: boolean;
  onApplyPreset: (presetId: string, vendor: ModelVendorEntry) => void;
  onSelect: (modelId: string) => void;
  onCreate: (vendor: ModelVendorEntry) => void;
  onCreateVendor: (label: string, adapter: ProviderKind) => ModelVendorEntry | Promise<ModelVendorEntry>;
  onDeleteVendor: (vendor: ModelVendorEntry) => void;
  onReorderVendors: (vendorIds: string[]) => Promise<void>;
  onReorder: (modelIds: string[]) => Promise<void>;
  onChange: (patch: Partial<ModelDraft>) => void;
  onCapabilityToggle: (capability: ModelCapability) => void;
  onMediaConfigChange: (patch: Partial<NonNullable<ModelDraft["mediaConfig"]>>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onDelete: () => void;
};

const headlineCapabilities = new Set<ModelCapability>(["chat", "image", "video", "embedding", "tts", "stt"]);

function modelCapabilitySummary(entry: ModelCatalogEntry) {
  const labels = entry.capabilities
    .filter((capability) => headlineCapabilities.has(capability))
    .map((capability) => capabilityOptions.find((option) => option.value === capability)?.label)
    .filter(Boolean)
    .slice(0, 3);
  return labels.length ? labels.join(" · ") : "未配置能力";
}

function dedicatedRequestChannel(form: ModelDraft) {
  const supportsImage = form.capabilities.includes("image") || form.capabilities.includes("imageEdit");
  if (supportsImage) {
    if (form.vendor === "openai") {
      return {
        label: "OpenAI 图片专用接口",
        path: form.capabilities.includes("imageEdit")
          ? "/v1/images/generations · /v1/images/edits"
          : "/v1/images/generations"
      };
    }
    if (form.vendor === "gemini") {
      return {
        label: "Gemini 图片生成接口",
        path: "/v1beta/models/{model}:generateContent"
      };
    }
    if (form.vendor === "botcf") {
      const usesGeminiCompatibility = /^gemini-[a-z0-9.-]*image(?:$|[-_])/i.test(form.model);
      return {
        label: usesGeminiCompatibility ? "BotCF Gemini 图片兼容接口" : "BotCF 图片专用接口",
        path: usesGeminiCompatibility
          ? "/v1/chat/completions"
          : "/v1/images/generations · /v1/images/edits"
      };
    }
    return {
      label: "图片专用接口",
      path: "/v1/images/generations"
    };
  }

  if (form.capabilities.includes("tts") || form.capabilities.includes("stt") || form.capabilities.includes("audio")) {
    return { label: "音频专用接口", path: "由厂商适配器按能力自动选择" };
  }
  if (form.capabilities.includes("video")) {
    return { label: "视频专用接口", path: "使用下方媒体端点模板" };
  }
  if (form.capabilities.includes("embedding")) {
    return { label: "向量专用接口", path: "由厂商适配器按能力自动选择" };
  }
  return { label: "厂商专用接口", path: "由运行时适配器自动选择" };
}

function moveItem<T extends { id: string }>(items: T[], sourceId: string, targetIndex: number) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= items.length || sourceIndex === targetIndex) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function useScrollActivity() {
  const [scrolling, setScrolling] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const onScroll: UIEventHandler<HTMLElement> = () => {
    setScrolling(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setScrolling(false), 520);
  };

  return { scrolling, onScroll };
}

export function AdminModelsSection({
  catalog,
  vendors,
  modelIssues,
  selectedModelId,
  form,
  showFieldErrors,
  displayNameMissing,
  requestNameMissing,
  contextWindowInvalid,
  maxOutputTokensInvalid,
  maxInputCharactersInvalid,
  onApplyPreset,
  onSelect,
  onCreate,
  onCreateVendor,
  onDeleteVendor,
  onReorderVendors,
  onReorder,
  onChange,
  onCapabilityToggle,
  onMediaConfigChange,
  onSubmit,
  onDelete
}: AdminModelsSectionProps) {
  const selectedEntry = catalog.find((entry) => entry.id === selectedModelId);
  const selectedVendorId = selectedModelId === "new" ? form.vendorId : selectedEntry?.vendorId;
  const [activeVendorId, setActiveVendorId] = useState(
    selectedEntry?.vendorId || form.vendorId || vendors[0]?.id || ""
  );
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [vendorLabelDraft, setVendorLabelDraft] = useState("");
  const [vendorAdapterDraft, setVendorAdapterDraft] = useState<ProviderKind>("openai-compatible");
  const [vendorFormError, setVendorFormError] = useState("");
  const [vendorFormBusy, setVendorFormBusy] = useState(false);
  const [orderedVendors, setOrderedVendors] = useState(vendors);
  const [orderedCatalog, setOrderedCatalog] = useState(catalog);
  const [draggedVendorId, setDraggedVendorId] = useState("");
  const [draggedModelId, setDraggedModelId] = useState("");
  const [vendorOrderBusy, setVendorOrderBusy] = useState(false);
  const [modelOrderBusy, setModelOrderBusy] = useState(false);
  const [vendorOrderError, setVendorOrderError] = useState("");
  const [modelOrderError, setModelOrderError] = useState("");
  const vendorScroll = useScrollActivity();
  const modelScroll = useScrollActivity();

  useEffect(() => {
    setOrderedVendors(vendors);
  }, [vendors]);

  useEffect(() => {
    setOrderedCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    if (selectedVendorId && orderedVendors.some((vendor) => vendor.id === selectedVendorId)) {
      setActiveVendorId(selectedVendorId);
    }
  }, [orderedVendors, selectedVendorId]);

  useEffect(() => {
    if (!orderedVendors.length) {
      setActiveVendorId("");
      return;
    }
    if (!orderedVendors.some((vendor) => vendor.id === activeVendorId)) {
      setActiveVendorId(orderedVendors[0].id);
    }
  }, [activeVendorId, orderedVendors]);

  const activeVendor = orderedVendors.find((vendor) => vendor.id === activeVendorId) || orderedVendors[0];

  const activeModels = useMemo(
    () => activeVendor ? orderedCatalog.filter((entry) => entry.vendorId === activeVendor.id) : [],
    [activeVendor, orderedCatalog]
  );
  const availablePresets = useMemo(() => {
    if (!activeVendor) return [];
    const existingModels = new Set(activeModels.map((entry) => entry.model));
    return modelCatalogPresets.filter(
      (preset) => preset.vendor === activeVendor.adapter && !existingModels.has(preset.model)
    );
  }, [activeModels, activeVendor]);
  const activePresetId = selectedModelId === "new" && form.vendorId === activeVendor?.id
    ? availablePresets.find((preset) => preset.model === form.model)?.id
    : "";
  const supportsChat = form.capabilities.includes("chat");
  const endpointDetails = endpointProtocolDetails(form.endpointProtocol);
  const requestChannel = supportsChat ? endpointDetails : dedicatedRequestChannel(form);

  const selectVendor = (vendor: ModelVendorEntry) => {
    setActiveVendorId(vendor.id);
    const firstModel = orderedCatalog.find((entry) => entry.vendorId === vendor.id);
    if (firstModel) {
      onSelect(firstModel.id);
    } else {
      onCreate(vendor);
    }
  };

  const createModel = () => {
    if (activeVendor) onCreate(activeVendor);
  };

  const applyPreset = (presetId: string) => {
    const preset = modelCatalogPresets.find((item) => item.id === presetId);
    if (!preset || !activeVendor) return;
    onApplyPreset(preset.id, activeVendor);
  };

  const submitVendor: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const label = vendorLabelDraft.trim();
    if (!label) {
      setVendorFormError("请输入厂商名称");
      return;
    }
    if (vendors.some((vendor) => vendor.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
      setVendorFormError("厂商名称已存在");
      return;
    }

    setVendorFormBusy(true);
    setVendorFormError("");
    try {
      const createdVendor = await onCreateVendor(label, vendorAdapterDraft);
      setActiveVendorId(createdVendor.id);
      onCreate(createdVendor);
      setVendorLabelDraft("");
      setVendorFormOpen(false);
    } catch (error) {
      setVendorFormError(error instanceof Error ? error.message : "新增厂商失败");
    } finally {
      setVendorFormBusy(false);
    }
  };

  const persistVendorOrder = async (next: ModelVendorEntry[], movedVendorId: string) => {
    if (next === orderedVendors || vendorOrderBusy) return;
    const previous = orderedVendors;
    setOrderedVendors(next);
    setVendorOrderBusy(true);
    setVendorOrderError("");
    try {
      await onReorderVendors(next.map((vendor) => vendor.id));
    } catch (error) {
      setOrderedVendors(previous);
      setVendorOrderError(error instanceof Error ? error.message : "模型厂商排序保存失败");
    } finally {
      setVendorOrderBusy(false);
    }
  };

  const persistModelOrder = async (nextActiveModels: ModelCatalogEntry[]) => {
    if (nextActiveModels === activeModels || modelOrderBusy || !activeVendor) return;
    const previous = orderedCatalog;
    let activeIndex = 0;
    const nextCatalog = orderedCatalog.map((entry) =>
      entry.vendorId === activeVendor.id ? nextActiveModels[activeIndex++] : entry
    );
    setOrderedCatalog(nextCatalog);
    setModelOrderBusy(true);
    setModelOrderError("");
    try {
      await onReorder(nextCatalog.map((entry) => entry.id));
    } catch (error) {
      setOrderedCatalog(previous);
      setModelOrderError(error instanceof Error ? error.message : "模型排序保存失败");
    } finally {
      setModelOrderBusy(false);
    }
  };

  const vendorDeleteDisabledReason = activeModels.length
    ? `该厂商仍有 ${activeModels.length} 个模型，请先迁移或删除这些模型。`
    : vendors.length <= 1
      ? "至少需要保留一个模型厂商。"
      : "";
  const vendorDeleteHelpId = "admin-model-vendor-delete-help";
  const modelDeleteDisabledReason = selectedModelId === "new" || !selectedEntry
    ? "仅可删除已保存的模型。"
    : "";
  const modelDeleteHelpId = "admin-model-delete-help";
  return (
    <section id="admin-section-models" className="admin-section admin-model-section">
      {modelIssues.length ? (
        <p className="admin-model-issues" role="alert" title={modelIssues.join("\n")}>
          <AlertCircle size={15} aria-hidden="true" />
          模型目录有 {modelIssues.length} 项需要处理
        </p>
      ) : null}

      <div className="admin-model-workbench">
        <aside className="admin-model-vendor-rail" aria-label="模型厂商">
          <div className="admin-model-column-heading">
            <div>
              <span>模型厂商</span>
              <small>{vendors.length} 个厂商</small>
            </div>
          </div>
          <nav
            className={`admin-model-vendor-list ${vendorScroll.scrolling ? "is-scrolling" : ""}`}
            aria-label="选择模型厂商"
            onScroll={vendorScroll.onScroll}
          >
            {orderedVendors.map((vendor, index) => {
              const count = catalog.filter((entry) => entry.vendorId === vendor.id).length;
              const selected = activeVendor?.id === vendor.id;
              return (
                <div
                  key={vendor.id}
                  className={`admin-model-vendor-row ${selected ? "is-active" : ""} ${draggedVendorId === vendor.id ? "is-dragging" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = event.dataTransfer.getData("text/plain") || draggedVendorId;
                    setDraggedVendorId("");
                    if (sourceId) void persistVendorOrder(moveItem(orderedVendors, sourceId, index), sourceId);
                  }}
                >
                  <button
                    type="button"
                    className="admin-model-vendor-select"
                    aria-pressed={selected}
                    onClick={() => selectVendor(vendor)}
                  >
                    <Cpu size={15} aria-hidden="true" />
                    <span>{vendor.label}</span>
                    <em>{count}</em>
                  </button>
                  <button
                    type="button"
                    className="admin-model-vendor-handle"
                    draggable={!vendorOrderBusy}
                    disabled={vendorOrderBusy}
                    aria-label={`拖动 ${vendor.label} 调整厂商顺序`}
                    title="拖动调整顺序"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", vendor.id);
                      setDraggedVendorId(vendor.id);
                    }}
                    onDragEnd={() => setDraggedVendorId("")}
                  >
                    <GripVertical size={15} />
                  </button>
                  <span className="admin-model-vendor-move-actions">
                    <button
                      type="button"
                      disabled={vendorOrderBusy || index === 0}
                      aria-label={`上移厂商 ${vendor.label}`}
                      title="上移厂商"
                      onClick={() => void persistVendorOrder(moveItem(orderedVendors, vendor.id, index - 1), vendor.id)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={vendorOrderBusy || index === orderedVendors.length - 1}
                      aria-label={`下移厂商 ${vendor.label}`}
                      title="下移厂商"
                      onClick={() => void persistVendorOrder(moveItem(orderedVendors, vendor.id, index + 1), vendor.id)}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </span>
                </div>
              );
            })}
          </nav>
          {vendorOrderError ? <small className="admin-field-error" role="alert">{vendorOrderError}</small> : null}
          <div className="admin-model-vendor-management">
            <div className="admin-model-vendor-actions">
              <button
                type="button"
                className="admin-model-add-vendor-action"
                aria-expanded={vendorFormOpen}
                aria-controls="admin-model-vendor-form"
                onClick={() => {
                  setVendorFormOpen((open) => !open);
                  setVendorFormError("");
                }}
              >
                <CirclePlus size={15} aria-hidden="true" />
                新增模型厂商
              </button>
              <button
                type="button"
                className="admin-model-delete-vendor-action"
                disabled={!activeVendor || Boolean(vendorDeleteDisabledReason)}
                title={vendorDeleteDisabledReason || (activeVendor ? `删除 ${activeVendor.label}` : "没有可删除的厂商")}
                aria-label={activeVendor ? `删除厂商 ${activeVendor.label}` : "删除厂商"}
                aria-describedby={vendorDeleteDisabledReason ? vendorDeleteHelpId : undefined}
                onClick={() => {
                  if (activeVendor && !vendorDeleteDisabledReason) onDeleteVendor(activeVendor);
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>

            {vendorFormOpen ? (
              <form id="admin-model-vendor-form" className="admin-model-vendor-form" onSubmit={submitVendor} noValidate>
                <label>
                  <span>厂商名称</span>
                  <input
                    value={vendorLabelDraft}
                    onChange={(event) => {
                      setVendorLabelDraft(event.target.value);
                      setVendorFormError("");
                    }}
                    placeholder="例如 团队网关"
                    autoFocus
                    aria-invalid={Boolean(vendorFormError)}
                    aria-describedby={vendorFormError ? "admin-model-vendor-form-error" : undefined}
                  />
                </label>
                <label>
                  <span>请求适配器</span>
                  <select
                    value={vendorAdapterDraft}
                    onChange={(event) => setVendorAdapterDraft(event.target.value as ProviderKind)}
                  >
                    {vendorOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {vendorFormError ? <small id="admin-model-vendor-form-error" className="admin-field-error">{vendorFormError}</small> : null}
                <div className="admin-model-vendor-form-actions">
                  <button type="submit" className="primary-action" disabled={vendorFormBusy}>
                    {vendorFormBusy ? "新增中…" : "新增"}
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={vendorFormBusy}
                    onClick={() => {
                      setVendorFormOpen(false);
                      setVendorFormError("");
                    }}
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : null}

            <small id={vendorDeleteHelpId} className={vendorDeleteDisabledReason ? "is-warning" : ""}>
              {vendorDeleteDisabledReason || "仅可删除不含模型的厂商。"}
            </small>
          </div>
        </aside>

        <div className="admin-model-list-panel">
          <div className="admin-model-column-heading">
            <div>
              <span>{activeVendor?.label || "未选择厂商"}</span>
              <small>{activeModels.length} 个已配置模型</small>
            </div>
          </div>

          <div
            className={`admin-model-list-scroll ${modelScroll.scrolling ? "is-scrolling" : ""}`}
            onScroll={modelScroll.onScroll}
          >
            <div className="admin-model-list-group">
              <span className="admin-model-list-label">已配置</span>
              {activeModels.length ? activeModels.map((entry, index) => {
                const active = entry.id === selectedModelId;
                return (
                  <div
                    key={entry.id}
                    className={`admin-model-entry-row ${active ? "is-active" : ""} ${draggedModelId === entry.id ? "is-dragging" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = event.dataTransfer.getData("text/plain") || draggedModelId;
                      setDraggedModelId("");
                      if (sourceId) void persistModelOrder(moveItem(activeModels, sourceId, index));
                    }}
                  >
                    <button
                      type="button"
                      className="admin-model-row admin-model-select"
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        setActiveVendorId(entry.vendorId);
                        onSelect(entry.id);
                      }}
                    >
                      <span className={`admin-model-row-status ${entry.enabled ? "is-enabled" : ""}`} aria-hidden="true" />
                      <span className="admin-model-row-copy">
                        <strong>{entry.label}</strong>
                        <small>{entry.model}</small>
                        <em>{modelCapabilitySummary(entry)}</em>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="admin-model-handle"
                      draggable={!modelOrderBusy}
                      disabled={modelOrderBusy}
                      aria-label={`拖动 ${entry.label} 调整模型顺序`}
                      title="拖动调整顺序"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", entry.id);
                        setDraggedModelId(entry.id);
                      }}
                      onDragEnd={() => setDraggedModelId("")}
                    >
                      <GripVertical size={15} />
                    </button>
                    <span className="admin-model-move-actions">
                      <button
                        type="button"
                        disabled={modelOrderBusy || index === 0}
                        aria-label={`上移模型 ${entry.label}`}
                        title="上移模型"
                        onClick={() => void persistModelOrder(moveItem(activeModels, entry.id, index - 1))}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={modelOrderBusy || index === activeModels.length - 1}
                        aria-label={`下移模型 ${entry.label}`}
                        title="下移模型"
                        onClick={() => void persistModelOrder(moveItem(activeModels, entry.id, index + 1))}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </span>
                  </div>
                );
              }) : (
                <div className="admin-model-list-empty">当前厂商还没有模型</div>
              )}
              {selectedModelId === "new" && form.vendorId === activeVendor?.id && !activePresetId ? (
                <div className="admin-model-draft-row">
                  <span className="admin-model-row-status is-draft" aria-hidden="true" />
                  <span>
                    <strong>{form.label || "未命名模型"}</strong>
                    <small>未保存草稿</small>
                  </span>
                </div>
              ) : null}
            </div>

            <div className="admin-model-list-group admin-model-preset-list">
              <span className="admin-model-list-label">可添加预设</span>
              {availablePresets.length ? availablePresets.map((preset) => {
                const active = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`admin-model-row is-preset ${active ? "is-active" : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => applyPreset(preset.id)}
                  >
                    <Plus size={15} aria-hidden="true" />
                    <span className="admin-model-row-copy">
                      <strong>{preset.label}</strong>
                      <small>{preset.model}</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                );
              }) : (
                <div className="admin-model-list-empty">该厂商的预设均已添加</div>
              )}
            </div>
          </div>
          <div className="admin-model-management">
            {modelOrderError ? <small className="admin-field-error" role="alert">{modelOrderError}</small> : null}
            <div className="admin-model-management-actions">
              <button
                type="button"
                className="admin-model-add-action"
                aria-label={`新增 ${activeVendor?.label || "当前厂商"} 模型`}
                disabled={!activeVendor}
                onClick={createModel}
              >
                <CirclePlus size={15} aria-hidden="true" />
                新增模型
              </button>
              <button
                type="button"
                className="admin-model-delete-action"
                disabled={Boolean(modelDeleteDisabledReason)}
                title={modelDeleteDisabledReason || (selectedEntry ? `删除 ${selectedEntry.label}` : "没有可删除的模型")}
                aria-label={selectedEntry ? `删除模型 ${selectedEntry.label}` : "删除模型"}
                aria-describedby={modelDeleteDisabledReason ? modelDeleteHelpId : undefined}
                onClick={() => {
                  if (!modelDeleteDisabledReason) onDelete();
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
            <small id={modelDeleteHelpId} className={modelDeleteDisabledReason ? "is-warning" : ""}>
              {modelDeleteDisabledReason || "删除前会要求确认。"}
            </small>
          </div>
        </div>

        <div className="admin-model-detail-panel">
          <div className="admin-model-detail-heading">
            <div>
              <span>{selectedModelId === "new" ? "新增模型" : "模型设置"}</span>
              <h3>{form.label.trim() || "未命名模型"}</h3>
              <small>{form.model.trim() || "填写实际请求模型名"}</small>
            </div>
            <label className="admin-model-enabled-toggle">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => onChange({ enabled: event.target.checked })}
              />
              <span>启用模型</span>
            </label>
          </div>

          <form className="provider-form admin-model-detail-form" onSubmit={onSubmit} noValidate>
            {supportsChat ? (
              <label className="admin-model-endpoint-field" htmlFor="admin-model-endpoint-protocol">
                对话请求端点
                <select
                  id="admin-model-endpoint-protocol"
                  aria-label="对话请求端点"
                  value={form.endpointProtocol}
                  onChange={(event) => onChange({ endpointProtocol: event.target.value as ModelEndpointProtocol })}
                >
                  {endpointProtocolOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} · {option.path}
                    </option>
                  ))}
                </select>
                <small>仅控制对话请求；图片、音频、视频和向量仍使用各自专用端点。</small>
              </label>
            ) : (
              <div className="admin-model-dedicated-endpoint" role="note" aria-label="专用请求通道">
                <span>请求通道</span>
                <strong>{requestChannel.label}</strong>
                <code>{requestChannel.path}</code>
                <small>该模型不具备对话能力，不会发送到 Chat、Responses 或 Messages 端点。</small>
              </div>
            )}
            <label htmlFor="admin-model-display-name">
              前台显示名称
              <input
                id="admin-model-display-name"
                aria-label="前台显示名称"
                value={form.label}
                onChange={(event) => onChange({ label: event.target.value })}
                placeholder="例如 GPT-5.6 Luna"
                required
                aria-invalid={showFieldErrors && displayNameMissing}
                aria-describedby={showFieldErrors && displayNameMissing ? "admin-model-label-error" : undefined}
              />
              {showFieldErrors && displayNameMissing ? <small id="admin-model-label-error" className="admin-field-error">前台显示名称不能为空</small> : null}
            </label>
            <label htmlFor="admin-model-request-name">
              实际请求模型名
              <input
                id="admin-model-request-name"
                aria-label="实际请求模型名"
                value={form.model}
                onChange={(event) => onChange({ model: event.target.value })}
                placeholder="例如 gpt-5.6-luna"
                required
                aria-invalid={showFieldErrors && requestNameMissing}
                aria-describedby={showFieldErrors && requestNameMissing ? "admin-model-name-error" : undefined}
              />
              {showFieldErrors && requestNameMissing ? <small id="admin-model-name-error" className="admin-field-error">实际请求模型名不能为空</small> : null}
            </label>
            <label htmlFor="admin-model-context-window">
              上下文窗口（Token）
              <input
                id="admin-model-context-window"
                aria-label="上下文窗口（Token）"
                type="number"
                min={4096}
                max={2000000}
                step={1024}
                value={form.contextWindowTokens}
                onChange={(event) => onChange({ contextWindowTokens: Number(event.target.value) })}
                required
                aria-invalid={showFieldErrors && contextWindowInvalid}
                aria-describedby={showFieldErrors && contextWindowInvalid ? "admin-model-context-error" : undefined}
              />
              {showFieldErrors && contextWindowInvalid ? <small id="admin-model-context-error" className="admin-field-error">至少填写 4,096 Token</small> : null}
            </label>
            <label htmlFor="admin-model-max-output-tokens">
              最大输出 Token 数
              <input
                id="admin-model-max-output-tokens"
                aria-label="最大输出 Token 数"
                type="number"
                min={1}
                max={1048576}
                step={1024}
                value={form.maxOutputTokens}
                onChange={(event) => onChange({ maxOutputTokens: Number(event.target.value) })}
                required
                aria-invalid={showFieldErrors && maxOutputTokensInvalid}
                aria-describedby={showFieldErrors && maxOutputTokensInvalid ? "admin-model-max-output-error" : undefined}
              />
              {showFieldErrors && maxOutputTokensInvalid ? <small id="admin-model-max-output-error" className="admin-field-error">填写 1 至 1,048,576 Token</small> : null}
            </label>
            <label htmlFor="admin-model-max-input-characters">
              最大输入字符数
              <input
                id="admin-model-max-input-characters"
                aria-label="最大输入字符数"
                type="number"
                min={1000}
                max={2000000}
                step={1000}
                value={form.maxInputCharacters}
                onChange={(event) => onChange({ maxInputCharacters: Number(event.target.value) })}
                required
                aria-invalid={showFieldErrors && maxInputCharactersInvalid}
                aria-describedby={showFieldErrors && maxInputCharactersInvalid ? "admin-model-max-input-error" : undefined}
              />
              {showFieldErrors && maxInputCharactersInvalid ? <small id="admin-model-max-input-error" className="admin-field-error">至少填写 1,000 个字符</small> : null}
            </label>

            <div className="admin-model-capability-field" role="group" aria-labelledby="admin-model-capability-title">
              <span id="admin-model-capability-title">模型能力</span>
              <div className="admin-model-option-grid">
                {capabilityOptions.map((option) => {
                  const selected = form.capabilities.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="admin-model-check-row"
                      aria-pressed={selected}
                      onClick={() => onCapabilityToggle(option.value)}
                    >
                      <span className="admin-model-check-indicator" aria-hidden="true">
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <span className="admin-model-check-label">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {form.capabilities.includes("video") ? (
              <div className="admin-media-config">
                <strong>视频端点模板</strong>
                <label>生成路径<input value={form.mediaConfig?.generatePath || ""} onChange={(event) => onMediaConfigChange({ generatePath: event.target.value })} placeholder="/video/generations" /></label>
                <label>状态路径<input value={form.mediaConfig?.statusPath || ""} onChange={(event) => onMediaConfigChange({ statusPath: event.target.value })} placeholder="/video/generations/status" /></label>
                <label>任务 ID 路径<input value={form.mediaConfig?.idJsonPath || ""} onChange={(event) => onMediaConfigChange({ idJsonPath: event.target.value })} placeholder="id 或 data.id" /></label>
                <label>状态字段路径<input value={form.mediaConfig?.statusJsonPath || ""} onChange={(event) => onMediaConfigChange({ statusJsonPath: event.target.value })} placeholder="status" /></label>
                <label>资产 URL 路径<input value={form.mediaConfig?.assetJsonPath || ""} onChange={(event) => onMediaConfigChange({ assetJsonPath: event.target.value })} placeholder="data[0].url" /></label>
              </div>
            ) : null}

            <div className="admin-form-actions">
              <button type="submit" className="primary-action"><Save size={16} />保存模型</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
