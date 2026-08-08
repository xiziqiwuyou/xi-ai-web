import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultModelCatalog, normalizeModelCatalog } from "../server/registry/model-registry.mjs";
import { defaultAssistants, defaultMenuItems } from "../server/data/defaults.mjs";

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
const chatModule = [
  "src/features/chat/ChatModule.tsx",
  "src/features/chat/ChatSessionBlock.tsx"
].map(readProjectFile).join("\n");
const automationModule = [
  "src/features/automation/AutomationModule.tsx",
  "src/features/automation/automationShared.tsx",
  "src/features/automation/AgentsWorkspace.tsx",
  "src/features/automation/WorkflowsWorkspace.tsx"
].map(readProjectFile).join("\n");
const workflowCanvas = readProjectFile("src/features/automation/WorkflowCanvas.tsx");
const workflowGraph = readProjectFile("src/features/automation/workflowGraph.ts");
const workflowRuntime = readProjectFile("src/features/automation/workflowRuntime.ts");
const studioModule = [
  "src/features/studio/StudioModule.tsx",
  "src/features/studio/studioShared.tsx",
  "src/features/studio/ImageStudio.tsx",
  "src/features/studio/ImageResultGallery.tsx",
  "src/features/studio/imageResultActions.ts",
  "src/features/studio/PptStudio.tsx",
  "src/features/studio/pptPresets.ts",
  "src/features/studio/PptDeckPreview.tsx",
  "src/features/generation/pptDeck.ts",
  "src/features/studio/MindmapStudio.tsx",
  "src/features/studio/mindmapPresets.ts",
  "src/features/mindmap/mindmapDocument.ts",
  "src/features/mindmap/mindmapLayout.ts",
  "src/features/mindmap/mindmapExport.ts",
  "src/features/mindmap/MindmapTreeCanvas.tsx",
  "src/features/studio/AssistantsStudio.tsx",
  "src/features/studio/TranslateStudio.tsx"
].map(readProjectFile).join("\n");
const figmaMenu = readProjectFile("src/components/ui/FigmaMenu.tsx");
const adminConsole = readProjectFile("src/features/admin/AdminConsole.tsx");
const adminNavigation = readProjectFile("src/features/admin/AdminNavigation.tsx");
const adminModelsSection = readProjectFile("src/features/admin/AdminModelsSection.tsx");
const modelUtils = readProjectFile("src/components/workbench/model-utils.ts");
const adminCss = readProjectFile("src/styles/rednote-flat-v2.admin.css");
const adminConsoleConfig = readProjectFile("src/features/admin/adminConsoleConfig.ts");
const modelCatalogPresets = readProjectFile("src/features/admin/modelCatalogPresets.ts");
const adminValidation = readProjectFile("src/features/admin/adminValidation.ts");
const adminMcpSection = readProjectFile("src/features/admin/AdminMcpSection.tsx");
const mcpContract = readProjectFile("server/mcp/contract.mjs");
const mcpSecurity = readProjectFile("server/mcp/security.mjs");
const mcpClient = readProjectFile("server/mcp/client.mjs");
const mcpRoutes = readProjectFile("server/mcp/routes.mjs");
const chatSessionSettings = readProjectFile("src/features/chat/ChatSessionSettingsDialog.tsx");
const server = readProjectFile("server/index.mjs");
const imageTimingStore = readProjectFile("server/image-generation-timing.mjs");
const providerRegistry = readProjectFile("server/providers/registry.mjs");
const api = readProjectFile("src/api.ts");
const providerContracts = readProjectFile("scripts/provider-contracts.mjs");
const packageJson = JSON.parse(readProjectFile("package.json"));
const appDataPath = path.join(rootDir, "data/app-data.json");
const appData = fs.existsSync(appDataPath) ? JSON.parse(fs.readFileSync(appDataPath, "utf8")) : {};
const currentCatalog = normalizeModelCatalog(appData.modelCatalog || [], []);
const freshCatalog = defaultModelCatalog();
const freshAssistants = defaultAssistants();
assert(
  types.includes("McpServerProfile")
    && types.includes("McpDiscoveryResult")
    && !types.slice(types.indexOf("export type PublicBootstrapPayload"), types.indexOf("export type AdminBootstrapPayload")).includes("mcpServers"),
  "MCP profiles must remain an Admin-only bootstrap contract"
);
assert(
  server.includes("mcpServers")
    && mcpContract.includes("MCP_EXECUTION_NOT_AVAILABLE")
    && mcpSecurity.includes("pinnedLookup")
    && mcpClient.includes("tools/list")
    && mcpRoutes.includes("/tools/call"),
  "MCP secure discovery foundation must remain wired with an explicit execution gate"
);
assert(
  adminConsoleConfig.includes('id: "mcp"')
    && adminConsole.includes('activeSection === "mcp"')
    && adminMcpSection.includes("发现工具")
    && adminConsole.includes("discoverMcpServer")
    && api.includes("discoverMcpServer"),
  "Admin MCP configuration must stay reachable through the shared AI navigation"
);
assert(freshCatalog.every((entry, index) => entry.order === index), "Fresh model catalogs must expose compact model order");
assert(
  freshCatalog.some((entry) => entry.vendor === "openai" && entry.model === "gpt-5.4-mini" && entry.capabilities.includes("chat")),
  "Fresh model catalogs must include the default Chat title-summary model"
);
assert(
  freshCatalog.some((entry) => entry.id === "deepseek-v4-flash" && entry.endpointProtocol === "openai-responses")
    && freshCatalog.some((entry) => entry.id === "deepseek-v4-pro" && entry.endpointProtocol === "openai-chat"),
  "Fresh DeepSeek catalogs must separate documented Responses and Chat-only models"
);
assert(
  freshCatalog.find((entry) => entry.id === "claude-sonnet-5")?.maxOutputTokens === 128_000
    && freshCatalog.find((entry) => entry.id === "claude-haiku-4-5")?.maxOutputTokens === 64_000,
  "Fresh Claude models must expose their configured Messages output ceilings"
);
assert(
  adminModelsSection.includes('aria-label="最大输出 Token 数"')
    && adminConsoleConfig.includes("maxOutputTokens: number")
    && modelCatalogPresets.includes("presetMaxOutputTokens"),
  "Admin model CRUD and presets must expose model-specific maximum output tokens"
);
assert(
  /id:\s*"deepseek-v4-flash"[\s\S]{0,320}endpointProtocol:\s*"openai-responses"/u.test(modelCatalogPresets),
  "Admin DeepSeek V4 Flash preset must select Responses"
);
assert(server.includes("version: 14") && server.includes('entry.model === "gpt-5.4-mini"'), "Current metadata must retain the assistant catalog and title-summary migrations");
assert(
  freshAssistants.length === 30
    && new Set(freshAssistants.map((assistant) => assistant.category)).size === 7
    && freshAssistants.every((assistant) => assistant.avatar && assistant.starterPrompts.length === 3),
  "Fresh assistant metadata must expose the curated catalog, categories, avatars, and starters"
);
assert(
  types.includes("ModelEndpointProtocol") && providerRegistry.includes("createChatProtocolAdapter"),
  "Model catalog endpoint protocols must be typed and routed independently from vendors"
);
for (const protocol of ["openai-chat", "openai-responses", "anthropic-messages", "gemini-generate-content"]) {
  assert(adminConsoleConfig.includes(`value: "${protocol}"`), `Admin model endpoint selector must expose ${protocol}`);
}
assert(
  adminConsoleConfig.includes("Responses API (OpenAI / DeepSeek / Qwen)"),
  "Admin endpoint copy must identify the shared Responses compatibility boundary"
);
assert(
  providerRegistry.includes("createDeepSeekResponsesAdapter"),
  "Provider registry must route DeepSeek Responses through its stateless adapter"
);
assert(
  adminModelsSection.includes('aria-label="对话请求端点"') && adminModelsSection.includes("仅控制对话请求"),
  "Admin model editor must expose the chat endpoint selector without implying media endpoint changes"
);
assert(
  adminModelsSection.includes("admin-model-workbench")
    && adminModelsSection.includes("admin-model-vendor-list")
    && adminModelsSection.includes("admin-model-list-panel")
    && adminModelsSection.includes("admin-model-detail-panel"),
  "Admin model catalog must keep the vendor, model list, and detail inspector workbench"
);
assert(
  types.includes("export type ModelVendorEntry")
    && types.includes("vendorId: string")
    && types.includes("modelVendors: ModelVendorEntry[]")
    && adminModelsSection.includes("orderedCatalog.filter((entry) => entry.vendorId === activeVendor.id)")
    && adminModelsSection.includes("preset.vendor === activeVendor.adapter")
    && adminModelsSection.includes("onCreate: (vendor: ModelVendorEntry)")
    && adminModelsSection.includes("onCreateVendor: (label: string, adapter: ProviderKind)")
    && adminModelsSection.includes("onDeleteVendor: (vendor: ModelVendorEntry)")
    && adminModelsSection.includes("admin-model-management"),
  "Admin model catalog must scope models and presets to stable vendor entities and expose guarded vendor management"
);
assert(
  adminConsole.includes("vendors={sortedModelVendors}")
    && adminConsole.includes("vendorId: vendor.id")
    && server.includes('adminRouter.post("/model-vendors"')
    && server.includes('adminRouter.delete("/model-vendors/:id"'),
  "Admin bootstrap, model drafts, and vendor routes must retain the model-vendor association"
);
assert(
  adminModelsSection.includes('form.capabilities.includes("chat")')
    && adminModelsSection.includes('aria-label="专用请求通道"')
    && adminModelsSection.includes("/v1/images/generations")
    && adminModelsSection.includes("/v1beta/models/{model}:generateContent"),
  "Admin media-only models must expose their dedicated provider route instead of a chat protocol selector"
);
assert(
  adminCss.includes(".admin-console-inner {")
    && adminCss.includes("width: min(1680px, 100%)")
    && !adminCss.includes(".admin-console-inner:has("),
  "Every Admin destination must share the wide responsive content boundary"
);
let adminGroupCursor = -1;
for (const groupLabel of ["运行总览", "AI 能力", "内容与展示", "知识库", "系统与安全"]) {
  const nextCursor = adminConsoleConfig.indexOf(`label: "${groupLabel}"`, adminGroupCursor + 1);
  assert(nextCursor > adminGroupCursor, `Admin navigation group order is missing ${groupLabel}`);
  adminGroupCursor = nextCursor;
}
assert(
  adminNavigation.includes("admin-nav-group-icon")
    && adminNavigation.includes("admin-nav-group-meta")
    && adminNavigation.includes("group.items.length"),
  "Admin first-level navigation must expose an icon, label, and destination count"
);
assert(
  adminConsole.includes("setExpandedNavigationGroups([group.id])")
    && adminConsole.includes("activeNavigationGroup?.label")
    && !adminConsoleConfig.includes("eyebrow:"),
  "Admin navigation must use one expanded group and a Chinese group breadcrumb without English eyebrows"
);
assert(
  adminCss.includes(".admin-console {")
    && adminCss.includes("border: 0;")
    && adminCss.includes(".admin-nav-group.is-expanded")
    && adminCss.includes(".admin-model-usage-table")
    && adminNavigation.includes("admin-nav-item-icon"),
  "Admin shell must use an unframed content canvas, one-column expanded navigation, and real model usage statistics"
);

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
assert(!topBar.includes('"/xizi2333"'), "TopBar must not expose the private Admin entry");
assert(studioModule.includes('api.generate("image"'), "Active Image workbench must call image generation");
assert(studioModule.includes("api.imageTimingEstimate(timingKey"), "Image workbench must load the server-global timing estimate");
assert(studioModule.includes("count: 1") && !studioModule.includes("imageCountOptions") && !studioModule.includes('ariaLabel="\u751f\u6210\u6570\u91cf"'), "Image workbench must generate one image without a quantity control");
assert(studioModule.includes('className="figma-image-output-pane"') && studioModule.includes('className="figma-image-loading-spinner"'), "Image workbench must keep result and loading feedback in the right output pane");
assert(!studioModule.includes("loadImageGenerationHistory") && !studioModule.includes("saveImageGenerationTiming"), "Image workbench must not use browser-local timing history");
assert(server.includes('app.get("/api/image/timing-estimate"') && server.includes("imageGenerationTimingStore.record"), "Server must expose and refresh global image timing estimates");
assert(imageTimingStore.includes("slice(-boundedSampleLimit)") && imageTimingStore.includes("defaultSampleLimit = 10"), "Image timing estimates must use at most the newest 10 records");
assert(studioModule.includes('api.generate("ppt"'), "Active PPT workbench must call PPT generation");
assert(studioModule.includes('api.generate("mindmap"'), "Active Mind Map workbench must call mindmap generation");
assert(studioModule.includes('api.generate("translate" as GenerationModuleId'), "Active Translation workbench must call translation generation");
assert(!studioModule.includes('case "audio"'), "Public Studio workbench must not carry audio UI branches");
assert(!studioModule.includes('case "video"'), "Public Studio workbench must not carry video UI branches");
for (const modelMenuLabel of ["PPT 生成模型", "思维导图生成模型", "翻译模型"]) {
  assert(studioModule.includes(`ariaLabel="${modelMenuLabel}"`), `Active Studio workbench must expose ${modelMenuLabel}`);
}
assert((studioModule.match(/modelId: selectedModel\.id/g) || []).length >= 4, "Active Studio generation requests must carry the selected model ID");
assert(studioModule.includes("exportPptxFromDeck") && studioModule.includes("exportPptxFromMarkdown") && studioModule.includes('from "../generation/pptxExport"'), "PPT workbench must import structured and Markdown-compatible PPTX exporters");
assert(studioModule.includes("await exportPptxFromDeck(deck)") && studioModule.includes("await exportPptxFromMarkdown(result.text, topic.trim() || result.title)"), "PPT workbench must prefer structured PPTX export and preserve Markdown fallback");
assert(studioModule.includes('options: { ppt: pptOptions }') && studioModule.includes("pptDeckFromResult"), "PPT workbench must send structured generation options and normalize the response");
for (const previewContract of [
  'className="figma-ppt-preview-panel"',
  'className="figma-ppt-thumbnails"',
  'className="figma-ppt-stage-frame"',
  'className="figma-ppt-fullscreen-dialog"',
  'data-theme={deck.themeId}',
  "const zoomLevels = [0.75, 0.9, 1] as const"
]) {
  assert(studioModule.includes(previewContract), `PPT preview contract is missing ${previewContract}`);
}
assert(!studioModule.includes("downloadOutline"), "PPT workbench must not fall back to Markdown outline downloads");
assert(types.includes("export type MindmapDocument") && types.includes("mindmap?: MindmapDocument"), "Mind Map must use the shared versioned document contract");
assert(studioModule.includes("function MindmapTreeCanvas(") && studioModule.includes("layoutMindmapDocument(document, collapsedNodeIds)"), "Mind Map must render every visible node through the structured tree canvas");
assert(
  studioModule.includes('runAiOperation("generate")')
    && studioModule.includes('runAiOperation("expand")')
    && studioModule.includes('runAiOperation("reorganize")')
    && studioModule.includes('targetNodeId: operation === "expand" ? selectedNode.id : undefined')
    && studioModule.includes('currentDocument: operation === "generate" ? undefined : mindmap'),
  "Mind Map generate, expand, and reorganize actions must execute real provider operations"
);
assert(
  studioModule.includes("mindmapDocumentToMarkdown")
    && studioModule.includes("mindmapDocumentToMermaid")
    && studioModule.includes("mindmapDocumentToSvg")
    && studioModule.includes("mindmapDocumentToPngBlob")
    && studioModule.includes("copyMindmapText"),
  "Mind Map must export the current document as clipboard text, Markdown, Mermaid, SVG, and PNG"
);
assert(!studioModule.includes("activeBranchId") && !studioModule.includes("branchSource") && !studioModule.includes("figma-map-branch"), "Mind Map must not retain decorative branch-card state");
assert(chatModule.includes("streamChat("), "Chat module must use streaming chat");
assert(!adminConsoleConfig.includes('{ value: "streaming"'), "Streaming must not be exposed as an Admin model capability");
assert(chatSessionSettings.includes('label="流式输出"'), "Streaming output must remain isolated in Chat session settings");
assert(!chatModule.includes("ChatSkillManagerDialog"), "Chat Session Settings must keep local Skill management hidden");
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
assert(chatModule.includes("topP: chatSettings.topP") && chatModule.includes("maxTokens: chatSettings.maxTokensEnabled ? chatSettings.maxTokens : undefined") && chatModule.includes("streamOutput: chatSettings.streamOutput"), "Chat requests must carry topP, streamOutput, and omit a disabled output limit");
const chatSettings = fs.readFileSync(path.join(rootDir, "src/features/chat/chatSessionSettings.ts"), "utf8");
assert(chatSettings.includes('chatSettingsStorageKey = "xi-ai-web-chat-session-settings"'), "Chat settings must use the session-scoped settings key");
assert(chatSettings.includes("window.sessionStorage.getItem(chatSettingsStorageKey)") && chatSettings.includes("window.sessionStorage.setItem(chatSettingsStorageKey"), "Chat settings must persist through sessionStorage only");
assert(!chatSettings.includes("localStorage.getItem(chatSettingsStorageKey)") && !chatSettings.includes("localStorage.setItem(chatSettingsStorageKey"), "Chat settings must not use localStorage");
assert(
  chatModule.includes("const selectedHistory = selectChatHistory(") &&
  chatModule.includes("selectedModel.maxOutputTokens") &&
  chatModule.includes("history: chatHistoryWithoutAttachments(selectedHistory)"),
  "Chat requests must honor both saved context settings while replaying bounded historical attachments"
);
assert(types.includes("maxOutputTokens?: number;") && chatSettings.includes("modelMaxOutputTokens"), "Model output limits must cross the catalog and Chat history budget boundary");
assert(
  chatModule.includes('ariaLabel="引用上下文条数"') &&
  chatModule.includes("figma-token-usage-summary") &&
  !chatModule.includes("figma-message-usage"),
  "Chat must keep referenced-history selection and consistent Token usage above the composer"
);
assert(chatSettings.includes('chatContextSizeValues = ["4", "16", "32", "64", "128", "256", "512", "1024"]') && chatSettings.includes("chatContextMessageCountValues"), "Chat context settings must cover 1M windows and independent message counts");
assert(chatSettings.includes("maxTokensEnabled: false"), "Chat output limit must default to unlimited");
assert(chatSettings.includes('titleSummaryModelId: "gpt-5.4-mini"') && chatSettings.includes("titleSummaryMessageCount: 4"), "Chat title summaries must use the requested default model and history count");
assert(chatModule.includes("generateChatTitle") && chatModule.includes("titleSummaryAt: sourceUpdatedAt"), "Chat must generate and persist fresh collapsed titles");
assert(chatModule.includes("Boolean(a.pinned) !== Boolean(b.pinned)") && chatModule.includes("aExpanded !== bExpanded"), "Chat sessions must prioritize pinned and expanded conversations");
assert(chatModule.includes("toolInvocationMode: chatSettings.toolInvocationMode"), "Chat tool mode must change truthful request behavior");
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
  "count: 1",
  "aspectRatio: selectedSizePreset.aspectRatio",
  "imageSize: selectedSizePreset.resolution",
  "size: imageRequestSize(selectedSizePreset.aspectRatio, selectedSizePreset.resolution)",
  'inputImage: mode === "edit"',
  'inputImages: mode === "edit"',
  'referenceImageUrls: mode === "edit" && usesBotcf',
  'maskImage: mode === "edit" && supportsMask',
  "quality: imageCapabilities.supportsQuality ? quality : undefined",
  "outputFormat: fixedImageOutputFormat",
  '"1:1": "2880x2880"',
  "generationAbortRef.current?.abort()",
  "assets.map((asset, index) => (",
  "imageFormRef.current?.requestSubmit()",
  "setInputImages([image])",
  "api.importImageResult(asset.url)",
  "copyImageResult",
  "downloadImageResult",
  "transformedImageBlob"
]) {
  assert(studioModule.includes(imageContract), `Image Studio contract is missing ${imageContract}`);
}
assert(!studioModule.includes('ariaLabel="\u753b\u9762\u6bd4\u4f8b"') && !studioModule.includes('ariaLabel="\u56fe\u50cf\u5206\u8fa8\u7387"'), "Image Studio must keep ratio and resolution inside the unified size control");
assert(!studioModule.includes('ariaLabel="\u8f93\u51fa\u683c\u5f0f"') && !studioModule.includes('ariaLabel="\u538b\u7f29\u8d28\u91cf"'), "Image Studio must keep PNG and compression defaults internal");
assert(!studioModule.includes("background: fixedImageBackground"), "Image Studio must not send removed background parameters");
assert(!studioModule.includes("figma-image-progress") && !studioModule.includes("figma-image-eta"), "Image Studio must not retain the former ETA pill or progress rail");
assert(server.includes('"/api/image/import"') && server.includes("importPublicImageAsset"), "Image result editing must use the guarded same-origin importer after browser CORS failure");

assert(server.includes('"/api/chat/stream"'), "Chat stream route is missing");
assert(server.includes('"/api/generate/:module"'), "Generation route is missing");
assert(server.includes('"/api/agents/run"'), "Agent run route is missing");
assert(server.includes("chatSkillInstructionsFromBody"), "Server must sanitize Chat-local Skill instructions");
assert(server.includes("resolveRuntimeProvider(req.body || {}, capability)"), "Generation route must resolve provider by model capability");
assert(server.includes('resolveRuntimeProvider(req.body || {}, "chat")'), "Chat/agent routes must resolve chat-capable models");
assert(server.includes('translate: ["chat"]'), "Translate menu coverage must require a chat-capable model");
assert(server.includes("for (const item of data)"), "OpenAI image assets must be fully extracted");
assert(server.includes("for (const candidate of candidates)") && server.includes("for (const part of parts)"), "Gemini image assets must be fully extracted");
assert(server.includes("requestImageBatch(requestedCount)") && server.includes("requestImageBatch(1)"), "Image generation must make a bounded single-image supplemental request for partial Provider results");
assert(server.includes("assets.length < requestedCount") && server.includes("providerRequestCount"), "Image generation must reject incomplete result counts and report Provider request count metadata");

const serverMenuItems = defaultMenuItems();
assert(JSON.stringify(serverMenuItems) === JSON.stringify(expectedMenuItems), "Server defaults must match the exact Figma menu metadata");

const pptGenerationStart = server.indexOf('if (module === "ppt")');
const mindmapGenerationStart = server.indexOf('if (module === "mindmap")', pptGenerationStart);
const translateGenerationStart = server.indexOf('if (module === "translate")', mindmapGenerationStart);
const agentGenerationStart = server.indexOf('if (module === "agents")', translateGenerationStart);
const pptGenerationBranch = server.slice(pptGenerationStart, mindmapGenerationStart);
const mindmapGenerationBranch = server.slice(mindmapGenerationStart, translateGenerationStart);
const translateGenerationBranch = server.slice(translateGenerationStart, agentGenerationStart);
assert(pptGenerationStart >= 0 && mindmapGenerationStart > pptGenerationStart, "PPT must have a dedicated structured generation branch");
assert(pptGenerationBranch.includes("pptGenerationMessages") && pptGenerationBranch.includes("parsePptDeckModelOutput") && pptGenerationBranch.includes("pptDeckToMarkdown"), "PPT generation must request a structured deck and keep Markdown compatibility");
assert(pptGenerationBranch.includes('format: deck ? "ppt-deck-v1" : "markdown-fallback"'), "PPT generation must disclose structured versus fallback output");
assert(mindmapGenerationStart >= 0 && translateGenerationStart > mindmapGenerationStart, "Mind Map must have a dedicated structured generation branch");
assert(
  mindmapGenerationBranch.includes("mindmapGenerationMessages")
    && mindmapGenerationBranch.includes("parseMindmapExpansionOutput")
    && mindmapGenerationBranch.includes("mergeMindmapExpansion")
    && mindmapGenerationBranch.includes("parseMindmapModelOutput")
    && mindmapGenerationBranch.includes("mindmapDocumentToMarkdown")
    && mindmapGenerationBranch.includes('format: "mindmap-document-v1"'),
  "Mind Map generation must normalize complete documents and execute real expand/reorganize operations"
);
assert(translateGenerationStart >= 0 && agentGenerationStart > translateGenerationStart, "Translate must have its own text generation branch");
assert(translateGenerationBranch.includes("requestChatCompletion("), "Translate must execute through chat completion");
assert(translateGenerationBranch.includes("你是专业翻译助手。"), "Translate must use a translation system prompt");
assert(translateGenerationBranch.includes('"翻译结果"'), "Translate must return a translation result");
assert(api.includes('connection: GenerationPayload["connection"]'), "Client API must carry user connection payloads");
assert(adminConsole.includes("validateModelCatalog(bootstrap.modelCatalog, bootstrap.menuItems)"), "Admin console must validate catalog against enabled menus");
assert(types.includes("order: number") && api.includes("reorderModelCatalog"), "Model ordering must be typed and exposed by the Admin API client");
assert(server.includes('adminRouter.patch("/model-catalog/order"'), "Server must expose the atomic model reorder route");
assert(
  adminModelsSection.includes("admin-model-entry-row")
    && adminModelsSection.includes("draggable={!modelOrderBusy}")
    && adminModelsSection.includes("上移模型")
    && adminModelsSection.includes("下移模型")
    && !adminModelsSection.includes("AdminModelOrderDialog"),
  "Admin model ordering must be direct in-list drag plus explicit move controls"
);
assert(modelUtils.includes("sortModelsByOrder") && !modelUtils.includes("isDefaultFor"), "Public model defaults must derive from catalog order rather than defaultFor");
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
