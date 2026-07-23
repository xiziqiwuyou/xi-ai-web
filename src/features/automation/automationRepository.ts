import type {
  AgentSkillDefinition,
  AgentWorkflowDefinition,
  UserAgentDefinition
} from "../../types";
import {
  sanitizeWorkspaceAgentSkill,
  sanitizeWorkspaceUserAgent,
  sanitizeWorkspaceWorkflow
} from "../workspace/workspaceArchive";
import {
  getAllWorkspaceRecords,
  getWorkspaceRecord,
  putAllWorkspaceRecords,
  putWorkspaceRecord,
  replaceAllWorkspaceRecords
} from "../workspace/workspaceDb";
import { initializeWorkspace } from "../workspace/workspaceMigration";
import {
  defaultAgentSkills,
  defaultAgentWorkflows,
  defaultUserAgents
} from "./automationDefaults";

export type AutomationWorkspace = {
  agents: UserAgentDefinition[];
  skills: AgentSkillDefinition[];
  workflows: AgentWorkflowDefinition[];
};

function sanitizeList<T>(items: unknown[], sanitizer: (value: unknown) => T | null) {
  return items.map(sanitizer).filter((item): item is T => item !== null);
}

export async function loadAutomationWorkspace(): Promise<AutomationWorkspace> {
  await initializeWorkspace();
  const [storedAgents, storedSkills, storedWorkflows, defaultsMarker, catalogV2Marker] =
    await Promise.all([
      getAllWorkspaceRecords("userAgents"),
      getAllWorkspaceRecords("agentSkills"),
      getAllWorkspaceRecords("workflows"),
      getWorkspaceRecord("meta", "automationDefaultsV1"),
      getWorkspaceRecord("meta", "automationCatalogV2")
    ]);
  let agents = sanitizeList(storedAgents, sanitizeWorkspaceUserAgent);
  let skills = sanitizeList(storedSkills, sanitizeWorkspaceAgentSkill);
  let workflows = sanitizeList(storedWorkflows, sanitizeWorkspaceWorkflow);

  if (!agents.length && !skills.length && !workflows.length && defaultsMarker?.value !== true) {
    agents = defaultUserAgents();
    skills = defaultAgentSkills();
    workflows = defaultAgentWorkflows();
    await Promise.all([
      putAllWorkspaceRecords("userAgents", agents),
      putAllWorkspaceRecords("agentSkills", skills),
      putAllWorkspaceRecords("workflows", workflows)
    ]);
    await putWorkspaceRecord("meta", { key: "automationDefaultsV1", value: true });
  } else if (defaultsMarker?.value !== true) {
    await putWorkspaceRecord("meta", { key: "automationDefaultsV1", value: true });
  }

  if (catalogV2Marker?.value !== true) {
    const curatedAgents = defaultUserAgents();
    const curatedIds = new Set(curatedAgents.map((agent) => agent.id));
    if (agents.some((agent) => curatedIds.has(agent.id))) {
      const existingIds = new Set(agents.map((agent) => agent.id));
      const missingAgents = curatedAgents.filter((agent) => !existingIds.has(agent.id));
      if (missingAgents.length) {
        agents = [...agents, ...missingAgents];
        await putAllWorkspaceRecords("userAgents", missingAgents);
      }
    }
    await putWorkspaceRecord("meta", { key: "automationCatalogV2", value: true });
  }

  return { agents, skills, workflows };
}

export async function loadAutomationSkills(): Promise<AgentSkillDefinition[]> {
  return (await loadAutomationWorkspace()).skills;
}

export async function saveUserAgents(agents: UserAgentDefinition[]) {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords("userAgents", sanitizeList(agents, sanitizeWorkspaceUserAgent));
}

export async function saveAgentSkills(skills: AgentSkillDefinition[]) {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords("agentSkills", sanitizeList(skills, sanitizeWorkspaceAgentSkill));
}

export async function saveAgentWorkflows(workflows: AgentWorkflowDefinition[]) {
  await initializeWorkspace();
  await replaceAllWorkspaceRecords("workflows", sanitizeList(workflows, sanitizeWorkspaceWorkflow));
}
