import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CheckCircle2, CircleAlert, Loader2, Maximize2 } from "lucide-react";
import type {
  AgentWorkflowEdge,
  AgentWorkflowGraph,
  AgentWorkflowNode
} from "../../types";
import { createClientId } from "../../utils/clientId";
import { canConnectWorkflowNodes } from "./workflowGraph";
import { workflowComponentForNode } from "./workflowComponents";
import { workflowComponentIcon } from "./WorkflowComponentIcon";
import type {
  WorkflowCanvasEdgeState,
  WorkflowCanvasNodeState
} from "./workflowState";

type WorkflowCanvasNodeData = {
  node: AgentWorkflowNode;
  status?: WorkflowCanvasNodeState;
};

type WorkflowCanvasNode = Node<WorkflowCanvasNodeData, "workflow">;

type WorkflowCanvasProps = {
  graph: AgentWorkflowGraph;
  nodeStates?: Record<string, WorkflowCanvasNodeState>;
  edgeStates?: Record<string, WorkflowCanvasEdgeState>;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  disabled?: boolean;
  onChange: (graph: AgentWorkflowGraph) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
};

function nodeIcon(node: AgentWorkflowNode) {
  return workflowComponentIcon(node.kind);
}

function nodeKindLabel(node: AgentWorkflowNode) {
  return workflowComponentForNode(node).label;
}

function statusLabel(status?: WorkflowCanvasNodeState) {
  if (status === "running") return "执行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "skipped") return "已跳过";
  return "等待";
}

function WorkflowCanvasNodeCard({ data, selected }: NodeProps<WorkflowCanvasNode>) {
  const Icon = nodeIcon(data.node);
  const status = data.status || "pending";
  const component = workflowComponentForNode(data.node);
  const inputPorts = component.ports.inputs;
  const outputPorts = component.ports.outputs;
  return (
    <div
      className={`workflow-canvas-node ${data.node.kind} ${status} ${selected ? "selected" : ""}`}
      data-testid={`workflow-node-${data.node.id}`}
      aria-label={`${data.node.name}，${statusLabel(status)}`}
    >
      {inputPorts.map((port, index) => (
        <Handle
          key={port.id}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{ top: `${((index + 1) / (inputPorts.length + 1)) * 100}%` }}
          aria-label={`连接到 ${data.node.name} 的${port.label}端口`}
          title={port.label}
        />
      ))}
      <div className="workflow-canvas-node-icon"><Icon size={16} /></div>
      <div>
        <small>{nodeKindLabel(data.node)} · V{component.version}</small>
        <strong>{data.node.name}</strong>
        <span>{status === "running" ? <Loader2 className="spin" size={12} /> : status === "completed" ? <CheckCircle2 size={12} /> : status === "failed" ? <CircleAlert size={12} /> : null}{statusLabel(status)}</span>
      </div>
      {outputPorts.map((port, index) => (
        <Handle
          key={port.id}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{ top: `${((index + 1) / (outputPorts.length + 1)) * 100}%` }}
          aria-label={`从 ${data.node.name} 的${port.label}端口继续连接`}
          title={port.label}
        />
      ))}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowCanvasNodeCard };
const workflowNodeDimensions = { width: 190, height: 76 } as const;

function edgeStateClass(state?: WorkflowCanvasEdgeState, selected = false) {
  return ["workflow-canvas-edge", state || "waiting", selected ? "selected" : ""].filter(Boolean).join(" ");
}

function minimapNodeColor(node: WorkflowCanvasNode) {
  if (node.data.node.kind === "reply") return "var(--xhs-green)";
  if (node.data.node.kind === "knowledge") return "var(--xhs-warning)";
  if (node.data.node.kind === "template") return "var(--xhs-blue)";
  if (node.data.node.kind === "agent") return "var(--xhs-red)";
  if (node.data.node.kind === "unsupported") return "var(--xhs-danger)";
  if (node.data.node.kind === "conditional" || node.data.node.kind === "loop") return "var(--xhs-blue)";
  return "var(--xhs-blue)";
}

function isConnectionAllowed(
  graph: AgentWorkflowGraph,
  connection: {
    source?: string | null;
    target?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }
) {
  return canConnectWorkflowNodes(
    graph,
    connection.source,
    connection.target,
    connection.sourceHandle,
    connection.targetHandle
  );
}

function WorkflowCanvasInner({
  graph,
  nodeStates,
  edgeStates,
  selectedNodeId,
  selectedEdgeId,
  disabled,
  onChange,
  onSelectNode,
  onSelectEdge
}: WorkflowCanvasProps) {
  const { fitView } = useReactFlow();
  const nodes = useMemo<WorkflowCanvasNode[]>(() => graph.nodes.map((node) => ({
    id: node.id,
    type: "workflow",
    position: node.position,
    ...workflowNodeDimensions,
    data: { node, status: nodeStates?.[node.id] },
    selected: selectedNodeId === node.id,
    draggable: !disabled,
    connectable: !disabled,
    deletable: false,
    ariaLabel: node.name
  })), [disabled, graph.nodes, nodeStates, selectedNodeId]);

  const edges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle || "output",
    target: edge.target,
    targetHandle: edge.targetHandle || "input",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    animated: edgeStates?.[edge.id] === "active",
    className: edgeStateClass(edgeStates?.[edge.id], selectedEdgeId === edge.id),
    selectable: true,
    focusable: true,
    ariaLabel: "工作流连线"
  })), [edgeStates, graph.edges, selectedEdgeId]);

  const updateNodePositions = useCallback((changes: NodeChange<WorkflowCanvasNode>[]) => {
    const positions = new Map(
      changes.flatMap((change) => change.type === "position" && change.position && change.dragging !== true
        ? [[change.id, change.position] as const]
        : [])
    );
    if (!positions.size) return;
    onChange({
      ...graph,
      nodes: graph.nodes.map((node) => {
        const position = positions.get(node.id);
        return position ? { ...node, position } : node;
      })
    });
  }, [graph, onChange]);

  const removeEdges = useCallback((changes: EdgeChange<Edge>[]) => {
    const removed = new Set(changes.flatMap((change) => change.type === "remove" ? [change.id] : []));
    if (!removed.size) return;
    onChange({ ...graph, edges: graph.edges.filter((edge) => !removed.has(edge.id)) });
  }, [graph, onChange]);

  const connect = useCallback((connection: Connection) => {
    if (!isConnectionAllowed(graph, connection) || !connection.source || !connection.target) return;
    const edge: AgentWorkflowEdge = {
      id: createClientId("edge"),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || "output",
      targetHandle: connection.targetHandle || "input"
    };
    onChange({ ...graph, edges: [...graph.edges, edge] });
    onSelectEdge(edge.id);
  }, [graph, onChange, onSelectEdge]);

  const setViewport = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    onChange({ ...graph, viewport });
  }, [graph, onChange]);

  const fitCanvas = useCallback(() => {
    void fitView({ padding: 0.28, duration: 150 });
  }, [fitView]);

  return (
    <div className="workflow-canvas-frame" data-testid="workflow-canvas">
      <button
        type="button"
        className="workflow-canvas-fit"
        onClick={fitCanvas}
        aria-label="适配工作流画布"
        title="适配工作流画布"
      >
        <Maximize2 size={15} />
      </button>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={updateNodePositions}
        onEdgesChange={removeEdges}
        onConnect={connect}
        onNodeClick={(_event, node) => onSelectNode(node.id)}
        onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}
        onMoveEnd={setViewport}
        defaultViewport={graph.viewport || { x: 0, y: 0, zoom: 1 }}
        minZoom={0.2}
        maxZoom={1.7}
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable
        deleteKeyCode={disabled ? null : ["Backspace", "Delete"]}
        onPaneClick={() => {
          onSelectNode("");
          onSelectEdge("");
        }}
        isValidConnection={(connection) => isConnectionAllowed(graph, connection)}
        proOptions={{ hideAttribution: true }}
        aria-label="工作流画布"
      >
        <Background gap={18} size={1} color="var(--xhs-line)" />
        <MiniMap
          className="workflow-canvas-minimap"
          nodeColor={minimapNodeColor}
          pannable
          zoomable
          position="bottom-left"
          style={{ width: 104, height: 70 }}
        />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export default function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
