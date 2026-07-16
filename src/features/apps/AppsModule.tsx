import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, LayoutGrid, Search, Sparkles } from "lucide-react";
import { api } from "../../api";
import {
  ConnectionStatus,
  EmptyState,
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
  const [runnerView, setRunnerView] = useState<"setup" | "result">("setup");
  const [mobileView, setMobileView] = useState<"market" | "runner">("market");

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
      setRunnerView("result");
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

  const selectApp = (appId: string) => {
    setSelectedAppId(appId);
    setRunnerView("setup");
    setMobileView("runner");
  };

  const sidebar = (
    <div className="apps-runner">
      <div className="apps-runner-mobile-head">
        <button type="button" className="secondary-action compact-action" onClick={() => setMobileView("market")}>
          <ChevronLeft size={16} />
          返回应用市场
        </button>
      </div>

      {result ? (
        <div className="option-segmented runner-view-switcher" role="tablist" aria-label="应用运行器视图">
          <button
            type="button"
            role="tab"
            className={runnerView === "setup" ? "active" : ""}
            aria-selected={runnerView === "setup"}
            aria-controls="app-runner-setup"
            onClick={() => setRunnerView("setup")}
          >
            设置
          </button>
          <button
            type="button"
            role="tab"
            className={runnerView === "result" ? "active" : ""}
            aria-selected={runnerView === "result"}
            aria-controls="app-runner-result"
            onClick={() => setRunnerView("result")}
          >
            结果
          </button>
        </div>
      ) : null}

      {selectedApp ? (
        <>
          <form
            id="app-runner-setup"
            className={runnerView === "setup" ? "workbench-form" : "workbench-form runner-view-hidden"}
            onSubmit={submit}
            role="tabpanel"
          >
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
            <div className="selected-app-summary">
              <span>{selectedApp.category}</span>
              <strong>{selectedApp.name}</strong>
              <p>{selectedApp.description}</p>
            </div>
            <PromptComposer
              label="任务内容"
              value={input}
              placeholder="输入背景、目标、素材或限制条件"
              rows={6}
              submitLabel={`运行 ${selectedApp.name}`}
              busy={busy}
              disabled={!canSubmit}
              notice={error}
              onChange={setInput}
            />
          </form>

          <div
            id="app-runner-result"
            className={runnerView === "result" ? "apps-runner-result" : "apps-runner-result runner-view-hidden"}
            role="tabpanel"
          >
            <ResultPanel
              title={selectedApp.name}
              result={result}
              emptyIcon={LayoutGrid}
              emptyTitle="等待运行结果"
              emptyDescription="填写任务内容后运行应用。"
            />
          </div>
        </>
      ) : (
        <EmptyState icon={LayoutGrid} title="暂无可用应用" description="后台启用应用后会显示在这里。" />
      )}
    </div>
  );

  return (
    <WorkbenchLayout
      title="AI 应用"
      description="选择一个预设应用，把复杂任务变成一键工作流。"
      icon={LayoutGrid}
      badges={["应用市场", "场景模板", "智能体运行"]}
      sidebar={sidebar}
      sidebarTitle="应用运行器"
      sidebarPosition="end"
      className={`apps-layout mobile-${mobileView}`}
    >
      <section className="apps-market">
          <header className="apps-market-head">
            <div>
              <strong>应用市场</strong>
              <span>{filteredApps.length} 个可用应用</span>
            </div>
            <label className="apps-search" aria-label="搜索应用">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用" />
            </label>
          </header>

          <div className="app-categories" role="group" aria-label="应用分类">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={item === category ? "active" : ""}
                aria-pressed={item === category}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {filteredApps.length ? (
            <div className="app-card-grid">
              {filteredApps.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={preset.id === selectedApp?.id ? "app-preset-card active" : "app-preset-card"}
                  aria-pressed={preset.id === selectedApp?.id}
                  onClick={() => selectApp(preset.id)}
                >
                  <span aria-hidden="true">
                    <Sparkles size={18} />
                  </span>
                  <strong>{preset.name}</strong>
                  <small>{preset.category}</small>
                  <p>{preset.description}</p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={Search} title="没有匹配的应用" description="调整关键词或分类后重试。" />
          )}
      </section>
    </WorkbenchLayout>
  );
}

export default AppsModule;
