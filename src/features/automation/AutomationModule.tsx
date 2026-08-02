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
import { AgentsWorkspace } from "./AgentsWorkspace";
import { WorkflowsWorkspace } from "./WorkflowsWorkspace";
import { emptyWorkspace, type AutomationModuleProps } from "./automationShared";

export function AutomationModule({
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

export default AutomationModule;
