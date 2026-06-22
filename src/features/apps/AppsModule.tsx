import { FormEvent, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Search, Sparkles } from "lucide-react";
import { api } from "../../api";
import {
  ConnectionStatus,
  ModelPicker,
  PromptComposer,
  ResultPanel,
  WorkbenchLayout,
  compactModelLabel,
  modelsForCapability,
  preferredModelFor
} from "../../components/workbench";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import type { AppPreset, GalleryItem, GenerationResult, ModelCatalogEntry, UserProviderConfig } from "../../types";

type AppsModuleProps = {
  appPresets: AppPreset[];
  modelCatalog: ModelCatalogEntry[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onRequestApiConfig: () => void;
  onGenerationResult: (item: GalleryItem) => void;
};

const allCategory = "全部";

function AppsModule({
  appPresets,
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onRequestApiConfig,
  onGenerationResult
}: AppsModuleProps) {
  const enabledApps = useMemo(() => appPresets.filter((preset) => preset.enabled), [appPresets]);
  const categories = useMemo(
    () => [allCategory, ...Array.from(new Set(enabledApps.map((preset) => preset.category)))],
    [enabledApps]
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(allCategory);
  const [selectedAppId, setSelectedAppId] = useState(enabledApps[0]?.id || "");
  const [input, setInput] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = isUserProviderReady(userProvider);
  const chatModels = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const selectedModel =
    chatModels.find((entry) => entry.id === selectedModelId) ||
    preferredModelFor(chatModels, "chat", userProvider.lastModelId);
  const selectedApp = enabledApps.find((preset) => preset.id === selectedAppId) || enabledApps[0];

  const filteredApps = useMemo(() => {
    const term = query.trim().toLowerCase();
    return enabledApps.filter((preset) => {
      const inCategory = category === allCategory || preset.category === category;
      const inSearch = !term || `${preset.name} ${preset.description} ${preset.category}`.toLowerCase().includes(term);
      return inCategory && inSearch;
    });
  }, [category, enabledApps, query]);

  const canSubmit = ready && Boolean(selectedModel) && Boolean(selectedApp) && Boolean(input.trim()) && !busy;

  useEffect(() => {
    if (!chatModels.length) {
      setSelectedModelId("");
      return;
    }
    setSelectedModelId((current) => {
      if (chatModels.some((entry) => entry.id === current)) return current;
      return preferredModelFor(chatModels, "chat", userProvider.lastModelId)?.id || "";
    });
  }, [chatModels, userProvider.lastModelId]);

  useEffect(() => {
    if (selectedAppId && enabledApps.some((preset) => preset.id === selectedAppId)) return;
    setSelectedAppId(enabledApps[0]?.id || "");
  }, [enabledApps, selectedAppId]);

  useEffect(() => {
    if (categories.includes(category)) return;
    setCategory(allCategory);
  }, [categories, category]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedApp) return;
    if (!ready) {
      setError("请先填写 API URL 和 Key");
      onRequestApiConfig();
      return;
    }
    if (!selectedModel) {
      setError("请先启用可用的对话模型");
      return;
    }
    if (!input.trim()) {
      setError("请补充任务内容");
      return;
    }

    setBusy(true);
    setError("");
    const prompt = `${selectedApp.prompt}\n\n用户输入：\n${input.trim()}`;
    try {
      const nextResult = await api.generate("agents", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt,
        options: { temperature: 0.4 }
      });
      setResult(nextResult);
      onGenerationResult({
        ...nextResult,
        sourceModule: "apps",
        prompt: input.trim(),
        modelId: selectedModel.id
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "应用运行失败");
    } finally {
      setBusy(false);
    }
  };

  const sidebar = (
    <form className="workbench-form" onSubmit={submit}>
      <ConnectionStatus
        ready={ready}
        modelLabel={compactModelLabel(selectedModel)}
        onOpenSettings={onRequestApiConfig}
      />
      <ModelPicker
        className="workbench-model-picker"
        models={modelCatalog}
        capability="chat"
        value={selectedModel?.id || ""}
        onChange={(modelId) => {
          setSelectedModelId(modelId);
          onUserProviderChange({ lastModelId: modelId });
        }}
      />
      {selectedApp ? (
        <div className="selected-app-summary">
          <span>{selectedApp.category}</span>
          <strong>{selectedApp.name}</strong>
          <p>{selectedApp.description}</p>
        </div>
      ) : null}
      <PromptComposer
        label="任务内容"
        value={input}
        placeholder="输入背景、目标、素材或限制条件"
        rows={6}
        submitLabel={selectedApp ? `运行 ${selectedApp.name}` : "运行应用"}
        busy={busy}
        disabled={!canSubmit}
        notice={error}
        onChange={setInput}
      />
    </form>
  );

  return (
    <WorkbenchLayout
      title="AI 应用"
      description="选择一个预设应用，把复杂任务变成一键工作流。"
      icon={LayoutGrid}
      badges={["应用市场", "场景模板", "智能体运行"]}
      sidebar={sidebar}
    >
      <div className="apps-workbench">
        <section className="apps-market">
          <header className="apps-market-head">
            <div>
              <strong>应用市场</strong>
              <span>{filteredApps.length} 个可用应用</span>
            </div>
            <label className="apps-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用" />
            </label>
          </header>

          <div className="option-segmented app-categories" role="tablist" aria-label="应用分类">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={item === category ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="app-card-grid">
            {filteredApps.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={preset.id === selectedApp?.id ? "app-preset-card active" : "app-preset-card"}
                onClick={() => setSelectedAppId(preset.id)}
              >
                <span>
                  <Sparkles size={18} />
                </span>
                <strong>{preset.name}</strong>
                <small>{preset.category}</small>
                <p>{preset.description}</p>
              </button>
            ))}
          </div>
        </section>

        <ResultPanel title="应用结果" result={result} emptyIcon={LayoutGrid} />
      </div>
    </WorkbenchLayout>
  );
}

export default AppsModule;
