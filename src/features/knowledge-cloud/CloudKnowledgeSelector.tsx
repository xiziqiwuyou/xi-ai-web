import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, Database, ExternalLink } from "lucide-react";
import type { KnowledgeBase } from "../../types";
import { isKnowledgeBaseReady, normalizeKnowledgeBaseIds } from "./integrationState";

type CloudKnowledgeSelectorProps = {
  bases: KnowledgeBase[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

export default function CloudKnowledgeSelector({
  bases,
  selectedIds,
  onChange,
  disabled = false,
  compact = false
}: CloudKnowledgeSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();
  const normalized = normalizeKnowledgeBaseIds(selectedIds);
  const activeBases = bases.filter((base) => base.status !== "deleting");

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = (baseId: string, checked: boolean) => {
    const next = checked
      ? normalizeKnowledgeBaseIds([...normalized, baseId])
      : normalized.filter((id) => id !== baseId);
    onChange(next);
  };

  return (
    <div ref={rootRef} className={`cloud-knowledge-selector${compact ? " compact" : ""}`}>
      <button
        type="button"
        className={normalized.length ? "cloud-knowledge-trigger active" : "cloud-knowledge-trigger"}
        aria-label="选择云知识库"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <Database size={14} />
        <span>知识库{normalized.length ? ` ${normalized.length}` : ""}</span>
        <ChevronDown size={12} />
      </button>
      {open ? (
        <section id={popoverId} className="cloud-knowledge-popover" aria-label="云知识库选择" role="dialog">
          <header>
            <span><BookOpen size={14} /><strong>引用知识库</strong></span>
            <small>{normalized.length} / 3</small>
          </header>
          <div className="cloud-knowledge-options">
            {activeBases.length ? activeBases.map((base) => {
              const checked = normalized.includes(base.id);
              const ready = isKnowledgeBaseReady(base);
              const optionDisabled = !checked && (!ready || normalized.length >= 3);
              return (
                <label key={base.id} className={!ready ? "not-ready" : ""}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={optionDisabled}
                    onChange={(event) => toggle(base.id, event.target.checked)}
                  />
                  <span>
                    <strong>{base.name}</strong>
                    <small>{ready ? `${base.readyDocumentCount} 个文档` : "索引未就绪"}</small>
                  </span>
                  {checked ? <Check size={14} /> : null}
                </label>
              );
            }) : <p>暂无可用知识库</p>}
          </div>
          <footer>
            <a href="/knowledge">管理知识库 <ExternalLink size={12} /></a>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
