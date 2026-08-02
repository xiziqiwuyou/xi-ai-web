import { useEffect, useId, useMemo, useState } from "react";

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

import { queueAssistantLaunch } from "../assistants/assistantLaunch";
import { Dialog } from "../../components/ui";
import { type StudioModuleProps } from "./studioShared";

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


const preferredAssistantCategories = [
  "通用效率",
  "内容创作",
  "编程开发",
  "学习研究",
  "商业办公",
  "生活创意"
] as const;

function assistantCategories(assistants: Assistant[]) {
  const available = new Set(assistants.map((assistant) => assistant.category || "通用效率"));
  const preferred = preferredAssistantCategories.filter((category) => available.has(category));
  const additional = [...available]
    .filter((category) => !preferredAssistantCategories.includes(category as (typeof preferredAssistantCategories)[number]))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  return ["全部", ...preferred, ...additional];
}

export function AssistantsStudio({ assistants, onModuleChange }: StudioModuleProps) {
  const availableAssistants = useMemo(
    () => assistants.filter((assistant) => assistant.enabled !== false),
    [assistants]
  );
  const categories = useMemo(() => assistantCategories(availableAssistants), [availableAssistants]);
  const [activeCategory, setActiveCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(availableAssistants[0]?.id || "");
  const [selectedStarterPrompt, setSelectedStarterPrompt] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredAssistants = availableAssistants.filter((assistant) => {
    if (activeCategory !== "全部" && assistant.category !== activeCategory) return false;
    if (!normalizedQuery) return true;
    return [assistant.name, assistant.description, assistant.category, ...assistant.tags]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const selected = availableAssistants.find((assistant) => assistant.id === selectedId) || availableAssistants[0];

  useEffect(() => {
    if (!categories.includes(activeCategory)) setActiveCategory("全部");
  }, [activeCategory, categories]);

  useEffect(() => {
    if (selectedId && availableAssistants.some((assistant) => assistant.id === selectedId)) return;
    setSelectedId(availableAssistants[0]?.id || "");
  }, [availableAssistants, selectedId]);

  const startConversation = () => {
    if (!selected) return;
    try {
      queueAssistantLaunch(selected.id, selectedStarterPrompt);
      setDetailOpen(false);
      setNotice("");
      onModuleChange("chat");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法启动助手，请检查浏览器存储权限。");
    }
  };

  return (
    <section className="figma-module-view figma-assistants-page" data-testid="assistants-module">
      <header className="figma-page-hero figma-assistants-hero">
        <div>
          <p>08 / AGENT LIBRARY</p>
          <h1>给任务找一位<br /><em>真正懂行的伙伴。</em></h1>
          <span className="figma-hero-copy">每位 AI 助手都有专属指令、知识结构与工作方式。选择一个，立即开始协作。</span>
        </div>
        <span>{String(availableAssistants.length).padStart(2, "0")} CURATED AGENTS</span>
      </header>

      <div className="figma-agent-toolbar">
        <nav className="figma-agent-filters" aria-label="助手分类">
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              className={activeCategory === category ? "active" : ""}
              aria-pressed={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </nav>
        <label className="figma-agent-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索助手"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、分类或标签"
          />
        </label>
      </div>

      {filteredAssistants.length ? (
        <section className="figma-agent-grid" aria-label="助手列表">
          {filteredAssistants.map((assistant) => (
            <button
              key={assistant.id}
              type="button"
              className="figma-agent-card"
              onClick={() => {
                setSelectedId(assistant.id);
                setSelectedStarterPrompt("");
                setNotice("");
                setDetailOpen(true);
              }}
              aria-haspopup="dialog"
              aria-label={`查看助手 ${assistant.name}`}
            >
              <span className="figma-agent-symbol" style={{ background: assistant.color }}><Bot size={19} /></span>
              <small className="figma-agent-category">{assistant.category}</small>
              <strong>{assistant.name}</strong>
              <p>{assistant.description}</p>
              <span className="figma-agent-tags">
                {assistant.tags.map((tag) => <small key={tag}>{tag}</small>)}
              </span>
            </button>
          ))}
        </section>
      ) : (
        <div className="figma-empty-state" role="status">
          <Bot size={24} />
          <strong>没有找到匹配的助手</strong>
          <p>调整分类或搜索关键词。</p>
        </div>
      )}

      {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}

      <Dialog
        open={detailOpen && Boolean(selected)}
        labelledBy={titleId}
        describedBy={descriptionId}
        onClose={() => setDetailOpen(false)}
        className="figma-agent-dialog"
      >
        <div className="figma-agent-dialog-top">
          <span className="figma-agent-dialog-symbol" style={{ background: selected?.color }}>
            <Bot size={21} />
          </span>
          <button type="button" onClick={() => setDetailOpen(false)} aria-label="关闭助手详情" title="关闭">
            <X size={17} />
          </button>
        </div>
        <small>SPECIALIST AGENT</small>
        <h2 id={titleId}>{selected?.name || "助手详情"}</h2>
        {selected ? (
          <>
            <p id={descriptionId}>{selected.description}</p>
            <div className="figma-agent-dialog-tags" aria-label="助手标签">
              <span>{selected.category}</span>
              {selected.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            {selected.starterPrompts.length ? (
              <section className="figma-agent-starters" aria-label="开场问题">
                <strong>可以这样开始</strong>
                <div>
                  {selected.starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className={selectedStarterPrompt === prompt ? "active" : ""}
                      aria-pressed={selectedStarterPrompt === prompt}
                      onClick={() => setSelectedStarterPrompt((current) => current === prompt ? "" : prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <button type="button" className="figma-primary-action" onClick={startConversation}>
              <Sparkles size={16} />
              启动此助手
            </button>
          </>
        ) : null}
      </Dialog>
    </section>
  );
}
