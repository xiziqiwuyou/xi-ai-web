import { useState, type FormEvent } from "react";

import {
  ArrowLeftRight,
  Bot,
  BookOpen,
  CheckCircle2,
  Columns2,
  Copy,
  Download,
  Expand,
  FileText,
  FileUp,
  GitFork,
  Languages,
  Loader2,
  Minus,
  Plus,
  Search,
  Shuffle,
  Sparkles,
  Wand2,
  X
} from "lucide-react";

import { api } from "../../api";
import { FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import { exportPptxFromMarkdown } from "../generation/pptxExport";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import { StudioModelSelect, useStudioModel, type StudioModuleProps } from "./studioShared";

import type {
  Assistant,
  GalleryItem,
  GenerationModuleId,
  GenerationResult,
  ImageAspectRatio,
  ImageGenerationMode,
  ImageInputPayload,
  ImageOutputFormat,
  ImageResolution,
  ModelCatalogEntry,
  ModuleId,
  UserProviderConfig
} from "../../types";


const pptAudienceOptions: readonly FigmaMenuOption[] = [
  { value: "企业管理层", label: "企业管理层" },
  { value: "潜在投资人", label: "潜在投资人" },
  { value: "内部团队", label: "内部团队" },
  { value: "公开听众", label: "公开听众" }
];

const pptDurationOptions: readonly FigmaMenuOption[] = [
  { value: "5 分钟", label: "5 分钟" },
  { value: "8–10 分钟", label: "8–10 分钟" },
  { value: "20 分钟", label: "20 分钟" },
  { value: "30 分钟", label: "30 分钟" }
];

const pptVisualToneOptions: readonly FigmaMenuOption[] = [
  { value: "未来专业", label: "未来专业" },
  { value: "极简科技", label: "极简科技" },
  { value: "专业商务", label: "专业商务" },
  { value: "明快创意", label: "明快创意" }
];

const pptStages = [
  "发现叙事主线",
  "生成页面结构",
  "匹配视觉素材",
  "润色关键表达"
] as const;

const pptPromptIdeas = [
  "年度战略复盘",
  "新品发布方案",
  "市场进入策略",
  "行业趋势解读"
] as const;

export function PptStudio({
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [topic, setTopic] = useState("生成式 AI 如何重塑企业创新");
  const [audience, setAudience] = useState("企业管理层");
  const [duration, setDuration] = useState("8–10 分钟");
  const [visualTone, setVisualTone] = useState("未来专业");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const { models, selectedModel, chooseModel } = useStudioModel(modelCatalog, "chat", userProvider, onUserProviderChange);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedModel || !topic.trim()) {
      setNotice("请输入演示主题并确认模型可用。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const prompt = `${topic.trim()}\n目标受众：${audience}\n演讲时长：${duration}\n视觉语气：${visualTone}\n内容规模：约 8 页`;
      const nextResult = await api.generate("ppt", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt
      });
      setResult(nextResult);
      onGenerationResult({ ...nextResult, sourceModule: "ppt", prompt, modelId: selectedModel.id });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PPT 生成失败");
    } finally {
      setBusy(false);
    }
  };

  const downloadDeck = async () => {
    if (!result?.text || exporting) return;
    setExporting(true);
    setNotice("");
    try {
      await exportPptxFromMarkdown(result.text, topic.trim() || result.title);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PPT export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="figma-module-view figma-ppt-page" data-testid="ppt-module">
      <header className="figma-page-hero figma-ppt-hero">
        <p>06 / AUTO-DECK</p>
        <h1>一句主题，<em>一份好 PPT。</em></h1>
        <span>AiStudio 会研究主题、编排故事、选择视觉语言，并生成可下载的演示文稿。</span>
      </header>

      <form className="figma-ppt-creator" onSubmit={submit}>
        <section className="figma-ppt-input-panel">
          <div className="figma-ppt-step-label">
            <b>01</b>
            <strong>描述你的主题</strong>
          </div>
          <label className="figma-ppt-topic">
            <span className="figma-visually-hidden">演示主题</span>
            <textarea
              aria-label="演示主题"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              rows={3}
              placeholder="告诉 AI 这份演示要讲什么..."
            />
          </label>
          <div className="figma-ppt-options" aria-label="演示选项">
            <StudioModelSelect
              models={models}
              selectedModel={selectedModel}
              onChange={chooseModel}
              ariaLabel="PPT 生成模型"
              className="figma-ppt-menu figma-ppt-model-menu"
              disabled={busy}
            />
            <FigmaMenu
              className="figma-ppt-menu"
              label="目标受众"
              value={audience}
              options={pptAudienceOptions}
              onChange={setAudience}
              ariaLabel="目标受众"
            />
            <FigmaMenu
              className="figma-ppt-menu"
              label="演示时长"
              value={duration}
              options={pptDurationOptions}
              onChange={setDuration}
              ariaLabel="演示时长"
            />
            <FigmaMenu
              className="figma-ppt-menu"
              label="视觉气质"
              value={visualTone}
              options={pptVisualToneOptions}
              onChange={setVisualTone}
              ariaLabel="视觉气质"
            />
          </div>
          {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}
          {!models.length ? <p className="figma-module-notice" role="status">暂无可用演示模型。</p> : null}
          <div className="figma-ppt-action-row">
            <button type="submit" className="figma-primary-action figma-ppt-submit" disabled={busy || !topic.trim() || !selectedModel}>
              {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
              {busy ? "正在创作" : "让 AI 开始创作"}
            </button>
            <p className="figma-ppt-support">预计 40 秒 · 约 8 页内容 · 支持导出 PPTX</p>
          </div>
        </section>

        <aside className="figma-ppt-stages" aria-labelledby="ppt-stages-title">
          <small id="ppt-stages-title">WHAT AI CREATES</small>
          <ol>
            {pptStages.map((stage, index) => (
              <li key={stage}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{stage}</strong>
              </li>
            ))}
          </ol>
          <p>不再从空白页面开始。只需表达你的目标，剩下的交给 AI。</p>
        </aside>
      </form>

      <section className="figma-ppt-ideas" aria-labelledby="ppt-ideas-title">
        <header><small id="ppt-ideas-title">PROMPT IDEAS</small></header>
        <div>
          {pptPromptIdeas.map((idea) => (
            <button type="button" key={idea} onClick={() => setTopic(idea)}>{idea}</button>
          ))}
        </div>
      </section>

      {result?.text ? (
        <section className="figma-ppt-result" aria-labelledby="ppt-result-title">
          <header>
            <div><small>PRESENTATION OUTLINE</small><h2 id="ppt-result-title">演示大纲</h2></div>
            <button type="button" onClick={() => void downloadDeck()} disabled={exporting}>
              {exporting ? <Loader2 className="spin" size={14} /> : <Download size={14} />}
              {exporting ? "导出中" : "下载 PPT"}
            </button>
          </header>
          <div><FileText size={22} /><pre>{result.text}</pre></div>
        </section>
      ) : null}
    </section>
  );
}
