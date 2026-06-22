import { FormEvent, useEffect, useMemo, useState } from "react";
import { GitFork, Wand2 } from "lucide-react";
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
import MindmapCanvas from "./MindmapCanvas";
import { parseMindmap } from "./mindmapParser";
import type { GalleryItem, GenerationResult, ModelCatalogEntry, PromptPreset, UserProviderConfig } from "../../types";

type MindmapModuleProps = {
  title: string;
  description: string;
  modelCatalog: ModelCatalogEntry[];
  promptPresets: PromptPreset[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onGenerationResult: (item: GalleryItem) => void;
  onRequestApiConfig: () => void;
};

function MindmapModule({
  title,
  description,
  modelCatalog,
  promptPresets,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: MindmapModuleProps) {
  const [prompt, setPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.4);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [sourceDraft, setSourceDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"visual" | "raw">("visual");
  const [selectedModelId, setSelectedModelId] = useState("");
  const ready = isUserProviderReady(userProvider);
  const chatModels = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const selectedModel =
    chatModels.find((entry) => entry.id === selectedModelId) ||
    preferredModelFor(chatModels, "chat", userProvider.lastModelId);
  const presets = useMemo(
    () => promptPresets.filter((preset) => preset.enabled && preset.moduleId === "mindmap"),
    [promptPresets]
  );
  const presetLabels = presets.length ? presets.map((preset) => preset.title) : ["会议行动导图", "产品需求拆解", "课程学习路线"];
  const presetPromptByTitle = useMemo(() => new Map(presets.map((preset) => [preset.title, preset.prompt])), [presets]);
  const canSubmit = ready && Boolean(selectedModel) && Boolean(prompt.trim()) && !busy;
  const parsed = useMemo(
    () => (sourceDraft ? parseMindmap(sourceDraft, prompt || result?.title || "思维导图") : null),
    [prompt, result, sourceDraft]
  );

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
    const replay = consumeReplayDraft("mindmap");
    if (replay?.prompt) {
      setPrompt(replay.prompt);
      if (replay.modelId) setSelectedModelId(replay.modelId);
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      if (!ready) {
        setNotice("请先填写 API URL 和 Key");
        onRequestApiConfig();
      } else {
        setNotice("请补全主题，并选择可用模型");
      }
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      if (!selectedModel) return;
      const nextResult = await api.generate("mindmap", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt: prompt.trim(),
        options: { temperature }
      });
      setResult(nextResult);
      setSourceDraft(nextResult.text || "");
      setTab("visual");
      onGenerationResult({
        ...nextResult,
        sourceModule: "mindmap",
        prompt: prompt.trim(),
        modelId: selectedModel.id
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "思维导图生成失败");
    } finally {
      setBusy(false);
    }
  };

  const sidebar = (
    <form className="workbench-form" onSubmit={submit}>
      <ConnectionStatus ready={ready} modelLabel={compactModelLabel(selectedModel)} onOpenSettings={onRequestApiConfig} />
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
      <PromptComposer
        label="导图主题"
        value={prompt}
        placeholder="输入主题、资料摘要或会议纪要，生成层级清晰的可视化导图"
        submitLabel="生成思维导图"
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
            <input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
          </label>
        </GenerationOptions>
      </PromptComposer>
    </form>
  );

  return (
    <WorkbenchLayout title={title} description={description} icon={Wand2} badges={["可视化", "SVG 导出", "源码编辑"]} sidebar={sidebar}>
      <section className="mindmap-workspace">
        <header className="mindmap-tabs">
          <div>
            <strong>思维导图</strong>
            <span>{result ? "已生成" : "等待生成"}</span>
          </div>
          <div className="option-segmented">
            <button type="button" className={tab === "visual" ? "active" : ""} onClick={() => setTab("visual")}>可视化</button>
            <button type="button" className={tab === "raw" ? "active" : ""} onClick={() => setTab("raw")}>源码</button>
          </div>
        </header>
        {sourceDraft && parsed && tab === "visual" ? <MindmapCanvas root={parsed} source={sourceDraft} /> : null}
        {tab === "raw" && result?.text ? (
          <section className="artifact-editor-panel">
            <header>
              <strong>导图源码编辑</strong>
              <span>修改后切回可视化即可重新渲染</span>
            </header>
            <textarea value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} rows={16} />
          </section>
        ) : null}
        {!result?.text ? (
          <ResultPanel
            title="导图源码"
            result={result}
            emptyIcon={GitFork}
            emptyTitle="生成后会显示可视化导图"
            emptyDescription="模型输出会被解析为节点，并保留 Markdown/Mermaid 源码。"
          />
        ) : null}
      </section>
    </WorkbenchLayout>
  );
}

export default MindmapModule;
