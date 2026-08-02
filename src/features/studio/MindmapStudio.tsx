import { useEffect, useMemo, useState, type FormEvent } from "react";

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
import { downloadText, mindmapToSvg } from "../mindmap/mindmapExport";
import { parseMindmap } from "../mindmap/mindmapParser";
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


const mindmapBranches = ["用户洞察", "价值主张", "产品策略", "增长实验"] as const;

const defaultMindmapSource = `# 构建 AI 驱动的产品增长体系
## 用户洞察
### 核心人群
### 真实需求
### 使用场景
## 价值主张
### 差异优势
### 核心体验
### 可信证明
## 产品策略
### 最小闭环
### 版本节奏
### 质量指标
## 增长实验
### 内容触达
### 渠道合作
### 留存优化`;

const mindmapCapabilities = [
  { icon: Expand, title: "一键展开", detail: "从中心主题延展更多观点" },
  { icon: Shuffle, title: "AI 重组", detail: "按时间、优先级或因果排序" },
  { icon: Download, title: "导出图片", detail: "生成可分享的高清结构图" }
] as const;

export function MindmapStudio({
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [topic, setTopic] = useState("构建 AI 驱动的产品增长体系");
  const [activeBranchId, setActiveBranchId] = useState("");
  const [branchOrderOffset, setBranchOrderOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const { models, selectedModel, chooseModel } = useStudioModel(modelCatalog, "chat", userProvider, onUserProviderChange);
  const canvasSource = result?.text || defaultMindmapSource;
  const parsed = useMemo(() => parseMindmap(canvasSource, topic || "思维导图"), [canvasSource, topic]);
  const branchSource = useMemo(() => {
    const generated = parsed.children
      .filter((node) => node.label.trim())
      .slice(0, 4)
      .map((node) => ({
        id: node.id,
        label: node.label,
        count: node.children.length
      }));
    if (generated.length) return generated;
    return mindmapBranches.map((label, index) => ({
      id: `fallback-${index}`,
      label,
      count: 3
    }));
  }, [parsed]);
  const branchCards = useMemo(
    () => branchSource.map((_, index) => branchSource[(index + branchOrderOffset) % branchSource.length]),
    [branchOrderOffset, branchSource]
  );

  useEffect(() => {
    setBranchOrderOffset((value) => branchSource.length ? value % branchSource.length : 0);
    setActiveBranchId((current) => (
      current && branchSource.some((branch) => branch.id === current) ? current : ""
    ));
  }, [branchSource]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedModel || !topic.trim()) {
      setNotice("请输入需要整理的主题。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const nextResult = await api.generate("mindmap", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt: topic.trim()
      });
      setResult(nextResult);
      onGenerationResult({
        ...nextResult,
        sourceModule: "mindmap",
        prompt: topic.trim(),
        modelId: selectedModel.id
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "思维导图生成失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="figma-module-view figma-mindmap-page" data-testid="mindmap-module">
      <header className="figma-page-hero figma-mindmap-hero">
        <p>07 / THINKING MAP</p>
        <h1>把模糊想法，<em>变成清晰路径。</em></h1>
        <span>输入一个问题或主题，AI 将为你提炼关键分支、逻辑关系和下一步行动。</span>
      </header>

      <form className="figma-map-command" onSubmit={submit}>
        <StudioModelSelect
          models={models}
          selectedModel={selectedModel}
          onChange={chooseModel}
          ariaLabel="思维导图生成模型"
          className="figma-compact-model-menu figma-map-model-menu"
          disabled={busy}
        />
        <label>
          <span className="figma-visually-hidden">导图主题</span>
          <input
            aria-label="导图主题"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="输入主题、资料摘要或会议纪要..."
          />
        </label>
        <button type="submit" className="figma-primary-action" disabled={busy || !topic.trim() || !selectedModel}>
          {busy ? <Loader2 className="spin" size={16} /> : <GitFork size={16} />}
          {busy ? "生成中" : "AI 生成导图"}
        </button>
      </form>
      {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}
      {!models.length ? <p className="figma-module-notice" role="status">暂无可用导图模型。</p> : null}

      <section className="figma-map-canvas" aria-label="思维导图画布">
        <div className="figma-map-stage" style={{ transform: `scale(${zoom})` }}>
          <svg className="figma-map-connectors" viewBox="0 0 1000 440" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 430 198 L 165 112" />
            <path d="M 430 244 L 205 332" />
            <path d="M 570 198 L 844 92" />
            <path d="M 570 244 L 850 320" />
          </svg>
          <div className="figma-map-center-node">
            <Sparkles size={18} />
            <strong>{parsed.label || topic || "思维导图"}</strong>
          </div>
          {branchCards.map((branch, index) => (
            <button
              type="button"
              key={branch.id}
              className={`figma-map-branch branch-${index + 1}${activeBranchId === branch.id ? " active" : ""}`}
              aria-pressed={activeBranchId === branch.id}
              onClick={() => setActiveBranchId(branch.id)}
            >
              <strong>{branch.label}</strong>
              <small>AI 已扩展 {branch.count} 个节点</small>
            </button>
          ))}
        </div>
        <div className="figma-map-zoom" aria-label="画布缩放">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.8, Number((value - 0.1).toFixed(1))))} aria-label="缩小">
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.2, Number((value + 0.1).toFixed(1))))} aria-label="放大">
            <Plus size={14} />
          </button>
        </div>
      </section>

      <section className="figma-map-capabilities" aria-label="思维导图能力">
        {mindmapCapabilities.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.title}
              onClick={() => {
                if (index === 0) {
                  const currentIndex = branchCards.findIndex((branch) => branch.id === activeBranchId);
                  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % branchCards.length;
                  setActiveBranchId(branchCards[nextIndex].id);
                  setNotice(`已展开“${branchCards[nextIndex].label}”分支。`);
                  return;
                }
                if (index === 1) {
                  setBranchOrderOffset((value) => (value + 1) % branchCards.length);
                  setNotice("已重新排列导图分支。");
                  return;
                }
                downloadText(mindmapToSvg(parsed), "mindmap.svg", "image/svg+xml;charset=utf-8");
              }}
            >
              <Icon size={17} aria-hidden="true" />
              <div><strong>{item.title}</strong><p>{item.detail}</p></div>
            </button>
          );
        })}
      </section>
    </section>
  );
}
