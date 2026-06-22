import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultModelCatalog, normalizeModelCatalog } from "../server/registry/model-registry.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreMenuIds = ["chat", "image", "mindmap", "agents", "apps", "gallery"];

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

const moduleRegistry = readProjectFile("src/app/moduleRegistry.tsx");
const moduleRouter = readProjectFile("src/app/ModuleRouter.tsx");
const topBar = readProjectFile("src/app/TopBar.tsx");
const chatModule = readProjectFile("src/features/chat/ChatModule.tsx");
const generationModule = readProjectFile("src/features/generation/GenerationModule.tsx");
const agentsModule = readProjectFile("src/features/agents/AgentsModule.tsx");
const appsModule = readProjectFile("src/features/apps/AppsModule.tsx");
const mindmapModule = readProjectFile("src/features/mindmap/MindmapModule.tsx");
const galleryModule = readProjectFile("src/features/gallery/GalleryModule.tsx");
const adminConsole = readProjectFile("src/features/admin/AdminConsole.tsx");
const adminValidation = readProjectFile("src/features/admin/adminValidation.ts");
const server = readProjectFile("server/index.mjs");
const api = readProjectFile("src/api.ts");
const providerContracts = readProjectFile("scripts/provider-contracts.mjs");
const packageJson = JSON.parse(readProjectFile("package.json"));
const appDataPath = path.join(rootDir, "data/app-data.json");
const appData = fs.existsSync(appDataPath) ? JSON.parse(fs.readFileSync(appDataPath, "utf8")) : {};
const currentCatalog = normalizeModelCatalog(appData.modelCatalog || [], []);
const freshCatalog = defaultModelCatalog();

coreMenuIds.forEach((moduleId) => {
  assert(moduleRegistry.includes(`"${moduleId}"`), `${moduleId} must be registered in module metadata`);
});

["audio", "video", "ppt", "knowledge", "assistants"].forEach((moduleId) => {
  assert(!moduleRegistry.includes(`portalModuleOrder`) || !moduleRegistry.match(/portalModuleOrder[\s\S]*?\];/)?.[0].includes(`"${moduleId}"`), `${moduleId} must not be in the public module order`);
});

assert(topBar.includes("top-module-nav"), "TopBar must use the wide top module nav");
assert(!topBar.includes("global-search"), "TopBar must not include global search");
assert(generationModule.includes('api.generate("image"'), "Image workbench must call image generation");
assert(!generationModule.includes('moduleId === "audio"'), "Public generation workbench must not carry audio UI branches");
assert(!generationModule.includes('moduleId === "video"'), "Public generation workbench must not carry video UI branches");
assert(moduleRouter.includes('activeModule === "chat"'), "chat frontend module is not routed");
assert(moduleRouter.includes('activeModule === "mindmap"'), "mindmap frontend module is not routed");
assert(moduleRouter.includes('activeModule === "agents"'), "agents frontend module is not routed");
assert(moduleRouter.includes('activeModule === "apps"'), "apps frontend module is not routed");
assert(moduleRouter.includes('activeModule === "gallery"'), "gallery frontend module is not routed");
assert(appsModule.includes('api.generate("agents"'), "Apps module must execute through the agent-capable generation flow");
assert(mindmapModule.includes('api.generate("mindmap"'), "Mindmap module must execute through the mindmap generation flow");
assert(galleryModule.includes("portalModuleOrder"), "Gallery must filter/replay against the public module order");
assert(chatModule.includes("streamChat("), "Chat module must use streaming chat");
assert(agentsModule.includes("api.runAgent"), "Agents module must call the agent run endpoint");

assert(server.includes('"/api/chat/stream"'), "Chat stream route is missing");
assert(server.includes('"/api/generate/:module"'), "Generation route is missing");
assert(server.includes('"/api/agents/run"'), "Agent run route is missing");
assert(server.includes("resolveRuntimeProvider(req.body || {}, capability)"), "Generation route must resolve provider by model capability");
assert(server.includes('resolveRuntimeProvider(req.body || {}, "chat")'), "Chat/agent routes must resolve chat-capable models");
assert(api.includes('connection: GenerationPayload["connection"]'), "Client API must carry user connection payloads");
assert(adminConsole.includes("validateModelCatalog(bootstrap.modelCatalog, bootstrap.menuItems)"), "Admin console must validate catalog against enabled menus");
assert(adminValidation.includes("moduleRequirements"), "Admin validation must define per-module model requirements");
assert(!adminValidation.includes("knowledge:"), "Admin validation must not require removed knowledge menu coverage");
assert(!adminValidation.includes("video:"), "Admin validation must not require removed video menu coverage");

["OpenAI adapter contracts", "Claude adapter contracts", "Gemini adapter contracts", "OpenAI-compatible adapter contracts"].forEach((label) => {
  assert(providerContracts.includes(label), `${label} test is missing`);
});
assert(providerContracts.includes("OpenAI embeddings parse"), "Provider contracts must cover embeddings for future retrieval/tool use");
assert(packageJson.scripts["feature-audit"] === "node scripts/feature-audit.mjs", "package.json must expose feature-audit");

assertCapabilityCoverage(freshCatalog, "chat", "fresh chat");
assertCapabilityCoverage(freshCatalog, "image", "fresh image");
assertCapabilityCoverage(freshCatalog, "toolCalling", "fresh tool calling");

if (Array.isArray(appData.menuItems)) {
  const visibleMenuIds = appData.menuItems
    .filter((item) => item.visible && item.enabled)
    .sort((a, b) => a.order - b.order)
    .map((item) => item.id);
  assert(JSON.stringify(visibleMenuIds) === JSON.stringify(coreMenuIds), `Visible menu order must be ${coreMenuIds.join(", ")}`);
}

if (currentCatalog.length) {
  const enabledMenuIds = new Set((appData.menuItems || []).filter((item) => item.visible && item.enabled).map((item) => item.id));
  const currentRequirements = [
    ["chat", "chat", "current chat"],
    ["image", "image", "current image"],
    ["mindmap", "chat", "current mindmap"],
    ["agents", "toolCalling", "current tool calling"],
    ["apps", "chat", "current apps"]
  ];
  currentRequirements.forEach(([moduleId, capability, label]) => {
    if (enabledMenuIds.has(moduleId)) assertCapabilityCoverage(currentCatalog, capability, label);
  });
}

console.log("Feature audit passed");
