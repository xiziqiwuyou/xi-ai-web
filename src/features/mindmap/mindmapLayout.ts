import type { MindmapDocument, MindmapNode } from "../../types";

export type MindmapLayoutNode = {
  node: MindmapNode;
  depth: number;
  side: -1 | 0 | 1;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MindmapLayoutEdge = {
  id: string;
  from: MindmapLayoutNode;
  to: MindmapLayoutNode;
};

export type MindmapLayout = {
  width: number;
  height: number;
  nodes: MindmapLayoutNode[];
  edges: MindmapLayoutEdge[];
};

const nodeWidth = 176;
const nodeHeight = 58;
const rootWidth = 196;
const rootHeight = 72;
const depthGap = 238;
const rowGap = 88;
const margin = 72;

function visibleChildren(node: MindmapNode, collapsed: ReadonlySet<string>) {
  return collapsed.has(node.id) ? [] : node.children;
}

function leafWeight(node: MindmapNode, collapsed: ReadonlySet<string>): number {
  const children = visibleChildren(node, collapsed);
  if (!children.length) return 1;
  return children.reduce((sum, child) => sum + leafWeight(child, collapsed), 0);
}

function maxVisibleDepth(node: MindmapNode, collapsed: ReadonlySet<string>, depth = 0): number {
  return visibleChildren(node, collapsed).reduce(
    (deepest, child) => Math.max(deepest, maxVisibleDepth(child, collapsed, depth + 1)),
    depth
  );
}

function splitRootChildren(children: MindmapNode[], collapsed: ReadonlySet<string>) {
  const left: MindmapNode[] = [];
  const right: MindmapNode[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  children.forEach((child, index) => {
    const weight = leafWeight(child, collapsed);
    if (leftWeight < rightWeight || (leftWeight === rightWeight && index % 2 === 0)) {
      left.push(child);
      leftWeight += weight;
    } else {
      right.push(child);
      rightWeight += weight;
    }
  });
  return { left, right, leftWeight, rightWeight };
}

export function layoutMindmapDocument(
  document: MindmapDocument,
  collapsed: ReadonlySet<string> = new Set()
): MindmapLayout {
  const rootChildren = visibleChildren(document.root, collapsed);
  const split = splitRootChildren(rootChildren, collapsed);
  const leftDepth = split.left.reduce((depth, node) => Math.max(depth, maxVisibleDepth(node, collapsed, 1)), 0);
  const rightDepth = split.right.reduce((depth, node) => Math.max(depth, maxVisibleDepth(node, collapsed, 1)), 0);
  const height = Math.max(520, Math.max(split.leftWeight, split.rightWeight, 1) * rowGap + margin * 2);
  const centerX = margin + nodeWidth + leftDepth * depthGap + rootWidth / 2;
  const width = Math.max(900, centerX + rootWidth / 2 + rightDepth * depthGap + nodeWidth + margin);
  const centerY = height / 2;
  const rootLayout: MindmapLayoutNode = {
    node: document.root,
    depth: 0,
    side: 0,
    x: centerX - rootWidth / 2,
    y: centerY - rootHeight / 2,
    width: rootWidth,
    height: rootHeight
  };
  const nodes: MindmapLayoutNode[] = [rootLayout];
  const edges: MindmapLayoutEdge[] = [];

  const placeChildren = (
    parent: MindmapLayoutNode,
    children: MindmapNode[],
    side: -1 | 1,
    depth: number,
    top: number
  ) => {
    let cursor = top;
    for (const child of children) {
      const weight = leafWeight(child, collapsed);
      const allocation = weight * rowGap;
      const x = side === -1
        ? centerX - rootWidth / 2 - depth * depthGap
        : centerX + rootWidth / 2 + (depth - 1) * depthGap;
      const childLayout: MindmapLayoutNode = {
        node: child,
        depth,
        side,
        x: side === -1 ? x - nodeWidth : x,
        y: cursor + allocation / 2 - nodeHeight / 2,
        width: nodeWidth,
        height: nodeHeight
      };
      nodes.push(childLayout);
      edges.push({ id: `${parent.node.id}-${child.id}`, from: parent, to: childLayout });
      const grandchildren = visibleChildren(child, collapsed);
      if (grandchildren.length) placeChildren(childLayout, grandchildren, side, depth + 1, cursor);
      cursor += allocation;
    }
  };

  placeChildren(rootLayout, split.left, -1, 1, centerY - split.leftWeight * rowGap / 2);
  placeChildren(rootLayout, split.right, 1, 1, centerY - split.rightWeight * rowGap / 2);
  return { width, height, nodes, edges };
}

export function mindmapEdgePath(edge: MindmapLayoutEdge) {
  const leftward = edge.to.side === -1;
  const fromX = leftward ? edge.from.x : edge.from.x + edge.from.width;
  const toX = leftward ? edge.to.x + edge.to.width : edge.to.x;
  const fromY = edge.from.y + edge.from.height / 2;
  const toY = edge.to.y + edge.to.height / 2;
  const control = Math.max(42, Math.abs(toX - fromX) * 0.46);
  return leftward
    ? `M ${fromX} ${fromY} C ${fromX - control} ${fromY}, ${toX + control} ${toY}, ${toX} ${toY}`
    : `M ${fromX} ${fromY} C ${fromX + control} ${fromY}, ${toX - control} ${toY}, ${toX} ${toY}`;
}
