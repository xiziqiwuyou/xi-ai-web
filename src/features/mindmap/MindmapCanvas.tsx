import { Download, FileDown, LocateFixed, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadText, mindmapToSvg } from "./mindmapExport";
import type { MindmapNode } from "./mindmapParser";

type PositionedNode = {
  node: MindmapNode;
  depth: number;
  index: number;
  x: number;
  y: number;
};

function flatten(node: MindmapNode, depth = 0, rows: PositionedNode[] = []) {
  rows.push({ node, depth, index: rows.length, x: 0, y: 0 });
  node.children.forEach((child) => flatten(child, depth + 1, rows));
  return rows;
}

function layout(root: MindmapNode) {
  const rows = flatten(root).map((row) => ({
    ...row,
    x: 40 + row.depth * 220,
    y: 40 + row.index * 76
  }));
  const width = Math.max(760, Math.max(...rows.map((row) => row.x)) + 220);
  const height = Math.max(420, rows.length * 76 + 90);
  const points = new Map(rows.map((row) => [row.node.id, row]));
  return { rows, points, width, height };
}

function edgesFor(node: MindmapNode, points: Map<string, PositionedNode>, paths: string[] = []) {
  const from = points.get(node.id);
  if (!from) return paths;
  node.children.forEach((child) => {
    const to = points.get(child.id);
    if (to) {
      paths.push(`M ${from.x + 168} ${from.y + 24} C ${from.x + 204} ${from.y + 24}, ${to.x - 36} ${to.y + 24}, ${to.x} ${to.y + 24}`);
    }
    edgesFor(child, points, paths);
  });
  return paths;
}

function MindmapCanvas({ root, source }: { root: MindmapNode; source: string }) {
  const [zoom, setZoom] = useState(1);
  const view = useMemo(() => layout(root), [root]);
  const edges = useMemo(() => edgesFor(root, view.points), [root, view.points]);

  return (
    <section className="mindmap-canvas-panel">
      <div className="mindmap-toolbar">
        <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} aria-label="缩小">
          <Minus size={15} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))} aria-label="放大">
          <Plus size={15} />
        </button>
        <button type="button" className="icon-button" onClick={() => setZoom(1)} aria-label="重置缩放">
          <LocateFixed size={15} />
        </button>
        <button type="button" className="secondary-action compact-action" onClick={() => downloadText(source, "mindmap.md", "text/markdown;charset=utf-8")}>
          <FileDown size={15} />
          Markdown
        </button>
        <button type="button" className="secondary-action compact-action" onClick={() => downloadText(mindmapToSvg(root), "mindmap.svg", "image/svg+xml;charset=utf-8")}>
          <Download size={15} />
          SVG
        </button>
      </div>
      <div className="mindmap-viewport">
        <svg
          className="mindmap-svg"
          width={view.width * zoom}
          height={view.height * zoom}
          viewBox={`0 0 ${view.width} ${view.height}`}
        >
          {edges.map((path) => (
            <path key={path} d={path} className="mindmap-edge" />
          ))}
          {view.rows.map((row) => (
            <g key={row.node.id} transform={`translate(${row.x} ${row.y})`}>
              <rect className={row.depth === 0 ? "mindmap-node root" : "mindmap-node"} width="168" height="48" rx="18" />
              <text className={row.depth === 0 ? "mindmap-label root" : "mindmap-label"} x="14" y="29">
                {row.node.label.length > 18 ? `${row.node.label.slice(0, 18)}...` : row.node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

export default MindmapCanvas;
