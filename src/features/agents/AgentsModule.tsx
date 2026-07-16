import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, ChevronLeft, Loader2, PlayCircle, Wrench } from "lucide-react";
import { api } from "../../api";
import {
  ConnectionStatus,
  GenerationOptions,
  ModelPicker,
  PromptComposer,
  ResultPanel,
  WorkbenchLayout,
  compactModelLabel,
  modelsForCapability,
  preferredModelFor
} from "../../components/workbench";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import { consumeReplayDraft } from "../gallery/replayDraft";
import AgentTracePanel from "./AgentTracePanel";
import type {
  AgentTraceEvent,
  Assistant,
  GalleryItem,
  GenerationResult,
  ModelCatalogEntry,
  PromptPreset,
  ToolSetting,
  UserProviderConfig
} from "../../types";

type AgentsModuleProps = {
  title: string;
  description: string;
  assistants: Assistant[];
  modelCatalog: ModelCatalogEntry[];
  promptPresets: PromptPreset[];
  toolSettings: ToolSetting[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onGenerationResult: (item: GalleryItem) => void;
  onRequestApiConfig: () => void;
};

function traceFrom(result: GenerationResult | null): AgentTraceEvent[] {
  const raw = result?.raw as { toolTrace?: AgentTraceEvent[] } | undefined;
  return Array.isArray(raw?.toolTrace) ? raw.toolTrace : [];
}

const riskLabels: Record<ToolSetting["riskLevel"], string> = {
  low: "低风险",
  medium: "需确认",
  high: "高风险"
};

function AgentsModule({
  title,
  description,
  assistants,
  modelCatalog,
  promptPresets,
  toolSettings,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: AgentsModuleProps) {
  const [prompt, setPrompt] = useState("");
  const [assistantId, setAssistantId] = useState(assistants[0]?.id || "");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [allowedTools, setAllowedTools] = useState<string[]>(() =>
    toolSettings.filter((tool) => tool.enabled).map((tool) => tool.name)
  );
  const [temperature, setTemperature] = useState(0.35);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [mobileView, setMobileView] = useState<"setup" | "timeline">("setup");
  const ready = isUserProviderReady(userProvider);
  const toolModels = useMemo(
    () => modelsForCapability(modelCatalog, "toolCalling").filter((entry) => entry.capabilities.includes("chat")),
    [modelCatalog]
  );
  const selectedModel =
    toolModels.find((entry) => entry.id === selectedModelId) ||
    preferredModelFor(toolModels, "chat", userProvider.lastModelId);
  const presets = useMemo(
    () => promptPresets.filter((preset) => preset.enabled && preset.moduleId === "agents"),
    [promptPresets]
  );
  const presetLabels = presets.length ? presets.map((preset) => preset.title) : ["拆解上线计划", "生成竞品分析", "制定执行清单"];
  const presetPromptByTitle = useMemo(() => new Map(presets.map((preset) => [preset.title, preset.prompt])), [presets]);
  const enabledTools = useMemo(() => toolSettings.filter((tool) => tool.enabled), [toolSettings]);
  const canSubmit = ready && Boolean(selectedModel) && Boolean(prompt.trim()) && !busy;

  useEffect(() => {
    if (!assistantId && assistants[0]) setAssistantId(assistants[0].id);
  }, [assistantId, assistants]);

  useEffect(() => {
    if (!toolModels.length) {
      setSelectedModelId("");
      return;
    }
    setSelectedModelId((current) => {
      if (toolModels.some((entry) => entry.id === current)) return current;
      return preferredModelFor(toolModels, "chat", userProvider.lastModelId)?.id || "";
    });
  }, [toolModels, userProvider.lastModelId]);

  useEffect(() => {
    setAllowedTools((current) => {
      const enabledNames = enabledTools.map((tool) => tool.name);
      const next = current.filter((name) => enabledNames.includes(name));
      return next.length ? next : enabledNames;
    });
  }, [enabledTools]);

  useEffect(() => {
    const replay = consumeReplayDraft("agents");
    if (replay?.prompt) {
      setPrompt(replay.prompt);
      if (replay.modelId) setSelectedModelId(replay.modelId);
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !selectedModel) {
      if (!ready) onRequestApiConfig();
      setNotice(!ready ? "请先填写 API URL 和 Key" : "请补全任务，并选择支持工具调用的模型");
      return;
    }
    setMobileView("timeline");
    setBusy(true);
    setNotice("");
    try {
      const nextResult = await api.runAgent({
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        assistantId: assistantId || assistants[0]?.id || "",
        prompt: prompt.trim(),
        allowedTools,
        options: { temperature }
      });
      setResult(nextResult);
      onGenerationResult({
        ...nextResult,
        sourceModule: "agents",
        prompt: prompt.trim(),
        modelId: selectedModel.id
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "智能体执行失败");
    } finally {
      setBusy(false);
    }
  };

  const sidebar = (
    <form id="agent-setup-panel" className="workbench-form" onSubmit={submit}>
      <ConnectionStatus ready={ready} modelLabel={compactModelLabel(selectedModel)} onOpenSettings={onRequestApiConfig} />
      <label className="prompt-field agent-role-field">
        <span>智能体角色</span>
        <select value={assistantId} onChange={(event) => setAssistantId(event.target.value)}>
          {assistants.map((assistant) => (
            <option key={assistant.id} value={assistant.id}>
              {assistant.name}
            </option>
          ))}
        </select>
      </label>
      <ModelPicker
        className="workbench-model-picker"
        models={modelCatalog}
        capability="toolCalling"
        value={selectedModel?.id || ""}
        onChange={(modelId) => {
          setSelectedModelId(modelId);
          onUserProviderChange({ lastModelId: modelId });
        }}
      />
      <PromptComposer
        label="任务目标"
        value={prompt}
        placeholder="说明目标、约束、输入资料和希望得到的最终产物"
        submitLabel="运行智能体"
        busy={busy}
        disabled={!canSubmit}
        notice={notice}
        presets={presetLabels}
        onChange={setPrompt}
        onPresetPick={(value) => setPrompt(presetPromptByTitle.get(value) || value)}
      >
        <GenerationOptions>
          <label>
            温度 {temperature.toFixed(1)}
            <input type="range" min="0" max="1.2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
          </label>
        </GenerationOptions>
        <div className="agent-tool-picker" role="group" aria-labelledby="agent-permissions-title">
          <header>
            <strong id="agent-permissions-title">工具权限</strong>
            <span>{allowedTools.length}/{enabledTools.length} 已开启</span>
          </header>
          {enabledTools.map((tool) => (
            <label key={tool.name} className="agent-permission-row">
              <span className="agent-permission-copy">
                <span>
                  <strong>{tool.label}</strong>
                  <small className={`tool-risk ${tool.riskLevel}`}>{riskLabels[tool.riskLevel]}</small>
                </span>
                <small>{tool.description}</small>
              </span>
              <input
                type="checkbox"
                checked={allowedTools.includes(tool.name)}
                aria-label={`允许使用${tool.label}`}
                onChange={(event) =>
                  setAllowedTools((current) =>
                    event.target.checked ? [...current, tool.name] : current.filter((name) => name !== tool.name)
                  )
                }
              />
            </label>
          ))}
        </div>
      </PromptComposer>
    </form>
  );

  const trace = traceFrom(result);
  const runStatus = busy ? "执行中" : result?.status === "failed" ? "执行失败" : result ? "已完成" : "等待运行";

  return (
    <WorkbenchLayout
      title={title}
      description={description}
      icon={BrainCircuit}
      badges={["工具调用", "执行轨迹", "任务模板"]}
      sidebar={sidebar}
      sidebarTitle="智能体设置"
      className={`agents-workbench mobile-${mobileView}`}
    >
      <section id="agent-timeline-panel" className="agent-run-timeline" aria-live="polite">
        <header className="agent-timeline-head">
          <div>
            <strong>执行时间线</strong>
            <span>{runStatus}</span>
          </div>
          <button type="button" className="secondary-action compact-action agent-back-setup" onClick={() => setMobileView("setup")}>
            <ChevronLeft size={16} />
            返回设置
          </button>
        </header>

        <div className="agent-timeline-feed">
          <article className={busy ? "agent-timeline-event running" : "agent-timeline-event"}>
            <span className="agent-timeline-marker" aria-hidden="true">
              {busy ? <Loader2 size={16} className="spin" /> : result ? <CheckCircle2 size={16} /> : <PlayCircle size={16} />}
            </span>
            <div>
              <strong>{busy ? "正在执行任务" : result ? "任务执行完成" : "准备运行"}</strong>
              <p>{notice || (result ? "模型已返回执行结果。" : "设置角色、模型和权限后运行智能体。")}</p>
            </div>
          </article>

          {trace.length ? <AgentTracePanel trace={trace} /> : null}

          <div className="agent-final-result">
            <span className="agent-timeline-marker" aria-hidden="true">
              <Wrench size={16} />
            </span>
            <div>
        <ResultPanel
                title="最终回答"
          result={result}
          emptyIcon={Wrench}
                emptyTitle="等待智能体运行"
                emptyDescription="运行后会依次展示工具轨迹和最终回答。"
        />
            </div>
          </div>
        </div>
      </section>
    </WorkbenchLayout>
  );
}

export default AgentsModule;
