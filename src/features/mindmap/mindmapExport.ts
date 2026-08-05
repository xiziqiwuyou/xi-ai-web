import type { MindmapNode } from "./mindmapParser";
import type { MindmapDocument } from "../../types";
import { layoutMindmapDocument, mindmapEdgePath } from "./mindmapLayout";

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

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyMindmapText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Fall through to the HTTP/restricted-browser compatibility path.
  }
  const textarea = document.createElement("textarea");
  const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("当前浏览器无法复制导图内容");
  } finally {
    textarea.remove();
    restoreTarget?.focus({ preventScroll: true });
  }
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

export function mindmapDocumentToSvg(mindmap: MindmapDocument) {
  const view = layoutMindmapDocument(mindmap);
  const edges = view.edges.map((edge) => (
    `<path d="${mindmapEdgePath(edge)}" fill="none" stroke="#7aa2ed" stroke-width="2" opacity="0.68"/>`
  )).join("");
  const nodes = view.nodes.map((item) => {
    const root = item.depth === 0;
    const fill = root ? "#2368e8" : item.side === -1 ? "#ffffff" : "#f5f8ff";
    const color = root ? "#ffffff" : "#10203d";
    const border = root ? "#2368e8" : "#cfdbef";
    const label = escapeXml(item.node.label);
    const note = item.node.note ? escapeXml(item.node.note.slice(0, 38)) : "";
    return [
      `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="14" fill="${fill}" stroke="${border}"/>`,
      `<text x="${item.x + 14}" y="${item.y + (note ? 24 : 34)}" font-family="Microsoft YaHei, sans-serif" font-size="13" font-weight="700" fill="${color}">${label}</text>`,
      note
        ? `<text x="${item.x + 14}" y="${item.y + 43}" font-family="Microsoft YaHei, sans-serif" font-size="9" fill="${root ? "#dbe8ff" : "#66738a"}">${note}</text>`
        : ""
    ].join("");
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="0 0 ${view.width} ${view.height}"><rect width="100%" height="100%" fill="#f5f8ff"/>${edges}${nodes}</svg>`;
}

export async function mindmapDocumentToPngBlob(mindmap: MindmapDocument) {
  const svg = mindmapDocumentToSvg(mindmap);
  const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法渲染思维导图图片"));
      image.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth * scale);
    canvas.height = Math.max(1, image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片导出");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 导出失败")), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
