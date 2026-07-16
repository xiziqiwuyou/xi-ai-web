import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

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

const topBar = readProjectFile("src/app/TopBar.tsx");
const appShell = readProjectFile("src/app/AppShell.tsx");
const apiConnectionForm = readProjectFile("src/features/settings/ApiConnectionForm.tsx");
const apiConnectionModal = readProjectFile("src/features/settings/ApiConnectionModal.tsx");
const dialog = readProjectFile("src/components/ui/Dialog.tsx");
const modelPicker = readProjectFile("src/components/workbench/ModelPicker.tsx");
const promptComposer = readProjectFile("src/components/workbench/PromptComposer.tsx");
const chatModule = readProjectFile("src/features/chat/ChatModule.tsx");
const apiClient = readProjectFile("src/api.ts");
const styles = readCssWithImports("src/styles.css");
const server = readProjectFile("server/index.mjs");

assert(topBar.includes("className=\"top-module-nav\""), "TopBar lacks the horizontal module navigation");
assert(topBar.includes("top-module-button active"), "TopBar lacks active module styling");
assert(topBar.includes("aria-current={active ? \"page\" : undefined}"), "TopBar active module should expose aria-current");
assert(topBar.includes("disabled={!item.enabled}"), "TopBar module buttons should respect disabled menu state");
assert(topBar.includes("onModuleChange(item.id)"), "TopBar module buttons do not navigate to modules");
assert(!topBar.includes("global-search-input"), "TopBar search should remain removed");
assert(appShell.includes("onModuleChange={onModuleChange}"), "AppShell does not pass module navigation to TopBar");
assert(!apiClient.includes("/api/conversations"), "Public conversation CRUD client should remain removed");
assert(!styles.includes("var(--text)"), "Styles contain unresolved var(--text) references");
assert(server.includes('app.get("/api/conversations"'), "Server must keep 410 compatibility for public conversation list route");
assert(server.includes('app.get("/api/conversations/:id"'), "Server must keep 410 compatibility for public conversation detail route");
assert(server.includes("publicConversationGone"), "Server must keep public conversation compatibility handler");
assert(apiConnectionForm.includes("autoComplete=\"url\""), "API URL input should provide URL autocomplete");
assert(apiConnectionForm.includes("inputMode=\"url\""), "API URL input should provide URL input mode");
assert(apiConnectionForm.includes("name=\"apiUrl\""), "API URL input should provide a meaningful name");
assert(apiConnectionForm.includes("type=\"url\""), "API URL input should use the URL type");
assert(apiConnectionForm.includes("autoComplete=\"off\""), "API Key input should disable autocomplete");
assert(apiConnectionForm.includes("name=\"apiKey\""), "API Key input should provide a meaningful name");
assert(apiConnectionForm.includes("field-state"), "API connection form lacks per-field readiness state");
assert(apiConnectionModal.includes("<Dialog"), "API modal should use the shared accessible dialog contract");
assert(dialog.includes('document.body.style.overflow = "hidden"'), "Shared dialog should lock body scroll");
assert(dialog.includes("previousOverflow"), "Shared dialog should restore previous body overflow");
assert(dialog.includes("previousPaddingRight"), "Shared dialog should restore previous body padding");
assert(dialog.includes("appRoot.inert = true"), "Shared dialog should make the application background inert");
assert(dialog.includes("restoreTarget.focus"), "Shared dialog should restore trigger focus");
assert(modelPicker.includes("aria-describedby={empty ? helpId : undefined}"), "ModelPicker empty state should be described");
assert(modelPicker.includes("暂无可用模型"), "ModelPicker lacks visible empty option");
assert(modelPicker.includes("model-picker-empty"), "ModelPicker lacks visible empty-state helper");
assert(promptComposer.includes("data-testid=\"workbench-prompt-input\""), "PromptComposer input lacks runtime test id");
assert(promptComposer.includes("event.ctrlKey || event.metaKey"), "PromptComposer lacks Ctrl/Cmd+Enter handling");
assert(promptComposer.includes("requestSubmit()"), "PromptComposer shortcut should submit the parent form");
assert(promptComposer.includes("role=\"status\""), "PromptComposer lacks accessible status text");
assert(chatModule.includes("event.ctrlKey || event.metaKey"), "Chat composer should use Ctrl/Cmd+Enter submit");
assert(chatModule.includes("aria-describedby=\"composer-input-help\""), "Chat composer input lacks helper description");
assert(chatModule.includes("composer-status-row"), "Chat composer lacks visible input status row");
assert(chatModule.includes("Enter 换行"), "Chat composer should communicate multiline Enter behavior");
assert(chatModule.includes("className=\"thread-main\""), "Conversation cards should expose a semantic main button");
assert(chatModule.includes("aria-current={conversation.id === activeConversationId"), "Active conversation button should expose aria-current");
assert(!chatModule.includes("onClick={() => setActiveConversationId(conversation.id)}\n                >\n                  <div>"), "Conversation cards should not rely on article-level click handlers");
assert(styles.includes("touch-action: manipulation"), "Buttons should opt into touch-action manipulation");
assert(styles.includes("overscroll-behavior: contain"), "Modal layers should contain overscroll");

console.log("UI contract checks passed");
