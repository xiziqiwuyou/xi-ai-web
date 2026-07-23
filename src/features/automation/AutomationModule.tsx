import {
  useEffect,
  useMemo,
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
  Loader2,
  Play,
  Plus,
  Save,
  Search,
  Trash2,
  Workflow,
  Wrench
} from "lucide-react";
import { api } from "../../api";
import { ConfirmationDialog, FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import {
  compactModelLabel,
  modelsForCapability,
  preferredModelFor,
  vendorLabels
} from "../../components/workbench";
import type {
  AgentSkillDefinition,
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
import WorkflowCanvas, {
  type WorkflowCanvasEdgeState,
  type WorkflowCanvasNodeState
} from "./WorkflowCanvas";
import {
  addWorkflowNodeToGraph,
  emptyWorkflowGraph,
  normalizedWorkflowGraph,
  removeWorkflowNode,
  validateWorkflowGraph,
  workflowGraphToSteps
} from "./workflowGraph";
import {
  agentTraceFromResult,
  knowledgeCitationsFromResult,
  mergeKnowledgeCitations,
  prepareCloudKnowledgeRequestContext,
  stableKnowledgeBaseIds,
  withKnowledgeCitations,
  type AutomationKnowledgeCatalog
} from "./automationKnowledge";
import { renderWorkflowTemplate, retrieveWorkflowKnowledge } from "./workflowRuntime";
import {
  capabilitySetCompatibility,
  skillCompatibility,
  supportedVendorLabels,
  toolCompatibility,
  toolExecutionLabel,
  toolSetCompatibility
} from "./toolCompatibility";

export type AutomationModuleId = "agents" | "workflows";

type AutomationModuleProps = {
  moduleId: AutomationModuleId;
  modelCatalog: ModelCatalogEntry[];
  toolSettings: ToolSetting[];
  userProvider: UserProviderConfig;
  searchService: SearchServiceConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onSearchServiceChange: (config: SearchServiceConfig) => void;
  onGenerationResult: (item: GalleryItem) => void;
  onRequestApiConfig: () => void;
};

type WorkflowRunStep = {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: string;
  error?: string;
};

const emptyWorkspace: AutomationWorkspace = { agents: [], skills: [], workflows: [] };

function nextId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

const preferredAgentCategories = ["通用效率", "内容创作", "编程开发", "学习研究", "商业办公", "生活创意"];

function agentCategories(agents: UserAgentDefinition[]) {
  const available = new Set(agents.map((agent) => agent.category?.trim() || "通用效率"));
  const preferred = preferredAgentCategories.filter((category) => available.has(category));
  const additional = [...available]
    .filter((category) => !preferredAgentCategories.includes(category))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  return ["全部", ...preferred, ...additional];
}

function tagsFromInput(value: string) {
  return unique(value.split(/[,，]/).map((tag) => tag.trim())).slice(0, 12);
}

function modelOptions(models: ModelCatalogEntry[]): FigmaMenuOption[] {
  return models.map((model) => ({
    value: model.id,
    label: compactModelLabel(model),
    detail: `${vendorLabels[model.vendor] || model.vendor} · ${model.capabilities.includes("toolCalling") ? "支持工具调用" : "对话执行"}`
  }));
}

function agentKnowledgeContext(agent: UserAgentDefinition, knowledgeDocuments: KnowledgeDocument[]) {
  const selectedDocumentIds = new Set(agent.knowledgeDocumentIds || []);
  return knowledgeDocuments
    .filter((document) => selectedDocumentIds.has(document.id))
    .flatMap((document) => document.chunks.map((chunk) => ({
      ...chunk,
      documentId: document.id,
      documentName: document.name
    })))
    .slice(0, 160);
}

function collectWorkflowCloudKnowledgeBaseIds(
  nodes: AgentWorkflowNode[],
  agents: UserAgentDefinition[]
) {
  const ids: string[] = [];
  nodes.forEach((node) => {
    if (node.kind === "knowledge") ids.push(...(node.knowledgeBaseIds || []));
    if (node.kind !== "agent" || !node.agentId) return;
    const agent = agents.find((item) => item.id === node.agentId);
    if (agent) ids.push(...(agent.knowledgeBaseIds || []));
  });
  return stableKnowledgeBaseIds(ids);
}

function AutomationModule({
  moduleId,
  modelCatalog,
  toolSettings,
  userProvider,
  searchService,
  onUserProviderChange,
  onSearchServiceChange,
  onGenerationResult,
  onRequestApiConfig
}: AutomationModuleProps) {
  const [workspace, setWorkspace] = useState<AutomationWorkspace>(emptyWorkspace);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);
  const knowledgeCatalog = useKnowledgeCatalog();
  const searchReady = isSearchServiceReady(searchService);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([loadAutomationWorkspace(), loadKnowledgeDocumentsAsync()])
      .then(([nextWorkspace, nextKnowledgeDocuments]) => {
        if (!alive) return;
        setWorkspace(nextWorkspace);
        setKnowledgeDocuments(nextKnowledgeDocuments);
        setError("");
      })
      .catch((nextError: unknown) => {
        if (!alive) return;
        setError(nextError instanceof Error ? nextError.message : "无法读取本地自动化工作区。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persistAgents = async (agents: UserAgentDefinition[]) => {
    await saveUserAgents(agents);
    setWorkspace((current) => ({ ...current, agents }));
  };

  const persistWorkflows = async (workflows: AgentWorkflowDefinition[]) => {
    await saveAgentWorkflows(workflows);
    setWorkspace((current) => ({ ...current, workflows }));
  };

  if (loading) {
    return (
      <section className="figma-module-view automation-page automation-loading" aria-label="正在加载自动化工作区">
        <Loader2 className="spin" size={24} />
        <strong>正在加载本地自动化工作区</strong>
      </section>
    );
  }

  const sharedProps = {
    ...workspace,
    knowledgeDocuments,
    knowledgeCatalog,
    modelCatalog,
    toolSettings,
    userProvider,
    searchService,
    searchReady,
    onUserProviderChange,
    onSearchServiceChange,
    onGenerationResult,
    onRequestApiConfig,
    onOpenSearchSettings: () => setSearchSettingsOpen(true)
  };

  return (
    <>
      {moduleId === "agents" ? <AgentsWorkspace {...sharedProps} onSave={persistAgents} /> : null}
      {moduleId === "workflows" ? <WorkflowsWorkspace {...sharedProps} onSave={persistWorkflows} /> : null}
      {error ? <p className="figma-module-notice automation-global-error" role="alert">{error}</p> : null}
      <SearchServiceDialog
        open={searchSettingsOpen}
        config={searchService}
        onSave={onSearchServiceChange}
        onClose={() => setSearchSettingsOpen(false)}
      />
    </>
  );
}

type SharedWorkspaceProps = AutomationWorkspace & {
  knowledgeDocuments: KnowledgeDocument[];
  knowledgeCatalog: AutomationKnowledgeCatalog;
  searchReady: boolean;
  onOpenSearchSettings: () => void;
} & Omit<AutomationModuleProps, "moduleId">;

function AgentsWorkspace({
  agents,
  skills,
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
}: SharedWorkspaceProps & { onSave: (agents: UserAgentDefinition[]) => Promise<void> }) {
  const [view, setView] = useState<"catalog" | "editor">("catalog");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(agents[0]?.id || "");
  const selected = agents.find((agent) => agent.id === selectedId);
  const [draft, setDraft] = useState<UserAgentDefinition | null>(selected ? structuredClone(selected) : null);
  const [tagInput, setTagInput] = useState((selected?.tags || []).join(", "));
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const models = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const categories = useMemo(() => agentCategories(agents), [agents]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredAgents = agents.filter((agent) => {
    const category = agent.category?.trim() || "通用效率";
    if (activeCategory !== "全部" && category !== activeCategory) return false;
    if (!normalizedQuery) return true;
    return [agent.name, agent.description || "", category, ...(agent.tags || [])]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const draftModel = models.find((model) => model.id === (draft?.modelId || selected?.modelId)) ||
    preferredModelFor(models, "chat", userProvider.lastModelId);
  const runModel = models.find((model) => model.id === selected?.modelId) ||
    preferredModelFor(models, "chat", userProvider.lastModelId);
  const draftHasKnowledgeContext = Boolean(
    draft?.knowledgeDocumentIds.length || stableKnowledgeBaseIds(draft?.knowledgeBaseIds).length
  );

  useEffect(() => {
    if (!categories.includes(activeCategory)) setActiveCategory("全部");
  }, [activeCategory, categories]);

  useEffect(() => {
    const clearUnsavedCloudSelection = () => {
      setDraft((current) => {
        if (!current) return current;
        const saved = agents.find((agent) => agent.id === current.id);
        const savedIds = normalizeKnowledgeBaseIds(saved?.knowledgeBaseIds);
        const currentIds = normalizeKnowledgeBaseIds(current.knowledgeBaseIds);
        if (savedIds.length === currentIds.length && savedIds.every((id, index) => id === currentIds[index])) {
          return current;
        }
        return { ...current, knowledgeBaseIds: savedIds };
      });
    };
    window.addEventListener(knowledgeSessionChangedEvent, clearUnsavedCloudSelection);
    return () => window.removeEventListener(knowledgeSessionChangedEvent, clearUnsavedCloudSelection);
  }, [agents]);

  useEffect(() => {
    const exact = agents.find((agent) => agent.id === selectedId);
    if (exact) {
      setDraft(structuredClone(exact));
      setTagInput((exact.tags || []).join(", "));
      return;
    }
    if (draft?.id === selectedId) return;
    const fallback = agents[0];
    setSelectedId(fallback?.id || "");
    setDraft(fallback ? structuredClone(fallback) : null);
    setTagInput((fallback?.tags || []).join(", "));
  }, [agents, draft?.id, selectedId]);

  const createAgent = () => {
    const createdAt = new Date().toISOString();
    const next: UserAgentDefinition = {
      id: nextId("agent"),
      name: "新智能体",
      description: "",
      systemPrompt: "你是一个可靠的 AI 智能体。先理解目标和约束，再给出可执行结果。",
      modelId: preferredModelFor(models, "chat", userProvider.lastModelId)?.id,
      requiredCapabilities: ["chat"],
      skillIds: [],
      allowedTools: [],
      knowledgeDocumentIds: [],
      knowledgeBaseIds: [],
      category: activeCategory === "全部" ? "通用效率" : activeCategory,
      tags: [],
      createdAt,
      updatedAt: createdAt
    };
    setSelectedId(next.id);
    setDraft(next);
    setTagInput("");
    setNotice("");
    setTask("");
    setResult(null);
    setView("editor");
  };

  const openAgent = (agent: UserAgentDefinition) => {
    setSelectedId(agent.id);
    setDraft(structuredClone(agent));
    setTagInput((agent.tags || []).join(", "));
    setTask("");
    setResult(null);
    setNotice("");
    setView("editor");
  };

  const saveDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft?.name.trim() || !draft.systemPrompt.trim()) {
      setNotice("请填写智能体名称和系统指令。");
      return;
    }
    const updatedAt = new Date().toISOString();
    const toolCapabilities = draft.allowedTools.flatMap((name) => {
      const tool = toolSettings.find((item) => item.name === name);
      return tool?.execution === "search" ? [] : [tool?.requiredCapability || "toolCalling"];
    });
    const normalized: UserAgentDefinition = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      category: draft.category?.trim() || "通用效率",
      tags: tagsFromInput(tagInput),
      systemPrompt: draft.systemPrompt.trim(),
      modelId: draft.modelId || draftModel?.id,
      requiredCapabilities: unique(["chat", ...toolCapabilities]) as UserAgentDefinition["requiredCapabilities"],
      knowledgeDocumentIds: unique(draft.knowledgeDocumentIds || []),
      knowledgeBaseIds: normalizeKnowledgeBaseIds(draft.knowledgeBaseIds),
      updatedAt
    };
    const nextAgents = agents.some((agent) => agent.id === normalized.id)
      ? agents.map((agent) => agent.id === normalized.id ? normalized : agent)
      : [normalized, ...agents];
    try {
      await onSave(nextAgents);
      setSelectedId(normalized.id);
      setTagInput((normalized.tags || []).join(", "));
      setNotice("智能体已保存到当前浏览器。");
    } catch (nextError) {
      setNotice(nextError instanceof Error ? nextError.message : "智能体保存失败。");
    }
  };

  const removeAgent = async () => {
    if (!selected) return;
    try {
      const remaining = agents.filter((agent) => agent.id !== selected.id);
      await onSave(remaining);
      setSelectedId(remaining[0]?.id || "");
      setDraft(remaining[0] ? structuredClone(remaining[0]) : null);
      setTagInput((remaining[0]?.tags || []).join(", "));
      setNotice("智能体已删除。");
      setDeleteConfirmOpen(false);
      setView("catalog");
    } catch (nextError) {
      setNotice(nextError instanceof Error ? nextError.message : "智能体删除失败。");
    }
  };

  const runAgent = async () => {
    const agent = agents.find((item) => item.id === selectedId);
    if (!agent || !task.trim()) {
      setNotice("请选择已保存的智能体并填写任务。");
      return;
    }
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    const model = models.find((item) => item.id === agent.modelId) || runModel;
    if (!model) {
      setNotice("暂无可用对话模型。");
      return;
    }
    const linkedSkills = skills.filter((skill) => agent.skillIds.includes(skill.id));
    const contextChunks = agentKnowledgeContext(agent, knowledgeDocuments);
    let cloudKnowledge;
    try {
      cloudKnowledge = prepareCloudKnowledgeRequestContext(agent.knowledgeBaseIds, knowledgeCatalog);
    } catch (knowledgeError) {
      setNotice(knowledgeError instanceof Error ? knowledgeError.message : "云知识库预检失败。");
      return;
    }
    const hasKnowledgeContext = Boolean(contextChunks.length || cloudKnowledge?.knowledgeBaseIds.length);
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
    if (!agentCapabilityResult.compatible) {
      setNotice(agentCapabilityResult.reason);
      return;
    }
    const incompatibleSkill = linkedSkills.find((skill) =>
      !skillCompatibility(skill, toolSettings, model, compatibilityOptions).compatible
    );
    if (incompatibleSkill) {
      const compatibility = skillCompatibility(incompatibleSkill, toolSettings, model, compatibilityOptions);
      setNotice(`Skill“${incompatibleSkill.name}”不可用：${compatibility.reason}`);
      return;
    }
    const toolsCompatibility = toolSetCompatibility(allowedTools, toolSettings, model, compatibilityOptions);
    if (!toolsCompatibility.compatible) {
      setNotice(toolsCompatibility.reason);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const nextResult = await api.runAgent(
        {
          moduleId: "agents",
          connection: userConnectionPayload(userProvider),
          modelId: model.id,
          agent: {
            id: agent.id,
            name: agent.name,
            systemPrompt: agent.systemPrompt,
            skillInstructions: linkedSkills.map((skill) => `${skill.name}: ${skill.instructions}`)
          },
          prompt: task.trim(),
          allowedTools,
          searchService: allowedTools.includes("web_search")
            ? searchServicePayload(searchService)
            : undefined,
          contextChunks,
          ...(cloudKnowledge ? {
            knowledgeBaseIds: cloudKnowledge.knowledgeBaseIds,
            embeddingConnections: cloudKnowledge.embeddingConnections
          } : {}),
          options: { temperature: 0.35 }
        },
        cloudKnowledge?.csrfToken || ""
      );
      setResult(nextResult);
      onGenerationResult({
        ...nextResult,
        sourceModule: "agents",
        prompt: task.trim(),
        modelId: model.id
      });
    } catch (nextError) {
      setNotice(nextError instanceof Error ? nextError.message : "智能体运行失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="figma-module-view automation-page" data-testid="agents-module">
      <AutomationHero eyebrow="03 / AGENTS" icon={BrainCircuit} title="让智能体，真正开始工作。" description="创建可复用的角色，并绑定模型、Skill、工具与本地知识。" searchReady={searchReady} onConfigureSearch={onOpenSearchSettings} />
      {view === "catalog" ? (
        <section className="agent-catalog" aria-label="智能体目录">
          <header className="agent-catalog-toolbar">
            <div><strong>我的智能体</strong><span>{agents.length}</span></div>
            <label className="agent-catalog-search">
              <Search size={15} aria-hidden="true" />
              <input type="search" aria-label="搜索智能体" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、分类或标签" />
            </label>
            <button type="button" className="figma-primary-action" onClick={createAgent}><Plus size={15} />新建智能体</button>
          </header>
          <nav className="agent-catalog-filters" aria-label="智能体分类">
            {categories.map((category) => (
              <button key={category} type="button" className={activeCategory === category ? "active" : ""} aria-pressed={activeCategory === category} onClick={() => setActiveCategory(category)}>{category}</button>
            ))}
          </nav>
          <div className="agent-catalog-grid">
            <button type="button" className="agent-create-card" onClick={createAgent} aria-label="新建智能体">
              <span><Plus size={19} /></span><strong>新建智能体</strong><small>从角色与能力配置开始</small>
            </button>
            {filteredAgents.map((agent) => {
              const agentModel = models.find((model) => model.id === agent.modelId);
              return (
                <button key={agent.id} type="button" className="agent-catalog-card" onClick={() => openAgent(agent)} aria-label={`打开智能体 ${agent.name}`}>
                  <span className="agent-card-heading"><i><BrainCircuit size={18} /></i><small>{agent.category || "通用效率"}</small></span>
                  <span className="agent-card-copy"><strong>{agent.name}</strong><small>{agent.description || "未填写描述"}</small></span>
                  <span className="agent-card-tags">{(agent.tags || []).slice(0, 3).map((tag) => <b key={tag}>{tag}</b>)}</span>
                  <span className="agent-card-stats"><b>{agent.skillIds.length} Skill</b><b>{agent.allowedTools.length} 工具</b><b>{agent.knowledgeDocumentIds.length + stableKnowledgeBaseIds(agent.knowledgeBaseIds).length} 知识源</b></span>
                  <span className="agent-card-meta"><b>{agentModel ? compactModelLabel(agentModel) : "自动选择模型"}</b><time dateTime={agent.updatedAt}>{new Date(agent.updatedAt).toLocaleDateString("zh-CN")}</time></span>
                </button>
              );
            })}
          </div>
          {!filteredAgents.length && agents.length ? <AutomationEmpty icon={Search} title="没有找到匹配的智能体" description="调整分类或搜索关键词。" /> : null}
          {notice ? <p className="figma-module-notice" role="status">{notice}</p> : null}
        </section>
      ) : (
        <>
          <div className="workflow-detail-nav agent-detail-nav">
            <button type="button" onClick={() => setView("catalog")}><ArrowLeft size={16} />返回智能体</button>
            <span><small>当前智能体</small><strong>{draft?.name || "未命名智能体"}</strong></span>
          </div>
          <div className="automation-content agent-detail-content">
          <form className="automation-editor" onSubmit={saveDraft}>
            <AutomationSectionHeader title="智能体配置" description="定义角色、模型、Skill 与工具权限。" />
            {draft ? (
              <>
                <div className="automation-field-grid">
                  <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                  <label><span>描述</span><input value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
                  <label><span>分类</span><input aria-label="分类" value={draft.category || ""} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
                  <label><span>标签</span><input aria-label="标签" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="研究, 复核" /></label>
                </div>
                <FigmaMenu
                  className="automation-model-menu"
                  label="执行模型"
                  value={draft.modelId || draftModel?.id || ""}
                  options={modelOptions(models)}
                  onChange={(modelId) => {
                    setDraft({ ...draft, modelId });
                    onUserProviderChange({ lastModelId: modelId });
                  }}
                  ariaLabel="智能体执行模型"
                />
                <label className="automation-long-field"><span>系统指令</span><textarea aria-label="系统指令" rows={7} value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} /></label>
                <ChoiceGrid title="关联 Skill" empty="还没有 Skill，可在 AI 对话中创建。">
                  {skills.map((skill) => {
                    const compatibility = skillCompatibility(skill, toolSettings, draftModel, { hasContext: draftHasKnowledgeContext, searchReady });
                    const checked = draft.skillIds.includes(skill.id);
                    return (
                      <label key={skill.id} className={!compatibility.compatible ? "disabled" : ""}>
                        <input type="checkbox" checked={checked} disabled={!compatibility.compatible && !checked} onChange={(event) => setDraft({ ...draft, skillIds: event.target.checked ? unique([...draft.skillIds, skill.id]) : draft.skillIds.filter((id) => id !== skill.id) })} />
                        <span><strong>{skill.name}</strong><small>{compatibility.compatible ? skill.description || "声明式能力" : compatibility.reason}</small></span>
                      </label>
                    );
                  })}
                </ChoiceGrid>
                <ChoiceGrid title="工具权限" empty="后台没有开放工具。">
                  {toolSettings.map((tool) => {
                    const compatibility = toolCompatibility(tool, draftModel, { hasContext: draftHasKnowledgeContext, searchReady });
                    const checked = draft.allowedTools.includes(tool.name);
                    return (
                      <label key={tool.name} className={!compatibility.compatible ? "disabled" : ""}>
                        <input type="checkbox" checked={checked} disabled={!compatibility.compatible && !checked} onChange={(event) => setDraft({ ...draft, allowedTools: event.target.checked ? unique([...draft.allowedTools, tool.name]) : draft.allowedTools.filter((name) => name !== tool.name) })} />
                        <span><strong>{tool.label}</strong><small>{compatibility.compatible ? `${toolExecutionLabel(tool)} · ${supportedVendorLabels(tool)}` : compatibility.reason}</small></span>
                      </label>
                    );
                  })}
                </ChoiceGrid>
                <ChoiceGrid title="本地知识" empty="当前浏览器还没有知识文档。">
                  {knowledgeDocuments.map((document) => (
                    <label key={document.id}>
                      <input type="checkbox" checked={draft.knowledgeDocumentIds.includes(document.id)} onChange={(event) => setDraft({ ...draft, knowledgeDocumentIds: event.target.checked ? unique([...draft.knowledgeDocumentIds, document.id]) : draft.knowledgeDocumentIds.filter((id) => id !== document.id) })} />
                      <span><strong>{document.name}</strong><small>{document.chunks.length} 个本地片段</small></span>
                    </label>
                  ))}
                </ChoiceGrid>
                {knowledgeCatalog.status === "authenticated" ? (
                  <fieldset className="automation-cloud-knowledge">
                    <legend>云知识库</legend>
                    <CloudKnowledgeSelector
                      bases={knowledgeCatalog.bases}
                      selectedIds={draft.knowledgeBaseIds || []}
                      onChange={(knowledgeBaseIds) => setDraft({ ...draft, knowledgeBaseIds })}
                      disabled={busy}
                    />
                  </fieldset>
                ) : null}
                <div className="automation-form-actions">
                  {agents.some((agent) => agent.id === draft.id) ? <button type="button" className="automation-danger-action" onClick={() => setDeleteConfirmOpen(true)}><Trash2 size={15} />删除</button> : <span />}
                  <button type="submit" className="figma-primary-action"><Save size={15} />保存智能体</button>
                </div>
              </>
            ) : <AutomationEmpty icon={Bot} title="创建第一个智能体" description="智能体数据只保存在当前浏览器工作区。" />}
          </form>

          <section className="automation-runner">
            <AutomationSectionHeader title="运行任务" description="使用已保存的智能体执行一次完整请求。" />
            <textarea aria-label="智能体任务" rows={5} value={task} onChange={(event) => setTask(event.target.value)} placeholder="描述目标、输入资料、约束和希望得到的结果..." />
            <div className="automation-run-actions">
              <span>{runModel ? `${vendorLabels[runModel.vendor] || runModel.vendor} · ${compactModelLabel(runModel)}` : "等待模型"}</span>
              <button type="button" className="figma-primary-action" disabled={busy || !task.trim() || !selected} onClick={() => void runAgent()}>
                {busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />}{busy ? "运行中" : "运行智能体"}
              </button>
            </div>
            {notice ? <p className="figma-module-notice" role="status">{notice}</p> : null}
            <AutomationResult result={result} />
            {result ? <AgentTracePanel trace={agentTraceFromResult(result)} /> : null}
          </section>
        </div>
        </>
      )}
      <ConfirmationDialog
        open={deleteConfirmOpen && Boolean(selected)}
        title={`删除智能体“${selected?.name || ""}”？`}
        description="工作流中引用这个智能体的节点将保留失效引用，并在运行前明确报错。"
        confirmLabel="删除智能体"
        busy={busy}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void removeAgent()}
      />
    </section>
  );
}

function WorkflowsWorkspace({
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
  const selectedNodeAgent = selectedNode?.kind === "agent"
    ? agents.find((agent) => agent.id === selectedNode.agentId)
    : undefined;
  const selectedNodeModel = models.find((model) => model.id === selectedNodeAgent?.modelId) || selectedRunModel;
  const selectedNodeHasContext = Boolean(selectedNodeAgent && agentKnowledgeContext(selectedNodeAgent, knowledgeDocuments).length);
  const selectedNodeHasKnowledgeContext = Boolean(
    selectedNodeHasContext || stableKnowledgeBaseIds(selectedNodeAgent?.knowledgeBaseIds).length
  );
  const readyCloudKnowledgeBases = knowledgeCatalog.status === "authenticated"
    ? knowledgeCatalog.bases.filter(isKnowledgeBaseReady)
    : [];
  const canAddKnowledgeNode = Boolean(knowledgeDocuments.length || readyCloudKnowledgeBases.length);

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

  const addWorkflowNode = (kind: "agent" | "template" | "knowledge") => {
    if (!graph || busy) return;
    const maxX = Math.max(...graph.nodes.map((node) => node.position.x));
    const sequence = graph.nodes.filter((node) => node.kind === kind).length + 1;
    const node: AgentWorkflowNode = {
      id: nextId("node"),
      kind,
      name: kind === "agent" ? `智能体 ${sequence}` : kind === "template" ? `文本模板 ${sequence}` : `知识检索 ${sequence}`,
      instruction: kind === "agent" ? "说明这个节点需要完成的任务和输出要求。" : undefined,
      agentId: kind === "agent" ? agents[0]?.id : undefined,
      skillIds: kind === "agent" ? [] : undefined,
      template: kind === "template" ? "任务：{{task}}\n\n上游内容：\n{{input}}" : undefined,
      knowledgeDocumentIds: kind === "knowledge" && knowledgeDocuments.length
        ? knowledgeDocuments.slice(0, 1).map((document) => document.id)
        : undefined,
      knowledgeBaseIds: kind === "knowledge" && !knowledgeDocuments.length && knowledgeCatalog.status === "authenticated"
        ? normalizeKnowledgeBaseIds(readyCloudKnowledgeBases.slice(0, 1).map((base) => base.id))
        : undefined,
      maxKnowledgeChunks: kind === "knowledge" ? 4 : undefined,
      position: { x: maxX + 286, y: 148 }
    };
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
          name: node.name.trim(),
          instruction: node.instruction?.trim() || undefined,
          skillIds: [...(node.skillIds || [])],
          template: node.template?.trim() || undefined,
          knowledgeDocumentIds: [...(node.knowledgeDocumentIds || [])],
          knowledgeBaseIds: normalizeKnowledgeBaseIds(node.knowledgeBaseIds),
          maxKnowledgeChunks: node.kind === "knowledge" ? Math.max(1, Math.min(12, Math.round(node.maxKnowledgeChunks || 4))) : undefined
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
      validation.orderedNodes
        .filter((node) => node.kind === "agent")
        .forEach((node) => resolveAgentNodeRuntime(node));

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
    const outputs = new Map<string, string>();
    const startNode = runtimeGraph.nodes.find((node) => node.kind === "start");
    if (startNode) outputs.set(startNode.id, task.trim());
    let finalResult: GenerationResult | null = null;
    let finalModelId = selectedRunModel.id;
    try {
      for (const [nodeIndex, node] of validation.orderedNodes.entries()) {
        if (node.kind === "start") continue;
        const inboundEdges = runtimeGraph.edges.filter((edge) => edge.target === node.id);
        setNodeStates((current) => ({ ...current, [node.id]: "running" }));
        setEdgeStates((current) => ({ ...current, ...Object.fromEntries(inboundEdges.map((edge) => [edge.id, "active"])) }));
        setRunSteps((current) => current.map((item) => item.id === node.id ? { ...item, status: "running" } : item));
        try {
          const upstreamOutput = inboundEdges
            .map((edge) => ({ source: runtimeGraph.nodes.find((item) => item.id === edge.source), text: outputs.get(edge.source) || "" }))
            .filter((item) => item.text)
            .map((item) => `${item.source?.name || "上游节点"}：\n${item.text}`)
            .join("\n\n");

          if (node.kind === "reply") {
            outputs.set(node.id, upstreamOutput);
            finalResult = {
              ...(finalResult || {
                id: `workflow-${crypto.randomUUID()}`,
                module: "agents" as const,
                title: workflow.name,
                status: "completed" as const,
                createdAt: new Date().toISOString()
              }),
              title: `${workflow.name} · 结果`,
              text: upstreamOutput
            };
            setNodeStates((current) => ({ ...current, [node.id]: "completed" }));
            setEdgeStates((current) => ({ ...current, ...Object.fromEntries(inboundEdges.map((edge) => [edge.id, "completed"])) }));
            setRunSteps((current) => current.map((item) => item.id === node.id ? { ...item, status: "completed", result: upstreamOutput } : item));
            continue;
          }
          if (node.kind === "template") {
            const templateOutput = renderWorkflowTemplate(node.template || "", task.trim(), upstreamOutput);
            outputs.set(node.id, templateOutput);
            setNodeStates((current) => ({ ...current, [node.id]: "completed" }));
            setEdgeStates((current) => ({ ...current, ...Object.fromEntries(inboundEdges.map((edge) => [edge.id, "completed"])) }));
            setRunSteps((current) => current.map((item) => item.id === node.id ? { ...item, status: "completed", result: templateOutput } : item));
            continue;
          }
          if (node.kind === "knowledge") {
            const query = upstreamOutput || task.trim();
            const localKnowledge = (node.knowledgeDocumentIds || []).length
              ? retrieveWorkflowKnowledge(
                  knowledgeDocuments,
                  node.knowledgeDocumentIds || [],
                  query,
                  node.maxKnowledgeChunks || 4
                )
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
            if (cloudResult) {
              workflowCitations = mergeKnowledgeCitations(workflowCitations, cloudResult.citations);
            }
            const knowledgeOutput = [
              localKnowledge?.text ? `本地知识：\n${localKnowledge.text}` : "",
              cloudResult?.context ? `云知识库：\n${cloudResult.context}` : ""
            ].filter(Boolean).join("\n\n") || "所选知识源中没有可用片段。";
            outputs.set(node.id, knowledgeOutput);
            setNodeStates((current) => ({ ...current, [node.id]: "completed" }));
            setEdgeStates((current) => ({ ...current, ...Object.fromEntries(inboundEdges.map((edge) => [edge.id, "completed"])) }));
            setRunSteps((current) => current.map((item) => item.id === node.id ? { ...item, status: "completed", result: knowledgeOutput } : item));
            continue;
          }
          const { agent, linkedSkills, model, contextChunks, allowedTools, cloudKnowledgeIds } = resolveAgentNodeRuntime(node);
          const agentCloudKnowledge = prepareCloudKnowledgeRequestContext(cloudKnowledgeIds, knowledgeCatalog);
          const prompt = [
            `初始任务：\n${task.trim()}`,
            `当前步骤：${node.name}\n${node.instruction || "说明这个节点需要完成的任务和输出要求。"}`,
            upstreamOutput ? `前一步输出：\n${upstreamOutput}` : ""
          ].filter(Boolean).join("\n\n");
          const stepResult = await api.runAgent(
            {
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
              searchService: allowedTools.includes("web_search")
                ? searchServicePayload(searchService)
                : undefined,
              contextChunks,
              ...(agentCloudKnowledge ? {
                knowledgeBaseIds: agentCloudKnowledge.knowledgeBaseIds,
                embeddingConnections: agentCloudKnowledge.embeddingConnections
              } : {}),
              options: { temperature: 0.3 }
            },
            agentCloudKnowledge?.csrfToken || ""
          );
          workflowCitations = mergeKnowledgeCitations(
            workflowCitations,
            knowledgeCitationsFromResult(stepResult)
          );
          outputs.set(node.id, stepResult.text || "");
          finalResult = stepResult;
          finalModelId = model.id;
          setNodeStates((current) => ({ ...current, [node.id]: "completed" }));
          setEdgeStates((current) => ({ ...current, ...Object.fromEntries(inboundEdges.map((edge) => [edge.id, "completed"])) }));
          setRunSteps((current) => current.map((item) => item.id === node.id ? { ...item, status: "completed", result: stepResult.text } : item));
        } catch (stepError) {
          const message = stepError instanceof Error ? stepError.message : "节点执行失败。";
          const skippedNodeIds = validation.orderedNodes
            .slice(nodeIndex + 1)
            .filter((item) => item.kind !== "start")
            .map((item) => item.id);
          const skippedNodeIdSet = new Set(skippedNodeIds);
          setNodeStates((current) => ({
            ...current,
            [node.id]: "failed",
            ...Object.fromEntries(skippedNodeIds.map((id) => [id, "skipped"]))
          }));
          setEdgeStates((current) => {
            const next = { ...current, ...Object.fromEntries(inboundEdges.map((edge) => [edge.id, "failed" as const])) };
            for (const edge of runtimeGraph.edges) {
              if (
                next[edge.id] === "waiting" &&
                (edge.source === node.id || skippedNodeIdSet.has(edge.source) || skippedNodeIdSet.has(edge.target))
              ) {
                next[edge.id] = "skipped";
              }
            }
            return next;
          });
          setRunSteps((current) => current.map((item) => item.id === node.id
            ? { ...item, status: "failed", error: message }
            : skippedNodeIdSet.has(item.id)
              ? { ...item, status: "skipped" }
              : item));
          throw stepError;
        }
      }
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
            <div><strong>我的工作流</strong><span>{workflows.length}</span></div>
            <button type="button" className="figma-primary-action" onClick={createWorkflow}><Plus size={15} />新建工作流</button>
          </header>
          <div className="workflow-catalog-grid">
            <button type="button" className="workflow-create-card" onClick={createWorkflow} aria-label="新建工作流">
              <span><Plus size={19} /></span>
              <strong>新建工作流</strong>
              <small>从空白画布开始</small>
            </button>
            {workflows.map((workflow) => {
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
            })}
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
                    <button type="button" onClick={() => addWorkflowNode("agent")} disabled={busy} aria-label="添加智能体节点"><Bot size={15} /><b>智能体</b><small>模型推理</small></button>
                    <button type="button" onClick={() => addWorkflowNode("template")} disabled={busy} aria-label="添加文本模板节点"><FileText size={15} /><b>文本模板</b><small>组织变量</small></button>
                    <button type="button" onClick={() => addWorkflowNode("knowledge")} disabled={busy || !canAddKnowledgeNode} aria-label="添加知识检索节点" title={canAddKnowledgeNode ? "添加知识检索节点" : "请先准备本地文档或云知识库"}><BookOpenText size={15} /><b>知识检索</b><small>{canAddKnowledgeNode ? "本地或云端" : "暂无知识源"}</small></button>
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
                      <header><span>{selectedNode.kind === "start" ? "输入节点" : selectedNode.kind === "reply" ? "输出节点" : selectedNode.kind === "agent" ? "智能体节点" : selectedNode.kind === "template" ? "文本模板" : "知识检索"}</span><strong>{selectedNode.name}</strong></header>
                      {selectedNode.kind !== "start" && selectedNode.kind !== "reply" ? <label><span>节点名称</span><input aria-label="节点名称" value={selectedNode.name} disabled={busy} onChange={(event) => updateSelectedNode({ name: event.target.value })} /></label> : null}
                      {selectedNode.kind === "agent" ? <>
                        <label><span>智能体</span><select aria-label="节点智能体" value={selectedNode.agentId || ""} disabled={busy} onChange={(event) => updateSelectedNode({ agentId: event.target.value || undefined })}><option value="">未绑定</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
                        <label><span>节点指令</span><textarea aria-label="节点指令" rows={5} value={selectedNode.instruction || ""} disabled={busy} onChange={(event) => updateSelectedNode({ instruction: event.target.value })} /></label>
                        <fieldset><legend>关联 Skill</legend>{skills.map((skill) => {
                          const compatibility = skillCompatibility(skill, toolSettings, selectedNodeModel, { hasContext: selectedNodeHasKnowledgeContext, searchReady });
                          const checked = (selectedNode.skillIds || []).includes(skill.id);
                          return <label key={skill.id} className={!compatibility.compatible ? "disabled" : ""}><input type="checkbox" checked={checked} disabled={busy || (!compatibility.compatible && !checked)} onChange={(event) => updateSelectedNode({ skillIds: event.target.checked ? unique([...(selectedNode.skillIds || []), skill.id]) : (selectedNode.skillIds || []).filter((id) => id !== skill.id) })} /><span><strong>{skill.name}</strong><small>{compatibility.compatible ? skill.description || "声明式能力" : compatibility.reason}</small></span></label>;
                        })}</fieldset>
                      </> : null}
                      {selectedNode.kind === "template" ? <label><span>文本模板</span><textarea aria-label="文本模板" rows={7} value={selectedNode.template || ""} disabled={busy} onChange={(event) => updateSelectedNode({ template: event.target.value })} placeholder="任务：{{task}}\n\n上游内容：{{input}}" /></label> : null}
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
    </section>
  );
}

function AutomationHero({
  eyebrow,
  icon: Icon,
  title,
  description,
  searchReady,
  onConfigureSearch
}: {
  eyebrow: string;
  icon: typeof BrainCircuit;
  title: string;
  description: string;
  searchReady: boolean;
  onConfigureSearch: () => void;
}) {
  return (
    <header className="figma-page-hero automation-hero">
      <p>{eyebrow}</p>
      <div className="automation-hero-title"><span aria-hidden="true"><Icon size={20} /></span><h1>{title}</h1></div>
      <span>{description}</span>
      <button type="button" className="automation-search-service-action" data-ready={searchReady ? "true" : "false"} onClick={onConfigureSearch}>
        <Globe2 size={15} />{searchReady ? "联网搜索已连接" : "配置联网搜索"}
      </button>
    </header>
  );
}

function AutomationLibrary({
  title,
  count,
  onCreate,
  createLabel,
  children
}: {
  title: string;
  count: number;
  onCreate: () => void;
  createLabel: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="automation-library">
      <header><div><strong>{title}</strong><span>{count}</span></div><button type="button" onClick={onCreate} aria-label={createLabel} title={createLabel}><Plus size={16} /></button></header>
      <div className="automation-library-list">{children}</div>
    </aside>
  );
}

function AutomationSectionHeader({ title, description }: { title: string; description: string }) {
  return <header className="automation-section-header"><div><h2>{title}</h2><p>{description}</p></div></header>;
}

function ChoiceGrid({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const entries = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <fieldset className="automation-choice-grid"><legend>{title}</legend>{entries.length ? entries : <p>{empty}</p>}</fieldset>
  );
}

function AutomationEmpty({ icon: Icon, title, description }: { icon: typeof Bot; title: string; description: string }) {
  return <div className="figma-empty-state"><Icon size={24} /><strong>{title}</strong><p>{description}</p></div>;
}

function AutomationResult({ result }: { result: GenerationResult | null }) {
  if (!result) return null;
  return (
    <section className="automation-result" aria-live="polite">
      <header><CheckCircle2 size={16} /><strong>{result.title || "执行结果"}</strong></header>
      <pre>{result.text || "没有文本结果。"}</pre>
      <KnowledgeCitationList citations={knowledgeCitationsFromResult(result)} />
    </section>
  );
}

function WorkflowTimeline({ steps }: { steps: WorkflowRunStep[] }) {
  return (
    <ol className="workflow-run-timeline" aria-label="工作流执行时间线">
      {steps.map((step) => (
        <li key={step.id} className={step.status}>
          <span aria-hidden="true">{step.status === "running" ? <Loader2 className="spin" size={15} /> : step.status === "failed" ? <CircleAlert size={15} /> : step.status === "completed" ? <CheckCircle2 size={15} /> : <Wrench size={15} />}</span>
          <div><strong>{step.name}</strong><small>{step.status === "pending" ? "等待执行" : step.status === "running" ? "正在执行" : step.status === "completed" ? "已完成" : step.status === "skipped" ? "已跳过" : `执行失败${step.error ? ` · ${step.error}` : ""}`}</small>{step.result ? <p>{step.result}</p> : null}</div>
        </li>
      ))}
    </ol>
  );
}

export default AutomationModule;
