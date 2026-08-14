import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  LoaderCircle,
  LogIn,
  TriangleAlert
} from "lucide-react";
import type { KnowledgeBase } from "../../types";
import {
  knowledgeBaseReadiness,
  maximumSelectedKnowledgeBases,
  missingKnowledgeEmbeddingVendors,
  normalizeKnowledgeBaseIds
} from "./integrationState";
import type { KnowledgeCatalogStatus } from "./useKnowledgeCatalog";

type CloudKnowledgeSelectorProps = {
  bases: KnowledgeBase[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
  availability?: KnowledgeCatalogStatus;
  unavailableMessage?: string;
  retrieving?: boolean;
  sessionExpired?: boolean;
};

export default function CloudKnowledgeSelector({
  bases,
  selectedIds,
  onChange,
  disabled = false,
  compact = false,
  availability = "authenticated",
  unavailableMessage = "",
  retrieving = false,
  sessionExpired = false
}: CloudKnowledgeSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();
  const normalized = normalizeKnowledgeBaseIds(selectedIds);
  const activeBases = bases.filter((base) => base.status !== "deleting");
  const missingVendors = new Set(missingKnowledgeEmbeddingVendors(
    activeBases.map((base) => base.id),
    activeBases
  ));
  const partialCount = activeBases.filter((base) => knowledgeBaseReadiness(base) === "partial").length;
  const selectedMissingKey = activeBases.some((base) =>
    normalized.includes(base.id) &&
    Boolean(base.embeddingProfile?.vendor && missingVendors.has(base.embeddingProfile.vendor))
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(
          ".cloud-knowledge-popover input:not(:disabled), .cloud-knowledge-popover a[href], .cloud-knowledge-popover button:not(:disabled)"
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const toggle = (baseId: string, checked: boolean) => {
    const next = checked
      ? normalizeKnowledgeBaseIds([...normalized, baseId])
      : normalized.filter((id) => id !== baseId);
    onChange(next);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  const triggerText = retrieving
    ? "检索知识"
    : sessionExpired
      ? "知识库 · 会话过期"
      : availability === "anonymous"
      ? "知识库 · 登录"
        : availability === "unavailable"
          ? "知识库不可用"
          : `知识库${normalized.length ? ` ${normalized.length}` : ""}`;

  return (
    <div
      ref={rootRef}
      className={`cloud-knowledge-selector${compact ? " compact" : ""}`}
      data-open={open ? "true" : "false"}
      data-availability={availability}
      onBlur={handleBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        className={normalized.length ? "cloud-knowledge-trigger active" : "cloud-knowledge-trigger"}
        aria-label="选择云知识库"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-busy={retrieving}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {retrieving ? <LoaderCircle className="cloud-knowledge-spinner" size={14} /> : <Database size={14} />}
        <span>{triggerText}</span>
        <ChevronDown size={12} />
      </button>
      {open ? (
        <section id={popoverId} className="cloud-knowledge-popover" aria-label="云知识库选择" role="dialog">
          <header>
            <span><BookOpen size={14} /><strong>引用知识库</strong></span>
            <small>{normalized.length} / {maximumSelectedKnowledgeBases}</small>
          </header>
          {availability !== "authenticated" ? (
            <div className={`cloud-knowledge-popover-state ${availability}`} role={availability === "loading" ? "status" : "note"}>
              {availability === "loading" ? <LoaderCircle className="cloud-knowledge-spinner" size={18} /> : availability === "anonymous" ? <LogIn size={18} /> : <TriangleAlert size={18} />}
              <strong>{availability === "loading" ? "正在检查知识库" : sessionExpired ? "知识库会话已过期" : availability === "anonymous" ? "登录后可引用云知识库" : "云知识库当前不可用"}</strong>
              <span>{availability === "unavailable" && unavailableMessage ? unavailableMessage : "普通对话不受影响。"}</span>
            </div>
          ) : (
            <>
              {retrieving ? <p className="cloud-knowledge-status" role="status">正在检索已选知识库…</p> : null}
              {partialCount ? <p className="cloud-knowledge-status partial">部分知识库仍在处理新文档，已就绪内容可正常引用。</p> : null}
              {selectedMissingKey ? <p className="cloud-knowledge-status missing-key" role="alert">已选知识库缺少 Embedding API Key，发送前需要配置。</p> : null}
              <div className="cloud-knowledge-options">
                {activeBases.length ? activeBases.map((base) => {
              const checked = normalized.includes(base.id);
              const readiness = knowledgeBaseReadiness(base);
              const ready = readiness !== "not-ready";
              const vendor = base.embeddingProfile?.vendor;
              const missingKey = Boolean(vendor && missingVendors.has(vendor));
              const optionDisabled = !checked && (!ready || normalized.length >= maximumSelectedKnowledgeBases);
              const readinessLabel = readiness === "partial"
                ? `${base.readyDocumentCount} / ${base.documentCount} 篇已就绪 · 其余处理中`
                : ready
                  ? `${base.readyDocumentCount} 篇文档已就绪`
                  : "至少需要 1 篇已就绪文档";
              return (
                <label key={base.id} className={`${readiness}${missingKey ? " missing-key" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={optionDisabled}
                    onChange={(event) => toggle(base.id, event.target.checked)}
                  />
                  <span>
                    <strong>{base.name}</strong>
                    <small>{readinessLabel}{missingKey ? ` · 缺少 ${vendor === "qwen" ? "Qwen" : "OpenAI"} Key` : ""}</small>
                  </span>
                  {checked ? <Check size={14} /> : null}
                </label>
              );
                }) : <p>暂无可用知识库</p>}
              </div>
            </>
          )}
          <footer>
            <a href="/knowledge">
              {availability === "anonymous" ? "登录知识库" : "管理知识库"}
              <ExternalLink size={12} />
            </a>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
