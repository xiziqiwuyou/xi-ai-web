import type { GenerationResult, MindmapDocument, MindmapNode } from "../../types";
import { createClientId } from "../../utils/clientId";
import { parseMindmap } from "./mindmapParser";

const maxDepth = 5;
const maxChildren = 8;
const maxNodes = 60;

function cleanText(value: unknown, maxLength: number, fallback = "") {
  const normalized = String(value ?? "").replace(/\s+/gu, " ").trim();
  return Array.from(normalized || fallback).slice(0, maxLength).join("");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeNode(
  value: unknown,
  context: { count: number; sequence: number; ids: Set<string> },
  depth: number,
  fallbackLabel = "",
  root = false
): MindmapNode | null {
  const source = record(value);
  if (!source || context.count >= maxNodes) return null;
  const label = cleanText(source.label ?? source.title ?? source.name, 24, fallbackLabel);
  if (!label) return null;
  context.count += 1;
  let id = root ? "root" : cleanText(source.id, 96).replace(/[^a-zA-Z0-9_-]/gu, "-");
  if (!id || context.ids.has(id)) {
    do {
      context.sequence += 1;
      id = `node-${context.sequence}`;
    } while (context.ids.has(id));
  }
  context.ids.add(id);
  const node: MindmapNode = {
    id,
    label,
    note: cleanText(source.note ?? source.description, 180) || undefined,
    children: []
  };
  if (depth >= maxDepth || !Array.isArray(source.children)) return node;
  const labels = new Set<string>();
  for (const candidate of source.children) {
    if (node.children.length >= maxChildren || context.count >= maxNodes) break;
    const child = normalizeNode(candidate, context, depth + 1);
    if (!child) continue;
    const key = child.label.toLocaleLowerCase();
    if (labels.has(key)) continue;
    labels.add(key);
    node.children.push(child);
  }
  return node;
}

export function normalizeMindmapDocument(value: unknown, fallbackTitle = "思维导图"): MindmapDocument | null {
  const source = record(value);
  if (!source) return null;
  const rootSource = record(source.root) || (source.label || source.children ? source : null);
  if (!rootSource) return null;
  const title = cleanText(source.title, 120, cleanText(rootSource.label, 24, fallbackTitle));
  const root = normalizeNode(rootSource, { count: 0, sequence: 0, ids: new Set() }, 1, title, true);
  if (!root) return null;
  return {
    version: 1,
    title,
    summary: cleanText(source.summary, 360) || undefined,
    root
  };
}

export function mindmapDocumentFromMarkdown(markdown: string, fallbackTitle = "思维导图") {
  const root = parseMindmap(markdown, fallbackTitle);
  return normalizeMindmapDocument({ title: root.label || fallbackTitle, root }, fallbackTitle);
}

export function mindmapDocumentFromResult(result: GenerationResult, fallbackTitle = "思维导图") {
  return normalizeMindmapDocument(result.mindmap, fallbackTitle)
    || mindmapDocumentFromMarkdown(result.text || "", fallbackTitle);
}

export function findMindmapNode(node: MindmapNode, nodeId: string): MindmapNode | null {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findMindmapNode(child, nodeId);
    if (match) return match;
  }
  return null;
}

export function mindmapNodeDepth(node: MindmapNode, nodeId: string, depth = 1): number | null {
  if (node.id === nodeId) return depth;
  for (const child of node.children) {
    const match = mindmapNodeDepth(child, nodeId, depth + 1);
    if (match !== null) return match;
  }
  return null;
}

export function mindmapNodeCount(node: MindmapNode): number {
  return 1 + node.children.reduce((sum, child) => sum + mindmapNodeCount(child), 0);
}

function mapNode(node: MindmapNode, nodeId: string, update: (node: MindmapNode) => MindmapNode): MindmapNode {
  if (node.id === nodeId) return update(node);
  return { ...node, children: node.children.map((child) => mapNode(child, nodeId, update)) };
}

export function updateMindmapNode(
  document: MindmapDocument,
  nodeId: string,
  patch: { label?: string; note?: string }
): MindmapDocument {
  const label = patch.label === undefined ? undefined : cleanText(patch.label, 24);
  const note = patch.note === undefined ? undefined : cleanText(patch.note, 180);
  return {
    ...document,
    title: nodeId === document.root.id && label ? label : document.title,
    root: mapNode(document.root, nodeId, (node) => ({
      ...node,
      label: label || node.label,
      note: patch.note === undefined ? node.note : note || undefined
    }))
  };
}

export function canAddMindmapChild(document: MindmapDocument, parentId: string) {
  const parent = findMindmapNode(document.root, parentId);
  const depth = mindmapNodeDepth(document.root, parentId);
  return Boolean(parent && depth && depth < maxDepth && parent.children.length < maxChildren && mindmapNodeCount(document.root) < maxNodes);
}

export function addMindmapChild(document: MindmapDocument, parentId: string, label = "新节点") {
  if (!canAddMindmapChild(document, parentId)) return document;
  const child: MindmapNode = {
    id: createClientId("map-node"),
    label: cleanText(label, 24, "新节点"),
    children: []
  };
  return {
    ...document,
    root: mapNode(document.root, parentId, (node) => ({ ...node, children: [...node.children, child] }))
  };
}

function removeNode(node: MindmapNode, nodeId: string): MindmapNode {
  return {
    ...node,
    children: node.children
      .filter((child) => child.id !== nodeId)
      .map((child) => removeNode(child, nodeId))
  };
}

export function deleteMindmapNode(document: MindmapDocument, nodeId: string) {
  if (!nodeId || nodeId === document.root.id) return document;
  return { ...document, root: removeNode(document.root, nodeId) };
}

function moveAmongChildren(node: MindmapNode, nodeId: string, direction: -1 | 1): MindmapNode {
  const index = node.children.findIndex((child) => child.id === nodeId);
  if (index >= 0) {
    const target = index + direction;
    if (target < 0 || target >= node.children.length) return node;
    const children = [...node.children];
    [children[index], children[target]] = [children[target], children[index]];
    return { ...node, children };
  }
  return { ...node, children: node.children.map((child) => moveAmongChildren(child, nodeId, direction)) };
}

export function moveMindmapNode(document: MindmapDocument, nodeId: string, direction: -1 | 1) {
  if (!nodeId || nodeId === document.root.id) return document;
  return { ...document, root: moveAmongChildren(document.root, nodeId, direction) };
}

export function mindmapDocumentToMarkdown(document: MindmapDocument) {
  const lines: string[] = [];
  if (document.summary) lines.push(`> ${document.summary}`, "");
  const visit = (node: MindmapNode, depth: number) => {
    lines.push(`${"#".repeat(Math.min(6, depth))} ${node.label}`);
    if (node.note) lines.push(`> ${node.note}`);
    node.children.forEach((child) => visit(child, depth + 1));
  };
  visit(document.root, 1);
  return lines.join("\n").trim();
}

function mermaidLabel(node: MindmapNode) {
  return [node.label, node.note].filter(Boolean).join(" · ")
    .replace(/[()[\]{}"<>]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function mindmapDocumentToMermaid(document: MindmapDocument) {
  const lines = ["mindmap", `  root((${mermaidLabel(document.root)}))`];
  const visit = (node: MindmapNode, depth: number) => {
    lines.push(`${"  ".repeat(depth)}${mermaidLabel(node)}`);
    node.children.forEach((child) => visit(child, depth + 1));
  };
  document.root.children.forEach((child) => visit(child, 2));
  return lines.join("\n");
}
