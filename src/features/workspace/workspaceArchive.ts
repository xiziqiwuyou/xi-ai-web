import type {
  AgentMemoryRecord,
  AgentSkillDefinition,
  AgentWorkflowEdge,
  AgentWorkflowDefinition,
  AgentWorkflowGraph,
  AgentWorkflowNode,
  AgentWorkflowStep,
  AgentWorkflowViewport,
  Conversation,
  GalleryItem,
  GenerationResult,
  KnowledgeChunk,
  KnowledgeDocument,
  MediaJob,
  ModelCapability,
  UserAgentDefinition,
  WorkspaceBackupRun,
  WorkspaceDataCounts,
  WorkspaceExportEnvelope,
  WorkspacePreferenceRecord,
  WorkspaceSnapshot
} from "../../types";

export const workspaceExportSchema = "xi-ai-web.workspace-export" as const;
export const workspaceExportVersion = 1 as const;
export const workspaceAppVersion = "0.1.0";
export const maxWorkspaceImportBytes = 256 * 1024 * 1024;

const modelCapabilities: readonly ModelCapability[] = [
  "chat",
  "vision",
  "image",
  "imageEdit",
  "tts",
  "stt",
  "audio",
  "video",
  "embedding",
  "fileSearch",
  "toolCalling",
  "streaming"
];

type WorkspaceRecord = Record<string, unknown>;

function recordFrom(value: unknown): WorkspaceRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as WorkspaceRecord
    : null;
}

function cleanText(value: unknown, maxLength: number, trim = true) {
  const text = typeof value === "string" ? value : "";
  const normalized = trim ? text.trim() : text;
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function cleanStringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanUniqueStringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function cleanCapabilities(value: unknown) {
  const allowed = new Set(modelCapabilities);
  return cleanStringList(value, modelCapabilities.length, 40)
    .filter((item): item is ModelCapability => allowed.has(item as ModelCapability));
}

function cleanIsoDate(value: unknown, fallback = new Date().toISOString()) {
  const text = cleanText(value, 80);
  return text && Number.isFinite(Date.parse(text)) ? text : fallback;
}

function cleanOptionalObject(value: unknown) {
  const source = recordFrom(value);
  return source ? structuredClone(source) : undefined;
}

export function sanitizeWorkspaceMessage(value: unknown): Conversation["messages"][number] | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 120);
  const role = source?.role;
  if (!id || (role !== "user" && role !== "assistant")) return null;
  const status = source?.status;
  return {
    id,
    role,
    content: cleanText(source?.content, 24000),
    model: cleanText(source?.model, 180) || undefined,
    providerId: cleanText(source?.providerId, 180) || undefined,
    status:
      status === "streaming" || status === "done" || status === "error" || status === "stopped"
        ? status
        : undefined,
    createdAt: cleanIsoDate(source?.createdAt)
  };
}

export function sanitizeWorkspaceConversation(value: unknown): Conversation | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 120);
  const assistantId = cleanText(source?.assistantId, 120);
  if (!id || !assistantId) return null;
  const messages = Array.isArray(source?.messages)
    ? source.messages.map(sanitizeWorkspaceMessage).filter((item): item is Conversation["messages"][number] => Boolean(item))
    : [];
  const createdAt = cleanIsoDate(source?.createdAt);
  const updatedAt = cleanIsoDate(source?.updatedAt, createdAt);
  const lastMessage = [...messages].reverse().find((message) => message.content);
  return {
    id,
    title: cleanText(source?.title, 120) || "新对话",
    assistantId,
    pinned: Boolean(source?.pinned),
    messageCount: messages.length,
    preview: lastMessage?.content.replace(/\s+/g, " ").slice(0, 120) || "",
    messages,
    createdAt,
    updatedAt
  };
}

function sanitizeGenerationResult(value: unknown): GenerationResult | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 120);
  const moduleId = cleanText(source?.module, 40) as GenerationResult["module"];
  const allowedModules = new Set<GenerationResult["module"]>([
    "image", "audio", "video", "agents", "knowledge", "ppt", "mindmap", "translate"
  ]);
  if (!id || !allowedModules.has(moduleId)) return null;
  const status = source?.status;
  const assets = Array.isArray(source?.assets)
    ? source.assets
        .map((value): NonNullable<GenerationResult["assets"]>[number] | null => {
          const asset = recordFrom(value);
          const type = asset?.type;
          const url = cleanText(asset?.url, 32_000_000, false);
          if (!url || (type !== "image" && type !== "audio" && type !== "video" && type !== "link")) return null;
          return {
            type,
            url,
            label: cleanText(asset?.label, 120) || undefined
          };
        })
        .filter((item): item is NonNullable<GenerationResult["assets"]>[number] => item !== null)
    : undefined;
  return {
    id,
    module: moduleId,
    title: cleanText(source?.title, 160) || "生成结果",
    status: status === "submitted" || status === "failed" ? status : "completed",
    text: cleanText(source?.text, 200_000, false) || undefined,
    assets: assets?.length ? assets : undefined,
    createdAt: cleanIsoDate(source?.createdAt)
  };
}

export function sanitizeWorkspaceGalleryItem(value: unknown): GalleryItem | null {
  const source = recordFrom(value);
  const result = sanitizeGenerationResult(value);
  const sourceModule = cleanText(source?.sourceModule, 40) as GalleryItem["sourceModule"];
  if (!result || !sourceModule) return null;
  return {
    ...result,
    sourceModule,
    prompt: cleanText(source?.prompt, 12000, false),
    modelId: cleanText(source?.modelId, 160),
    favorite: Boolean(source?.favorite),
    tags: cleanStringList(source?.tags, 24, 60)
  };
}

function sanitizeKnowledgeChunk(
  value: unknown,
  fallbackDocumentId: string,
  fallbackDocumentName: string
): KnowledgeChunk | null {
  const source = recordFrom(value);
  const text = cleanText(source?.text, 2400);
  if (!text) return null;
  return {
    id: cleanText(source?.id, 160) || `${fallbackDocumentId}-${cleanText(source?.index, 20) || "0"}`,
    documentId: cleanText(source?.documentId, 160) || fallbackDocumentId,
    documentName: cleanText(source?.documentName, 180) || fallbackDocumentName,
    index: Number.isFinite(Number(source?.index)) ? Math.max(0, Math.trunc(Number(source?.index))) : 0,
    text,
    score: typeof source?.score === "number" && Number.isFinite(source.score) ? source.score : undefined
  };
}

export function sanitizeWorkspaceKnowledgeDocument(value: unknown): KnowledgeDocument | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 160);
  const name = cleanText(source?.name, 180);
  const text = cleanText(source?.text, 160_000, false);
  if (!id || !name || !text) return null;
  const chunks = Array.isArray(source?.chunks)
    ? source.chunks
        .map((chunk) => sanitizeKnowledgeChunk(chunk, id, name))
        .filter((item): item is KnowledgeChunk => Boolean(item))
    : [];
  const createdAt = cleanIsoDate(source?.createdAt);
  return {
    id,
    name,
    type: cleanText(source?.type, 120) || "text/plain",
    size: Number.isFinite(Number(source?.size)) ? Math.max(0, Number(source?.size)) : text.length,
    text,
    chunks,
    tags: cleanStringList(source?.tags, 24, 60),
    indexedAt: cleanText(source?.indexedAt, 80) || undefined,
    embeddingModelId: cleanText(source?.embeddingModelId, 180) || undefined,
    createdAt,
    updatedAt: cleanIsoDate(source?.updatedAt, createdAt)
  };
}

export function sanitizeWorkspaceMediaJob(value: unknown): MediaJob | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 140);
  const modelId = cleanText(source?.modelId, 160);
  const createdAt = cleanIsoDate(source?.createdAt);
  if (!id || !modelId || !cleanText(source?.createdAt, 80)) return null;
  const status = source?.status;
  return {
    id,
    module: source?.module === "audio" ? "audio" : "video",
    modelId,
    endpointPath: cleanText(source?.endpointPath, 180) || "/video/generations/status",
    providerJobId: cleanText(source?.providerJobId, 180) || undefined,
    status:
      status === "processing" || status === "completed" || status === "failed"
        ? status
        : "submitted",
    prompt: cleanText(source?.prompt, 3000),
    result: sanitizeGenerationResult(source?.result) || undefined,
    failureReason: cleanText(source?.failureReason, 800) || undefined,
    pollAttempts: Number.isFinite(Number(source?.pollAttempts))
      ? Math.max(0, Math.trunc(Number(source?.pollAttempts)))
      : 0,
    autoPoll: Boolean(source?.autoPoll),
    createdAt,
    updatedAt: cleanIsoDate(source?.updatedAt, createdAt)
  };
}

export function sanitizeWorkspaceUserAgent(value: unknown): UserAgentDefinition | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 140);
  const name = cleanText(source?.name, 160);
  if (!id || !name) return null;
  const createdAt = cleanIsoDate(source?.createdAt);
  const knowledgeBaseIds = cleanUniqueStringList(source?.knowledgeBaseIds, 3, 160);
  return {
    id,
    name,
    description: cleanText(source?.description, 1000) || undefined,
    category: cleanText(source?.category, 80) || "通用效率",
    tags: cleanStringList(source?.tags, 12, 80),
    systemPrompt: cleanText(source?.systemPrompt, 24000, false),
    modelId: cleanText(source?.modelId, 180) || undefined,
    requiredCapabilities: cleanCapabilities(source?.requiredCapabilities),
    skillIds: cleanStringList(source?.skillIds, 100, 140),
    allowedTools: cleanStringList(source?.allowedTools, 100, 140),
    knowledgeDocumentIds: cleanStringList(source?.knowledgeDocumentIds, 200, 160),
    ...(Array.isArray(source?.knowledgeBaseIds) ? { knowledgeBaseIds } : {}),
    createdAt,
    updatedAt: cleanIsoDate(source?.updatedAt, createdAt)
  };
}

export function sanitizeWorkspaceAgentSkill(value: unknown): AgentSkillDefinition | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 140);
  const name = cleanText(source?.name, 160);
  const instructions = cleanText(source?.instructions, 32000, false);
  if (!id || !name || !instructions) return null;
  const createdAt = cleanIsoDate(source?.createdAt);
  return {
    id,
    name,
    description: cleanText(source?.description, 1000) || undefined,
    instructions,
    inputSchema: cleanOptionalObject(source?.inputSchema),
    outputSchema: cleanOptionalObject(source?.outputSchema),
    allowedTools: cleanStringList(source?.allowedTools, 100, 140),
    requiredCapabilities: cleanCapabilities(source?.requiredCapabilities),
    createdAt,
    updatedAt: cleanIsoDate(source?.updatedAt, createdAt)
  };
}

export function sanitizeWorkspaceAgentMemory(value: unknown): AgentMemoryRecord | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 140);
  const agentId = cleanText(source?.agentId, 140);
  const content = cleanText(source?.content, 24000, false);
  const scope = source?.scope;
  if (!id || !agentId || !content || (scope !== "agent" && scope !== "conversation" && scope !== "workspace")) {
    return null;
  }
  const createdAt = cleanIsoDate(source?.createdAt);
  return {
    id,
    agentId,
    scope,
    conversationId: cleanText(source?.conversationId, 140) || undefined,
    content,
    createdAt,
    updatedAt: cleanIsoDate(source?.updatedAt, createdAt)
  };
}

function sanitizeWorkspaceWorkflowStep(value: unknown): AgentWorkflowStep | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 140);
  const name = cleanText(source?.name, 160);
  const instruction = cleanText(source?.instruction, 12000, false);
  if (!id || !name || !instruction) return null;
  return {
    id,
    name,
    instruction,
    agentId: cleanText(source?.agentId, 140) || undefined,
    skillIds: cleanStringList(source?.skillIds, 100, 140),
    usePreviousOutput: source?.usePreviousOutput !== false
  };
}

function cleanFiniteNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function sanitizeWorkflowGraphNode(value: unknown): AgentWorkflowNode | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 140);
  const name = cleanText(source?.name, 160);
  const kind = source?.kind;
  const position = recordFrom(source?.position);
  const x = cleanFiniteNumber(position?.x, -100000, 100000);
  const y = cleanFiniteNumber(position?.y, -100000, 100000);
  if (
    !id || !name || x === null || y === null ||
    (kind !== "start" && kind !== "agent" && kind !== "template" && kind !== "knowledge" && kind !== "reply")
  ) {
    return null;
  }
  const instruction = cleanText(source?.instruction, 12000, false);
  if (kind === "agent" && !instruction) return null;
  const template = cleanText(source?.template, 12000, false);
  if (kind === "template" && !template) return null;
  const knowledgeDocumentIds = cleanStringList(source?.knowledgeDocumentIds, 40, 160);
  const knowledgeBaseIds = cleanUniqueStringList(source?.knowledgeBaseIds, 3, 160);
  if (kind === "knowledge" && !knowledgeDocumentIds.length && !knowledgeBaseIds.length) return null;
  const maxKnowledgeChunks = cleanFiniteNumber(source?.maxKnowledgeChunks, 1, 12);
  return {
    id,
    kind,
    name,
    position: { x, y },
    instruction: instruction || undefined,
    agentId: cleanText(source?.agentId, 140) || undefined,
    skillIds: cleanStringList(source?.skillIds, 100, 140),
    template: template || undefined,
    knowledgeDocumentIds,
    ...(Array.isArray(source?.knowledgeBaseIds) ? { knowledgeBaseIds } : {}),
    maxKnowledgeChunks: kind === "knowledge" ? Math.round(maxKnowledgeChunks || 4) : undefined
  };
}

function sanitizeWorkflowGraphEdge(value: unknown): AgentWorkflowEdge | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 220);
  const sourceId = cleanText(source?.source, 140);
  const target = cleanText(source?.target, 140);
  if (!id || !sourceId || !target) return null;
  const sourceHandle = cleanText(source?.sourceHandle, 40);
  const targetHandle = cleanText(source?.targetHandle, 40);
  if (sourceHandle && sourceHandle !== "output") return null;
  if (targetHandle && targetHandle !== "input") return null;
  return {
    id,
    source: sourceId,
    target,
    sourceHandle: sourceHandle ? "output" : undefined,
    targetHandle: targetHandle ? "input" : undefined
  };
}

function sanitizeWorkflowGraphViewport(value: unknown): AgentWorkflowViewport | undefined {
  if (value === undefined) return undefined;
  const source = recordFrom(value);
  const x = cleanFiniteNumber(source?.x, -100000, 100000);
  const y = cleanFiniteNumber(source?.y, -100000, 100000);
  const zoom = cleanFiniteNumber(source?.zoom, 0.2, 2);
  if (x === null || y === null || zoom === null) return undefined;
  return { x, y, zoom };
}

function sanitizeWorkflowGraph(value: unknown): AgentWorkflowGraph | null {
  const source = recordFrom(value);
  if (source?.version !== 1 || !Array.isArray(source.nodes) || !Array.isArray(source.edges)) return null;
  if (source.nodes.length > 42 || source.edges.length > 80) return null;
  const nodes = source.nodes.map(sanitizeWorkflowGraphNode);
  const edges = source.edges.map(sanitizeWorkflowGraphEdge);
  if (nodes.some((node) => node === null) || edges.some((edge) => edge === null)) return null;
  const nodeIds = (nodes as AgentWorkflowNode[]).map((node) => node.id);
  const edgeIds = (edges as AgentWorkflowEdge[]).map((edge) => edge.id);
  if (new Set(nodeIds).size !== nodeIds.length || new Set(edgeIds).size !== edgeIds.length) return null;
  const viewport = source.viewport === undefined ? undefined : sanitizeWorkflowGraphViewport(source.viewport);
  if (source.viewport !== undefined && !viewport) return null;
  return {
    version: 1,
    nodes: nodes as AgentWorkflowNode[],
    edges: edges as AgentWorkflowEdge[],
    viewport
  };
}

export function sanitizeWorkspaceWorkflow(value: unknown): AgentWorkflowDefinition | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 140);
  const name = cleanText(source?.name, 160);
  if (!id || !name || !Array.isArray(source?.steps) || source.steps.length > 40) return null;
  const steps = source.steps.map(sanitizeWorkspaceWorkflowStep);
  if (steps.some((step) => step === null)) return null;
  const graph = source.graph === undefined ? undefined : sanitizeWorkflowGraph(source.graph);
  if (source.graph !== undefined && !graph) return null;
  const createdAt = cleanIsoDate(source?.createdAt);
  return {
    id,
    name,
    description: cleanText(source?.description, 1000) || undefined,
    steps: steps as AgentWorkflowStep[],
    graph: graph || undefined,
    createdAt,
    updatedAt: cleanIsoDate(source?.updatedAt, createdAt)
  };
}

export function sanitizeWorkspacePreference(value: unknown): WorkspacePreferenceRecord | null {
  const source = recordFrom(value);
  if (source?.key !== "theme" || (source.value !== "dark" && source.value !== "light")) return null;
  return {
    key: "theme",
    value: source.value,
    updatedAt: cleanIsoDate(source.updatedAt)
  };
}

export function sanitizeWorkspaceBackupRun(value: unknown): WorkspaceBackupRun | null {
  const source = recordFrom(value);
  const id = cleanText(source?.id, 160);
  const providerId = cleanText(source?.providerId, 160);
  const status = source?.status;
  if (!id || !providerId || (status !== "running" && status !== "completed" && status !== "failed")) return null;
  return {
    id,
    providerId,
    status,
    startedAt: cleanIsoDate(source?.startedAt),
    completedAt: cleanText(source?.completedAt, 80) || undefined,
    error: cleanText(source?.error, 1200) || undefined,
    byteLength: Number.isFinite(Number(source?.byteLength)) ? Math.max(0, Number(source?.byteLength)) : undefined
  };
}

type SnapshotSanitizerMap = {
  [Key in keyof WorkspaceSnapshot]: (value: unknown) => WorkspaceSnapshot[Key][number] | null;
};

const snapshotSanitizers: SnapshotSanitizerMap = {
  conversations: sanitizeWorkspaceConversation,
  galleryItems: sanitizeWorkspaceGalleryItem,
  knowledgeDocuments: sanitizeWorkspaceKnowledgeDocument,
  mediaJobs: sanitizeWorkspaceMediaJob,
  userAgents: sanitizeWorkspaceUserAgent,
  agentSkills: sanitizeWorkspaceAgentSkill,
  workflows: sanitizeWorkspaceWorkflow,
  agentMemories: sanitizeWorkspaceAgentMemory,
  preferences: sanitizeWorkspacePreference,
  backupRuns: sanitizeWorkspaceBackupRun
};

export function emptyWorkspaceSnapshot(): WorkspaceSnapshot {
  return {
    conversations: [],
    galleryItems: [],
    knowledgeDocuments: [],
    mediaJobs: [],
    userAgents: [],
    agentSkills: [],
    workflows: [],
    agentMemories: [],
    preferences: [],
    backupRuns: []
  };
}

function sanitizeCollection<Key extends keyof WorkspaceSnapshot>(
  key: Key,
  value: unknown,
  strict: boolean
): WorkspaceSnapshot[Key] {
  if (value === undefined && key === "workflows") return [] as WorkspaceSnapshot[Key];
  if (!Array.isArray(value)) throw new Error(`工作区数据 ${String(key)} 必须是数组。`);
  const sanitizer = snapshotSanitizers[key];
  const sanitized = value.map((item) => sanitizer(item)).filter(Boolean) as WorkspaceSnapshot[Key];
  if (strict && sanitized.length !== value.length) {
    throw new Error(`工作区数据 ${String(key)} 包含无效记录。`);
  }
  if (strict) {
    const identities = sanitized.map((item) => "key" in item ? item.key : item.id);
    if (new Set(identities).size !== identities.length) {
      throw new Error(`工作区数据 ${String(key)} 包含重复记录。`);
    }
  }
  return sanitized;
}

export function sanitizeWorkspaceSnapshot(value: unknown, strict = false): WorkspaceSnapshot {
  const source = recordFrom(value);
  if (!source) throw new Error("工作区数据结构无效。");
  return {
    conversations: sanitizeCollection("conversations", source.conversations, strict),
    galleryItems: sanitizeCollection("galleryItems", source.galleryItems, strict),
    knowledgeDocuments: sanitizeCollection("knowledgeDocuments", source.knowledgeDocuments, strict),
    mediaJobs: sanitizeCollection("mediaJobs", source.mediaJobs, strict),
    userAgents: sanitizeCollection("userAgents", source.userAgents, strict),
    agentSkills: sanitizeCollection("agentSkills", source.agentSkills, strict),
    workflows: sanitizeCollection("workflows", source.workflows, strict),
    agentMemories: sanitizeCollection("agentMemories", source.agentMemories, strict),
    preferences: sanitizeCollection("preferences", source.preferences, strict),
    backupRuns: sanitizeCollection("backupRuns", source.backupRuns, strict)
  };
}

export function workspaceDataCounts(snapshot: WorkspaceSnapshot): WorkspaceDataCounts {
  return {
    conversations: snapshot.conversations.length,
    galleryItems: snapshot.galleryItems.length,
    knowledgeDocuments: snapshot.knowledgeDocuments.length,
    mediaJobs: snapshot.mediaJobs.length,
    userAgents: snapshot.userAgents.length,
    agentSkills: snapshot.agentSkills.length,
    workflows: snapshot.workflows.length,
    agentMemories: snapshot.agentMemories.length,
    preferences: snapshot.preferences.length,
    backupRuns: snapshot.backupRuns.length
  };
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function workspaceDigest(snapshot: WorkspaceSnapshot) {
  if (!globalThis.crypto?.subtle) throw new Error("当前环境不支持 Web Crypto 完整性校验。");
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)));
}

export async function createWorkspaceExport(
  snapshot: WorkspaceSnapshot,
  exportedAt = new Date().toISOString()
): Promise<WorkspaceExportEnvelope> {
  const workspace = sanitizeWorkspaceSnapshot(snapshot, true);
  return {
    schema: workspaceExportSchema,
    version: workspaceExportVersion,
    exportedAt,
    app: { name: "xi-ai-web", version: workspaceAppVersion },
    integrity: {
      algorithm: "SHA-256",
      digest: await workspaceDigest(workspace)
    },
    counts: workspaceDataCounts(workspace),
    workspace
  };
}

export async function createWorkspaceExportBlob(snapshot: WorkspaceSnapshot) {
  const envelope = await createWorkspaceExport(snapshot);
  const serialized = JSON.stringify(envelope, null, 2);
  const stamp = envelope.exportedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return {
    envelope,
    blob: new Blob([serialized], { type: "application/json;charset=utf-8" }),
    filename: `xi-ai-web-workspace-${stamp}.xiworkspace.json`
  };
}

function countsEqual(left: WorkspaceDataCounts, right: WorkspaceDataCounts) {
  return (Object.keys(right) as Array<keyof WorkspaceDataCounts>)
    .every((key) => left[key] === right[key]);
}

export async function previewWorkspaceImportPayload(value: unknown): Promise<WorkspaceExportEnvelope> {
  const source = recordFrom(value);
  if (!source || source.schema !== workspaceExportSchema) throw new Error("不是有效的 xi-ai-web 工作区文件。");
  if (source.version !== workspaceExportVersion) {
    if (typeof source.version === "number" && source.version > workspaceExportVersion) {
      throw new Error("该工作区文件来自未来版本，当前应用尚不支持。");
    }
    throw new Error("不支持的工作区文件版本。");
  }
  const app = recordFrom(source.app);
  const integrity = recordFrom(source.integrity);
  const counts = recordFrom(source.counts);
  if (app?.name !== "xi-ai-web" || integrity?.algorithm !== "SHA-256" || !counts) {
    throw new Error("工作区文件清单不完整。");
  }
  const workspace = sanitizeWorkspaceSnapshot(source.workspace, true);
  const actualCounts = workspaceDataCounts(workspace);
  const claimedCounts = Object.fromEntries(
    Object.keys(actualCounts).map((key) => [key, counts[key] === undefined && key === "workflows" ? 0 : Number(counts[key])])
  ) as WorkspaceDataCounts;
  if (!countsEqual(claimedCounts, actualCounts)) throw new Error("工作区文件的数据计数校验失败。");
  const digest = cleanText(integrity.digest, 128);
  if (!digest || digest !== await workspaceDigest(workspace)) throw new Error("工作区文件完整性校验失败。");
  return {
    schema: workspaceExportSchema,
    version: workspaceExportVersion,
    exportedAt: cleanIsoDate(source.exportedAt),
    app: { name: "xi-ai-web", version: cleanText(app.version, 80) || "unknown" },
    integrity: { algorithm: "SHA-256", digest },
    counts: actualCounts,
    workspace
  };
}

export async function previewWorkspaceImport(file: File) {
  if (file.size > maxWorkspaceImportBytes) throw new Error("工作区文件过大，当前最多支持 256 MB。");
  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("工作区文件不是有效的 JSON。");
  }
  return previewWorkspaceImportPayload(payload);
}

function mergeRecords<T extends { id: string; updatedAt?: string }>(local: T[], incoming: T[]) {
  const merged = new Map(local.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    const current = merged.get(item.id);
    if (!current) {
      merged.set(item.id, item);
      return;
    }
    const currentTime = current.updatedAt ? Date.parse(current.updatedAt) : Number.NaN;
    const incomingTime = item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN;
    if (Number.isFinite(currentTime) && Number.isFinite(incomingTime) && currentTime > incomingTime) return;
    merged.set(item.id, item);
  });
  return [...merged.values()];
}

export function mergeWorkspaceSnapshots(local: WorkspaceSnapshot, incoming: WorkspaceSnapshot): WorkspaceSnapshot {
  const localPreferences = new Map(local.preferences.map((item) => [item.key, item]));
  incoming.preferences.forEach((item) => localPreferences.set(item.key, item));
  return {
    conversations: mergeRecords(local.conversations, incoming.conversations),
    galleryItems: mergeRecords(local.galleryItems, incoming.galleryItems),
    knowledgeDocuments: mergeRecords(local.knowledgeDocuments, incoming.knowledgeDocuments),
    mediaJobs: mergeRecords(local.mediaJobs, incoming.mediaJobs),
    userAgents: mergeRecords(local.userAgents, incoming.userAgents),
    agentSkills: mergeRecords(local.agentSkills, incoming.agentSkills),
    workflows: mergeRecords(local.workflows, incoming.workflows),
    agentMemories: mergeRecords(local.agentMemories, incoming.agentMemories),
    preferences: [...localPreferences.values()],
    backupRuns: mergeRecords(
      local.backupRuns.map((item) => ({ ...item, updatedAt: item.completedAt || item.startedAt })),
      incoming.backupRuns.map((item) => ({ ...item, updatedAt: item.completedAt || item.startedAt }))
    ).map(({ updatedAt: _updatedAt, ...item }) => item)
  };
}
