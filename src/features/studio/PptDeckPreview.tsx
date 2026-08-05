import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Loader2,
  Minus,
  Plus,
  Presentation,
  X
} from "lucide-react";

import { Dialog } from "../../components/ui";
import type { PptDeck, PptSlide } from "../../types";

const zoomLevels = [0.75, 0.9, 1] as const;

type PptDeckPreviewProps = {
  deck: PptDeck | null;
  busy: boolean;
  exporting: boolean;
  onDownload: () => void;
};

function slideItems(slide: PptSlide) {
  return slide.bullets.length
    ? slide.bullets
    : [...(slide.leftContent || []), ...(slide.rightContent || [])];
}

function PptSlideCanvas({
  deck,
  slide,
  index,
  compact = false
}: {
  deck: PptDeck;
  slide: PptSlide;
  index: number;
  compact?: boolean;
}) {
  const items = slideItems(slide);
  const leftItems = slide.leftContent?.length ? slide.leftContent : items.slice(0, Math.ceil(items.length / 2));
  const rightItems = slide.rightContent?.length ? slide.rightContent : items.slice(Math.ceil(items.length / 2));

  return (
    <article
      className={`figma-ppt-slide ${compact ? "compact" : ""}`.trim()}
      data-theme={deck.themeId}
      data-slide-type={slide.type}
      aria-label={`第 ${index + 1} 页：${slide.title}`}
    >
      {slide.type === "cover" ? (
        <div className="figma-ppt-slide-cover">
          <small>XI AI PRESENTATION</small>
          <strong>{slide.title || deck.title}</strong>
          <p>{slide.subtitle || deck.subtitle || deck.summary}</p>
          <span>{deck.slides.length} PAGES</span>
          <div className="figma-ppt-cover-visual" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      ) : slide.type === "section" ? (
        <div className="figma-ppt-slide-section">
          <span>{String(index).padStart(2, "0")}</span>
          <strong>{slide.title}</strong>
          {slide.subtitle ? <p>{slide.subtitle}</p> : null}
        </div>
      ) : (
        <>
          <header className="figma-ppt-slide-header">
            <span>{String(index).padStart(2, "0")}</span>
            <strong>{slide.title}</strong>
          </header>
          <div className="figma-ppt-slide-body">
            {slide.type === "two-column" ? (
              <div className="figma-ppt-slide-columns">
                <ul>{leftItems.map((item) => <li key={item}>{item}</li>)}</ul>
                <ul>{rightItems.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : slide.type === "timeline" ? (
              <ol className="figma-ppt-slide-timeline">
                {items.map((item, itemIndex) => (
                  <li key={item}><span>{itemIndex + 1}</span><strong>{item}</strong></li>
                ))}
              </ol>
            ) : slide.type === "data" ? (
              <div className="figma-ppt-slide-data">
                {items.map((item, itemIndex) => (
                  <div key={item}><b>{String(itemIndex + 1).padStart(2, "0")}</b><span>{item}</span></div>
                ))}
              </div>
            ) : slide.type === "quote" ? (
              <blockquote>{items[0] || slide.subtitle || slide.title}</blockquote>
            ) : (
              <ul className={slide.type === "summary" ? "figma-ppt-slide-summary" : "figma-ppt-slide-points"}>
                {items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </div>
          <footer><span>{index + 1}/{deck.slides.length}</span></footer>
        </>
      )}
    </article>
  );
}

export default function PptDeckPreview({ deck, busy, exporting, onDownload }: PptDeckPreviewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [thumbnailsScrolling, setThumbnailsScrolling] = useState(false);
  const thumbnailsScrollTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setActiveIndex(0);
  }, [deck?.title, deck?.slides.length]);

  useEffect(() => () => window.clearTimeout(thumbnailsScrollTimeoutRef.current), []);

  const activeSlide = deck?.slides[activeIndex] || deck?.slides[0];
  const zoom = zoomLevels[zoomIndex];
  const frameStyle = useMemo(() => ({
    "--ppt-preview-zoom": zoom
  }) as CSSProperties, [zoom]);

  const move = (offset: number) => {
    if (!deck?.slides.length) return;
    setActiveIndex((current) => Math.max(0, Math.min(deck.slides.length - 1, current + offset)));
  };

  const handleThumbnailsScroll = () => {
    setThumbnailsScrolling(true);
    window.clearTimeout(thumbnailsScrollTimeoutRef.current);
    thumbnailsScrollTimeoutRef.current = window.setTimeout(() => setThumbnailsScrolling(false), 520);
  };

  return (
    <section className="figma-ppt-preview-panel" aria-labelledby="ppt-preview-title">
      <header className="figma-ppt-preview-toolbar">
        <div>
          <small>PREVIEW</small>
          <h2 id="ppt-preview-title">演示预览</h2>
          <span>{deck ? `${deck.slides.length} 页 · 16:9` : "16:9"}</span>
        </div>
        <div className="figma-ppt-preview-actions">
          <button
            type="button"
            aria-label="缩小预览"
            title="缩小预览"
            disabled={zoomIndex === 0 || !deck}
            onClick={() => setZoomIndex((current) => Math.max(0, current - 1))}
          ><Minus size={15} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="放大预览"
            title="放大预览"
            disabled={zoomIndex === zoomLevels.length - 1 || !deck}
            onClick={() => setZoomIndex((current) => Math.min(zoomLevels.length - 1, current + 1))}
          ><Plus size={15} /></button>
          <button
            type="button"
            aria-label="全屏预览"
            title="全屏预览"
            disabled={!deck}
            onClick={() => setFullscreenOpen(true)}
          ><Expand size={15} /></button>
          <button
            type="button"
            className="figma-ppt-download"
            disabled={!deck || exporting}
            onClick={onDownload}
          >{exporting ? <Loader2 className="spin" size={15} /> : <Download size={15} />}<span>{exporting ? "导出中" : "下载 PPT"}</span></button>
        </div>
      </header>

      <div className={`figma-ppt-preview-workspace ${deck ? "has-thumbnails" : "is-empty"}`}>
        {deck ? (
          <nav
            className="figma-ppt-thumbnails"
            aria-label="幻灯片缩略图"
            data-scroll-active={thumbnailsScrolling ? "true" : "false"}
            onScroll={handleThumbnailsScroll}
          >
            {deck.slides.map((slide, index) => (
              <button
                type="button"
                key={slide.id}
                className={index === activeIndex ? "active" : ""}
                aria-label={`查看第 ${index + 1} 页：${slide.title}`}
                aria-current={index === activeIndex ? "page" : undefined}
                onClick={() => setActiveIndex(index)}
              >
                <span>{index + 1}</span>
                <PptSlideCanvas deck={deck} slide={slide} index={index} compact />
              </button>
            ))}
          </nav>
        ) : null}

        <div className="figma-ppt-stage" aria-live="polite">
          {deck && activeSlide ? (
            <>
              <div className="figma-ppt-stage-frame" style={frameStyle}>
                <PptSlideCanvas deck={deck} slide={activeSlide} index={activeIndex} />
              </div>
              <div className="figma-ppt-page-controls">
                <button type="button" aria-label="上一页" disabled={activeIndex === 0} onClick={() => move(-1)}><ChevronLeft size={16} /></button>
                <span>{activeIndex + 1} / {deck.slides.length}</span>
                <button type="button" aria-label="下一页" disabled={activeIndex === deck.slides.length - 1} onClick={() => move(1)}><ChevronRight size={16} /></button>
              </div>
              {activeSlide.speakerNotes ? <p className="figma-ppt-speaker-note">备注：{activeSlide.speakerNotes}</p> : null}
            </>
          ) : (
            <div className="figma-ppt-empty-preview">
              <Presentation size={34} />
              <strong>{busy ? "正在生成演示稿" : "暂无演示稿"}</strong>
            </div>
          )}
          {busy ? <div className="figma-ppt-preview-loading"><Loader2 className="spin" size={26} /><span>正在编排页面</span></div> : null}
        </div>
      </div>

      <Dialog
        open={fullscreenOpen && Boolean(deck && activeSlide)}
        labelledBy="ppt-fullscreen-title"
        onClose={() => setFullscreenOpen(false)}
        className="figma-ppt-fullscreen-dialog"
      >
        <header>
          <div><small>FULLSCREEN</small><h2 id="ppt-fullscreen-title">{activeSlide?.title}</h2></div>
          <button type="button" aria-label="关闭全屏预览" title="关闭" onClick={() => setFullscreenOpen(false)}><X size={18} /></button>
        </header>
        {deck && activeSlide ? (
          <div className="figma-ppt-fullscreen-stage">
            <PptSlideCanvas deck={deck} slide={activeSlide} index={activeIndex} />
          </div>
        ) : null}
        <footer>
          <button type="button" aria-label="全屏上一页" disabled={activeIndex === 0} onClick={() => move(-1)}><ChevronLeft size={17} />上一页</button>
          <span>{activeIndex + 1} / {deck?.slides.length || 0}</span>
          <button type="button" aria-label="全屏下一页" disabled={!deck || activeIndex === deck.slides.length - 1} onClick={() => move(1)}>下一页<ChevronRight size={17} /></button>
        </footer>
      </Dialog>
    </section>
  );
}
