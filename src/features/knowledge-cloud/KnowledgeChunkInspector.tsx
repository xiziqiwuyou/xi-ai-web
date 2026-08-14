import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Eye,
  FileText,
  LoaderCircle,
  Save,
  X
} from "lucide-react";
import { api } from "../../api";
import type {
  KnowledgeCloudChunk,
  KnowledgeCloudDocument,
  KnowledgeChunkPreview,
  KnowledgeChunkStrategyId,
  KnowledgeChunkStrategyPreset
} from "../../types";

type KnowledgeChunkInspectorProps = {
  document: KnowledgeCloudDocument;
  csrfToken: string;
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

function formatBytes(value: string) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatLocator(locator: Record<string, unknown>) {
  const values = Object.entries(locator)
    .filter(([, value]) => ["string", "number"].includes(typeof value))
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return values.length ? values.join(" · ") : "无定位信息";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "分块操作失败";
}

export function KnowledgeChunkInspector({
  document,
  csrfToken,
  onClose,
  onError,
  onNotice
}: KnowledgeChunkInspectorProps) {
  const [chunks, setChunks] = useState<KnowledgeCloudChunk[]>([]);
  const [presets, setPresets] = useState<KnowledgeChunkStrategyPreset[]>([]);
  const [capacity, setCapacity] = useState({
    sourceBytes: "0",
    normalizedBytes: "0",
    activeChunkBytes: "0",
    activeVectorBytes: "0",
    draftChunkBytes: "0"
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [strategyId, setStrategyId] = useState<KnowledgeChunkStrategyId>("balanced");
  const [preview, setPreview] = useState<KnowledgeChunkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const selected = useMemo(
    () => chunks.find((chunk) => chunk.id === selectedId) || chunks[0] || null,
    [chunks, selectedId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, presetResponse] = await Promise.all([
        api.knowledgeDocumentChunks(document.id, { limit: 50 }),
        api.knowledgeChunkStrategyPresets()
      ]);
      setChunks(page.items);
      setCapacity(page.capacity);
      setNextCursor(page.nextCursor);
      setSelectedId(page.items[0]?.id || "");
      setPresets(presetResponse.items);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [document.id, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setDraftText(selected.text);
    setDraftEnabled(selected.enabled);
    setStrategyId(selected.strategyId || "balanced");
  }, [selected]);

  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const page = await api.knowledgeDocumentChunks(document.id, {
        cursor: nextCursor,
        limit: 50
      });
      setChunks((current) => [...current, ...page.items]);
      setCapacity(page.capacity);
      setNextCursor(page.nextCursor);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const saveRevision = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const result = await api.reviseKnowledgeChunk(csrfToken, selected.id, {
        expectedRevision: selected.revision,
        text: draftText,
        enabled: draftEnabled
      });
      setChunks((current) => current.map((chunk) =>
        chunk.id === result.chunk.id ? result.chunk : chunk
      ));
      onNotice("分块草稿已保存，活动索引未变更");
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const createPreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await api.previewKnowledgeDocumentChunks(csrfToken, document.id, strategyId));
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <section className="knowledge-chunk-inspector" aria-labelledby="knowledge-chunk-title">
      <header className="knowledge-chunk-heading">
        <div>
          <span className="knowledge-document-icon"><FileText size={17} /></span>
          <div><h3 id="knowledge-chunk-title">{document.displayName}</h3><p>规范化分块</p></div>
        </div>
        <button type="button" className="knowledge-icon-button" onClick={onClose} aria-label="关闭分块" title="关闭分块"><X size={16} /></button>
      </header>

      <div className="knowledge-chunk-capacity" aria-label="文档容量归属">
        <span><small>源文件</small><strong>{formatBytes(capacity.sourceBytes)}</strong></span>
        <span><small>规范化</small><strong>{formatBytes(capacity.normalizedBytes)}</strong></span>
        <span><small>活动分块</small><strong>{formatBytes(capacity.activeChunkBytes)}</strong></span>
        <span><small>活动向量</small><strong>{formatBytes(capacity.activeVectorBytes)}</strong></span>
        <span><small>草稿</small><strong>{formatBytes(capacity.draftChunkBytes)}</strong></span>
      </div>

      <div className="knowledge-chunk-strategy">
        <div className="knowledge-chunk-segments" aria-label="分块策略">
          {presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              aria-pressed={strategyId === preset.id}
              onClick={() => setStrategyId(preset.id)}
            >
              <strong>{preset.label}</strong>
              <small>{preset.maxCharacters} 字 · 重叠 {preset.overlapCharacters}</small>
            </button>
          ))}
        </div>
        <button type="button" className="knowledge-workspace-button" onClick={() => void createPreview()} disabled={previewing}>
          {previewing ? <LoaderCircle className="knowledge-cloud-spin" size={15} /> : <Eye size={15} />}预览
        </button>
      </div>

      {preview ? (
        <div className="knowledge-chunk-preview" aria-label="分块策略预览">
          <div><strong>{preview.totalChunks} 个预览分块</strong><small>{preview.sourceTruncated ? "源文本已按上限截断" : preview.strategy.label}</small></div>
          <ol>
            {preview.items.map((item) => <li key={item.ordinal}><span>{item.ordinal + 1}</span><p>{item.text}</p><small>{item.tokenEstimate} Tokens</small></li>)}
          </ol>
        </div>
      ) : null}

      <div className="knowledge-chunk-workbench">
        <div className="knowledge-chunk-list" aria-label="文档分块">
          {chunks.map((chunk) => (
            <button type="button" key={chunk.id} className={selected?.id === chunk.id ? "active" : ""} onClick={() => setSelectedId(chunk.id)}>
              <span>{chunk.ordinal + 1}</span>
              <span><strong>{chunk.enabled ? "已启用" : "已停用"}{chunk.draft ? " · 草稿" : ""}</strong><small>{formatLocator(chunk.locator)}</small></span>
              <ChevronRight size={15} />
            </button>
          ))}
          {nextCursor ? <button type="button" className="knowledge-chunk-more" onClick={() => void loadMore()} disabled={loading}>加载更多</button> : null}
          {loading && !chunks.length ? <div className="knowledge-document-loading"><LoaderCircle className="knowledge-cloud-spin" size={17} />正在读取分块</div> : null}
          {!loading && !chunks.length ? <div className="knowledge-document-empty"><Check size={20} /><strong>暂无活动分块</strong></div> : null}
        </div>

        {selected ? (
          <div className="knowledge-chunk-editor">
            <div className="knowledge-chunk-editor-meta"><span>#{selected.ordinal + 1}</span><span>修订 {selected.revision}</span><span>{selected.tokenEstimate} Tokens</span><span>{selected.embeddingStatus}</span></div>
            <p>{formatLocator(selected.locator)}</p>
            <textarea aria-label="分块文本" value={draftText} onChange={(event) => setDraftText(event.target.value)} maxLength={16_384} rows={10} />
            <div className="knowledge-chunk-editor-actions">
              <label><input type="checkbox" checked={draftEnabled} onChange={(event) => setDraftEnabled(event.target.checked)} /><span>启用分块</span></label>
              <button type="button" className="knowledge-workspace-button primary" onClick={() => void saveRevision()} disabled={saving || !draftText.trim()}>
                {saving ? <LoaderCircle className="knowledge-cloud-spin" size={15} /> : <Save size={15} />}保存草稿
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
