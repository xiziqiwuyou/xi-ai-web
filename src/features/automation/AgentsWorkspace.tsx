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
  type SharedWorkspaceProps
} from "./automationShared";

export function AgentsWorkspace({
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
