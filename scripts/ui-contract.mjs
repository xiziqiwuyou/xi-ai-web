import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

const expectedDestinations = [
  { id: "chat", path: "/chat", label: "AI \u5bf9\u8bdd" },
  { id: "image", path: "/image", label: "\u56fe\u50cf\u751f\u6210" },
  { id: "agents", path: "/agents", label: "\u667a\u80fd\u4f53" },
  { id: "workflows", path: "/workflows", label: "\u5de5\u4f5c\u6d41" },
  { id: "ppt", path: "/ppt", label: "AI \u4e00\u952e PPT" },
  { id: "mindmap", path: "/mindmap", label: "\u601d\u7ef4\u5bfc\u56fe" },
  { id: "assistants", path: "/assistants", label: "\u52a9\u624b\u5e93" },
  { id: "translate", path: "/translate", label: "\u7ffb\u8bd1" }
];

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readCssWithImports(relativePath, seen = new Set()) {
  const absolutePath = path.join(rootDir, relativePath);
  if (seen.has(absolutePath)) return "";
  seen.add(absolutePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const directory = path.dirname(relativePath);
  const imports = [...source.matchAll(/@import\s+["']([^"']+)["'];/g)]
    .map((match) => path.join(directory, match[1]).replace(/\\/g, "/"));
  return [source, ...imports.map((importPath) => readCssWithImports(importPath, seen))].join("\n");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertJsonEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
}

function assertInOrder(source, snippets, message) {
  let cursor = -1;
  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor + 1);
    assert(next > cursor, `${message}: missing or out of order ${JSON.stringify(snippet)}`);
    cursor = next;
  }
}

const topBar = readProjectFile("src/app/TopBar.tsx");
const appShell = readProjectFile("src/app/AppShell.tsx");
const publicRoutes = readProjectFile("src/app/publicRoutes.ts");
const types = readProjectFile("src/types.ts");
const apiConnectionForm = readProjectFile("src/features/settings/ApiConnectionForm.tsx");
const apiConnectionModal = readProjectFile("src/features/settings/ApiConnectionModal.tsx");
const dialog = readProjectFile("src/components/ui/Dialog.tsx");
const figmaMenu = readProjectFile("src/components/ui/FigmaMenu.tsx");
const chatModule = readProjectFile("src/features/chat/ChatModule.tsx");
const automationModule = readProjectFile("src/features/automation/AutomationModule.tsx");
const workflowCanvas = readProjectFile("src/features/automation/WorkflowCanvas.tsx");
const studioModule = readProjectFile("src/features/studio/StudioModule.tsx");
const apiClient = readProjectFile("src/api.ts");
const tokensCss = readProjectFile("src/styles/rednote-flat-v2.tokens.css");
const shellCss = readProjectFile("src/styles/rednote-flat-v2.shell.css");
const chatCss = readProjectFile("src/styles/rednote-flat-v2.chat.css");
const workbenchCss = readProjectFile("src/styles/rednote-flat-v2.workbench.css");
const adminCss = readProjectFile("src/styles/rednote-flat-v2.admin.css");
const modalCss = readProjectFile("src/styles/rednote-flat-v2.modal.css");
const responsiveCss = readProjectFile("src/styles/rednote-flat-v2.responsive.css");
const activeCss = [tokensCss, shellCss, chatCss, workbenchCss, adminCss, modalCss, responsiveCss].join("\n");
const styles = readCssWithImports("src/styles.css");
const server = readProjectFile("server/index.mjs");

const routePairs = [...publicRoutes.matchAll(/\{\s*id:\s*"([^"]+)",\s*path:\s*"([^"]+)"\s*\}/g)]
  .map((match) => ({ id: match[1], path: match[2] }));
assertJsonEqual(
  routePairs,
  expectedDestinations.map(({ id, path }) => ({ id, path })),
  "Public routes must match the exact Figma destinations"
);

const navigationBlock = topBar.match(/const navigationMeta[\s\S]*?\n};/)?.[0] || "";
const navigationItems = [...navigationBlock.matchAll(/^\s*(\w+):\s*\{\s*label:\s*"([^"]+)"/gm)]
  .map((match) => ({ id: match[1], label: match[2] }));
assertJsonEqual(
  navigationItems,
  expectedDestinations.map(({ id, label }) => ({ id, label })),
  "TopBar labels and order must match the exact Figma navigation"
);

assert(topBar.includes('navigation("figma-navigation")'), "TopBar lacks .figma-navigation");
assert(topBar.includes('className="figma-mobile-header"'), "TopBar lacks .figma-mobile-header");
assert(topBar.includes('"figma-sidebar mobile-open"'), "TopBar lacks the responsive .figma-sidebar state");
assert(topBar.includes('"figma-nav-item active"'), "TopBar lacks active .figma-nav-item styling");
assert(topBar.includes('aria-label={mobileNavOpen ? "\u5173\u95ed\u529f\u80fd\u83dc\u5355" : "\u6253\u5f00\u529f\u80fd\u83dc\u5355"}'), "Mobile menu trigger accessible names changed");
assert(topBar.includes('aria-current={active ? "page" : undefined}'), "Active navigation must expose aria-current");
assert(topBar.includes("disabled={!item.enabled}"), "Navigation must respect disabled menu state");
assert(topBar.includes("onModuleChange(item.id)"), "Navigation buttons do not change modules");
assert(topBar.includes('event.key !== "Escape"'), "Mobile navigation must close on Escape");
assert(topBar.includes("mobileMenuButtonRef.current?.focus()"), "Mobile navigation must restore trigger focus");
assert(!topBar.includes("onRequestApiConfig"), "Public shell must not expose a persistent API configuration action");

for (const retiredLabel of ["\u5bf9\u8bdd", "\u7ed8\u753b", "\u5e94\u7528", "\u753b\u5eca"]) {
  assert(!navigationBlock.includes(`label: "${retiredLabel}"`), `Retired public label remains in TopBar: ${retiredLabel}`);
}
for (const retiredToken of [
  'navigation("studio-nav")',
  'navigation("studio-mobile-nav")',
  'className="studio-sidebar"',
  'className="studio-mobile-header"',
  'className="top-module-nav"',
  'className="mobile-nav"'
]) {
  assert(!topBar.includes(retiredToken), `Retired public navigation token remains: ${retiredToken}`);
}

assert(appShell.includes('className="figma-studio-shell"'), "AppShell lacks .figma-studio-shell");
assert(appShell.includes('className="figma-workspace"'), "AppShell lacks .figma-workspace");
assert(appShell.includes('className="figma-workspace-canvas"'), "AppShell lacks .figma-workspace-canvas");
assert(appShell.includes('className="figma-public-footer"'), "AppShell lacks the Figma public footer");
assert(appShell.includes('data-scroll-owner="public-workspace"'), "Figma workspace must own public scrolling");
assert(appShell.includes("onModuleChange={onModuleChange}"), "AppShell does not pass module navigation to TopBar");

assertInOrder(
  chatModule,
  [
    'className="figma-chat-view"',
    'className="figma-workspace-heading"',
    'className="figma-heading-actions"',
    'className="figma-session-stack"',
    '"figma-chat-session collapsed"',
    'className="figma-session-header"',
    '"figma-message-history list"',
    'className="figma-composer"'
  ],
  "Chat must preserve the Figma stacked-session anatomy"
);
for (const exactCopy of [
  "<h1>AI \u5bf9\u8bdd\u5de5\u4f5c\u53f0</h1>",
  "\u7f51\u7edc\u641c\u7d22",
  "\u56fe\u7247\u8f93\u5165",
  "\u6e05\u9664\u6b64\u5bf9\u8bdd\u4e0a\u4e0b\u6587",
  "\u5728\u6b64\u8f93\u5165\u4f60\u60f3\u63a2\u8ba8\u7684\u60f3\u6cd5\u3001\u5206\u6790\u7684\u5185\u5bb9\uff0c\u6216\u8005\u5411 AI \u63d0\u95ee...",
  "Shift + Enter",
  "AI \u751f\u6210\u5185\u5bb9\u4ec5\u4f9b\u53c2\u8003\uff0c\u8bf7\u6838\u9a8c\u5173\u952e\u7ed3\u8bba\u3002"
]) {
  assert(chatModule.includes(exactCopy), `Chat is missing exact Figma copy: ${exactCopy}`);
}
assert(chatModule.includes("commitConversations((current) => [conversation, ...current])"), "New Chat sessions must be inserted at the top");
assert(chatModule.includes("collapsed: true"), "Creating a Chat session must fold existing sessions");
assert(chatModule.includes("[conversation.id]: defaultSessionUi(false)"), "The new Chat session must start expanded");
assert(!chatModule.includes('className="figma-session-action"'), "Session headers must not repeat heading actions");
assert(chatModule.includes('model?.vendor === "openai-compatible"'), "OpenAI-compatible models must use the OpenAI vendor tab");
const modelVendorTabsBlock = chatModule.match(/const modelVendorTabs:[^=]+\[\] = \[([^\]]+)\]/)?.[1] || "";
const modelVendorTabs = [...modelVendorTabsBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
assertJsonEqual(
  modelVendorTabs,
  ["OpenAI", "Claude", "Gemini", "Kimi", "DeepSeek", "\u901a\u4e49\u5343\u95ee"],
  "Chat vendor tabs must expose every named provider"
);
for (const vendorMapping of [
  ['model?.vendor === "anthropic"', 'return "Claude"'],
  ['model?.vendor === "gemini"', 'return "Gemini"'],
  ['model?.vendor === "kimi"', 'return "Kimi"'],
  ['model?.vendor === "deepseek"', 'return "DeepSeek"'],
  ['return "\u901a\u4e49\u5343\u95ee"', 'return "\u901a\u4e49\u5343\u95ee"']
]) {
  assert(vendorMapping.every((snippet) => chatModule.includes(snippet)), `Chat vendor mapping is missing ${vendorMapping.join(" -> ")}`);
}
assert(chatCss.includes(".figma-model-vendors") && chatCss.includes("overflow-y: auto;"), "Chat vendor tabs must remain scrollable");
assert(!chatModule.includes("ChevronRight"), "Chat model options must not render trailing chevrons");
assert(chatModule.includes('className="figma-model-option-mark"'), "Chat unselected model rows must reserve a stable empty mark");
const sharedMenuOptionsStart = figmaMenu.indexOf("{options.map((option, index) => (");
const sharedMenuOptionsEnd = figmaMenu.indexOf("          ))}", sharedMenuOptionsStart);
const sharedMenuOptionsBlock = figmaMenu.slice(sharedMenuOptionsStart, sharedMenuOptionsEnd);
assert(sharedMenuOptionsStart >= 0 && sharedMenuOptionsEnd > sharedMenuOptionsStart, "Shared Figma menu option block is missing");
assert(!sharedMenuOptionsBlock.includes("ChevronRight"), "Unselected shared menu options must not render trailing chevrons");
assert(sharedMenuOptionsBlock.includes("<Check") && sharedMenuOptionsBlock.includes('className="figma-menu-option-mark"'), "Shared menu options must keep selected checks and stable empty marks");
assert(chatModule.includes("event.shiftKey"), "Chat composer must reserve Shift+Enter for line breaks");
assert(chatModule.includes("event.nativeEvent.isComposing"), "Chat composer must guard IME composition");
assert(chatModule.includes('aria-label="管理对话 Skill"'), "Chat must expose local Skill management");
assert(chatModule.includes('className="figma-chat-skill-selection"'), "Chat settings must expose Skill selection");
assert(chatModule.includes("skillInstructions: selectedSkills.map"), "Chat must inject only selected Skill instructions");
assert(chatModule.includes("ChatCommandPalette"), "Chat must expose inline Skill and application commands");
assert(chatModule.includes('className="figma-chat-command-tags"'), "Chat must render removable command selections beside the composer");
assert(chatCss.includes(".figma-chat-command-palette"), "Chat CSS must style the command palette");
assert(!automationModule.includes("function SkillsWorkspace"), "Skill must not render as a public automation workspace");
assert(workflowCanvas.includes('data-testid="workflow-canvas"'), "Workflow must expose a visual canvas");
assert(workflowCanvas.includes('aria-label="适配工作流画布"'), "Workflow canvas needs an accessible fit control");
assert(automationModule.includes('className="workflow-catalog"'), "Workflow must expose a card catalog before the detail editor");
assert(workbenchCss.includes(".workflow-catalog-grid"), "Workflow catalog needs dedicated responsive card styles");
assert(chatModule.includes('data-testid="session-header-toggle-area"'), "Chat session header must expose the full fold target");
assert(chatModule.includes("handleSessionHeaderClick"), "Chat session header must fold from the complete header area");
assert(chatModule.includes("const visibleVendorModelCount = Math.min(3, vendorModels.length)"), "Chat model submenu must show the visible row count");
assert(chatModule.includes("!selectedModelInVendor && model === vendorModels[0]"), "Chat vendor switching must focus the first model when no selection exists");
assert(
  !/<select[^>]*aria-label=["']\u9009\u62e9\u5bf9\u8bdd\u6a21\u578b["']/.test(chatModule),
  "Chat must not restore the native session model select"
);
const chatRequestStart = chatModule.indexOf("await streamChat(");
const chatRequestEnd = chatModule.indexOf("(event) => handleStreamEvent", chatRequestStart);
const chatRequestBlock = chatModule.slice(chatRequestStart, chatRequestEnd);
assert(chatRequestStart >= 0 && chatRequestEnd > chatRequestStart, "Chat stream request block is missing");
assertInOrder(
  chatRequestBlock,
  ["temperature,", "topP,", "maxTokens: Math.max(1, Number(maxTokens) || 4096)"],
  "Chat requests must carry saved sampling and maximum-token settings"
);
assert(types.includes("topP?: number;") && types.includes("maxTokens?: number;"), "Chat request types must include topP and maxTokens");
for (const requiredChatContract of [
  'className="figma-model-trigger"',
  'className="figma-model-popover"',
  'className="figma-model-vendors"',
  'className="figma-model-list"',
  'role="tablist"',
  'role="listbox"',
  'aria-haspopup="listbox"',
  "OpenAI",
  "Claude",
  "Gemini",
  "Kimi",
  "DeepSeek",
  "\u901a\u4e49\u5343\u95ee",
  "Math.min(3, vendorModels.length)",
  "\u663e\u793a ${visibleVendorModelCount} \u4e2a",
  'className="figma-avatar-presets"',
  'className="figma-personal-avatar"',
  "TOP-P",
  "\u4e0a\u4e0b\u6587\u6570",
  "\u6700\u5927 Token \u6570",
  "\u6d41\u5f0f\u8f93\u51fa",
  "\u5de5\u5177\u8c03\u7528\u65b9\u5f0f",
  "\u4fdd\u5b58\u8bbe\u7f6e"
]) {
  assert(chatModule.includes(requiredChatContract), `Chat Phase 11 contract is missing ${requiredChatContract}`);
}

for (const requiredMenuContract of [
  'className="figma-menu-trigger"',
  'className="figma-menu-popover"',
  'role="listbox"',
  'role="option"',
  'aria-haspopup="listbox"',
  'event.key !== "Escape"',
  "triggerRef.current?.focus()"
]) {
  assert(figmaMenu.includes(requiredMenuContract), `Shared Figma menu contract is missing ${requiredMenuContract}`);
}

for (const retiredChatToken of [
  'className="chat-header"',
  'className="conversation-rail"',
  'className="thread-main"',
  'className="composer"',
  "composer-status-row",
  "mask-workflow"
]) {
  assert(!chatModule.includes(retiredChatToken), `Retired Chat surface remains mounted: ${retiredChatToken}`);
}

const studioPageContracts = [
  {
    label: "Image",
    snippets: [
      'className="figma-module-view figma-image-page"',
      'className="figma-page-hero figma-image-hero"',
      "02 / VISUALS",
      "\u56fe\u50cf\u751f\u6210",
      "\u628a\u6587\u5b57\u7075\u611f\u8f6c\u6362\u4e3a\u4e00\u5e45\u72ec\u6709\u753b\u9762\u3002",
      'className="figma-image-builder"',
      'className="figma-image-parameters"',
      "\u521b\u4f5c\u53c2\u6570",
      "\u7075\u611f\u7011\u5e03\u6d41",
      'className="figma-inspiration-waterfall"'
    ]
  },
  {
    label: "PPT",
    snippets: [
      'className="figma-module-view figma-ppt-page"',
      "06 / AUTO-DECK",
      "\u4e00\u53e5\u4e3b\u9898\uff0c",
      "\u4e00\u4efd\u597d PPT\u3002",
      'className="figma-ppt-creator"',
      'className="figma-ppt-input-panel"',
      'className="figma-ppt-options"',
      'ariaLabel="PPT \u751f\u6210\u6a21\u578b"',
      "\u8ba9 AI \u5f00\u59cb\u521b\u4f5c",
      'className="figma-ppt-stages"',
      "WHAT AI CREATES",
      'className="figma-ppt-ideas"',
      "PROMPT IDEAS"
    ]
  },
  {
    label: "Mind Map",
    snippets: [
      'className="figma-module-view figma-mindmap-page"',
      "07 / THINKING MAP",
      "\u628a\u6a21\u7cca\u60f3\u6cd5\uff0c",
      "\u53d8\u6210\u6e05\u6670\u8def\u5f84\u3002",
      'className="figma-map-command"',
      'ariaLabel="\u601d\u7ef4\u5bfc\u56fe\u751f\u6210\u6a21\u578b"',
      'className="figma-map-canvas"',
      'className="figma-map-stage"',
      'className="figma-map-center-node"',
      "figma-map-branch branch-",
      'className="figma-map-zoom"',
      'className="figma-map-capabilities"'
    ]
  },
  {
    label: "Assistants",
    snippets: [
      'className="figma-module-view figma-assistants-page"',
      "08 / AGENT LIBRARY",
      "CURATED AGENTS",
      'className="figma-agent-filters"',
      'className="figma-agent-grid"',
      'className="figma-agent-dialog"',
      "SPECIALIST AGENT",
      "\u542f\u52a8\u6b64\u52a9\u624b"
    ]
  },
  {
    label: "Translation",
    snippets: [
      'className="figma-module-view figma-translate-page"',
      "09 / TRANSLATE",
      "\u4e0d\u53ea\u662f\u7ffb\u8bd1\uff0c",
      "\u66f4\u50cf\u6bcd\u8bed\u8868\u8fbe\u3002",
      'className="figma-translate-toolbar"',
      'ariaLabel="\u7ffb\u8bd1\u6a21\u578b"',
      'className="figma-language-row"',
      'className="figma-tone-tabs"',
      'className="figma-translate-source"',
      'className="figma-translate-result"',
      'className="figma-translate-capabilities"'
    ]
  }
];
for (const contract of studioPageContracts) {
  assertInOrder(studioModule, contract.snippets, `${contract.label} must preserve its Phase 11 page structure`);
}
for (const exactStudioCopy of [
  "\u4e00\u5ea7\u6f02\u6d6e\u5728\u6df1\u6d77\u4e2d\u7684\u672a\u6765\u56fe\u4e66\u9986\uff0c\u84dd\u7d2b\u8272\u751f\u7269\u8367\u5149\uff0c\u7535\u5f71\u611f",
  "\u6362\u4e00\u6279 \u2192",
  "\u751f\u6210\u5f0f AI \u5982\u4f55\u91cd\u5851\u4f01\u4e1a\u521b\u65b0",
  "\u9884\u8ba1 40 \u79d2 \u00b7 \u7ea6 8 \u9875\u5185\u5bb9 \u00b7 \u652f\u6301\u540e\u7eed\u5bfc\u51fa PDF",
  "\u53d1\u73b0\u53d9\u4e8b\u4e3b\u7ebf",
  "\u751f\u6210\u9875\u9762\u7ed3\u6784",
  "\u5339\u914d\u89c6\u89c9\u7d20\u6750",
  "\u6da6\u8272\u5173\u952e\u8868\u8fbe",
  "\u6784\u5efa AI \u9a71\u52a8\u7684\u4ea7\u54c1\u589e\u957f\u4f53\u7cfb",
  "\u7528\u6237\u6d1e\u5bdf",
  "\u4ef7\u503c\u4e3b\u5f20",
  "\u4ea7\u54c1\u7b56\u7565",
  "\u589e\u957f\u5b9e\u9a8c",
  "\u4e00\u952e\u5c55\u5f00",
  "AI \u91cd\u7ec4",
  "\u5bfc\u51fa\u56fe\u7247",
  "\u81ea\u7136\u4e13\u4e1a",
  "\u7b80\u6d01",
  "\u8425\u9500\u611f",
  "\u6587\u4ef6\u7ffb\u8bd1",
  "\u672f\u8bed\u5e93",
  "\u53cc\u8bed\u5bf9\u7167"
]) {
  assert(studioModule.includes(exactStudioCopy), `Studio Phase 11 copy is missing: ${exactStudioCopy}`);
}
for (const authoredMenuLabel of [
  "\u56fe\u50cf\u751f\u6210\u6a21\u578b",
  "\u753b\u9762\u6bd4\u4f8b",
  "\u751f\u6210\u6570\u91cf",
  "\u76ee\u6807\u53d7\u4f17",
  "\u6f14\u793a\u65f6\u957f",
  "\u89c6\u89c9\u6c14\u8d28",
  "\u6e90\u8bed\u8a00",
  "\u76ee\u6807\u8bed\u8a00"
]) {
  assert(studioModule.includes(`ariaLabel="${authoredMenuLabel}"`), `Studio menu button is missing ${authoredMenuLabel}`);
}
assert(!/<select[^>]+aria-label="(?:\u56fe\u50cf\u751f\u6210\u6a21\u578b|\u753b\u9762\u6bd4\u4f8b|\u751f\u6210\u6570\u91cf|\u76ee\u6807\u53d7\u4f17|\u6f14\u793a\u65f6\u957f|\u89c6\u89c9\u6c14\u8d28|\u6e90\u8bed\u8a00|\u76ee\u6807\u8bed\u8a00)"/.test(studioModule), "Authored studio submenus must not fall back to visible native selects");
for (const zoomContract of ['aria-label="\u7f29\u5c0f"', 'aria-label="\u653e\u5927"', "Math.round(zoom * 100)"]) {
  assert(studioModule.includes(zoomContract), `Mind Map zoom contract is missing ${zoomContract}`);
}

for (const imageUiContract of [
  "\u6587\u751f\u56fe",
  "\u56fe\u7247\u7f16\u8f91",
  "\u539f\u56fe",
  "\u8499\u7248\uff08PNG\uff09",
  'accept="image/png,image/jpeg,image/webp"',
  'accept="image/png"',
  'ariaLabel="\u56fe\u50cf\u5206\u8fa8\u7387"',
  'ariaLabel="\u751f\u6210\u6570\u91cf"',
  'ariaLabel="\u751f\u6210\u8d28\u91cf"',
  'ariaLabel="\u8f93\u51fa\u683c\u5f0f"',
  'ariaLabel="\u538b\u7f29\u8d28\u91cf"'
]) {
  assert(studioModule.includes(imageUiContract), `Image generation/editing UI contract is missing ${imageUiContract}`);
}
for (const imageTypeContract of [
  'export type ImageGenerationMode = "generate" | "edit";',
  'export type ImageAspectRatio = "1:1" | "3:2" | "2:3" | "16:9" | "9:16";',
  'export type ImageResolution = "512px" | "1K" | "2K" | "4K";',
  'export type ImageOutputFormat = "png" | "jpeg" | "webp";',
  "count?: number;",
  "inputImage?: ImageInputPayload;",
  "maskImage?: ImageInputPayload;",
  "outputFormat?: ImageOutputFormat;",
  "outputCompression?: number;"
]) {
  assert(types.includes(imageTypeContract), `Typed image request contract is missing ${imageTypeContract}`);
}
const imageRequestStart = studioModule.indexOf('const nextResult = await api.generate("image"');
const imageRequestEnd = studioModule.indexOf("setResult(nextResult)", imageRequestStart);
const imageRequestBlock = studioModule.slice(imageRequestStart, imageRequestEnd);
assert(imageRequestStart >= 0 && imageRequestEnd > imageRequestStart, "Image generation request block is missing");
for (const typedImageOption of [
  "mode,",
  "count: Number(count)",
  "aspectRatio,",
  "imageSize: resolution",
  "size: imageRequestSize(aspectRatio, resolution)",
  'inputImage: mode === "edit"',
  'maskImage: mode === "edit" && supportsMask',
  "quality: usesOpenAIImageOptions ? quality : undefined",
  "outputFormat: usesOpenAIImageOptions ? outputFormat : undefined",
  "outputCompression: usesOpenAIImageOptions && outputFormat !== \"png\""
]) {
  assert(imageRequestBlock.includes(typedImageOption), `Image request must send typed option ${typedImageOption}`);
}
assert(imageRequestBlock.includes("Number(outputCompression)"), "Image compression must be sent as a number");
assert(studioModule.includes('result?.assets?.filter((asset) => asset.type === "image") || []'), "Image results must retain every image asset");
assert(studioModule.includes("resultImages.map((asset, index) => ("), "Image results must render every returned asset");
assert(studioModule.includes("item.assets") && studioModule.includes(".forEach((asset, index) =>"), "Saved multi-asset image generations must be flattened into the waterfall");
assert(server.includes("for (const item of data)"), "Server image extraction must iterate every OpenAI data item");
assert(server.includes("for (const candidate of candidates)") && server.includes("for (const part of parts)"), "Server image extraction must iterate every Gemini candidate part");
assert(server.includes('extractAssets(json, "image", fallbackMimeType).slice(0, requestedCount)'), "Image responses must retain all assets up to the requested count");

for (const requiredSelector of [
  ".figma-studio-shell",
  ".figma-sidebar",
  ".figma-mobile-header",
  ".figma-navigation",
  ".figma-nav-item",
  ".figma-workspace"
]) {
  assert(shellCss.includes(requiredSelector), `Shell CSS lacks ${requiredSelector}`);
}
for (const requiredSelector of [
  ".figma-workspace-heading",
  ".figma-chat-session",
  ".figma-session-header",
  ".figma-message-history",
  ".figma-composer"
]) {
  assert(chatCss.includes(requiredSelector), `Chat CSS lacks ${requiredSelector}`);
}
assert(chatModule.includes('className="figma-session-mobile-actions"'), "Mobile Chat commands must live in the session header");
assert(chatModule.includes('className="figma-session-action-mobile"'), "Mobile Chat session commands are missing");
assert(responsiveCss.includes(".figma-session-mobile-actions"), "Responsive CSS must expose the mobile session-header commands");
assert(!chatModule.includes('className="figma-mobile-chat-actions"'), "Chat must not restore the extra bottom mobile action row");
for (const requiredSelector of [
  ".figma-menu-trigger",
  ".figma-menu-popover",
  ".figma-image-builder",
  ".figma-inspiration-waterfall",
  ".figma-ppt-stages",
  ".figma-ppt-ideas",
  ".figma-map-canvas",
  ".figma-map-stage",
  ".figma-map-branch",
  ".figma-map-zoom",
  ".figma-agent-filters",
  ".figma-agent-grid",
  ".figma-agent-dialog",
  ".figma-tone-tabs",
  ".figma-translate-capabilities"
]) {
  assert(workbenchCss.includes(requiredSelector), `Workbench CSS lacks ${requiredSelector}`);
}
assert(shellCss.includes("grid-template-columns: 224px minmax(0, 1fr)"), "Desktop Figma shell width changed");
assert(responsiveCss.includes(".figma-sidebar.mobile-open"), "Responsive CSS lacks the mobile Figma navigation state");
assert(responsiveCss.includes("@media (max-width: 1023.98px)"), "The mobile shell cutoff must cover fractional CSS widths below 1024px");
assert(responsiveCss.includes("grid-template-columns: minmax(0, 1fr);"), "Mobile Figma navigation must remain a single column");
assert(!responsiveCss.includes("214px"), "The 1024px Figma rail must not use the retired 214px width");
assert(responsiveCss.includes("grid-template-columns: 224px minmax(0, 1fr)"), "The 1024px Figma rail must keep its 224px width");
assert(workbenchCss.includes(".figma-page-hero h1 em") && workbenchCss.includes("white-space: nowrap"), "Hero emphasis must stay together on mobile");
assert(workbenchCss.includes("border-radius: 16px"), "Authored Figma menus must use the base 16px radius");
assert(!responsiveCss.includes(".figma-session-model select"), "Responsive CSS must not retain the removed native model select");
for (const retiredResponsiveSelector of [
  ".figma-creative-layout",
  ".figma-image-preview",
  ".figma-assistant-layout",
  ".figma-mindmap-command",
  ".figma-translation-panels",
  ".figma-translate-submit"
]) {
  assert(!responsiveCss.includes(retiredResponsiveSelector), `Responsive CSS still contains retired selector ${retiredResponsiveSelector}`);
}
for (const retiredSelector of [".studio-sidebar", ".studio-mobile-header", ".studio-nav-item", ".top-module-nav", ".mobile-nav"]) {
  assert(!shellCss.includes(retiredSelector), `Active shell CSS still contains ${retiredSelector}`);
}

assert(apiConnectionForm.includes('autoComplete="url"'), "API URL input should provide URL autocomplete");
assert(apiConnectionForm.includes('inputMode="url"'), "API URL input should provide URL input mode");
assert(apiConnectionForm.includes('name="apiUrl"'), "API URL input should provide a meaningful name");
assert(apiConnectionForm.includes('type="url"'), "API URL input should use the URL type");
assert(apiConnectionForm.includes('autoComplete="off"'), "API Key input should disable autocomplete");
assert(apiConnectionForm.includes('name="apiKey"'), "API Key input should provide a meaningful name");
for (const retiredByokSurface of [
  "settings-section-title",
  "settings-summary",
  "model-suggestions",
  "settings-ready-card",
  "settings-reset"
]) {
  assert(!apiConnectionForm.includes(retiredByokSurface), `BYOK modal must not restore ${retiredByokSurface}`);
}
assert(apiConnectionModal.includes("API CONNECTION"), "BYOK modal should use the Figma dialog heading");
assert(apiConnectionModal.includes("<Dialog"), "BYOK modal should use the shared accessible dialog");
assert(dialog.includes('document.body.style.overflow = "hidden"'), "Shared dialog should lock body scroll");
assert(dialog.includes("appRoot.inert = true"), "Shared dialog should make the application background inert");
assert(dialog.includes("restoreTarget.focus"), "Shared dialog should restore trigger focus");
assert(dialog.includes('event.key === "Escape"') && dialog.includes("event.stopPropagation()"), "Locked dialogs must consume Escape");
assert(dialog.includes("canClose && closeOnScrim"), "Dialog scrims must only expose a close action when dismissal is available");

assert(!apiClient.includes("/api/conversations"), "Public conversation CRUD client should remain removed");
assert(server.includes('app.get("/api/conversations"'), "Server must keep 410 compatibility for public conversation list route");
assert(server.includes('app.get("/api/conversations/:id"'), "Server must keep 410 compatibility for public conversation detail route");
assert(server.includes("publicConversationGone"), "Server must keep the public conversation compatibility handler");
assert(!styles.includes("var(--text)"), "Styles contain unresolved var(--text) references");
assert(styles.includes("touch-action: manipulation"), "Buttons should opt into touch-action manipulation");
assert(styles.includes("overscroll-behavior: contain"), "Modal and workspace layers should contain overscroll");
assert(tokensCss.includes('--font-ui: "Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei UI"'), "UI font stack must keep a Chinese-optimized Windows fallback");
assert(tokensCss.includes('--font-mono: "DM Mono", "SFMono-Regular", "PingFang SC", "Microsoft YaHei UI"'), "Metadata font stack must not fall back to a generic CJK monospace face");
assert(!styles.includes('font-family: "DM Mono", monospace'), "Active styles must use the shared metadata font stack");
assert(tokensCss.includes("--xhs-muted: #93a3bf"), "Dark muted text contrast regressed");
assert(tokensCss.includes("--xhs-faint: #7887a3"), "Dark faint text contrast regressed");
assert(tokensCss.includes("--xhs-range-track-border: #637493"), "Dark range track border token is missing");
assert(tokensCss.includes("--xhs-scrollbar-active: rgba(101, 115, 141, 0.42)") && tokensCss.includes("--xhs-scrollbar-active: rgba(147, 163, 191, 0.46)"), "Model scrollbar soft-contrast tokens are missing");
assert(tokensCss.includes("--xhs-primary-fill: #2368e8") && tokensCss.includes("--xhs-on-primary: #ffffff"), "Filled-primary text contrast tokens are missing");
assert(!/font-size:\s*(?:8|9)px/.test(activeCss), "Active UI metadata must not render below 10px");
assert(chatCss.includes('height: 24px;') && chatCss.includes('background: var(--xhs-range-track);'), "Chat range controls must keep the legible track geometry");
assert(chatCss.includes('min-height: 0;') && chatCss.includes('padding: 0;') && chatCss.includes('box-shadow: none;'), "Chat range inputs must reset legacy field chrome");
assert(chatCss.includes('.figma-range-track > i') && chatCss.includes('width: var(--range-progress);'), "Chat range controls must expose a visible progress segment");
assert(chatCss.includes('box-shadow: 0 0 0 1px var(--xhs-red), 0 0 0 4px var(--xhs-range-thumb-ring);'), "Chat range thumbs must keep their contrast ring");
assert(chatModule.includes('aria-labelledby="figma-temperature-label"') && chatModule.includes('aria-labelledby="figma-top-p-label"'), "Chat range names must stay stable when values change");
assert(chatModule.includes('<output htmlFor="figma-temperature-range">') && chatModule.includes('<output htmlFor="figma-top-p-range">'), "Chat range values must use semantic outputs");
assert(chatModule.includes('data-scroll-active={modelListScrolling ? "true" : "false"}') && chatModule.includes("handleModelListScroll"), "Chat model scrolling must expose a transient visual state");
assert(chatModule.includes('data-scroll-active={vendorListScrolling ? "true" : "false"}') && chatModule.includes("handleVendorListScroll"), "Chat vendor scrolling must expose an independent transient visual state");
assert(chatCss.includes("scrollbar-color: transparent transparent;") && chatCss.includes('.figma-model-list[data-scroll-active="true"]'), "Chat model scrollbar must stay transparent until interaction");
assert((chatCss.match(/scrollbar-gutter: stable;/g) || []).length >= 2 && chatCss.includes(".figma-model-list::-webkit-scrollbar-thumb") && chatCss.includes(".figma-model-vendors::-webkit-scrollbar-thumb"), "Chat model and vendor scrollbars must not shift menu geometry across browsers");
assert(chatCss.includes("scrollbar-color: var(--xhs-scrollbar-active) transparent;") && chatCss.includes("background: var(--xhs-scrollbar-active);"), "Chat model scrollbar must use the accessible active token");
assert(chatCss.includes('.figma-model-vendors[data-scroll-active="true"]'), "Chat vendor scrollbar must stay transparent until interaction");
assert(chatCss.includes("var(--xhs-red) 16%") && chatCss.includes("font-weight: 750;"), "Selected Chat vendors must keep a clearly emphasized rounded background state");
assert(chatModule.includes("modelValueDescriptionId") && chatModule.includes("aria-describedby={modelValueDescriptionId}"), "Chat model trigger must describe its current value");
assert(figmaMenu.includes("valueDescriptionId") && figmaMenu.includes("aria-describedby={valueDescriptionId}"), "Shared Figma menus must describe their current value");
for (const modelMenuLabel of ["PPT \u751f\u6210\u6a21\u578b", "\u601d\u7ef4\u5bfc\u56fe\u751f\u6210\u6a21\u578b", "\u7ffb\u8bd1\u6a21\u578b"]) {
  assert(studioModule.includes(`ariaLabel="${modelMenuLabel}"`), `Studio model selector is missing ${modelMenuLabel}`);
}
assert((studioModule.match(/disabled=\{busy\}/g) || []).length >= 4, "Studio model selectors must lock while generation is in flight");

console.log("UI contract checks passed");
