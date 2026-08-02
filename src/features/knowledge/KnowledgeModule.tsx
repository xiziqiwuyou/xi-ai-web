import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Database, FileText, FileUp, Trash2 } from "lucide-react";
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
import { extractKnowledgeFile, formatBytes } from "./documentExtractors";
import {
  createKnowledgeDocument,
} from "./knowledgeStore";
import {
  clearKnowledgeDocumentsAsync,
  loadKnowledgeDocumentsAsync,
  saveKnowledgeDocumentsAsync
} from "./knowledgeDb";
import { consumeReplayDraft } from "../gallery/replayDraft";
import type {
  GalleryItem,
  GenerationResult,
  KnowledgeChunk,
  KnowledgeDocument,
  ModelCatalogEntry,
  PromptPreset,
  UserProviderConfig
} from "../../types";

type KnowledgeModuleProps = {
  title: string;
  description: string;
  modelCatalog: ModelCatalogEntry[];
  promptPresets: PromptPreset[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onGenerationResult: (item: GalleryItem) => void;
  onRequestApiConfig: () => void;
};

type DraftState = {
  prompt: string;
  context: string;
  temperature: number;
  embeddingModelId: string;
  topK: number;
};

const maxUploadMb = 8;
const maxRequestChunks = 120;

function selectedChunksFrom(documents: KnowledgeDocument[], selectedIds: string[]): KnowledgeChunk[] {
  const selected = new Set(selectedIds);
  return documents
    .filter((document) => selected.has(document.id))
    .flatMap((document) =>
      document.chunks.map((chunk) => ({
        ...chunk,
        documentId: document.id,
        documentName: document.name
      }))
    )
    .slice(0, maxRequestChunks);
}

function KnowledgeModule({
  title,
  description,
  modelCatalog,
  promptPresets,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: KnowledgeModuleProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(() =>
    []
  );
  const [hydrated, setHydrated] = useState(false);
  const [documentQuery, setDocumentQuery] = useState("");
  const [draft, setDraft] = useState<DraftState>({
    prompt: "",
    context: "",
    temperature: 0.2,
    embeddingModelId: "",
    topK: 5
  });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");

  useEffect(() => {
    let alive = true;
    loadKnowledgeDocumentsAsync().then((loaded) => {
      if (!alive) return;
      setDocuments(loaded);
      setSelectedDocumentIds(loaded.map((document) => document.id));
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const replay = consumeReplayDraft("knowledge");
    if (replay?.prompt) {
      updateDraft({ prompt: replay.prompt });
      if (replay.modelId) setSelectedModelId(replay.modelId);
    }
  }, []);

  useEffect(() => {
    if (hydrated) void saveKnowledgeDocumentsAsync(documents);
  }, [documents, hydrated]);

  useEffect(() => {
    setSelectedDocumentIds((current) => current.filter((id) => documents.some((document) => document.id === id)));
  }, [documents]);

  const ready = isUserProviderReady(userProvider);
  const chatModels = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const selectedModel =
    chatModels.find((entry) => entry.id === selectedModelId) ||
    preferredModelFor(chatModels, "chat", userProvider.lastModelId);
  const embeddingModels = useMemo(() => modelsForCapability(modelCatalog, "embedding"), [modelCatalog]);
  const selectedEmbeddingModel =
    embeddingModels.find((entry) => entry.id === draft.embeddingModelId) ||
    preferredModelFor(embeddingModels, "embedding");
  const selectedChunks = useMemo(
    () => selectedChunksFrom(documents, selectedDocumentIds),
    [documents, selectedDocumentIds]
  );
  const visibleDocuments = useMemo(() => {
    const term = documentQuery.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((document) =>
      `${document.name} ${document.type} ${document.text.slice(0, 600)}`.toLowerCase().includes(term)
    );
  }, [documentQuery, documents]);
  const selectedTextLength = selectedChunks.reduce((total, chunk) => total + chunk.text.length, 0);
  const modulePromptPresets = useMemo(
    () => promptPresets.filter((preset) => preset.enabled && preset.moduleId === "knowledge"),
    [promptPresets]
  );
  const presetLabels = modulePromptPresets.length
    ? modulePromptPresets.map((preset) => preset.title)
    : ["总结资料核心结论", "找出资料里的风险点", "根据资料生成执行建议"];
  const presetPromptByTitle = useMemo(
    () => new Map(modulePromptPresets.map((preset) => [preset.title, preset.prompt])),
    [modulePromptPresets]
  );
  const hasContext = Boolean(draft.context.trim()) || selectedChunks.length > 0;
  const canSubmit = ready && Boolean(selectedModel) && Boolean(draft.prompt.trim()) && hasContext && !busy;

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

  const updateDraft = (patch: Partial<DraftState>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleFiles = async (files: FileList | File[]) => {
    const nextFiles = Array.from(files).slice(0, 8);
    if (!nextFiles.length) return;

    setUploadNotice("正在读取资料...");
    const nextDocuments: KnowledgeDocument[] = [];
    const errors: string[] = [];

    for (const file of nextFiles) {
      try {
        const extracted = await extractKnowledgeFile(file, maxUploadMb);
        nextDocuments.push(createKnowledgeDocument(extracted));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${file.name} 读取失败`);
      }
    }

    if (nextDocuments.length) {
      const newIds = nextDocuments.map((document) => document.id);
      setDocuments((current) => [...nextDocuments, ...current].slice(0, 18));
      setSelectedDocumentIds((current) => Array.from(new Set([...newIds, ...current])));
    }

    setUploadNotice(
      [
        nextDocuments.length ? `已加入 ${nextDocuments.length} 份资料` : "",
        errors.length ? errors.join("；") : ""
      ]
        .filter(Boolean)
        .join("。")
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      if (!ready) {
        setNotice("请先填写 API Key");
        onRequestApiConfig();
        return;
      }
      if (!selectedModel) {
        setNotice("请先在后台启用对话模型");
        return;
      }
      if (!hasContext) {
        setNotice("请先上传资料、选择资料，或粘贴临时资料");
        return;
      }
      setNotice("请补全问题");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      if (!selectedModel) return;
      const nextResult = await api.generate("knowledge", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt: draft.prompt.trim(),
        context: draft.context.trim(),
        contextChunks: selectedChunks,
        options: {
          embeddingModelId: selectedEmbeddingModel?.id,
          topK: draft.topK,
          temperature: draft.temperature
        }
      });
      setResult(nextResult);
      setDocuments((current) =>
        current.map((document) =>
          selectedDocumentIds.includes(document.id)
            ? {
                ...document,
                indexedAt: new Date().toISOString(),
                embeddingModelId: selectedEmbeddingModel?.id,
                updatedAt: new Date().toISOString()
              }
            : document
        )
      );
      onGenerationResult({
        ...nextResult,
        sourceModule: "knowledge",
        prompt: draft.prompt.trim(),
        modelId: selectedModel.id
      });
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "检索问答失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleDocument = (documentId: string) => {
    setSelectedDocumentIds((current) =>
      current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId]
    );
  };

  const removeDocument = (documentId: string) => {
    setDocuments((current) => current.filter((document) => document.id !== documentId));
    setSelectedDocumentIds((current) => current.filter((id) => id !== documentId));
  };

  const clearDocuments = () => {
    void clearKnowledgeDocumentsAsync();
    setDocuments([]);
    setSelectedDocumentIds([]);
  };

  const sidebar = (
    <form className="workbench-form knowledge-form" onSubmit={submit}>
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

      <section
        className={dragging ? "knowledge-upload-zone dragging" : "knowledge-upload-zone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".txt,.md,.markdown,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf"
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <span className="knowledge-upload-icon">
          <FileUp size={20} />
        </span>
        <div>
          <strong>上传本地资料</strong>
          <p>支持 TXT、Markdown、CSV、JSON、可提取文本的 PDF，单个文件 {maxUploadMb}MB 内，仅保存在当前浏览器。</p>
        </div>
        <button type="button" className="secondary-action compact-action" onClick={() => inputRef.current?.click()}>
          选择文件
        </button>
      </section>

      {uploadNotice ? <p className="workbench-notice good">{uploadNotice}</p> : null}

      <section className="knowledge-docs">
        <header>
          <div>
            <strong>本地资料</strong>
            <span>
              已选 {selectedDocumentIds.length} / {documents.length}
            </span>
          </div>
          <button type="button" className="icon-button danger" onClick={clearDocuments} disabled={!documents.length}>
            <Trash2 size={15} />
          </button>
        </header>
        <label className="thread-search knowledge-doc-search">
          <input
            value={documentQuery}
            onChange={(event) => setDocumentQuery(event.target.value)}
            placeholder="搜索本地资料"
          />
        </label>

        {documents.length ? (
          <div className="knowledge-doc-list">
            {visibleDocuments.map((document) => {
              const checked = selectedDocumentIds.includes(document.id);
              return (
                <article key={document.id} className={checked ? "knowledge-doc-item selected" : "knowledge-doc-item"}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDocument(document.id)}
                    />
                    <span>
                      <strong>{document.name}</strong>
                      <small>
                        {document.chunks.length} 个片段 · {formatBytes(document.size)}
                      </small>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => removeDocument(document.id)}
                    aria-label="删除资料"
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="knowledge-empty-copy">还没有本地资料，也可以直接粘贴临时资料提问。</p>
        )}
      </section>

      <PromptComposer
        label="问题"
        value={draft.prompt}
        placeholder="围绕资料提出一个具体问题，例如：总结结论、找风险、生成行动建议"
        rows={4}
        presets={presetLabels}
        submitLabel="检索问答"
        busy={busy}
        disabled={!canSubmit}
        notice={notice}
        onChange={(prompt) => updateDraft({ prompt })}
        onPresetPick={(prompt) => updateDraft({ prompt: presetPromptByTitle.get(prompt) || prompt })}
      >
        <label className="prompt-field">
          <span>临时资料</span>
          <textarea
            value={draft.context}
            onChange={(event) => updateDraft({ context: event.target.value })}
            placeholder="粘贴一次性资料；也可以和上方本地资料一起检索。"
            rows={5}
          />
        </label>

        <GenerationOptions>
          <ModelPicker
            className="workbench-model-picker compact"
            models={modelCatalog}
            capability="embedding"
            label="向量模型"
            value={selectedEmbeddingModel?.id || ""}
            onChange={(modelId) => updateDraft({ embeddingModelId: modelId })}
          />
          <label>
            召回片段 {draft.topK}
            <input
              type="range"
              min="2"
              max="8"
              step="1"
              value={draft.topK}
              onChange={(event) => updateDraft({ topK: Number(event.target.value) })}
            />
          </label>
          <label>
            温度 {draft.temperature.toFixed(1)}
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={draft.temperature}
              onChange={(event) => updateDraft({ temperature: Number(event.target.value) })}
            />
          </label>
        </GenerationOptions>
      </PromptComposer>
    </form>
  );

  return (
    <WorkbenchLayout
      title={title}
      description={description}
      icon={Database}
      badges={["文件上传", "本地索引", "向量召回"]}
      sidebar={sidebar}
    >
      <div className="knowledge-result-stack">
        <section className="knowledge-source-summary">
          <div>
            <strong>检索范围</strong>
            <span>
              {selectedChunks.length} 个本地片段 · {selectedTextLength.toLocaleString("zh-CN")} 字符
            </span>
          </div>
          <p>资料保存在当前浏览器，请求时只发送选中的片段和临时资料，不会写入服务端数据文件。</p>
        </section>

        <ResultPanel
          title="知识库回答"
          result={result}
          emptyIcon={FileText}
          emptyTitle="上传或粘贴资料后开始问答"
          emptyDescription="系统会先召回相关片段，再把片段作为上下文发送给你选择的模型。"
        />
      </div>
    </WorkbenchLayout>
  );
}

export default KnowledgeModule;
