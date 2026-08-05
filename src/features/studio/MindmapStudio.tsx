import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Copy,
  Download,
  FileCode2,
  FileText,
  GitFork,
  ImageDown,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from "lucide-react";

import { api } from "../../api";
import { Dialog, FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import type {
  MindmapDensity,
  MindmapDocument,
  MindmapNode,
  MindmapOperation,
  MindmapPresetId
} from "../../types";
import {
  addMindmapChild,
  canAddMindmapChild,
  deleteMindmapNode,
  findMindmapNode,
  mindmapDocumentFromMarkdown,
  mindmapDocumentFromResult,
  mindmapDocumentToMarkdown,
  mindmapDocumentToMermaid,
  mindmapNodeCount,
  moveMindmapNode,
  updateMindmapNode
} from "../mindmap/mindmapDocument";
import {
  copyMindmapText,
  downloadBlob,
  downloadText,
  mindmapDocumentToPngBlob,
  mindmapDocumentToSvg
} from "../mindmap/mindmapExport";
import MindmapTreeCanvas from "../mindmap/MindmapTreeCanvas";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import { StudioModelSelect, useStudioModel, type StudioModuleProps } from "./studioShared";
import { mindmapPresetById, mindmapPresets } from "./mindmapPresets";

const exampleMindmap: MindmapDocument = {
  version: 1,
  title: "AI 产品增长",
  summary: "示例导图，用于预览完整层级和节点操作",
  root: {
    id: "root",
    label: "AI 产品增长",
    note: "从用户价值形成可验证增长闭环",
    children: [
      {
        id: "example-users",
        label: "用户洞察",
        children: [
          { id: "example-audience", label: "核心人群", children: [] },
          { id: "example-needs", label: "真实需求", children: [] },
          { id: "example-scenes", label: "使用场景", children: [] }
        ]
      },
      {
        id: "example-value",
        label: "价值主张",
        children: [
          { id: "example-difference", label: "差异优势", children: [] },
          { id: "example-experience", label: "核心体验", children: [] }
        ]
      },
      {
        id: "example-product",
        label: "产品策略",
        children: [
          { id: "example-loop", label: "最小闭环", children: [] },
          { id: "example-quality", label: "质量指标", children: [] }
        ]
      },
      {
        id: "example-growth",
        label: "增长实验",
        children: [
          { id: "example-content", label: "内容触达", children: [] },
          { id: "example-retention", label: "留存优化", children: [] }
        ]
      }
    ]
  }
};

const depthOptions: readonly FigmaMenuOption[] = [2, 3, 4, 5].map((depth) => ({
  value: String(depth),
  label: `${depth} 层`,
  detail: depth === 2 ? "快速概览" : depth === 5 ? "复杂主题" : "常用层级"
}));

const densityOptions: readonly FigmaMenuOption[] = [
  { value: "concise", label: "精简", detail: "只保留关键节点" },
  { value: "balanced", label: "均衡", detail: "完整且便于阅读" },
  { value: "detailed", label: "详细", detail: "增加必要说明和层级" }
];

const presetOptions: readonly FigmaMenuOption[] = mindmapPresets.map((preset) => ({
  value: preset.id,
  label: preset.label,
  detail: preset.description
}));

type MindmapNotice = { kind: "error" | "success" | "info"; text: string } | null;

function collapsibleNodeIds(node: MindmapNode, result = new Set<string>()) {
  if (node.children.length) result.add(node.id);
  node.children.forEach((child) => collapsibleNodeIds(child, result));
  return result;
}

function MindmapStudio({
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [topic, setTopic] = useState("");
  const [presetId, setPresetId] = useState<MindmapPresetId>("brainstorm");
  const [maxDepth, setMaxDepth] = useState<2 | 3 | 4 | 5>(4);
  const [density, setDensity] = useState<MindmapDensity>("balanced");
  const [mindmap, setMindmap] = useState<MindmapDocument>(exampleMindmap);
  const [isExample, setIsExample] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState(exampleMindmap.root.id);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const [busyOperation, setBusyOperation] = useState<MindmapOperation | null>(null);
  const [notice, setNotice] = useState<MindmapNotice>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const [fitVersion, setFitVersion] = useState(0);
  const { models, selectedModel, chooseModel } = useStudioModel(
    modelCatalog,
    "chat",
    userProvider,
    onUserProviderChange
  );
  const selectedPreset = mindmapPresetById(presetId);
  const selectedNode = useMemo(
    () => findMindmapNode(mindmap.root, selectedNodeId) || mindmap.root,
    [mindmap, selectedNodeId]
  );
  const busy = busyOperation !== null;

  const commitLocal = (next: MindmapDocument, nextSelectedId = selectedNodeId) => {
    setMindmap(next);
    setIsExample(false);
    setSelectedNodeId(findMindmapNode(next.root, nextSelectedId)?.id || next.root.id);
    setNotice({ kind: "info", text: "本地修改已应用。" });
  };

  const runAiOperation = async (operation: MindmapOperation) => {
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedModel) {
      setNotice({ kind: "error", text: "暂无可用的思维导图模型。" });
      return;
    }
    if (operation === "generate" && !topic.trim()) {
      setNotice({ kind: "error", text: "请输入主题、资料摘要或会议内容。" });
      return;
    }
    if (operation !== "generate" && isExample) {
      setNotice({ kind: "error", text: "请先生成自己的导图，再使用 AI 扩展或重组。" });
      return;
    }

    setBusyOperation(operation);
    setNotice(null);
    try {
      const nextResult = await api.generate("mindmap", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt: topic.trim() || mindmap.title,
        options: {
          mindmap: {
            presetId,
            maxDepth,
            density,
            operation,
            targetNodeId: operation === "expand" ? selectedNode.id : undefined,
            currentDocument: operation === "generate" ? undefined : mindmap
          }
        }
      });
      const nextMindmap = mindmapDocumentFromResult(nextResult, topic.trim() || mindmap.title);
      if (!nextMindmap || !nextMindmap.root.children.length) {
        throw new Error("模型返回的导图结构无法使用，请调整主题后重试");
      }
      setMindmap(nextMindmap);
      setIsExample(false);
      setCollapsedNodeIds(new Set());
      setSelectedNodeId(
        operation === "expand" && findMindmapNode(nextMindmap.root, selectedNode.id)
          ? selectedNode.id
          : nextMindmap.root.id
      );
      setFitVersion((version) => version + 1);
      setSourceDraft(mindmapDocumentToMarkdown(nextMindmap));
      setNotice({
        kind: "success",
        text: operation === "expand" ? `已扩展“${selectedNode.label}”节点。` : operation === "reorganize" ? "导图已重新组织。" : "思维导图已生成。"
      });
      onGenerationResult({
        ...nextResult,
        mindmap: nextMindmap,
        text: mindmapDocumentToMarkdown(nextMindmap),
        sourceModule: "mindmap",
        prompt: topic.trim() || mindmap.title,
        modelId: selectedModel.id
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "思维导图生成失败" });
    } finally {
      setBusyOperation(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runAiOperation("generate");
  };

  const openSource = () => {
    setSourceDraft(mindmapDocumentToMarkdown(mindmap));
    setSourceOpen((open) => !open);
  };

  const applySource = () => {
    const next = mindmapDocumentFromMarkdown(sourceDraft, mindmap.title);
    if (!next || !next.root.children.length) {
      setNotice({ kind: "error", text: "源码中没有可用的层级，请使用 Markdown 标题组织节点。" });
      return;
    }
    commitLocal(next, next.root.id);
    setCollapsedNodeIds(new Set());
    setFitVersion((version) => version + 1);
    setSourceOpen(false);
  };

  const copyMarkdown = async () => {
    try {
      await copyMindmapText(mindmapDocumentToMarkdown(mindmap));
      setNotice({ kind: "success", text: "已复制当前导图的 Markdown。" });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "复制失败" });
    }
  };

  const exportPng = async () => {
    try {
      downloadBlob(await mindmapDocumentToPngBlob(mindmap), "mindmap.png");
      setNotice({ kind: "success", text: "PNG 图片已导出。" });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "PNG 导出失败" });
    }
  };

  return (
    <section className="figma-module-view figma-mindmap-page" data-testid="mindmap-module">
      <header className="figma-page-hero figma-mindmap-hero">
        <p>07 / THINKING MAP</p>
        <h1>把模糊想法，<em>变成清晰路径。</em></h1>
        <span>输入一个问题或资料，AI 将整理完整层级；生成后可以编辑节点、扩展分支或重新组织。</span>
      </header>

      <form className="figma-map-command" onSubmit={submit}>
        <div className="figma-map-options">
          <StudioModelSelect
            models={models}
            selectedModel={selectedModel}
            onChange={chooseModel}
            ariaLabel="思维导图生成模型"
            className="figma-map-option-menu figma-map-model-menu"
            disabled={busy}
          />
          <FigmaMenu
            className="figma-map-option-menu"
            label="导图类型"
            value={presetId}
            options={presetOptions}
            onChange={(value) => setPresetId(value as MindmapPresetId)}
            ariaLabel="思维导图类型"
            disabled={busy}
          />
          <FigmaMenu
            className="figma-map-option-menu"
            label="最大层级"
            value={String(maxDepth)}
            options={depthOptions}
            onChange={(value) => setMaxDepth(Number(value) as 2 | 3 | 4 | 5)}
            ariaLabel="思维导图最大层级"
            disabled={busy}
          />
          <FigmaMenu
            className="figma-map-option-menu"
            label="内容密度"
            value={density}
            options={densityOptions}
            onChange={(value) => setDensity(value as MindmapDensity)}
            ariaLabel="思维导图内容密度"
            disabled={busy}
          />
        </div>

        <label className="figma-map-prompt">
          <span>主题或资料</span>
          <textarea
            aria-label="导图主题"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="输入主题、文章、会议纪要或项目资料..."
            maxLength={selectedModel?.maxInputCharacters}
            rows={4}
          />
        </label>

        <div className="figma-map-preset-summary">
          <div>
            <strong>{selectedPreset.label}</strong>
            <span>{selectedPreset.description}</span>
          </div>
          <button type="button" onClick={() => setTopic(selectedPreset.example)} disabled={busy}>
            <WandSparkles size={14} />填入示例
          </button>
        </div>

        <button type="submit" className="figma-primary-action figma-map-submit" disabled={busy || !topic.trim() || !selectedModel}>
          {busyOperation === "generate" ? <Loader2 className="spin" size={16} /> : <GitFork size={16} />}
          {busyOperation === "generate" ? "生成中" : "AI 生成导图"}
        </button>
      </form>

      {notice ? (
        <p className={`figma-module-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
      {!models.length ? <p className="figma-module-notice" role="status">暂无可用导图模型。</p> : null}

      <section className="figma-map-workspace" aria-label="思维导图工作台">
        <div className="figma-map-main">
          <header className="figma-map-toolbar">
            <div>
              <strong>{mindmap.title}</strong>
              <span>{isExample ? "示例导图" : `${mindmapNodeCount(mindmap.root)} 个节点`}</span>
            </div>
            <div className="figma-map-toolbar-actions">
              <button type="button" onClick={() => void runAiOperation("reorganize")} disabled={busy || isExample}>
                <Sparkles size={14} />AI 重组
              </button>
              <button type="button" onClick={openSource} disabled={busy} aria-pressed={sourceOpen}>
                <Braces size={14} />源码
              </button>
              <button type="button" onClick={() => void copyMarkdown()} disabled={busy}>
                <Copy size={14} />复制
              </button>
              <button type="button" onClick={() => downloadText(mindmapDocumentToMarkdown(mindmap), "mindmap.md", "text/markdown;charset=utf-8")}>
                <FileText size={14} />Markdown
              </button>
              <button type="button" onClick={() => downloadText(mindmapDocumentToMermaid(mindmap), "mindmap.mmd", "text/plain;charset=utf-8")}>
                <FileCode2 size={14} />Mermaid
              </button>
              <button type="button" onClick={() => downloadText(mindmapDocumentToSvg(mindmap), "mindmap.svg", "image/svg+xml;charset=utf-8")}>
                <Download size={14} />SVG
              </button>
              <button type="button" onClick={() => void exportPng()}>
                <ImageDown size={14} />PNG
              </button>
            </div>
          </header>

          <MindmapTreeCanvas
            document={mindmap}
            selectedNodeId={selectedNode.id}
            collapsedNodeIds={collapsedNodeIds}
            busy={busy}
            fitVersion={fitVersion}
            onSelectNode={setSelectedNodeId}
            onToggleNode={(nodeId) => setCollapsedNodeIds((current) => {
              const next = new Set(current);
              if (next.has(nodeId)) next.delete(nodeId);
              else next.add(nodeId);
              return next;
            })}
            onCollapseAll={() => setCollapsedNodeIds(collapsibleNodeIds(mindmap.root))}
            onExpandAll={() => setCollapsedNodeIds(new Set())}
          />
        </div>

        <aside className="figma-map-inspector" aria-label="选中节点编辑">
          <header>
            <div><strong>节点编辑</strong><span>{selectedNode.id === mindmap.root.id ? "中心主题" : "普通节点"}</span></div>
            <GitFork size={16} aria-hidden="true" />
          </header>
          <label>
            <span>节点名称</span>
            <input
              value={selectedNode.label}
              maxLength={24}
              onChange={(event) => commitLocal(updateMindmapNode(mindmap, selectedNode.id, { label: event.target.value }))}
            />
          </label>
          <label>
            <span>补充说明</span>
            <textarea
              value={selectedNode.note || ""}
              maxLength={180}
              rows={5}
              placeholder="可选：背景、标准、负责人或待确认事项"
              onChange={(event) => commitLocal(updateMindmapNode(mindmap, selectedNode.id, { note: event.target.value }))}
            />
          </label>
          <div className="figma-map-node-actions">
            <button
              type="button"
              onClick={() => {
                const next = addMindmapChild(mindmap, selectedNode.id);
                const added = findMindmapNode(next.root, selectedNode.id)?.children.at(-1);
                commitLocal(next, added?.id || selectedNode.id);
              }}
              disabled={!canAddMindmapChild(mindmap, selectedNode.id)}
            >
              <Plus size={14} />添加子节点
            </button>
            <button type="button" onClick={() => commitLocal(moveMindmapNode(mindmap, selectedNode.id, -1))} disabled={selectedNode.id === mindmap.root.id}>
              <ArrowUp size={14} />上移
            </button>
            <button type="button" onClick={() => commitLocal(moveMindmapNode(mindmap, selectedNode.id, 1))} disabled={selectedNode.id === mindmap.root.id}>
              <ArrowDown size={14} />下移
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                commitLocal(deleteMindmapNode(mindmap, selectedNode.id), mindmap.root.id);
                setCollapsedNodeIds((current) => {
                  const next = new Set(current);
                  next.delete(selectedNode.id);
                  return next;
                });
              }}
              disabled={selectedNode.id === mindmap.root.id}
            >
              <Trash2 size={14} />删除节点
            </button>
          </div>
          <button
            type="button"
            className="figma-map-ai-expand"
            onClick={() => void runAiOperation("expand")}
            disabled={busy || isExample || !canAddMindmapChild(mindmap, selectedNode.id)}
          >
            {busyOperation === "expand" ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
            {busyOperation === "expand" ? "正在扩展" : "AI 扩展此节点"}
          </button>
        </aside>
      </section>

      <Dialog
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        labelledBy="mindmap-source-title"
        describedBy="mindmap-source-description"
        className="figma-map-source-dialog"
      >
        <header>
          <div>
            <strong id="mindmap-source-title">Markdown 源码</strong>
            <span id="mindmap-source-description">使用标题层级表示节点关系，应用后会重新生成本地节点 ID。</span>
          </div>
          <button type="button" aria-label="关闭导图源码编辑" onClick={() => setSourceOpen(false)}>
            <X size={17} />
          </button>
        </header>
        <div className="figma-map-source-dialog-body">
          <textarea
            data-dialog-initial-focus
            value={sourceDraft}
            onChange={(event) => setSourceDraft(event.target.value)}
            rows={16}
          />
        </div>
        <footer>
          <button type="button" onClick={() => setSourceOpen(false)}>取消</button>
          <button type="button" className="primary" onClick={applySource}>应用源码</button>
        </footer>
      </Dialog>
    </section>
  );
}

export { MindmapStudio };
