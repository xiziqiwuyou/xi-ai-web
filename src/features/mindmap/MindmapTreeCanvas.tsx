import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Focus, Loader2, Minus, Plus } from "lucide-react";
import type { MindmapDocument } from "../../types";
import { layoutMindmapDocument, mindmapEdgePath } from "./mindmapLayout";

type MindmapTreeCanvasProps = {
  document: MindmapDocument;
  selectedNodeId: string;
  collapsedNodeIds: ReadonlySet<string>;
  busy?: boolean;
  fitVersion?: number;
  onSelectNode: (nodeId: string) => void;
  onToggleNode: (nodeId: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
};

function MindmapTreeCanvas({
  document,
  selectedNodeId,
  collapsedNodeIds,
  busy = false,
  fitVersion = 0,
  onSelectNode,
  onToggleNode,
  onCollapseAll,
  onExpandAll
}: MindmapTreeCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollActive, setScrollActive] = useState(false);
  const layout = useMemo(
    () => layoutMindmapDocument(document, collapsedNodeIds),
    [collapsedNodeIds, document]
  );

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const horizontal = Math.max(0.45, (viewport.clientWidth - 40) / layout.width);
    const vertical = Math.max(0.45, (viewport.clientHeight - 40) / layout.height);
    const nextZoom = Math.max(0.45, Math.min(1.15, horizontal, vertical));
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (layout.width * nextZoom - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, (layout.height * nextZoom - viewport.clientHeight) / 2);
    });
  };

  useLayoutEffect(() => {
    fit();
    // A generation/refinement commit explicitly requests a new fit. Local edits keep the user's zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitVersion]);

  useEffect(() => () => {
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
  }, []);

  const markScrolling = () => {
    setScrollActive(true);
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => setScrollActive(false), 650);
  };

  return (
    <section className="figma-map-canvas" aria-label="思维导图画布">
      <div
        ref={viewportRef}
        className="figma-map-viewport"
        data-scroll-active={scrollActive ? "true" : "false"}
        onScroll={markScrolling}
      >
        <div
          className="figma-map-stage-frame"
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
        >
          <div
            className="figma-map-stage"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`
            }}
          >
            <svg
              className="figma-map-connectors"
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              aria-hidden="true"
            >
              {layout.edges.map((edge) => <path key={edge.id} d={mindmapEdgePath(edge)} />)}
            </svg>
            {layout.nodes.map((item) => {
              const hasChildren = item.node.children.length > 0;
              const collapsed = collapsedNodeIds.has(item.node.id);
              return (
                <div
                  key={item.node.id}
                  className={`figma-map-tree-node${item.depth === 0 ? " root" : ""}${selectedNodeId === item.node.id ? " active" : ""}`}
                  data-side={item.side}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.width,
                    minHeight: item.height
                  }}
                >
                  <button
                    type="button"
                    className="figma-map-node-select"
                    aria-pressed={selectedNodeId === item.node.id}
                    aria-label={`选择节点 ${item.node.label}`}
                    onClick={() => onSelectNode(item.node.id)}
                  >
                    <strong>{item.node.label}</strong>
                    {item.node.note ? <small>{item.node.note}</small> : null}
                    {hasChildren ? <span>{item.node.children.length} 个子节点</span> : null}
                  </button>
                  {hasChildren ? (
                    <button
                      type="button"
                      className="figma-map-node-toggle"
                      aria-label={`${collapsed ? "展开" : "折叠"}节点 ${item.node.label}`}
                      aria-expanded={!collapsed}
                      onClick={() => onToggleNode(item.node.id)}
                    >
                      {collapsed ? <Plus size={12} /> : <Minus size={12} />}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="figma-map-zoom" aria-label="画布缩放与层级">
        <button type="button" onClick={() => setZoom((value) => Math.max(0.45, Number((value - 0.1).toFixed(2))))} aria-label="缩小">
          <Minus size={14} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))} aria-label="放大">
          <Plus size={14} />
        </button>
        <button type="button" onClick={fit} aria-label="适应画布" title="适应画布">
          <Focus size={14} />
        </button>
        <button type="button" onClick={onCollapseAll} aria-label="折叠全部节点" title="折叠全部节点">
          <ChevronsDownUp size={14} />
        </button>
        <button type="button" onClick={onExpandAll} aria-label="展开全部节点" title="展开全部节点">
          <ChevronsUpDown size={14} />
        </button>
      </div>

      {busy ? (
        <div className="figma-map-busy" role="status" aria-live="polite">
          <Loader2 className="spin" size={22} />
          <strong>AI 正在整理导图结构</strong>
          <span>完成后会自动适应画布</span>
        </div>
      ) : null}
    </section>
  );
}

export default MindmapTreeCanvas;
