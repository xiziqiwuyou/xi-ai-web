import type {
  AgentWorkflowEdge,
  AgentWorkflowGraph,
  AgentWorkflowNode
} from "../../types";
import type {
  WorkflowCanvasEdgeState,
  WorkflowCanvasNodeState
} from "./workflowState";
import type { WorkflowUpstreamOutput } from "./workflowRuntime";

export type WorkflowNodeExecutionContext = {
  node: AgentWorkflowNode;
  index: number;
  inputs: WorkflowUpstreamOutput[];
  inboundEdges: AgentWorkflowEdge[];
};

export type WorkflowNodeExecutionResult = {
  output: string;
  activeSourceHandles?: string[];
};

export type WorkflowExecutionCallbacks = {
  executeNode: (context: WorkflowNodeExecutionContext) => Promise<WorkflowNodeExecutionResult>;
  onNodeState?: (node: AgentWorkflowNode, state: WorkflowCanvasNodeState, output?: string, error?: string) => void;
  onEdgeState?: (edges: AgentWorkflowEdge[], state: WorkflowCanvasEdgeState) => void;
};

export type WorkflowExecutionResult = {
  outputs: Map<string, string>;
  skippedNodeIds: Set<string>;
};

function sourceHandle(edge: AgentWorkflowEdge) {
  return edge.sourceHandle || "output";
}

export async function executeWorkflowGraph(
  graph: AgentWorkflowGraph,
  orderedNodes: AgentWorkflowNode[],
  initialInput: string,
  callbacks: WorkflowExecutionCallbacks
): Promise<WorkflowExecutionResult> {
  const outputs = new Map<string, string>();
  const skippedNodeIds = new Set<string>();
  const disabledEdgeIds = new Set<string>();
  const start = orderedNodes.find((node) => node.kind === "start");
  if (start) {
    outputs.set(start.id, initialInput);
    callbacks.onNodeState?.(start, "completed", initialInput);
  }

  for (const [index, node] of orderedNodes.entries()) {
    if (node.kind === "start") continue;
    const inboundEdges = graph.edges.filter((edge) => edge.target === node.id);
    const activeInboundEdges = inboundEdges.filter((edge) => (
      !disabledEdgeIds.has(edge.id) && outputs.has(edge.source) && !skippedNodeIds.has(edge.source)
    ));

    if (!activeInboundEdges.length) {
      skippedNodeIds.add(node.id);
      callbacks.onNodeState?.(node, "skipped");
      callbacks.onEdgeState?.(inboundEdges, "skipped");
      const outgoing = graph.edges.filter((edge) => edge.source === node.id);
      outgoing.forEach((edge) => disabledEdgeIds.add(edge.id));
      callbacks.onEdgeState?.(outgoing, "skipped");
      continue;
    }

    callbacks.onNodeState?.(node, "running");
    callbacks.onEdgeState?.(activeInboundEdges, "active");
    const inputs = activeInboundEdges.map((edge) => {
      const source = graph.nodes.find((item) => item.id === edge.source);
      return {
        nodeId: edge.source,
        name: source?.name || "上游节点",
        text: outputs.get(edge.source) || ""
      };
    });

    try {
      const result = await callbacks.executeNode({ node, index, inputs, inboundEdges: activeInboundEdges });
      outputs.set(node.id, result.output);
      callbacks.onNodeState?.(node, "completed", result.output);
      callbacks.onEdgeState?.(activeInboundEdges, "completed");

      if (result.activeSourceHandles) {
        const enabledHandles = new Set(result.activeSourceHandles);
        const outgoing = graph.edges.filter((edge) => edge.source === node.id);
        const disabled = outgoing.filter((edge) => !enabledHandles.has(sourceHandle(edge)));
        disabled.forEach((edge) => disabledEdgeIds.add(edge.id));
        callbacks.onEdgeState?.(disabled, "skipped");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "节点执行失败。";
      callbacks.onNodeState?.(node, "failed", undefined, message);
      callbacks.onEdgeState?.(activeInboundEdges, "failed");
      const outgoing = graph.edges.filter((edge) => edge.source === node.id);
      callbacks.onEdgeState?.(outgoing, "skipped");
      for (const remaining of orderedNodes.slice(index + 1)) {
        if (remaining.kind === "start") continue;
        skippedNodeIds.add(remaining.id);
        callbacks.onNodeState?.(remaining, "skipped");
      }
      callbacks.onEdgeState?.(
        graph.edges.filter((edge) => edge.source !== node.id && (
          skippedNodeIds.has(edge.source) || skippedNodeIds.has(edge.target)
        )),
        "skipped"
      );
      throw error;
    }
  }

  return { outputs, skippedNodeIds };
}
