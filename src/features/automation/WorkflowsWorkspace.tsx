import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import {
  ArrowLeft,
  BookOpenText,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  FileText,
  Globe2,
  LayoutTemplate,
  Loader2,
  Play,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  Workflow,
  Wrench
} from "lucide-react";
import { api } from "../../api";
import { ConfirmationDialog, FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import { createClientId } from "../../utils/clientId";
import {
  compactModelLabel,
  modelsForCapability,
  preferredModelFor,
  vendorLabels
} from "../../components/workbench";
import type {
  AgentSkillDefinition,
  AgentWorkflowConfigValue,
  AgentWorkflowGraph,
  AgentWorkflowDefinition,
  AgentWorkflowNode,
  GalleryItem,
  GenerationResult,
  KnowledgeCitation,
  KnowledgeDocument,
  ModelCapability,
  ModelCatalogEntry,
  SearchServiceConfig,
  ToolSetting,
  UserAgentDefinition,
  UserProviderConfig
} from "../../types";
import AgentTracePanel from "../agents/AgentTracePanel";
import { loadKnowledgeDocumentsAsync } from "../knowledge/knowledgeDb";
import CloudKnowledgeSelector from "../knowledge-cloud/CloudKnowledgeSelector";
import KnowledgeCitationList from "../knowledge-cloud/KnowledgeCitationList";
import {
  isKnowledgeBaseReady,
  knowledgeSessionChangedEvent,
  normalizeKnowledgeBaseIds
} from "../knowledge-cloud/integrationState";
import { useKnowledgeCatalog } from "../knowledge-cloud/useKnowledgeCatalog";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import SearchServiceDialog from "../settings/SearchServiceDialog";
import {
  isSearchServiceReady,
  searchServicePayload
} from "../settings/searchServiceConfig";
import {
  loadAutomationWorkspace,
  saveAgentWorkflows,
  saveUserAgents,
  type AutomationWorkspace
} from "./automationRepository";
import {
  createWorkflowComponentNode,
  workflowComponentForNode,
  workflowPaletteComponents,
  type WorkflowComponentConfigField
} from "./workflowComponents";
import WorkflowComponentIcon from "./WorkflowComponentIcon";
import WorkflowCanvas from "./WorkflowCanvas";
import {
  addWorkflowNodeToGraph,
  emptyWorkflowGraph,
  normalizedWorkflowGraph,
  removeWorkflowNode,
  validateWorkflowGraph,
  workflowGraphToSteps
} from "./workflowGraph";
import { executeWorkflowGraph } from "./workflowExecution";
import type {
  WorkflowCanvasEdgeState,
  WorkflowCanvasNodeState
} from "./workflowState";
import {
  importLangflowWorkflow,
  LangflowImportError
} from "./workflowLangflowImport";
import {
  createWorkflowFromTemplate,
  workflowStarterTemplates,
  type WorkflowStarterTemplate
} from "./workflowTemplates";
import {
  agentTraceFromResult,
  knowledgeCitationsFromResult,
  mergeKnowledgeCitations,
  prepareCloudKnowledgeRequestContext,
  stableKnowledgeBaseIds,
  withKnowledgeCitations,
  type AutomationKnowledgeCatalog
} from "./automationKnowledge";
import {
  evaluateWorkflowCondition,
  mergeWorkflowOutputs,
  parseWorkflowStructuredOutput,
  renderWorkflowTemplate,
  retrieveWorkflowKnowledge,
  runBoundedWorkflowLoop,
  splitWorkflowText,
  transformWorkflowText
} from "./workflowRuntime";
import {
  capabilitySetCompatibility,
  skillCompatibility,
  supportedVendorLabels,
  toolCompatibility,
  toolExecutionLabel,
  toolSetCompatibility
} from "./toolCompatibility";

import {
  AutomationEmpty,
  AutomationHero,
  AutomationResult,
  AutomationSectionHeader,
  ChoiceGrid,
  agentCategories,
  agentKnowledgeContext,
  collectWorkflowCloudKnowledgeBaseIds,
  modelOptions,
  nextId,
  tagsFromInput,
  unique,
  WorkflowConfigField,
  WorkflowTimeline,
  type PendingWorkflowApproval,
  type SharedWorkspaceProps,
  type WorkflowRunStep
} from "./automationShared";

export function WorkflowsWorkspace({
  agents,
  skills,
  workflows,
  knowledgeDocuments,
  knowledgeCatalog,
  modelCatalog,
  toolSettings,
  userProvider,
  searchService,
  searchReady,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig,
  onOpenSearchSettings,
  onSave
}: SharedWorkspaceProps & { onSave: (workflows: AgentWorkflowDefinition[]) => Promise<void> }) {
  const [view, setView] = useState<"catalog" | "editor">("catalog");
  const [catalogMode, setCatalogMode] = useState<"mine" | "templates">("mine");
  const [selectedId, setSelectedId] = useState(workflows[0]?.id || "");
  const selected = workflows.find((workflow) => workflow.id === selectedId) || workflows[0];
  const [draft, setDraft] = useState<AgentWorkflowDefinition | null>(selected ? structuredClone(selected) : null);
  const [task, setTask] = useState("");
  const [runModelId, setRunModelId] = useState("");
  const [runSteps, setRunSteps] = useState<WorkflowRunStep[]>([]);
  const [nodeStates, setNodeStates] = useState<Record<string, WorkflowCanvasNodeState>>({});
  const [edgeStates, setEdgeStates] = useState<Record<string, WorkflowCanvasEdgeState>>({});
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingWorkflowApproval | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const models = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const selectedRunModel = models.find((model) => model.id === runModelId) || preferredModelFor(models, "chat", userProvider.lastModelId);
  const graph = draft ? normalizedWorkflowGraph(draft) : null;
  const graphValidation = graph
    ? validateWorkflowGraph(graph, {
        agentIds: agents.map((agent) => agent.id),
        knowledgeDocumentIds: knowledgeDocuments.map((document) => document.id),
        knowledgeBaseIds: knowledgeCatalog.status === "authenticated"
          ? knowledgeCatalog.bases.map((base) => base.id)
          : undefined
      })
    : null;
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = graph?.edges.find((edge) => edge.id === selectedEdgeId);
  const selectedComponent = selectedNode ? workflowComponentForNode(selectedNode) : undefined;
  const selectedNodeAgent = selectedNode?.kind === "agent"
    ? agents.find((agent) => agent.id === selectedNode.agentId)
    : undefined;
  const selectedNodeConfiguredModelId = selectedNode?.kind === "model" && typeof selectedNode.config?.modelId === "string"
    ? selectedNode.config.modelId
    : undefined;
  const selectedNodeModel = models.find((model) => model.id === (selectedNodeAgent?.modelId || selectedNodeConfiguredModelId)) || selectedRunModel;
  const selectedNodeHasContext = Boolean(selectedNodeAgent && agentKnowledgeContext(selectedNodeAgent, knowledgeDocuments).length);
  const selectedNodeHasKnowledgeContext = Boolean(
    selectedNodeHasContext || stableKnowledgeBaseIds(selectedNodeAgent?.knowledgeBaseIds).length
  );
  const readyCloudKnowledgeBases = knowledgeCatalog.status === "authenticated"
    ? knowledgeCatalog.bases.filter(isKnowledgeBaseReady)
    : [];
  const canAddKnowledgeNode = Boolean(knowledgeDocuments.length || readyCloudKnowledgeBases.length);

  useEffect(() => () => {
    approvalResolverRef.current?.(false);
    approvalResolverRef.current = null;
  }, []);

  const resolveAgentNodeRuntime = (node: AgentWorkflowNode) => {
    const agent = node.agentId ? agents.find((item) => item.id === node.agentId) : undefined;
    if (!agent) throw new Error(`节点“${node.name}”引用的智能体已不存在，请重新绑定后再运行。`);
    const linkedSkills = skills.filter((skill) => unique([...agent.skillIds, ...(node.skillIds || [])]).includes(skill.id));
    const model = models.find((item) => item.id === agent.modelId) || selectedRunModel;
    if (!model) throw new Error(`节点“${node.name}”没有可用模型。`);
    const contextChunks = agentKnowledgeContext(agent, knowledgeDocuments);
    const cloudKnowledgeIds = stableKnowledgeBaseIds(agent.knowledgeBaseIds);
    const hasKnowledgeContext = Boolean(contextChunks.length || cloudKnowledgeIds.length);
    const allowedTools = unique([
      ...agent.allowedTools,
      ...linkedSkills.flatMap((skill) => skill.allowedTools),
      ...(hasKnowledgeContext ? ["knowledge_search"] : [])
    ]);
    const compatibilityOptions = {
      hasContext: hasKnowledgeContext,
      searchReady
    };
    const requiredCapabilities = allowedTools.includes("web_search")
      ? agent.requiredCapabilities.filter((capability) => capability !== "webSearch")
      : agent.requiredCapabilities;
    const agentCapabilityResult = capabilitySetCompatibility(requiredCapabilities, model);
    if (!agentCapabilityResult.compatible) throw new Error(`节点“${node.name}”：${agentCapabilityResult.reason}`);
    const incompatibleSkill = linkedSkills.find((skill) =>
      !skillCompatibility(skill, toolSettings, model, compatibilityOptions).compatible
    );
    if (incompatibleSkill) {
      const compatibility = skillCompatibility(incompatibleSkill, toolSettings, model, compatibilityOptions);
      throw new Error(`节点“${node.name}”的 Skill“${incompatibleSkill.name}”不可用：${compatibility.reason}`);
    }
    const toolsCompatibility = toolSetCompatibility(allowedTools, toolSettings, model, compatibilityOptions);
    if (!toolsCompatibility.compatible) throw new Error(`节点“${node.name}”：${toolsCompatibility.reason}`);
    return { agent, linkedSkills, model, contextChunks, allowedTools, cloudKnowledgeIds };
  };

  const resolveModelNodeRuntime = (node: AgentWorkflowNode) => {
    const configuredModelId = typeof node.config?.modelId === "string" ? node.config.modelId : "";
    const model = models.find((item) => item.id === configuredModelId) || selectedRunModel;
    if (!model) throw new Error(`节点“${node.name}”没有可用模型。`);
    const compatibility = capabilitySetCompatibility(["chat"], model);
    if (!compatibility.compatible) throw new Error(`节点“${node.name}”：${compatibility.reason}`);
    return model;
  };

  const preflightSearchNode = (node: AgentWorkflowNode) => {
    const model = resolveModelNodeRuntime(node);
    const compatibility = toolSetCompatibility(["web_search"], toolSettings, model, { searchReady });
    if (!compatibility.compatible) throw new Error(`节点“${node.name}”：${compatibility.reason}`);
    return model;
  };

  useEffect(() => {
    const exact = workflows.find((workflow) => workflow.id === selectedId);
    if (exact) {
      const nextDraft = { ...structuredClone(exact), graph: normalizedWorkflowGraph(exact) };
      setDraft(nextDraft);
      setSelectedNodeId(nextDraft.graph.nodes.find((node) => node.kind === "agent")?.id || nextDraft.graph.nodes[0]?.id || "");
      setSelectedEdgeId("");
      setRunSteps([]);
      setNodeStates({});
      setEdgeStates({});
      setResult(null);
      return;
    }
    if (draft?.id === selectedId) return;
    const fallback = workflows[0];
    setSelectedId(fallback?.id || "");
    setDraft(fallback ? { ...structuredClone(fallback), graph: normalizedWorkflowGraph(fallback) } : null);
    setSelectedNodeId("");
    setSelectedEdgeId("");
    setRunSteps([]);
    setNodeStates({});
    setEdgeStates({});
    setResult(null);
  }, [draft?.id, selectedId, workflows]);

  useEffect(() => {
    const clearUnsavedCloudSelection = () => {
      setDraft((current) => {
        if (!current?.graph) return current;
        const saved = workflows.find((workflow) => workflow.id === current.id);
        const savedGraph = saved ? normalizedWorkflowGraph(saved) : null;
        const savedNodes = new Map(
          (savedGraph?.nodes || [])
            .filter((node) => node.kind === "knowledge")
            .map((node) => [node.id, normalizeKnowledgeBaseIds(node.knowledgeBaseIds)])
        );
        const nodes = current.graph.nodes.map((node) => {
          if (node.kind !== "knowledge") return node;
          const savedIds = savedNodes.get(node.id) || [];
          const currentIds = normalizeKnowledgeBaseIds(node.knowledgeBaseIds);
          if (savedIds.length === currentIds.length && savedIds.every((id, index) => id === currentIds[index])) {
            return node;
          }
          return { ...node, knowledgeBaseIds: savedIds };
        });
        return nodes.some((node, index) => node !== current.graph?.nodes[index])
          ? { ...current, graph: { ...current.graph, nodes } }
          : current;
      });
    };
    window.addEventListener(knowledgeSessionChangedEvent, clearUnsavedCloudSelection);
    return () => window.removeEventListener(knowledgeSessionChangedEvent, clearUnsavedCloudSelection);
  }, [workflows]);

  useEffect(() => {
    if (!models.length) {
      setRunModelId("");
      return;
    }
    setRunModelId((current) => models.some((model) => model.id === current)
      ? current
      : preferredModelFor(models, "chat", userProvider.lastModelId)?.id || "");
  }, [models, userProvider.lastModelId]);

  const createWorkflow = () => {
    const createdAt = new Date().toISOString();
    const next: AgentWorkflowDefinition = {
      id: nextId("workflow"),
      name: "新工作流",
      description: "",
      steps: [],
      createdAt,
      updatedAt: createdAt
    };
    next.graph = emptyWorkflowGraph(next.id);
    setSelectedId(next.id);
    setDraft(next);
    setSelectedNodeId(next.graph.nodes[0]?.id || "");
    setSelectedEdgeId("");
    setNotice("");
    setView("editor");
  };

  const openWorkflow = (workflow: AgentWorkflowDefinition) => {
    setSelectedId(workflow.id);
    setDraft({ ...structuredClone(workflow), graph: normalizedWorkflowGraph(workflow) });
    setSelectedNodeId("");
    setSelectedEdgeId("");
    setRunSteps([]);
    setNodeStates({});
    setEdgeStates({});
    setResult(null);
    setNotice("");
    setView("editor");
  };

  const openStarterTemplate = (template: WorkflowStarterTemplate) => {
    const workflow = createWorkflowFromTemplate(template);
    openWorkflow(workflow);
    setNotice("模板已创建为独立草稿，配置节点后保存到当前浏览器。");
  };

  const importLangflowFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = importLangflowWorkflow(await file.text());
      openWorkflow(result.workflow);
      const unsupported = result.unsupportedComponents.length;
      setNotice(
        `已导入 ${result.importedCount} 个兼容组件${unsupported ? `，并保留 ${unsupported} 个不支持组件` : ""}` +
        `${result.warnings.length ? `；共 ${result.warnings.length} 条迁移提示` : ""}。`
      );
    } catch (error) {
      setNotice(error instanceof LangflowImportError ? error.message : "Langflow 工作流导入失败。");
    }
  };

  const requestWorkflowApproval = (node: AgentWorkflowNode, input: string) => new Promise<boolean>((resolve) => {
    approvalResolverRef.current?.(false);
    approvalResolverRef.current = resolve;
    const configuredPrompt = typeof node.config?.prompt === "string" ? node.config.prompt.trim() : "";
    const preview = input.trim().slice(0, 600);
    setPendingApproval({
      nodeId: node.id,
      title: node.name,
      description: [configuredPrompt || "确认继续执行这个工作流吗？", preview ? `待确认内容：${preview}` : ""].filter(Boolean).join("\n\n")
    });
  });

  const resolveWorkflowApproval = (approved: boolean) => {
    const resolve = approvalResolverRef.current;
    approvalResolverRef.current = null;
    setPendingApproval(null);
    resolve?.(approved);
  };

  const updateGraph = (nextGraph: AgentWorkflowGraph) => {
    if (!draft) return;
    setDraft({ ...draft, graph: nextGraph });
  };

  const updateSelectedNode = (patch: Partial<AgentWorkflowNode>) => {
    if (!draft || !graph || !selectedNode) return;
    updateGraph({
      ...graph,
      nodes: graph.nodes.map((node) => node.id === selectedNode.id ? { ...node, ...patch } : node)
    });
  };

  const updateSelectedNodeConfig = (key: string, value: string | number | boolean | string[]) => {
    if (!selectedNode) return;
    updateSelectedNode({ config: { ...(selectedNode.config || {}), [key]: value } });
  };

  const addWorkflowNode = (componentId: string) => {
    if (!graph || busy) return;
    const maxX = Math.max(...graph.nodes.map((node) => node.position.x));
    const component = workflowPaletteComponents.find((item) => item.id === componentId);
    if (!component) return;
    const sequence = graph.nodes.filter((node) => workflowComponentForNode(node).id === component.id).length + 1;
    const node = createWorkflowComponentNode(componentId, {
      id: nextId("node"),
      sequence,
      defaultAgentId: agents[0]?.id,
      knowledgeDocumentIds: knowledgeDocuments.slice(0, 1).map((document) => document.id),
      knowledgeBaseIds: !knowledgeDocuments.length && knowledgeCatalog.status === "authenticated"
        ? normalizeKnowledgeBaseIds(readyCloudKnowledgeBases.slice(0, 1).map((base) => base.id))
        : [],
      position: { x: maxX + 286, y: 148 }
    });
    const nextGraph = addWorkflowNodeToGraph(graph, node);
    updateGraph(nextGraph);
    setSelectedNodeId(node.id);
    setSelectedEdgeId("");
  };

  const deleteSelectedNode = () => {
    if (!graph || !selectedNode || busy) return;
    if (selectedNode.kind === "start" || selectedNode.kind === "reply") {
      setNotice("开始和输出节点用于保持工作流边界，不能删除。");
      return;
    }
    const nextGraph = removeWorkflowNode(graph, selectedNode.id);
    updateGraph(nextGraph);
    setSelectedNodeId(nextGraph.nodes.find((node) => node.kind === "agent")?.id || nextGraph.nodes[0]?.id || "");
  };

  const deleteSelectedEdge = () => {
    if (!graph || !selectedEdge || busy) return;
    updateGraph({ ...graph, edges: graph.edges.filter((edge) => edge.id !== selectedEdge.id) });
    setSelectedEdgeId("");
  };

  const saveDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft?.name.trim() || !graph) {
      setNotice("请填写工作流名称。");
      return;
    }
    const validation = validateWorkflowGraph(graph, {
      agentIds: agents.map((agent) => agent.id),
      knowledgeDocumentIds: knowledgeDocuments.map((document) => document.id),
      knowledgeBaseIds: knowledgeCatalog.status === "authenticated"
        ? knowledgeCatalog.bases.map((base) => base.id)
        : undefined
    });
    if (!validation.valid) {
      setNotice(validation.errors[0] || "工作流图无效。");
      return;
    }
    const normalized: AgentWorkflowDefinition = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) => ({
          ...node,
          componentId: workflowComponentForNode(node).id,
          componentVersion: workflowComponentForNode(node).version,
          name: node.name.trim(),
          instruction: node.instruction?.trim() || undefined,
          skillIds: [...(node.skillIds || [])],
          template: node.template?.trim() || undefined,
          knowledgeDocumentIds: [...(node.knowledgeDocumentIds || [])],
          knowledgeBaseIds: normalizeKnowledgeBaseIds(node.knowledgeBaseIds),
          maxKnowledgeChunks: node.kind === "knowledge" ? Math.max(1, Math.min(12, Math.round(node.maxKnowledgeChunks || 4))) : undefined,
          config: node.config ? Object.fromEntries(Object.entries(node.config).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) : undefined
        }))
      },
      steps: workflowGraphToSteps(graph),
      updatedAt: new Date().toISOString()
    };
    const nextWorkflows = workflows.some((workflow) => workflow.id === normalized.id)
      ? workflows.map((workflow) => workflow.id === normalized.id ? normalized : workflow)
      : [normalized, ...workflows];
    try {
      await onSave(nextWorkflows);
      setSelectedId(normalized.id);
      setNotice("工作流已保存到当前浏览器。");
    } catch (nextError) {
      setNotice(nextError instanceof Error ? nextError.message : "工作流保存失败。");
    }
  };

  const removeWorkflow = async () => {
    if (!selected || !window.confirm(`确定删除工作流“${selected.name}”吗？`)) return;
    try {
      const remaining = workflows.filter((workflow) => workflow.id !== selected.id);
      await onSave(remaining);
      setSelectedId(remaining[0]?.id || "");
      setDraft(remaining[0] ? structuredClone(remaining[0]) : null);
      setNotice("工作流已删除。");
      setView("catalog");
    } catch (nextError) {
      setNotice(nextError instanceof Error ? nextError.message : "工作流删除失败。");
    }
  };

  const runWorkflow = async () => {
    const workflow = draft;
    const runtimeGraph = workflow ? normalizedWorkflowGraph(workflow) : null;
    const validation = runtimeGraph
      ? validateWorkflowGraph(runtimeGraph, {
          agentIds: agents.map((agent) => agent.id),
          knowledgeDocumentIds: knowledgeDocuments.map((document) => document.id),
          knowledgeBaseIds: knowledgeCatalog.status === "authenticated"
            ? knowledgeCatalog.bases.map((base) => base.id)
            : undefined
        })
      : null;
    if (!workflow || !runtimeGraph || !task.trim()) {
      setNotice("请选择有效工作流并填写初始任务。");
      return;
    }
    if (!validation || !validation.valid) {
      const validationErrors = validation?.errors || ["工作流图无效。"];
      const missingAgentNode = runtimeGraph.nodes.find((node) => node.kind === "agent" && (
        !node.agentId || !agents.some((agent) => agent.id === node.agentId)
      ));
      if (missingAgentNode) {
        setNodeStates(Object.fromEntries(runtimeGraph.nodes.map((node) => [
          node.id,
          node.kind === "start" ? "completed" : node.id === missingAgentNode.id ? "failed" : "skipped"
        ])) as Record<string, WorkflowCanvasNodeState>);
        setEdgeStates(Object.fromEntries(runtimeGraph.edges.map((edge) => [
          edge.id,
          edge.target === missingAgentNode.id ? "failed" : "skipped"
        ])) as Record<string, WorkflowCanvasEdgeState>);
        setRunSteps(runtimeGraph.nodes.filter((node) => node.kind !== "start").map((node) => ({
          id: node.id,
          name: node.name,
          status: node.id === missingAgentNode.id ? "failed" : "skipped",
          error: node.id === missingAgentNode.id ? validationErrors[0] : undefined
        })));
      }
      setNotice(validationErrors[0]);
      return;
    }
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedRunModel) {
      setNotice("暂无可用对话模型。");
      return;
    }
    let workflowCitations: KnowledgeCitation[] = [];
    try {
      validation.orderedNodes.forEach((node) => {
        if (node.kind === "agent") resolveAgentNodeRuntime(node);
        if (node.kind === "model") resolveModelNodeRuntime(node);
        if (node.kind === "webSearch") preflightSearchNode(node);
      });

      const workflowCloudKnowledge = prepareCloudKnowledgeRequestContext(
        collectWorkflowCloudKnowledgeBaseIds(validation.orderedNodes, agents),
        knowledgeCatalog
      );
      if (workflowCloudKnowledge) {
        await api.retrieveKnowledge(workflowCloudKnowledge.csrfToken, {
          query: task.trim(),
          knowledgeBaseIds: workflowCloudKnowledge.knowledgeBaseIds,
          embeddingConnections: workflowCloudKnowledge.embeddingConnections,
          topK: 1
        });
      }
    } catch (preflightError) {
      setNotice(preflightError instanceof Error ? preflightError.message : "工作流知识与工具预检失败。");
      return;
    }
    setBusy(true);
    setNotice("");
    setResult(null);
    setRunSteps(runtimeGraph.nodes.filter((node) => node.kind !== "start").map((node) => ({ id: node.id, name: node.name, status: "pending" })));
    setNodeStates(Object.fromEntries(runtimeGraph.nodes.map((node) => [node.id, node.kind === "start" ? "completed" : "pending"])) as Record<string, WorkflowCanvasNodeState>);
    setEdgeStates(Object.fromEntries(runtimeGraph.edges.map((edge) => [edge.id, "waiting"])) as Record<string, WorkflowCanvasEdgeState>);
    let finalResult: GenerationResult | null = null;
    let finalModelId = selectedRunModel.id;
    try {
      await executeWorkflowGraph(runtimeGraph, validation.orderedNodes, task.trim(), {
        onNodeState: (node, state, output, error) => {
          setNodeStates((current) => ({ ...current, [node.id]: state }));
          if (node.kind === "start") return;
          setRunSteps((current) => current.map((item) => item.id === node.id
            ? { ...item, status: state, result: state === "completed" ? output : undefined, error: state === "failed" ? error : undefined }
            : item));
        },
        onEdgeState: (edges, state) => {
          if (!edges.length) return;
          setEdgeStates((current) => ({ ...current, ...Object.fromEntries(edges.map((edge) => [edge.id, state])) }));
        },
        executeNode: async ({ node, inputs }) => {
          const upstreamOutput = mergeWorkflowOutputs(inputs, { separator: "\n\n", includeLabels: inputs.length > 1 });
          if (node.kind === "reply") {
            finalResult = {
              ...(finalResult || {
                id: createClientId("workflow"),
                module: "agents" as const,
                title: workflow.name,
                status: "completed" as const,
                createdAt: new Date().toISOString()
              }),
              title: `${workflow.name} · 结果`,
              text: upstreamOutput
            };
            return { output: upstreamOutput };
          }
          if (node.kind === "template") {
            return { output: renderWorkflowTemplate(node.template || "", task.trim(), upstreamOutput) };
          }
          if (node.kind === "conditional") {
            const conditionInput = inputs.map((input) => input.text).join("\n\n");
            const matched = evaluateWorkflowCondition(conditionInput, node.config);
            return { output: conditionInput, activeSourceHandles: [matched ? "true" : "false"] };
          }
          if (node.kind === "structured") return { output: parseWorkflowStructuredOutput(upstreamOutput, node.config) };
          if (node.kind === "textSplit") return { output: splitWorkflowText(upstreamOutput, node.config) };
          if (node.kind === "merge") return { output: mergeWorkflowOutputs(inputs, node.config) };
          if (node.kind === "transform") return { output: transformWorkflowText(upstreamOutput, node.config) };
          if (node.kind === "loop") return { output: runBoundedWorkflowLoop(upstreamOutput, task.trim(), node.config) };
          if (node.kind === "approval") {
            const approved = await requestWorkflowApproval(node, upstreamOutput);
            if (!approved) throw new Error(`人工确认节点“${node.name}”已拒绝继续执行。`);
            return { output: upstreamOutput };
          }
          if (node.kind === "knowledge") {
            const query = upstreamOutput || task.trim();
            const localKnowledge = (node.knowledgeDocumentIds || []).length
              ? retrieveWorkflowKnowledge(knowledgeDocuments, node.knowledgeDocumentIds || [], query, node.maxKnowledgeChunks || 4)
              : null;
            const cloudKnowledge = prepareCloudKnowledgeRequestContext(node.knowledgeBaseIds, knowledgeCatalog);
            const cloudResult = cloudKnowledge
              ? await api.retrieveKnowledge(cloudKnowledge.csrfToken, {
                  query,
                  knowledgeBaseIds: cloudKnowledge.knowledgeBaseIds,
                  embeddingConnections: cloudKnowledge.embeddingConnections,
                  topK: node.maxKnowledgeChunks || 4
                })
              : null;
            if (cloudResult) workflowCitations = mergeKnowledgeCitations(workflowCitations, cloudResult.citations);
            return {
              output: [
                localKnowledge?.text ? `本地知识：\n${localKnowledge.text}` : "",
                cloudResult?.context ? `云知识库：\n${cloudResult.context}` : ""
              ].filter(Boolean).join("\n\n") || "所选知识源中没有可用片段。"
            };
          }
          if (node.kind === "model") {
            const model = resolveModelNodeRuntime(node);
            const temperature = typeof node.config?.temperature === "number"
              ? Math.max(0, Math.min(2, node.config.temperature))
              : 0.3;
            const stepResult = await api.runAgent({
              moduleId: "workflows",
              connection: userConnectionPayload(userProvider),
              modelId: model.id,
              agent: {
                name: node.name,
                systemPrompt: typeof node.config?.systemPrompt === "string" ? node.config.systemPrompt : "你是可靠的工作流执行助手。",
                skillInstructions: []
              },
              prompt: upstreamOutput || task.trim(),
              allowedTools: [],
              options: { temperature }
            });
            workflowCitations = mergeKnowledgeCitations(workflowCitations, knowledgeCitationsFromResult(stepResult));
            finalResult = stepResult;
            finalModelId = model.id;
            return { output: stepResult.text || "" };
          }
          if (node.kind === "webSearch") {
            const model = preflightSearchNode(node);
            const configuredSearchService = searchServicePayload(searchService);
            if (!configuredSearchService) throw new Error(`节点“${node.name}”需要先配置联网搜索。`);
            const maxResults = typeof node.config?.maxResults === "number"
              ? Math.max(1, Math.min(10, Math.round(node.config.maxResults)))
              : 5;
            const instruction = typeof node.config?.instruction === "string" ? node.config.instruction : "检索相关资料并保留来源。";
            const stepResult = await api.runAgent({
              moduleId: "workflows",
              connection: userConnectionPayload(userProvider),
              modelId: model.id,
              agent: {
                name: node.name,
                systemPrompt: "使用提供的联网搜索结果回答，区分来源事实与推断。",
                skillInstructions: []
              },
              prompt: `${instruction}\n\n查询：\n${upstreamOutput || task.trim()}`,
              allowedTools: ["web_search"],
              searchService: { ...configuredSearchService, count: maxResults },
              options: { temperature: 0.2 }
            });
            workflowCitations = mergeKnowledgeCitations(workflowCitations, knowledgeCitationsFromResult(stepResult));
            finalResult = stepResult;
            finalModelId = model.id;
            return { output: stepResult.text || "" };
          }
          if (node.kind === "agent") {
            const { agent, linkedSkills, model, contextChunks, allowedTools, cloudKnowledgeIds } = resolveAgentNodeRuntime(node);
            const agentCloudKnowledge = prepareCloudKnowledgeRequestContext(cloudKnowledgeIds, knowledgeCatalog);
            const prompt = [
              `初始任务：\n${task.trim()}`,
              `当前步骤：${node.name}\n${node.instruction || "说明这个节点需要完成的任务和输出要求。"}`,
              upstreamOutput ? `前一步输出：\n${upstreamOutput}` : ""
            ].filter(Boolean).join("\n\n");
            const stepResult = await api.runAgent({
              moduleId: "workflows",
              connection: userConnectionPayload(userProvider),
              modelId: model.id,
              agent: {
                id: agent.id,
                name: agent.name,
                systemPrompt: agent.systemPrompt,
                skillInstructions: linkedSkills.map((skill) => `${skill.name}: ${skill.instructions}`)
              },
              prompt,
              allowedTools,
              searchService: allowedTools.includes("web_search") ? searchServicePayload(searchService) : undefined,
              contextChunks,
              ...(agentCloudKnowledge ? {
                knowledgeBaseIds: agentCloudKnowledge.knowledgeBaseIds,
                embeddingConnections: agentCloudKnowledge.embeddingConnections
              } : {}),
              options: { temperature: 0.3 }
            }, agentCloudKnowledge?.csrfToken || "");
            workflowCitations = mergeKnowledgeCitations(workflowCitations, knowledgeCitationsFromResult(stepResult));
            finalResult = stepResult;
            finalModelId = model.id;
            return { output: stepResult.text || "" };
          }
          throw new Error(`节点“${node.name}”没有可用执行器。`);
        }
      });
      if (finalResult) {
        finalResult = withKnowledgeCitations(finalResult, workflowCitations);
        setResult(finalResult);
        onGenerationResult({
          ...finalResult,
          sourceModule: "workflows",
          prompt: task.trim(),
          modelId: finalModelId
        });
      }
      setNotice("工作流执行完成。");
    } catch (nextError) {
      setNotice(nextError instanceof Error ? nextError.message : "工作流执行失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="figma-module-view automation-page" data-testid="workflows-module">
      <AutomationHero eyebrow="04 / WORKFLOWS" icon={Workflow} title="工作流" description="把常用任务保存为可重复执行的本地流程。" searchReady={searchReady} onConfigureSearch={onOpenSearchSettings} />
      {view === "catalog" ? (
        <section className="workflow-catalog" aria-label="工作流目录">
          <header className="workflow-catalog-toolbar">
            <div className="workflow-catalog-tabs" role="tablist" aria-label="工作流目录视图">
              <button type="button" role="tab" aria-selected={catalogMode === "mine"} onClick={() => setCatalogMode("mine")}>我的工作流</button>
              <button type="button" role="tab" aria-selected={catalogMode === "templates"} onClick={() => setCatalogMode("templates")}>模板库</button>
              <span>{catalogMode === "mine" ? workflows.length : workflowStarterTemplates.length}</span>
            </div>
            <div className="workflow-catalog-actions">
              <input
                ref={importInputRef}
                className="workflow-import-input"
                type="file"
                accept="application/json,.json"
                aria-label="选择 Langflow JSON 文件"
                onChange={(event) => void importLangflowFile(event)}
              />
              <button type="button" className="workflow-secondary-action" onClick={() => importInputRef.current?.click()}><Upload size={15} />导入 Langflow</button>
              <button type="button" className="figma-primary-action" onClick={createWorkflow}><Plus size={15} />新建工作流</button>
            </div>
          </header>
          <div className="workflow-catalog-grid">
            {catalogMode === "mine" ? <button type="button" className="workflow-create-card" onClick={createWorkflow} aria-label="新建工作流">
              <span><Plus size={19} /></span>
              <strong>新建工作流</strong>
              <small>从空白画布开始</small>
            </button> : null}
            {catalogMode === "mine" ? workflows.map((workflow) => {
              const workflowGraph = normalizedWorkflowGraph(workflow);
              const componentCount = workflowGraph.nodes.filter((node) => node.kind !== "start" && node.kind !== "reply").length;
              return (
                <button key={workflow.id} type="button" className="workflow-catalog-card" onClick={() => openWorkflow(workflow)} aria-label={`打开工作流 ${workflow.name}`}>
                  <span className="workflow-card-icon"><Workflow size={18} /></span>
                  <span className="workflow-card-copy">
                    <strong>{workflow.name}</strong>
                    <small>{workflow.description || "未填写描述"}</small>
                  </span>
                  <span className="workflow-card-meta"><b>{componentCount} 个组件</b><time dateTime={workflow.updatedAt}>{new Date(workflow.updatedAt).toLocaleDateString("zh-CN")}</time></span>
                </button>
              );
            }) : workflowStarterTemplates.map((template) => (
              <button key={template.id} type="button" className="workflow-catalog-card workflow-template-card" onClick={() => openStarterTemplate(template)} aria-label={`使用模板 ${template.name}`}>
                <span className="workflow-card-icon"><LayoutTemplate size={18} /></span>
                <span className="workflow-card-copy">
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                </span>
                <span className="workflow-card-meta"><b>{template.nodes.length - 2} 个组件</b><span>{template.category}</span></span>
              </button>
            ))}
          </div>
          {notice ? <p className="figma-module-notice" role="status">{notice}</p> : null}
        </section>
      ) : (
        <>
          <div className="workflow-detail-nav">
            <button type="button" onClick={() => setView("catalog")}><ArrowLeft size={16} />返回工作流</button>
            <span><small>当前工作流</small><strong>{draft?.name || "未命名工作流"}</strong></span>
          </div>
          <div className="automation-content workflow-detail-content">
          <form className="automation-editor workflow-graph-editor" onSubmit={saveDraft}>
            <AutomationSectionHeader title="工作流编排" description="选择组件并连接，运行前会检查节点参数和图结构。" />
            {draft ? (
              <>
                <div className="automation-field-grid">
                  <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                  <label><span>描述</span><input value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
                </div>
                <div className="workflow-graph-toolbar">
                  <strong>流程画布</strong>
                  <span>{graph?.nodes.length || 0} 个节点 · {graph?.edges.length || 0} 条连线</span>
                </div>
                {graph ? <div className="workflow-graph-workbench">
                  <aside className="workflow-node-library" aria-label="工作流组件">
                    <strong>组件</strong>
                    <span><i className="start" /><b>开始</b><small>固定输入</small></span>
                    {workflowPaletteComponents.map((component) => {
                      const unavailable = component.kind === "knowledge" && !canAddKnowledgeNode;
                      const accessibleLabel = component.kind === "agent"
                        ? "添加智能体节点"
                        : component.kind === "template"
                          ? "添加文本模板节点"
                          : component.kind === "knowledge"
                            ? "添加知识检索节点"
                            : `添加${component.label}节点`;
                      return (
                        <button
                          key={component.id}
                          type="button"
                          onClick={() => addWorkflowNode(component.id)}
                          disabled={busy || unavailable}
                          aria-label={accessibleLabel}
                          title={unavailable ? "请先准备本地文档或云知识库" : component.description}
                          data-component={component.kind}
                        >
                          <WorkflowComponentIcon kind={component.kind} size={15} />
                          <b>{component.label}</b>
                          <small>{unavailable ? "暂无知识源" : component.description}</small>
                        </button>
                      );
                    })}
                    <span><i className="reply" /><b>输出</b><small>固定结果</small></span>
                  </aside>
                  <WorkflowCanvas
                    key={draft.id}
                    graph={graph}
                    nodeStates={nodeStates}
                    edgeStates={edgeStates}
                    selectedNodeId={selectedNodeId}
                    selectedEdgeId={selectedEdgeId}
                    disabled={busy}
                    onChange={updateGraph}
                    onSelectNode={(nodeId) => { setSelectedNodeId(nodeId); setSelectedEdgeId(""); }}
                    onSelectEdge={(edgeId) => { setSelectedEdgeId(edgeId); setSelectedNodeId(""); }}
                  />
                  <aside className="workflow-node-inspector" aria-label="节点配置">
                    {selectedNode ? <>
                      <header><span>{selectedComponent?.label || "工作流节点"}</span><strong>{selectedNode.name}</strong></header>
                      {selectedNode.kind !== "start" && selectedNode.kind !== "reply" ? <label><span>节点名称</span><input aria-label="节点名称" value={selectedNode.name} disabled={busy} onChange={(event) => updateSelectedNode({ name: event.target.value })} /></label> : null}
                      {selectedNode.kind === "agent" ? <>
                        <FigmaMenu className="workflow-inspector-menu" label="智能体" ariaLabel="节点智能体" value={selectedNode.agentId || ""} disabled={busy} options={[{ value: "", label: "未绑定" }, ...agents.map((agent) => ({ value: agent.id, label: agent.name }))]} onChange={(agentId) => updateSelectedNode({ agentId: agentId || undefined })} />
                        <label><span>节点指令</span><textarea aria-label="节点指令" rows={5} value={selectedNode.instruction || ""} disabled={busy} onChange={(event) => updateSelectedNode({ instruction: event.target.value })} /></label>
                        <fieldset><legend>关联 Skill</legend>{skills.map((skill) => {
                          const compatibility = skillCompatibility(skill, toolSettings, selectedNodeModel, { hasContext: selectedNodeHasKnowledgeContext, searchReady });
                          const checked = (selectedNode.skillIds || []).includes(skill.id);
                          return <label key={skill.id} className={!compatibility.compatible ? "disabled" : ""}><input type="checkbox" checked={checked} disabled={busy || (!compatibility.compatible && !checked)} onChange={(event) => updateSelectedNode({ skillIds: event.target.checked ? unique([...(selectedNode.skillIds || []), skill.id]) : (selectedNode.skillIds || []).filter((id) => id !== skill.id) })} /><span><strong>{skill.name}</strong><small>{compatibility.compatible ? skill.description || "声明式能力" : compatibility.reason}</small></span></label>;
                        })}</fieldset>
                      </> : null}
                      {selectedNode.kind === "template" ? <label><span>文本模板</span><textarea aria-label="文本模板" rows={7} value={selectedNode.template || ""} disabled={busy} onChange={(event) => updateSelectedNode({ template: event.target.value })} placeholder="任务：{{task}}\n\n上游内容：{{input}}" /></label> : null}
                      {selectedNode.kind === "model" ? <FigmaMenu className="workflow-inspector-menu" label="节点模型" ariaLabel="节点模型" value={typeof selectedNode.config?.modelId === "string" ? selectedNode.config.modelId : ""} disabled={busy} options={[{ value: "", label: "使用运行区默认模型" }, ...models.map((model) => ({ value: model.id, label: compactModelLabel(model) }))]} onChange={(modelId) => updateSelectedNodeConfig("modelId", modelId)} /> : null}
                      {selectedComponent?.fields.map((field) => (
                        <WorkflowConfigField
                          key={field.key}
                          field={field}
                          value={selectedNode.config?.[field.key]}
                          disabled={busy}
                          onChange={(value) => updateSelectedNodeConfig(field.key, value)}
                        />
                      ))}
                      {selectedNode.kind === "knowledge" ? <>
                        <label><span>返回片段数</span><input aria-label="知识片段数" type="number" min="1" max="12" value={selectedNode.maxKnowledgeChunks || 4} disabled={busy} onChange={(event) => updateSelectedNode({ maxKnowledgeChunks: Math.max(1, Math.min(12, Number(event.target.value) || 4)) })} /></label>
                        <fieldset><legend>本地文档</legend>{knowledgeDocuments.length ? knowledgeDocuments.map((document) => <label key={document.id}><input type="checkbox" checked={(selectedNode.knowledgeDocumentIds || []).includes(document.id)} disabled={busy} onChange={(event) => updateSelectedNode({ knowledgeDocumentIds: event.target.checked ? unique([...(selectedNode.knowledgeDocumentIds || []), document.id]) : (selectedNode.knowledgeDocumentIds || []).filter((id) => id !== document.id) })} /><span>{document.name}</span></label>) : <p>当前浏览器没有本地文档。</p>}</fieldset>
                        {knowledgeCatalog.status === "authenticated" ? (
                          <fieldset className="workflow-cloud-knowledge">
                            <legend>云知识库</legend>
                            <CloudKnowledgeSelector
                              bases={knowledgeCatalog.bases}
                              selectedIds={selectedNode.knowledgeBaseIds || []}
                              onChange={(knowledgeBaseIds) => updateSelectedNode({ knowledgeBaseIds })}
                              disabled={busy}
                            />
                          </fieldset>
                        ) : null}
                      </> : null}
                      {selectedNode.kind === "unsupported" ? <p className="workflow-unsupported-note">{typeof selectedNode.config?.reason === "string" ? selectedNode.config.reason : "这个 Langflow 组件尚未提供受控执行器。"}</p> : null}
                      {selectedNode.kind !== "start" && selectedNode.kind !== "reply" ? <button type="button" className="automation-danger-action" disabled={busy} onClick={deleteSelectedNode}><Trash2 size={15} />删除节点</button> : <p>{selectedNode.kind === "start" ? "开始节点提供本次运行的初始任务。" : "输出节点汇总上游节点结果。"}</p>}
                    </> : selectedEdge ? <>
                      <header><span>连线</span><strong>节点流向</strong></header>
                      <p>{graph.nodes.find((node) => node.id === selectedEdge.source)?.name} → {graph.nodes.find((node) => node.id === selectedEdge.target)?.name}</p>
                      <button type="button" className="automation-danger-action" disabled={busy} onClick={deleteSelectedEdge}><Trash2 size={15} />删除连线</button>
                    </> : <p>选择画布中的节点或连线进行配置。</p>}
                  </aside>
                </div> : null}
                {!graphValidation?.valid ? <p className="workflow-graph-validation" role="status">{graphValidation?.errors[0]}</p> : null}
                <div className="automation-form-actions">
                  {workflows.some((workflow) => workflow.id === draft.id) ? <button type="button" className="automation-danger-action" onClick={() => void removeWorkflow()}><Trash2 size={15} />删除</button> : <span />}
                  <button type="submit" className="figma-primary-action" disabled={busy}><Save size={15} />保存工作流</button>
                </div>
              </>
            ) : <AutomationEmpty icon={Workflow} title="创建第一个工作流" description="添加智能体节点后即可连接和运行。" />}
          </form>

          <section className="automation-runner">
            <AutomationSectionHeader title="运行工作流" description="按画布连线拓扑顺序单线程执行，并显示每个节点的状态。" />
            <FigmaMenu className="automation-model-menu" label="默认模型" value={selectedRunModel?.id || ""} options={modelOptions(models)} onChange={(modelId) => { setRunModelId(modelId); onUserProviderChange({ lastModelId: modelId }); }} ariaLabel="工作流默认模型" disabled={busy} />
            <textarea aria-label="工作流初始任务" rows={5} value={task} onChange={(event) => setTask(event.target.value)} placeholder="输入这次工作流要解决的任务..." />
            <div className="automation-run-actions">
              <span>{graph?.nodes.filter((node) => node.kind !== "start" && node.kind !== "reply").length || 0} 个执行组件</span>
              <button type="button" className="figma-primary-action" disabled={busy || !task.trim() || !draft} onClick={() => void runWorkflow()}>{busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />}{busy ? "执行中" : "运行工作流"}</button>
            </div>
            {runSteps.length ? <WorkflowTimeline steps={runSteps} /> : null}
            {notice ? <p className="figma-module-notice" role="status">{notice}</p> : null}
            <AutomationResult result={result} />
          </section>
        </div>
        </>
      )}
      <ConfirmationDialog
        open={Boolean(pendingApproval)}
        title={`确认执行“${pendingApproval?.title || "人工确认"}”`}
        description={pendingApproval?.description || "确认继续执行这个工作流吗？"}
        confirmLabel="确认继续"
        onCancel={() => resolveWorkflowApproval(false)}
        onConfirm={() => resolveWorkflowApproval(true)}
      />
    </section>
  );
}
