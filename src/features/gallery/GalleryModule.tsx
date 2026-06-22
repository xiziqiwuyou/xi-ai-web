import { useMemo, useState } from "react";
import { Copy, Download, FileText, Heart, Images, Search, Star, Trash2, X } from "lucide-react";
import AssetGallery from "../../components/workbench/AssetGallery";
import EmptyState from "../../components/workbench/EmptyState";
import { moduleMeta, portalModuleOrder } from "../../app/moduleRegistry";
import { saveReplayDraft } from "./replayDraft";
import type { GalleryItem, ModuleId } from "../../types";

type GalleryModuleProps = {
  items: GalleryItem[];
  onClearGallery: () => void;
  onRemoveGalleryItem: (id: string) => void;
  onRemoveGalleryItems: (ids: string[]) => void;
  onUpdateGalleryItem: (id: string, patch: Partial<GalleryItem>) => void;
  onNavigateModule: (moduleId: ModuleId) => void;
};

function moduleLabel(moduleId: ModuleId) {
  return moduleMeta[moduleId]?.label || "历史结果";
}

function markdownForItem(item: GalleryItem) {
  return [
    `# ${item.title}`,
    "",
    `- 来源：${moduleLabel(item.sourceModule)}`,
    `- 模型：${item.modelId || "未记录"}`,
    `- 时间：${new Date(item.createdAt).toLocaleString("zh-CN")}`,
    item.favorite ? "- 收藏：是" : "",
    "",
    "## 提示词",
    "",
    item.prompt || "未记录",
    "",
    item.text ? `## 结果\n\n${item.text}` : "",
    item.assets?.length
      ? ["## 资源", "", ...item.assets.map((asset, index) => `${index + 1}. ${asset.label || asset.type}: ${asset.url}`)].join("\n")
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function downloadMarkdown(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportGalleryItem(item: GalleryItem) {
  downloadMarkdown(markdownForItem(item), `${item.sourceModule}-${item.id}.md`);
}

function GalleryModule({
  items,
  onClearGallery,
  onRemoveGalleryItem,
  onRemoveGalleryItems,
  onUpdateGalleryItem,
  onNavigateModule
}: GalleryModuleProps) {
  const [filter, setFilter] = useState<ModuleId | "all">("all");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState("");
  const filters = useMemo(() => {
    const usedIds = new Set(items.map((item) => item.sourceModule));
    return portalModuleOrder.filter((id) => usedIds.has(id));
  }, [items]);
  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.sourceModule !== filter) return false;
      if (favoritesOnly && !item.favorite) return false;
      if (!term) return true;
      return `${item.title} ${item.prompt} ${item.text || ""} ${item.modelId} ${moduleLabel(item.sourceModule)}`
        .toLowerCase()
        .includes(term);
    });
  }, [favoritesOnly, filter, items, query]);
  const detailItem = items.find((item) => item.id === detailId) || null;
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const batchExport = () => {
    if (!selectedItems.length) return;
    downloadMarkdown(selectedItems.map(markdownForItem).join("\n\n---\n\n"), `gallery-${Date.now()}.md`);
  };

  const batchDelete = () => {
    onRemoveGalleryItems(selectedIds);
    setSelectedIds([]);
    if (detailItem && selectedIds.includes(detailItem.id)) setDetailId("");
  };

  const replayItem = (item: GalleryItem) => {
    if (!portalModuleOrder.includes(item.sourceModule)) return;
    saveReplayDraft(item);
    onNavigateModule(item.sourceModule);
  };

  return (
    <section className="gallery-module workbench-panel">
      <header className="gallery-head">
        <div>
          <span>本地保存</span>
          <strong>作品画廊</strong>
          <p>生成结果只保存在当前浏览器，可收藏、导出、删除或回到对应功能继续创作。</p>
        </div>
        <div className="gallery-head-actions">
          <button type="button" className="secondary-action compact-action" onClick={onClearGallery} disabled={!items.length}>
            <Trash2 size={16} />
            清空
          </button>
        </div>
      </header>

      {items.length ? (
        <>
          <div className="gallery-toolbar">
            <label className="apps-search gallery-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、提示词、结果" />
            </label>
            <div className="option-segmented gallery-filters" role="tablist" aria-label="画廊筛选">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button>
              {filters.map((moduleId) => (
                <button key={moduleId} type="button" className={filter === moduleId ? "active" : ""} onClick={() => setFilter(moduleId)}>
                  {moduleLabel(moduleId)}
                </button>
              ))}
              <button type="button" className={favoritesOnly ? "active" : ""} onClick={() => setFavoritesOnly((value) => !value)}>
                收藏
              </button>
            </div>
            <div className="gallery-batch-actions">
              <span>{selectedIds.length ? `已选 ${selectedIds.length}` : "未选择"}</span>
              <button type="button" className="secondary-action compact-action" disabled={!selectedIds.length} onClick={batchExport}>
                <Download size={15} />
                导出
              </button>
              <button type="button" className="secondary-action compact-action danger-action" disabled={!selectedIds.length} onClick={batchDelete}>
                <Trash2 size={15} />
                删除
              </button>
            </div>
          </div>

          <div className="gallery-grid">
            {visibleItems.map((item) => {
              const checked = selectedIds.includes(item.id);
              const canReplay = portalModuleOrder.includes(item.sourceModule);
              return (
                <article key={item.id} className={checked ? "gallery-card selected" : "gallery-card"}>
                  <div className="gallery-card-head">
                    <label className="gallery-select">
                      <input type="checkbox" checked={checked} onChange={() => toggleSelected(item.id)} />
                      <span>{moduleLabel(item.sourceModule)}</span>
                    </label>
                    <time>{new Date(item.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                  <button type="button" className="gallery-title-button" onClick={() => setDetailId(item.id)}>
                    <strong>{item.title}</strong>
                  </button>
                  <p>{item.prompt}</p>
                  <AssetGallery assets={item.assets || []} />
                  {item.text ? <div className="gallery-text-preview">{item.text.slice(0, 280)}</div> : null}
                  <div className="gallery-card-actions">
                    <button type="button" className="secondary-action" onClick={() => replayItem(item)} disabled={!canReplay}>
                      回到功能
                    </button>
                    <button
                      type="button"
                      className={item.favorite ? "icon-button active-soft" : "icon-button"}
                      onClick={() => onUpdateGalleryItem(item.id, { favorite: !item.favorite })}
                      title="收藏"
                      aria-label="收藏"
                    >
                      <Heart size={16} />
                    </button>
                    <button type="button" className="icon-button" onClick={() => exportGalleryItem(item)} title="导出 Markdown" aria-label="导出 Markdown">
                      <Download size={16} />
                    </button>
                    <button type="button" className="icon-button danger" onClick={() => onRemoveGalleryItem(item.id)} title="删除" aria-label="删除">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState icon={Images} title="还没有生成作品" description="使用绘画、思维导图、智能体或应用生成结果后，会自动出现在这里。" />
      )}

      {items.length > 0 && !visibleItems.length ? (
        <EmptyState icon={FileText} title="当前筛选没有结果" description="切换到全部、取消收藏筛选，或换一个搜索词。" />
      ) : null}

      {detailItem ? (
        <div className="gallery-detail-layer" role="dialog" aria-modal="true">
          <button type="button" className="gallery-detail-scrim" onClick={() => setDetailId("")} aria-label="关闭详情" />
          <aside className="gallery-detail">
            <header>
              <div>
                <span>{moduleLabel(detailItem.sourceModule)}</span>
                <strong>{detailItem.title}</strong>
              </div>
              <button type="button" className="icon-button" onClick={() => setDetailId("")} aria-label="关闭详情">
                <X size={16} />
              </button>
            </header>
            <AssetGallery assets={detailItem.assets || []} />
            <section>
              <strong>提示词</strong>
              <p>{detailItem.prompt || "未记录"}</p>
            </section>
            {detailItem.text ? (
              <section>
                <strong>结果</strong>
                <pre>{detailItem.text}</pre>
              </section>
            ) : null}
            <div className="gallery-detail-actions">
              <button type="button" className="secondary-action" onClick={() => void navigator.clipboard?.writeText(detailItem.prompt || "")}>
                <Copy size={15} />
                复制提示词
              </button>
              <button type="button" className="secondary-action" onClick={() => onUpdateGalleryItem(detailItem.id, { favorite: !detailItem.favorite })}>
                <Star size={15} />
                {detailItem.favorite ? "取消收藏" : "收藏"}
              </button>
              <button type="button" className="primary-action" onClick={() => replayItem(detailItem)} disabled={!portalModuleOrder.includes(detailItem.sourceModule)}>
                回到功能
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

export default GalleryModule;
