import type { MindmapNode } from "../../types";

export type { MindmapNode } from "../../types";

type StackEntry = {
  level: number;
  node: MindmapNode;
};

function cleanLabel(value: string) {
  return value
    .replace(/^[-*+]\s+/, "")
    .replace(/^#+\s*/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^root\s*\(\((.*)\)\)$/i, "$1")
    .replace(/^\(\((.*)\)\)$/, "$1")
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/^[\"'`]+|[\"'`]+$/g, "")
    .trim();
}

function extractMermaid(markdown: string): string[] | null {
  const labelledFence = markdown.match(/```mermaid\s*([\s\S]*?)```/i);
  const genericFence = markdown.match(/```\s*([\s\S]*?)```/i);
  const genericBody = genericFence?.[1]?.trim();
  const bareBody = markdown.trim();
  const block = labelledFence?.[1]
    || (genericBody && /^mindmap\b/i.test(genericBody) ? genericBody : "")
    || (/^mindmap\b/i.test(bareBody) ? bareBody : "");
  if (!block) return null;
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, "  "))
    .filter((line) => line.trim() && !/^mindmap\b/i.test(line.trim()));
}

function lineLevel(line: string) {
  const indent = line.match(/^\s*/)?.[0].length || 0;
  if (/^#+\s/.test(line.trim())) return Math.max(0, line.trim().match(/^#+/)?.[0].length || 1) - 1;
  return Math.floor(indent / 2);
}

function parseLines(lines: string[], fallbackTitle = "思维导图"): MindmapNode {
  const root: MindmapNode = { id: "root", label: fallbackTitle, children: [] };
  const stack: StackEntry[] = [{ level: -1, node: root }];
  let index = 0;

  for (const line of lines) {
    const note = line.trim().match(/^>\s*(.+)$/)?.[1]?.trim();
    if (note) {
      const current = stack.at(-1)?.node;
      if (current && current !== root) current.note = note;
      continue;
    }
    const label = cleanLabel(line.trim());
    if (!label || /^graph\b|^flowchart\b/i.test(label)) continue;
    const level = lineLevel(line);
    const node: MindmapNode = { id: `node-${index}`, label, children: [] };
    index += 1;

    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level, node });
  }

  if (root.children.length === 1) return root.children[0];
  return root.children.length ? root : { ...root, children: [{ id: "node-0", label: fallbackTitle, children: [] }] };
}

export function parseMindmap(markdown: string, fallbackTitle = "思维导图"): MindmapNode {
  const mermaidLines = extractMermaid(markdown);
  const usefulMermaid = mermaidLines?.filter((line) => line.trim() && !line.includes("```")) || [];
  if (usefulMermaid.length >= 2) return parseLines(usefulMermaid, fallbackTitle);

  const markdownLines = markdown
    .split(/\r?\n/)
    .filter((line) => (
      /^\s*[-*+]\s+/.test(line)
      || /^#+\s/.test(line.trim())
      || /^\s*\d+\.\s+/.test(line)
      || /^\s*>\s+/.test(line)
    ));
  return parseLines(markdownLines.length ? markdownLines : [fallbackTitle], fallbackTitle);
}
