import type { MindmapNode } from "./mindmapParser";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadText(content: string, fileName: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function flatten(node: MindmapNode, depth = 0, rows: Array<{ node: MindmapNode; depth: number; index: number }> = []) {
  rows.push({ node, depth, index: rows.length });
  node.children.forEach((child) => flatten(child, depth + 1, rows));
  return rows;
}

export function mindmapToSvg(node: MindmapNode) {
  const rows = flatten(node);
  const width = Math.max(760, Math.max(...rows.map((row) => row.depth)) * 220 + 260);
  const height = Math.max(420, rows.length * 78 + 80);
  const positions = new Map(rows.map((row) => [row.node.id, { x: 70 + row.depth * 220, y: 50 + row.index * 78 }]));
  const edges: string[] = [];

  const collectEdges = (parent: MindmapNode) => {
    const from = positions.get(parent.id);
    if (!from) return;
    parent.children.forEach((child) => {
      const to = positions.get(child.id);
      if (to) {
        edges.push(
          `<path d="M ${from.x + 170} ${from.y + 24} C ${from.x + 205} ${from.y + 24}, ${to.x - 35} ${to.y + 24}, ${to.x} ${to.y + 24}" fill="none" stroke="#ff8a9a" stroke-width="2" opacity="0.68"/>`
        );
      }
      collectEdges(child);
    });
  };
  collectEdges(node);

  const nodes = rows
    .map(({ node: item, depth }) => {
      const point = positions.get(item.id) || { x: 0, y: 0 };
      const fill = depth === 0 ? "#ff2442" : "#ffffff";
      const color = depth === 0 ? "#ffffff" : "#201f24";
      return [
        `<rect x="${point.x}" y="${point.y}" width="170" height="48" rx="18" fill="${fill}" stroke="rgba(255,255,255,.8)"/>`,
        `<text x="${point.x + 14}" y="${point.y + 30}" font-family="Microsoft YaHei, sans-serif" font-size="13" font-weight="700" fill="${color}">${escapeXml(item.label.slice(0, 18))}</text>`
      ].join("");
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff8f8"/>${edges.join("")}${nodes}</svg>`;
}

