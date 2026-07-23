import type {
  AgentWorkflowDefinition,
  AgentWorkflowEdge,
  AgentWorkflowGraph,
  AgentWorkflowNode,
  AgentWorkflowStep
} from "../../types";

export type WorkflowGraphValidation = {
  valid: boolean;
  errors: string[];
  orderedNodes: AgentWorkflowNode[];
};

type WorkflowGraphValidationOptions = {
  requireAgent?: boolean;
  agentIds?: readonly string[];
  knowledgeDocumentIds?: readonly string[];
  knowledgeBaseIds?: readonly string[];
};

const nodeSpacing = 286;
const defaultY = 148;

function uniqueIds(values: string[]) {
  return new Set(values).size === values.length;
}

function cloneNode(node: AgentWorkflowNode): AgentWorkflowNode {
  return {
    ...node,
    position: { ...node.position },
    skillIds: node.skillIds ? [...node.skillIds] : undefined,
    knowledgeDocumentIds: node.knowledgeDocumentIds ? [...node.knowledgeDocumentIds] : undefined,
    knowledgeBaseIds: node.knowledgeBaseIds ? [...node.knowledgeBaseIds] : undefined
  };
}

function cloneEdge(edge: AgentWorkflowEdge): AgentWorkflowEdge {
  return {
    ...edge,
    sourceHandle: edge.sourceHandle || "output",
    targetHandle: edge.targetHandle || "input"
  };
}

function startNodeId(workflowId: string) {
  return `${workflowId}-start`;
}

function replyNodeId(workflowId: string) {
  return `${workflowId}-reply`;
}

export function graphFromLegacySteps(workflow: Pick<AgentWorkflowDefinition, "id" | "steps">): AgentWorkflowGraph {
  const startId = startNodeId(workflow.id);
  const replyId = replyNodeId(workflow.id);
  const nodes: AgentWorkflowNode[] = [
    {
      id: startId,
      kind: "start",
      name: "开始",
      position: { x: 44, y: defaultY }
    },
    ...workflow.steps.map((step, index) => ({
      id: step.id,
      kind: "agent" as const,
      name: step.name,
      position: { x: 44 + nodeSpacing * (index + 1), y: defaultY },
      instruction: step.instruction,
      agentId: step.agentId,
      skillIds: [...step.skillIds]
    })),
    {
      id: replyId,
      kind: "reply",
      name: "输出结果",
      position: { x: 44 + nodeSpacing * (workflow.steps.length + 1), y: defaultY }
    }
  ];
  const orderedIds = nodes.map((node) => node.id);
  const edges = orderedIds.slice(0, -1).map((source, index) => ({
    id: `${source}->${orderedIds[index + 1]}`,
    source,
    target: orderedIds[index + 1],
    sourceHandle: "output" as const,
    targetHandle: "input" as const
  }));

  return { version: 1, nodes, edges };
}

export function emptyWorkflowGraph(workflowId: string): AgentWorkflowGraph {
  return graphFromLegacySteps({ id: workflowId, steps: [] });
}

export function normalizedWorkflowGraph(workflow: Pick<AgentWorkflowDefinition, "id" | "steps" | "graph">): AgentWorkflowGraph {
  const graph = workflow.graph;
  if (!graph || graph.version !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return graphFromLegacySteps(workflow);
  }
  return {
    version: 1,
    nodes: graph.nodes.map(cloneNode),
    edges: graph.edges.map(cloneEdge),
    viewport: graph.viewport ? { ...graph.viewport } : undefined
  };
}

export function workflowGraphToSteps(graph: AgentWorkflowGraph): AgentWorkflowStep[] {
  const validation = validateWorkflowGraph(graph, { requireAgent: false });
  if (!validation.valid) return [];
  return validation.orderedNodes
    .filter((node) => node.kind === "agent")
    .map((node) => ({
      id: node.id,
      name: node.name,
      instruction: node.instruction || "说明这个节点需要完成的任务和输出要求。",
      agentId: node.agentId,
      skillIds: [...(node.skillIds || [])],
      usePreviousOutput: graph.edges.some((edge) => {
        if (edge.target !== node.id) return false;
        const source = graph.nodes.find((item) => item.id === edge.source);
        return source?.kind === "agent";
      })
    }));
}

function acceptsInput(node: AgentWorkflowNode) {
  return node.kind !== "start";
}

function providesOutput(node: AgentWorkflowNode) {
  return node.kind !== "reply";
}

export function wouldCreateWorkflowCycle(
  graph: AgentWorkflowGraph,
  sourceId: string,
  targetId: string
) {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const targets = outgoing.get(edge.source) || [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const visited = new Set<string>();
  const stack = [targetId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === sourceId) return true;
    visited.add(current);
    stack.push(...(outgoing.get(current) || []));
  }
  return false;
}

export function canConnectWorkflowNodes(
  graph: AgentWorkflowGraph,
  sourceId: string | null | undefined,
  targetId: string | null | undefined
) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const source = graph.nodes.find((node) => node.id === sourceId);
  const target = graph.nodes.find((node) => node.id === targetId);
  if (!source || !target || !providesOutput(source) || !acceptsInput(target)) return false;
  if (graph.edges.some((edge) => edge.source === sourceId && edge.target === targetId)) return false;
  return !wouldCreateWorkflowCycle(graph, sourceId, targetId);
}

export function validateWorkflowGraph(
  graph: AgentWorkflowGraph,
  options: WorkflowGraphValidationOptions = {}
): WorkflowGraphValidation {
  const errors: string[] = [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const requireAgent = options.requireAgent !== false;
  const knownAgentIds = options.agentIds ? new Set(options.agentIds) : null;
  const knownKnowledgeDocumentIds = options.knowledgeDocumentIds ? new Set(options.knowledgeDocumentIds) : null;
  const knownKnowledgeBaseIds = options.knowledgeBaseIds ? new Set(options.knowledgeBaseIds) : null;

  if (!nodes.length) errors.push("工作流至少需要一个开始节点。");
  if (!uniqueIds(nodes.map((node) => node.id))) errors.push("工作流包含重复节点。");
  if (!uniqueIds(edges.map((edge) => edge.id))) errors.push("工作流包含重复连线。");

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const startNodes = nodes.filter((node) => node.kind === "start");
  const replyNodes = nodes.filter((node) => node.kind === "reply");
  const agentNodes = nodes.filter((node) => node.kind === "agent");
  const processingNodes = nodes.filter((node) => node.kind !== "start" && node.kind !== "reply");
  if (startNodes.length !== 1) errors.push("工作流必须且只能有一个开始节点。");
  if (replyNodes.length !== 1) errors.push("工作流必须且只能有一个输出节点。");
  if (requireAgent && !agentNodes.length) errors.push("工作流至少需要一个智能体节点。");

  const edgePairs = new Set<string>();
  const incoming = new Map<string, AgentWorkflowEdge[]>();
  const outgoing = new Map<string, AgentWorkflowEdge[]>();
  for (const node of nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    const pair = `${edge.source}->${edge.target}`;
    if (!source || !target) {
      errors.push("连线引用了不存在的节点。");
      continue;
    }
    if (source.id === target.id) {
      errors.push("节点不能连接到自身。");
      continue;
    }
    if (edgePairs.has(pair)) {
      errors.push("两个节点之间不能存在重复连线。");
      continue;
    }
    edgePairs.add(pair);
    if ((edge.sourceHandle || "output") !== "output" || (edge.targetHandle || "input") !== "input") {
      errors.push("连线端口无效，请从输出端口连接到输入端口。");
      continue;
    }
    if (!providesOutput(source) || !acceptsInput(target)) {
      errors.push("连线必须从可输出节点流向可接收输入的节点。");
      continue;
    }
    incoming.get(target.id)?.push(edge);
    outgoing.get(source.id)?.push(edge);
  }

  const start = startNodes[0];
  if (start && (incoming.get(start.id)?.length || 0) > 0) {
    errors.push("开始节点不能有输入连线。");
  }
  for (const agent of agentNodes) {
    if (!agent.name.trim()) errors.push("智能体节点名称不能为空。");
    if (!agent.instruction?.trim()) errors.push(`智能体节点“${agent.name || agent.id}”缺少节点指令。`);
    if (!agent.agentId) {
      errors.push(`智能体节点“${agent.name || agent.id}”尚未绑定智能体。`);
    } else if (knownAgentIds && !knownAgentIds.has(agent.agentId)) {
      errors.push(`智能体节点“${agent.name || agent.id}”引用的智能体已不存在。`);
    }
  }
  for (const node of processingNodes) {
    if (!node.name.trim()) errors.push("工作流节点名称不能为空。");
    if (!(incoming.get(node.id)?.length || 0)) errors.push(`节点“${node.name}”缺少输入连线。`);
    if (!(outgoing.get(node.id)?.length || 0)) errors.push(`节点“${node.name}”缺少输出连线。`);
    if (node.kind === "template" && !node.template?.trim()) errors.push(`文本模板节点“${node.name}”缺少模板内容。`);
    if (node.kind === "knowledge") {
      const localIds = node.knowledgeDocumentIds || [];
      const cloudIds = [...new Set(node.knowledgeBaseIds || [])];
      if (!localIds.length && !cloudIds.length) {
        errors.push(`知识检索节点“${node.name}”尚未选择本地文档或云知识库。`);
      }
      if (knownKnowledgeDocumentIds && localIds.some((id) => !knownKnowledgeDocumentIds.has(id))) {
        errors.push(`知识检索节点“${node.name}”引用的本地文档已不存在。`);
      }
      if (cloudIds.length > 3) {
        errors.push(`知识检索节点“${node.name}”最多引用 3 个云知识库。`);
      } else if (knownKnowledgeBaseIds && cloudIds.some((id) => !knownKnowledgeBaseIds.has(id))) {
        errors.push(`知识检索节点“${node.name}”引用的云知识库已不存在或无权访问。`);
      }
    }
  }
  for (const reply of replyNodes) {
    if (!(incoming.get(reply.id)?.length || 0)) errors.push("输出节点缺少输入连线。");
    if (outgoing.get(reply.id)?.length) errors.push("输出节点不能有输出连线。");
  }

  const visited = new Set<string>();
  if (start) {
    const stack = [start.id];
    while (stack.length) {
      const id = stack.pop();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      for (const edge of outgoing.get(id) || []) stack.push(edge.target);
    }
    for (const node of nodes) {
      if (!visited.has(node.id)) errors.push(`节点“${node.name}”无法从开始节点到达。`);
    }
  }

  const inDegree = new Map(nodes.map((node) => [node.id, incoming.get(node.id)?.length || 0]));
  const queue = nodes.filter((node) => (inDegree.get(node.id) || 0) === 0).sort((a, b) => a.position.x - b.position.x);
  const orderedNodes: AgentWorkflowNode[] = [];
  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    orderedNodes.push(node);
    for (const edge of outgoing.get(node.id) || []) {
      const nextDegree = (inDegree.get(edge.target) || 0) - 1;
      inDegree.set(edge.target, nextDegree);
      if (nextDegree === 0) {
        const target = nodeMap.get(edge.target);
        if (target) {
          queue.push(target);
          queue.sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);
        }
      }
    }
  }
  if (orderedNodes.length !== nodes.length) errors.push("工作流不能包含循环连线。");

  return { valid: errors.length === 0, errors: [...new Set(errors)], orderedNodes };
}

export function addWorkflowNodeToGraph(
  graph: AgentWorkflowGraph,
  node: AgentWorkflowNode
): AgentWorkflowGraph {
  const reply = graph.nodes.find((item) => item.kind === "reply");
  const inboundReplyEdges = reply ? graph.edges.filter((edge) => edge.target === reply.id) : [];
  const remainingEdges = reply
    ? graph.edges.filter((edge) => edge.target !== reply.id)
    : [...graph.edges];
  const rewiredEdges = inboundReplyEdges.map((edge) => ({
    ...edge,
    id: `${edge.source}->${node.id}`,
    target: node.id
  }));
  if (!inboundReplyEdges.length) {
    const start = graph.nodes.find((item) => item.kind === "start");
    if (start) rewiredEdges.push({ id: `${start.id}->${node.id}`, source: start.id, target: node.id, sourceHandle: "output", targetHandle: "input" });
  }
  if (reply) {
    rewiredEdges.push({ id: `${node.id}->${reply.id}`, source: node.id, target: reply.id, sourceHandle: "output", targetHandle: "input" });
  }
  return {
    ...graph,
    nodes: [...graph.nodes, cloneNode(node)],
    edges: [...remainingEdges, ...rewiredEdges]
  };
}

export const addAgentNodeToGraph = addWorkflowNodeToGraph;

export function removeWorkflowNode(graph: AgentWorkflowGraph, nodeId: string): AgentWorkflowGraph {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node || node.kind === "start" || node.kind === "reply") return graph;
  const inbound = graph.edges.filter((edge) => edge.target === nodeId);
  const outbound = graph.edges.filter((edge) => edge.source === nodeId);
  const retainedEdges = graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
  const restoredEdges = inbound.flatMap((sourceEdge) => outbound.map((targetEdge) => ({
    id: `${sourceEdge.source}->${targetEdge.target}`,
    source: sourceEdge.source,
    target: targetEdge.target,
    sourceHandle: "output" as const,
    targetHandle: "input" as const
  }))).filter((edge) => !retainedEdges.some((item) => item.source === edge.source && item.target === edge.target));
  return {
    ...graph,
    nodes: graph.nodes.filter((item) => item.id !== nodeId),
    edges: [...retainedEdges, ...restoredEdges]
  };
}
