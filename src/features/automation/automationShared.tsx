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

export type AutomationModuleId = "agents" | "workflows";

export type AutomationModuleProps = {
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

export type WorkflowRunStep = {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: string;
  error?: string;
};

export type PendingWorkflowApproval = {
  nodeId: string;
  title: string;
  description: string;
};

export const emptyWorkspace: AutomationWorkspace = { agents: [], skills: [], workflows: [] };

export function nextId(prefix: string) {
  return createClientId(prefix);
}

export function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

const preferredAgentCategories = ["通用效率", "内容创作", "编程开发", "学习研究", "商业办公", "生活创意"];

export function agentCategories(agents: UserAgentDefinition[]) {
  const available = new Set(agents.map((agent) => agent.category?.trim() || "通用效率"));
  const preferred = preferredAgentCategories.filter((category) => available.has(category));
  const additional = [...available]
    .filter((category) => !preferredAgentCategories.includes(category))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  return ["全部", ...preferred, ...additional];
}

export function tagsFromInput(value: string) {
  return unique(value.split(/[,，]/).map((tag) => tag.trim())).slice(0, 12);
}

export function modelOptions(models: ModelCatalogEntry[]): FigmaMenuOption[] {
  return models.map((model) => ({
    value: model.id,
    label: compactModelLabel(model),
    detail: `${model.vendorLabel || vendorLabels[model.vendor] || model.vendor} · ${model.capabilities.includes("toolCalling") ? "支持工具调用" : "对话执行"}`
  }));
}

export function agentKnowledgeContext(agent: UserAgentDefinition, knowledgeDocuments: KnowledgeDocument[]) {
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

export function collectWorkflowCloudKnowledgeBaseIds(
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

export type SharedWorkspaceProps = AutomationWorkspace & {
  knowledgeDocuments: KnowledgeDocument[];
  knowledgeCatalog: AutomationKnowledgeCatalog;
  searchReady: boolean;
  onOpenSearchSettings: () => void;
} & Omit<AutomationModuleProps, "moduleId">;

export function WorkflowConfigField({
  field,
  value,
  disabled,
  onChange
}: {
  field: WorkflowComponentConfigField;
  value: AgentWorkflowConfigValue | undefined;
  disabled: boolean;
  onChange: (value: AgentWorkflowConfigValue) => void;
}) {
  if (field.control === "toggle") {
    return (
      <label className="workflow-config-toggle">
        <input type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.control === "select") {
    const options = field.options || [];
    return (
      <FigmaMenu
        className="workflow-inspector-menu"
        label={field.label}
        ariaLabel={field.label}
        value={typeof value === "string" ? value : ""}
        options={options}
        disabled={disabled || !options.length}
        onChange={onChange}
        triggerText={options.length ? undefined : "暂无选项"}
      />
    );
  }
  if (field.control === "number") {
    const numericValue = typeof value === "number" ? value : field.minimum || 0;
    return (
      <label>
        <span>{field.label}</span>
        <input
          aria-label={field.label}
          type="number"
          min={field.minimum}
          max={field.maximum}
          step={field.step}
          value={numericValue}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    );
  }
  if (field.control === "textarea") {
    return (
      <label>
        <span>{field.label}</span>
        <textarea aria-label={field.label} rows={5} value={typeof value === "string" ? value : ""} placeholder={field.placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  }
  if (field.control === "string-list") {
    const text = Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "";
    return (
      <label>
        <span>{field.label}</span>
        <input aria-label={field.label} value={text} placeholder={field.placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 24))} />
      </label>
    );
  }
  return (
    <label>
      <span>{field.label}</span>
      <input aria-label={field.label} value={typeof value === "string" ? value : ""} placeholder={field.placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function AutomationHero({
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

export function AutomationLibrary({
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

export function AutomationSectionHeader({ title, description }: { title: string; description: string }) {
  return <header className="automation-section-header"><div><h2>{title}</h2><p>{description}</p></div></header>;
}

export function ChoiceGrid({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const entries = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <fieldset className="automation-choice-grid"><legend>{title}</legend>{entries.length ? entries : <p>{empty}</p>}</fieldset>
  );
}

export function AutomationEmpty({ icon: Icon, title, description }: { icon: typeof Bot; title: string; description: string }) {
  return <div className="figma-empty-state"><Icon size={24} /><strong>{title}</strong><p>{description}</p></div>;
}

export function AutomationResult({ result }: { result: GenerationResult | null }) {
  if (!result) return null;
  return (
    <section className="automation-result" aria-live="polite">
      <header><CheckCircle2 size={16} /><strong>{result.title || "执行结果"}</strong></header>
      <pre>{result.text || "没有文本结果。"}</pre>
      <KnowledgeCitationList citations={knowledgeCitationsFromResult(result)} />
    </section>
  );
}

export function WorkflowTimeline({ steps }: { steps: WorkflowRunStep[] }) {
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
