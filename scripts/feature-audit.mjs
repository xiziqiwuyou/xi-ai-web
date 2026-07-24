import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultModelCatalog, normalizeModelCatalog } from "../server/registry/model-registry.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDestinations = [
  { id: "chat", path: "/chat", label: "AI 对话" },
  { id: "image", path: "/image", label: "图像生成" },
  { id: "agents", path: "/agents", label: "智能体" },
  { id: "workflows", path: "/workflows", label: "工作流" },
  { id: "ppt", path: "/ppt", label: "AI 一键 PPT" },
  { id: "mindmap", path: "/mindmap", label: "思维导图" },
  { id: "assistants", path: "/assistants", label: "助手库" },
  { id: "translate", path: "/translate", label: "翻译" }
];
const coreMenuIds = publicDestinations.map(({ id }) => id);
const expectedMenuItems = publicDestinations.map(({ id, label }, index) => ({
  id,
  label,
  enabled: true,
  visible: true,
  order: (index + 1) * 10
}));

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function supportsCapability(entry, capability) {
  if (capability === "tts") return entry.capabilities.includes("tts") || entry.capabilities.includes("audio");
  return entry.capabilities.includes(capability);
}

function assertCapabilityCoverage(catalog, capability, label) {
  assert(
    catalog.some((entry) => entry.enabled && supportsCapability(entry, capability)),
    `Enabled model catalog lacks ${label} capability (${capability})`
  );
}

const types = readProjectFile("src/types.ts");
const publicRoutes = readProjectFile("src/app/publicRoutes.ts");
const moduleRegistry = readProjectFile("src/app/moduleRegistry.tsx");
const topBar = readProjectFile("src/app/TopBar.tsx");
const chatModule = readProjectFile("src/features/chat/ChatModule.tsx");
const automationModule = readProjectFile("src/features/automation/AutomationModule.tsx");
const workflowCanvas = readProjectFile("src/features/automation/WorkflowCanvas.tsx");
const workflowGraph = readProjectFile("src/features/automation/workflowGraph.ts");
const workflowRuntime = readProjectFile("src/features/automation/workflowRuntime.ts");
const studioModule = readProjectFile("src/features/studio/StudioModule.tsx");
const figmaMenu = readProjectFile("src/components/ui/FigmaMenu.tsx");
const adminConsole = readProjectFile("src/features/admin/AdminConsole.tsx");
const adminValidation = readProjectFile("src/features/admin/adminValidation.ts");
const server = readProjectFile("server/index.mjs");
const providerRegistry = readProjectFile("server/providers/registry.mjs");
const api = readProjectFile("src/api.ts");
const providerContracts = readProjectFile("scripts/provider-contracts.mjs");
const packageJson = JSON.parse(readProjectFile("package.json"));
const appDataPath = path.join(rootDir, "data/app-data.json");
const appData = fs.existsSync(appDataPath) ? JSON.parse(fs.readFileSync(appDataPath, "utf8")) : {};
const currentCatalog = normalizeModelCatalog(appData.modelCatalog || [], []);
const freshCatalog = defaultModelCatalog();

const moduleIdType = types.match(/export type ModuleId =([\s\S]*?);/)?.[1] || "";
const generationModuleIdType = types.match(/export type GenerationModuleId =([\s\S]*?);/)?.[1] || "";
const providerKindType = types.match(/export type ProviderKind =([\s\S]*?);/)?.[1] || "";
assert(moduleIdType.includes('| "translate"'), "ModuleId must include translate");
assert(generationModuleIdType.includes('| "translate"'), "GenerationModuleId must include translate");
for (const vendor of ["openai", "anthropic", "gemini", "kimi", "deepseek", "qwen", "botcf", "openai-compatible"]) {
  assert(providerKindType.includes(`| "${vendor}"`), `ProviderKind must include ${vendor}`);
}
for (const adapterKind of ["kimi", "deepseek", "qwen", "botcf"]) {
  assert(providerRegistry.includes(`kind === "${adapterKind}"`), `Provider registry must route ${adapterKind}`);
}

const publicRouteBlock = publicRoutes.match(/export const publicRoutes = \[([\s\S]*?)\]\s+as const/)?.[1] || "";
const registeredRoutes = [...publicRouteBlock.matchAll(/\{\s*id:\s*"([^"]+)",\s*path:\s*"([^"]+)"\s*\}/g)].map(
  ([, id, routePath]) => ({ id, path: routePath })
);
assert(
  JSON.stringify(registeredRoutes) === JSON.stringify(publicDestinations.map(({ id, path: routePath }) => ({ id, path: routePath }))),
  "Public routes must match the exact Figma destination sequence"
);
assert(!registeredRoutes.some(({ path: routePath }) => routePath === "/admin"), "/admin must not be a public route");

const publicOrderBlock = moduleRegistry.match(/export const portalModuleOrder[^=]*=\s*\[([\s\S]*?)\];/)?.[1] || "";
const publicOrder = [...publicOrderBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
assert(JSON.stringify(publicOrder) === JSON.stringify(coreMenuIds), "Public module order must match the exact Figma sequence");

publicDestinations.forEach(({ id, label }) => {
  const metadata = moduleRegistry.match(new RegExp(`\\n  ${id}: \\{([\\s\\S]*?)\\n  \\},`))?.[1] || "";
  assert(metadata, `${id} must be registered in module metadata`);
  assert(metadata.includes(`label: "${label}"`), `${id} must use the Figma label ${label}`);
});

["home", "audio", "video", "knowledge", "apps", "gallery"].forEach((moduleId) => {
  assert(!publicOrder.includes(moduleId), `${moduleId} must not be in the public module order`);
});

assert(topBar.includes('navigation("figma-navigation")'), "TopBar must use the Figma destination navigation");
assert(topBar.includes('className="figma-mobile-header"'), "TopBar must expose the Figma mobile header");
assert(!topBar.includes("global-search"), "TopBar must not include global search");
assert(!topBar.includes('"/admin"'), "TopBar must not expose /admin");
assert(studioModule.includes('api.generate("image"'), "Active Image workbench must call image generation");
assert(studioModule.includes('api.generate("ppt"'), "Active PPT workbench must call PPT generation");
assert(studioModule.includes('api.generate("mindmap"'), "Active Mind Map workbench must call mindmap generation");
assert(studioModule.includes('api.generate("translate" as GenerationModuleId'), "Active Translation workbench must call translation generation");
assert(!studioModule.includes('case "audio"'), "Public Studio workbench must not carry audio UI branches");
assert(!studioModule.includes('case "video"'), "Public Studio workbench must not carry video UI branches");
for (const modelMenuLabel of ["PPT 生成模型", "思维导图生成模型", "翻译模型"]) {
  assert(studioModule.includes(`ariaLabel="${modelMenuLabel}"`), `Active Studio workbench must expose ${modelMenuLabel}`);
}
assert((studioModule.match(/modelId: selectedModel\.id/g) || []).length >= 4, "Active Studio generation requests must carry the selected model ID");
assert(studioModule.includes('import { exportPptxFromMarkdown } from "../generation/pptxExport";'), "PPT workbench must import the PPTX exporter");
assert(studioModule.includes("await exportPptxFromMarkdown(result.text, topic.trim() || result.title)"), "PPT workbench must export a real PPTX deck");
assert(!studioModule.includes("downloadOutline"), "PPT workbench must not fall back to Markdown outline downloads");
assert(studioModule.includes("const [activeBranchId, setActiveBranchId]"), "Mind Map must track the active branch by stable ID");
assert(studioModule.includes("const branchSource = useMemo"), "Mind Map must derive branch cards from one normalized branch source");
assert(!studioModule.includes("activeBranchIndex"), "Mind Map must not track active branches by rotated visual index");
assert(chatModule.includes("streamChat("), "Chat module must use streaming chat");
assert(chatModule.includes("ChatSkillManagerDialog"), "Chat must manage local Skills inside the Chat workspace");
assert(chatModule.includes("skillInstructions: selectedSkills.map"), "Chat must send resolved Skill instructions, not storage records");
assert(chatModule.includes("ChatCommandPalette"), "Chat must expose inline $ and / command results");
assert(chatModule.includes("selectedApp.prompt"), "Chat applications must be composed only in the outbound request");
assert(!chatModule.includes('path: "/skills"'), "Chat must not reintroduce a public Skill route");
assert(automationModule.includes("WorkflowCanvas"), "Workflow workspace must render the visual node canvas");
assert(automationModule.includes('view === "catalog"'), "Workflow workspace must start from a card catalog view");
assert(automationModule.includes("workflow-catalog-card"), "Workflow catalog must expose saved workflow cards");
assert(automationModule.includes("renderWorkflowTemplate"), "Workflow must execute template nodes locally");
assert(automationModule.includes("retrieveWorkflowKnowledge"), "Workflow must execute local knowledge retrieval nodes");
assert(!automationModule.includes("function SkillsWorkspace"), "Legacy public Skill workspace must stay removed");
assert(workflowCanvas.includes("@xyflow/react"), "Workflow canvas must use React Flow");
assert(workflowCanvas.includes("canConnectWorkflowNodes") && workflowCanvas.includes("connection.sourceHandle") && workflowCanvas.includes("connection.targetHandle"), "Workflow connections must require valid registered ports");
assert(workflowGraph.includes("wouldCreateWorkflowCycle"), "Workflow graph must reject cycles before a run");
assert(workflowGraph.includes("agentIds?: readonly string[]"), "Workflow validation must resolve local agent references before provider calls");
assert(workflowGraph.includes("knowledgeDocumentIds?: readonly string[]"), "Workflow validation must resolve local knowledge references");
assert(workflowRuntime.includes("{{task}}") && workflowRuntime.includes("{{input}}"), "Workflow templates must use the documented placeholders only");
assert(types.includes('"template"') && types.includes('"knowledge"') && types.includes("AgentWorkflowNodeKind"), "Workflow node types must include safe template and knowledge nodes");
assert(
  chatModule.includes('const modelVendorTabs: ModelVendorTab[] = ["OpenAI", "Claude", "Gemini", "Kimi", "DeepSeek", "\u901a\u4e49\u5343\u95ee"]'),
  "Chat model picker must expose the six named vendor labels"
);
assert(chatModule.includes("topP,") && chatModule.includes("maxTokens: Math.max(1, Number(maxTokens) || 4096)"), "Chat requests must carry topP and maxTokens");
assert(chatModule.includes('const chatSettingsStorageKey = "xi-ai-web-chat-session-settings"'), "Chat settings must use the session-scoped settings key");
assert(chatModule.includes("window.sessionStorage.getItem(chatSettingsStorageKey)") && chatModule.includes("window.sessionStorage.setItem(chatSettingsStorageKey"), "Chat settings must persist through sessionStorage only");
assert(!chatModule.includes("localStorage.getItem(chatSettingsStorageKey)") && !chatModule.includes("localStorage.setItem(chatSettingsStorageKey"), "Chat settings must not use localStorage");
assert(chatModule.includes("history: requestConversation.messages.slice(-Math.max(1, Number(contextSize) || 16))"), "Chat requests must honor the saved context size");
assert(chatModule.includes('toolMode === "\u7981\u7528"') && chatModule.includes('toolMode === "\u8be2\u95ee\u540e\u8c03\u7528"'), "Chat tool mode must change truthful request behavior");
assert(!chatModule.includes("ChevronRight"), "Chat model options must not render trailing chevrons");
assert(chatModule.includes('className="figma-model-option-mark"'), "Chat model options must reserve stable trailing alignment");
const figmaMenuOptions = figmaMenu.slice(
  figmaMenu.indexOf("{options.map((option, index) => ("),
  figmaMenu.indexOf("          ))}", figmaMenu.indexOf("{options.map((option, index) => ("))
);
assert(!figmaMenuOptions.includes("ChevronRight"), "Shared model options must not render trailing chevrons");
assert(figmaMenuOptions.includes('className="figma-menu-option-mark"'), "Shared model options must reserve stable trailing alignment");

for (const imageContract of [
  "\u6587\u751f\u56fe",
  "\u56fe\u7247\u7f16\u8f91",
  "count: Number(count)",
  "imageSize: resolution",
  'inputImage: mode === "edit"',
  'inputImages: mode === "edit"',
  'referenceImageUrls: mode === "edit" && usesBotcf',
  'maskImage: mode === "edit" && supportsMask',
  "outputFormat: usesOpenAIImageOptions ? outputFormat : undefined",
  "Number(outputCompression)",
  "resultImages.map((asset, index) => ("
]) {
  assert(studioModule.includes(imageContract), `Image Studio contract is missing ${imageContract}`);
}

assert(server.includes('"/api/chat/stream"'), "Chat stream route is missing");
assert(server.includes('"/api/generate/:module"'), "Generation route is missing");
assert(server.includes('"/api/agents/run"'), "Agent run route is missing");
assert(server.includes("chatSkillInstructionsFromBody"), "Server must sanitize Chat-local Skill instructions");
assert(server.includes("resolveRuntimeProvider(req.body || {}, capability)"), "Generation route must resolve provider by model capability");
assert(server.includes('resolveRuntimeProvider(req.body || {}, "chat")'), "Chat/agent routes must resolve chat-capable models");
assert(server.includes('translate: ["chat"]'), "Translate menu coverage must require a chat-capable model");
assert(server.includes("for (const item of data)"), "OpenAI image assets must be fully extracted");
assert(server.includes("for (const candidate of candidates)") && server.includes("for (const part of parts)"), "Gemini image assets must be fully extracted");
assert(server.includes('extractAssets(json, "image", fallbackMimeType).slice(0, requestedCount)'), "Image generation must return every requested asset up to the limit");

const serverMenuBlock = server.match(/function defaultMenuItems\(\)\s*\{\s*return \[([\s\S]*?)\];\s*\}/)?.[1] || "";
const serverMenuItems = [...serverMenuBlock.matchAll(
  /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*enabled:\s*(true|false),\s*visible:\s*(true|false),\s*order:\s*(\d+)\s*\}/g
)].map(([, id, label, enabled, visible, order]) => ({
  id,
  label,
  enabled: enabled === "true",
  visible: visible === "true",
  order: Number(order)
}));
assert(JSON.stringify(serverMenuItems) === JSON.stringify(expectedMenuItems), "Server defaults must match the exact Figma menu metadata");

const textGenerationStart = server.indexOf('if (module === "ppt" || module === "mindmap" || module === "translate")');
const agentGenerationStart = server.indexOf('if (module === "agents")', textGenerationStart);
const textGenerationBranch = server.slice(textGenerationStart, agentGenerationStart);
assert(textGenerationStart >= 0 && agentGenerationStart > textGenerationStart, "Translate must be handled by the text generation branch");
assert(textGenerationBranch.includes("requestChatCompletion("), "Translate must execute through chat completion");
assert(textGenerationBranch.includes("你是专业翻译助手。"), "Translate must use a translation system prompt");
assert(textGenerationBranch.includes('"翻译结果"'), "Translate must return a translation result");
assert(api.includes('connection: GenerationPayload["connection"]'), "Client API must carry user connection payloads");
assert(adminConsole.includes("validateModelCatalog(bootstrap.modelCatalog, bootstrap.menuItems)"), "Admin console must validate catalog against enabled menus");
assert(adminValidation.includes("moduleRequirements"), "Admin validation must define per-module model requirements");
assert(!adminValidation.includes("knowledge:"), "Admin validation must not require removed knowledge menu coverage");
assert(!adminValidation.includes("video:"), "Admin validation must not require removed video menu coverage");

["OpenAI adapter contracts", "Claude adapter contracts", "Gemini adapter contracts", "Kimi adapter contracts", "Qwen adapter contracts", "OpenAI-compatible adapter contracts", "BotCF adapter contracts"].forEach((label) => {
  assert(providerContracts.includes(label), `${label} test is missing`);
});
assert(providerContracts.includes("OpenAI embeddings parse"), "Provider contracts must cover embeddings for future retrieval/tool use");
assert(providerContracts.includes("OpenAI image zero compression value"), "Provider contracts must preserve zero image compression");
assert(providerContracts.includes("OpenAI image editing should use FormData"), "Provider contracts must cover multipart OpenAI image editing");
assert(providerContracts.includes("Gemini exact image count uses bounded request fan-out"), "Provider contracts must cover Gemini image count fan-out");
assert(providerContracts.includes("BotCF URL edit keeps multiple references"), "Provider contracts must cover BotCF URL reference editing");
assert(providerContracts.includes("BotCF Gemini image endpoint"), "Provider contracts must cover BotCF Gemini Chat-compatible image routing");
assert(providerContracts.includes("Kimi fixed sampling must omit top-p"), "Provider contracts must prune Kimi fixed sampling values");
assert(providerContracts.includes("Qwen maximum output uses max_completion_tokens"), "Provider contracts must cover Qwen max_completion_tokens");
assert(packageJson.scripts["feature-audit"] === "node scripts/feature-audit.mjs", "package.json must expose feature-audit");

assertCapabilityCoverage(freshCatalog, "chat", "fresh chat");
assertCapabilityCoverage(freshCatalog, "image", "fresh image");
assertCapabilityCoverage(freshCatalog, "toolCalling", "fresh tool calling");

if (Array.isArray(appData.menuItems)) {
  const currentMenuItems = appData.menuItems
    .filter((item) => coreMenuIds.includes(item.id))
    .map(({ id }) => id)
    .sort((left, right) => coreMenuIds.indexOf(left) - coreMenuIds.indexOf(right));
  assert(JSON.stringify(currentMenuItems) === JSON.stringify(coreMenuIds), "Current metadata must retain every active public menu ID");
}

if (currentCatalog.length) {
  const enabledMenuIds = new Set((appData.menuItems || []).filter((item) => item.visible && item.enabled).map((item) => item.id));
  const currentRequirements = [
    ["chat", "chat", "current chat"],
    ["image", "image", "current image"],
    ["agents", "toolCalling", "current agents"],
    ["workflows", "chat", "current workflows"],
    ["ppt", "chat", "current PPT"],
    ["mindmap", "chat", "current mindmap"],
    ["assistants", "chat", "current assistants"],
    ["translate", "chat", "current translate"]
  ];
  currentRequirements.forEach(([moduleId, capability, label]) => {
    if (enabledMenuIds.has(moduleId)) assertCapabilityCoverage(currentCatalog, capability, label);
  });
}

console.log("Feature audit passed");
