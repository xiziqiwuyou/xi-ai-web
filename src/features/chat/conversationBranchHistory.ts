import type { Conversation, ConversationBranchMode } from "../../types";
import {
  normalizeConversationQuery,
  searchConversations
} from "./conversationRetrieval";

export const conversationBranchHistoryLimits = Object.freeze({
  maxConversations: 80,
  maxFamilies: 32,
  maxNodes: 80,
  maxDepth: 8
});

export type ConversationBranchHistoryStatus = "linked" | "orphan" | "invalid";

export type ConversationBranchHistoryNode = {
  conversation: Conversation;
  depth: number;
  mode?: ConversationBranchMode;
  status: ConversationBranchHistoryStatus;
  children: ConversationBranchHistoryNode[];
  truncated: boolean;
};

export type ConversationBranchFamily = {
  id: string;
  root: ConversationBranchHistoryNode;
  nodeCount: number;
  hasArchived: boolean;
};

export type ConversationBranchHistoryProjection = {
  families: ConversationBranchFamily[];
  totalNodes: number;
  truncated: boolean;
};

type ParentEdge = Map<string, string>;

function isConversationBranchMode(value: unknown): value is ConversationBranchMode {
  return value === "continue" || value === "edit" || value === "retry";
}

function uniqueConversations(conversations: readonly Conversation[]) {
  const byId = new Map<string, Conversation>();
  const order: string[] = [];
  for (const conversation of conversations.slice(0, conversationBranchHistoryLimits.maxConversations)) {
    if (!conversation || typeof conversation.id !== "string" || !conversation.id || byId.has(conversation.id)) {
      continue;
    }
    byId.set(conversation.id, conversation);
    order.push(conversation.id);
  }
  return { byId, order };
}

function createsCycle(childId: string, parentId: string, acceptedParents: ParentEdge) {
  const seen = new Set<string>([childId]);
  let current = parentId;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = acceptedParents.get(current) || "";
  }
  return false;
}

function buildEdges(
  byId: Map<string, Conversation>,
  order: string[]
) {
  const parents: ParentEdge = new Map();
  const statuses = new Map<string, ConversationBranchHistoryStatus>();

  for (const id of order) {
    const branch = byId.get(id)?.branch;
    if (!branch) {
      statuses.set(id, "linked");
      continue;
    }
    if (
      typeof branch.parentConversationId !== "string" ||
      !branch.parentConversationId ||
      typeof branch.sourceMessageId !== "string" ||
      !branch.sourceMessageId ||
      !isConversationBranchMode(branch.mode)
    ) {
      statuses.set(id, "invalid");
      continue;
    }
    if (!byId.has(branch.parentConversationId)) {
      statuses.set(id, "orphan");
      continue;
    }
    if (branch.parentConversationId === id || createsCycle(id, branch.parentConversationId, parents)) {
      statuses.set(id, "invalid");
      continue;
    }
    parents.set(id, branch.parentConversationId);
    statuses.set(id, "linked");
  }

  return { parents, statuses };
}

function countNode(node: ConversationBranchHistoryNode): number {
  return 1 + node.children.reduce((total, child) => total + countNode(child), 0);
}

function hasArchivedNode(node: ConversationBranchHistoryNode): boolean {
  return Boolean(node.conversation.archivedAt) || node.children.some(hasArchivedNode);
}

function nodeMatches(
  node: ConversationBranchHistoryNode,
  matchingIds: Set<string>
) {
  return matchingIds.has(node.conversation.id);
}

function flattenNodes(
  families: readonly ConversationBranchFamily[]
) {
  const conversations: Conversation[] = [];
  const visit = (node: ConversationBranchHistoryNode) => {
    conversations.push(node.conversation);
    node.children.forEach(visit);
  };
  families.forEach((family) => visit(family.root));
  return conversations;
}

function pruneNode(
  node: ConversationBranchHistoryNode,
  matchingIds: Set<string>
): ConversationBranchHistoryNode | null {
  const children = node.children
    .map((child) => pruneNode(child, matchingIds))
    .filter((child): child is ConversationBranchHistoryNode => Boolean(child));
  if (!nodeMatches(node, matchingIds) && !children.length) return null;
  return { ...node, children };
}

function rebuildFamily(root: ConversationBranchHistoryNode): ConversationBranchFamily {
  return {
    id: root.conversation.id,
    root,
    nodeCount: countNode(root),
    hasArchived: hasArchivedNode(root)
  };
}

export function buildConversationBranchHistory(
  conversations: readonly Conversation[]
): ConversationBranchHistoryProjection {
  const { byId, order } = uniqueConversations(conversations);
  const { parents, statuses } = buildEdges(byId, order);
  const childrenByParent = new Map<string, string[]>();

  for (const [childId, parentId] of parents) {
    const children = childrenByParent.get(parentId) || [];
    children.push(childId);
    childrenByParent.set(parentId, children);
  }

  const rootIds = order.filter((id) => !parents.has(id));
  const branchRootIds = rootIds.filter((id) =>
    Boolean(byId.get(id)?.branch) || Boolean(childrenByParent.get(id)?.length)
  );
  let remainingNodes = conversationBranchHistoryLimits.maxNodes;
  let truncated = order.length > conversationBranchHistoryLimits.maxConversations;
  const families: ConversationBranchFamily[] = [];

  const buildNode = (
    id: string,
    depth: number,
    path: Set<string>
  ): ConversationBranchHistoryNode | null => {
    const conversation = byId.get(id);
    if (!conversation || remainingNodes <= 0 || path.has(id)) return null;
    remainingNodes -= 1;
    const nextPath = new Set(path);
    nextPath.add(id);
    const childIds = childrenByParent.get(id) || [];
    const node: ConversationBranchHistoryNode = {
      conversation,
      depth,
      ...(conversation.branch && isConversationBranchMode(conversation.branch.mode)
        ? { mode: conversation.branch.mode }
        : {}),
      status: statuses.get(id) || "linked",
      children: [],
      truncated: false
    };
    if (depth >= conversationBranchHistoryLimits.maxDepth && childIds.length) {
      node.truncated = true;
      truncated = true;
      return node;
    }
    for (const childId of childIds) {
      const child = buildNode(childId, depth + 1, nextPath);
      if (child) node.children.push(child);
      else {
        node.truncated = true;
        truncated = true;
      }
    }
    return node;
  };

  for (const rootId of branchRootIds.slice(0, conversationBranchHistoryLimits.maxFamilies)) {
    const root = buildNode(rootId, 0, new Set());
    if (!root) {
      truncated = true;
      break;
    }
    families.push(rebuildFamily(root));
  }
  if (branchRootIds.length > conversationBranchHistoryLimits.maxFamilies) truncated = true;

  return {
    families,
    totalNodes: families.reduce((total, family) => total + family.nodeCount, 0),
    truncated
  };
}

export function filterConversationBranchHistory(
  projection: ConversationBranchHistoryProjection,
  query: unknown
): ConversationBranchHistoryProjection {
  const normalizedQuery = normalizeConversationQuery(query);
  if (!normalizedQuery) return projection;
  const matchingIds = new Set(
    searchConversations(flattenNodes(projection.families), normalizedQuery, conversationBranchHistoryLimits.maxNodes)
      .map((result) => result.id)
  );
  if (!matchingIds.size) {
    return { families: [], totalNodes: 0, truncated: projection.truncated };
  }
  const families = projection.families
    .map((family) => pruneNode(family.root, matchingIds))
    .filter((root): root is ConversationBranchHistoryNode => Boolean(root))
    .map(rebuildFamily);
  return {
    families,
    totalNodes: families.reduce((total, family) => total + family.nodeCount, 0),
    truncated: projection.truncated
  };
}

export function conversationBranchFamilyContains(
  family: ConversationBranchFamily,
  conversationId: string
) {
  if (!conversationId) return false;
  const pending = [family.root];
  let visited = 0;
  while (pending.length && visited < conversationBranchHistoryLimits.maxNodes) {
    const node = pending.shift();
    if (!node) break;
    if (node.conversation.id === conversationId) return true;
    pending.unshift(...node.children);
    visited += 1;
  }
  return false;
}
