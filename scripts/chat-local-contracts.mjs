import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { defaultMenuItems } from "../server/data/defaults.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivePath = path.join(rootDir, "src/features/chat/conversationArchive.ts");
const maskPath = path.join(rootDir, "src/features/chat/maskWorkflow.ts");
const archiveSource = fs.readFileSync(archivePath, "utf8");
function moduleUrlFromSource(source, replacements = {}) {
  let nextSource = source;
  for (const [specifier, replacement] of Object.entries(replacements)) {
    nextSource = nextSource.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }
  const transpiled = ts.transpileModule(nextSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
  return `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
}
function importTsSource(source, replacements = {}) {
  return import(moduleUrlFromSource(source, replacements));
}
const workspaceArchiveUrl = moduleUrlFromSource(
  fs.readFileSync(path.join(rootDir, "src/features/workspace/workspaceArchive.ts"), "utf8")
);
const workspaceArchive = await import(workspaceArchiveUrl);
const archive = await importTsSource(archiveSource, {
  "../workspace/workspaceArchive": workspaceArchiveUrl
});
const attachmentContext = await importTsSource(
  fs.readFileSync(path.join(rootDir, "src/features/chat/chatAttachmentContext.ts"), "utf8")
);
const masks = await importTsSource(fs.readFileSync(maskPath, "utf8"));
const workflowComponentsUrl = moduleUrlFromSource(
  fs.readFileSync(path.join(rootDir, "src/features/automation/workflowComponents.ts"), "utf8")
);
const workflowGraph = await importTsSource(
  fs.readFileSync(path.join(rootDir, "src/features/automation/workflowGraph.ts"), "utf8"),
  { "./workflowComponents": workflowComponentsUrl }
);
const chatCommands = await importTsSource(
  fs.readFileSync(path.join(rootDir, "src/features/chat/chatCommands.ts"), "utf8")
);
const workflowRuntime = await importTsSource(
  fs.readFileSync(path.join(rootDir, "src/features/automation/workflowRuntime.ts"), "utf8")
);

const now = "2026-06-13T13:50:00.000Z";
const conversation = {
  id: "thread-1",
  title: "NextChat local thread",
  assistantId: "assistant-1",
  pinned: false,
  messageCount: 4,
  preview: "hello",
  createdAt: now,
  updatedAt: now,
  messages: [
    { id: "m1", role: "user", content: "hello", createdAt: now },
    { id: "m2", role: "assistant", content: "hi", createdAt: now },
    { id: "m3", role: "user", content: "draft a plan", createdAt: now },
    { id: "m4", role: "assistant", content: "plan", createdAt: now }
  ]
};

const envelope = archive.createConversationExport([conversation], [
  archive.createConversationSummaryArtifact(conversation)
]);
assert.equal(envelope.schema, archive.conversationExportSchema);
assert.equal(envelope.version, archive.conversationExportVersion);
assert.equal(envelope.conversations.length, 1);

const persistedMessage = workspaceArchive.sanitizeWorkspaceMessage({
  id: "persisted-message",
  role: "assistant",
  content: "answer",
  attachments: [{
    id: "attachment-1",
    kind: "text",
    name: "notes.txt",
    mimeType: "text/plain",
    size: 5,
    text: "line 1\nline 2"
  }],
  knowledgeCitations: [{
    id: "citation-1",
    knowledgeBaseId: "kb-1",
    knowledgeBaseName: "KB",
    documentId: "doc-1",
    documentName: "Doc",
    chunkId: "chunk-1",
    chunkOrdinal: 0,
    locator: { page: 1 },
    score: 0.8,
    mode: "vector",
    source: { method: "GET", openPath: "/open", downloadPath: "/download" }
  }],
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  createdAt: now
});
assert.equal(persistedMessage.attachments[0].text, "line 1\nline 2");
assert.equal(persistedMessage.knowledgeCitations.length, 1);
assert.equal(persistedMessage.usage.totalTokens, 15);

const historicAttachment = {
  id: "historic-image",
  kind: "image",
  name: "reference.png",
  mimeType: "image/png",
  size: 3,
  dataUrl: "data:image/png;base64,AAAA"
};
assert.deepEqual(
  attachmentContext.chatAttachmentsForRequest(
    [{ ...conversation.messages[0], attachments: [historicAttachment] }],
    [],
    { imageLimit: 3, includeImages: true }
  ).map((attachment) => attachment.id),
  ["historic-image"],
  "selected historical attachments must be replayed for follow-up requests"
);
assert.equal(
  attachmentContext.settleStreamingMessage(
    [{ ...conversation, messages: [{ ...conversation.messages[1], status: "streaming" }] }],
    conversation.id,
    conversation.messages[1].id,
    "stopped"
  )[0].messages[0].status,
  "stopped"
);

const apiSource = fs.readFileSync(path.join(rootDir, "src/api.ts"), "utf8");
assert(apiSource.includes("let receivedDone = false"), "Chat SSE must track its terminal done event");
assert(apiSource.includes("if (!receivedDone)"), "Chat SSE must reject EOF before done");

const serialized = JSON.stringify({
  ...envelope,
  bait: {
    baseUrl: "https://api.secret.example/v1",
    apiKey: "sk-secret",
    lastModelId: "secret-model",
    adminAuditLog: ["secret"]
  }
});
assert(!JSON.stringify(envelope).includes("sk-secret"), "export envelope must not include API key");
assert(!JSON.stringify(envelope).includes("https://api.secret.example"), "export envelope must not include API URL");
assert(serialized.includes("sk-secret"), "test bait must contain secret to prove assertion is meaningful");

const preview = archive.previewConversationImport(envelope);
assert.equal(preview.valid.length, 1);
assert.equal(preview.rejected.length, 0);
assert.equal(preview.canReplace, true);

const malformed = archive.previewConversationImport({
  schema: archive.conversationExportSchema,
  version: archive.conversationExportVersion,
  conversations: [{ id: "", messages: "bad" }, conversation]
});
assert.equal(malformed.valid.length, 1);
assert.equal(malformed.rejected.length, 1);
assert.equal(malformed.canReplace, false);
assert.equal(archive.replaceImportedConversations(malformed), null);

const merged = archive.mergeImportedConversations(
  [conversation],
  preview.valid,
  { now }
);
assert.equal(merged.length, 2);
assert.equal(merged[0].id, "thread-1-import-1");
assert.equal(merged[0].title, conversation.title);
assert.equal(merged[1].id, "thread-1");

const beforeCompression = JSON.stringify(conversation);
const summary = archive.createConversationSummaryArtifact(conversation);
assert.equal(JSON.stringify(conversation), beforeCompression, "compression artifact must not mutate raw messages");
assert.equal(summary.conversationId, conversation.id);
assert(summary.summary.includes("关键内容"));

const edited = archive.editConversationFromUserMessage(conversation, "m1", "hello edited", now);
assert.equal(edited.messages.length, 1, "editing earlier user turn must fork/truncate later messages");
assert.equal(edited.messages[0].content, "hello edited");
assert.equal(conversation.messages.length, 4, "edit must not mutate original conversation");

const latestEdited = archive.editConversationFromUserMessage(conversation, "m3", "new plan", now);
assert.equal(latestEdited.messages.length, 3);
assert.equal(latestEdited.messages[2].content, "new plan");

const retryBase = archive.forkConversationBeforeUserMessage(conversation, "m3", now);
assert.equal(retryBase.messages.length, 2, "retry must send history before the retried user turn");
assert.equal(retryBase.messages.at(-1).id, "m2");

const editSendBase = archive.forkConversationBeforeUserMessage(conversation, "m1", now);
assert.equal(editSendBase.messages.length, 0, "editing the first user turn then sending must not keep stale assistant branch");

const markdown = archive.conversationToMarkdown(conversation);
assert(markdown.includes("# NextChat local thread"));
assert(markdown.includes("## 用户"));
assert(markdown.includes("## 助手"));

const maskList = masks.buildChatMaskWorkflows(
  [{
    id: "assistant-1",
    name: "通用助手",
    description: "daily",
    color: "#ff2442",
    systemPrompt: "be useful",
    createdAt: now,
    updatedAt: now
  }],
  [{
    id: "app-1",
    name: "周报",
    description: "weekly report",
    category: "办公",
    prompt: "write weekly report",
    enabled: true
  }]
);
assert.equal(maskList.length, 2);
assert.equal(maskList[0].type, "assistant");
assert.equal(maskList[1].type, "app");
assert(masks.starterPromptFromMask(maskList[1], "done tasks").includes("write weekly report"));
assert(masks.starterPromptFromMask(maskList[1], "done tasks").includes("done tasks"));

const visualWorkflow = {
  version: 1,
  nodes: [
    { id: "start", kind: "start", name: "开始", position: { x: 0, y: 0 } },
    { id: "agent-1-node", kind: "agent", name: "分析", instruction: "分析输入", agentId: "agent-1", position: { x: 260, y: 0 } },
    { id: "agent-2-node", kind: "agent", name: "复核", instruction: "复核输出", agentId: "agent-1", position: { x: 520, y: 0 } },
    { id: "reply", kind: "reply", name: "输出", position: { x: 780, y: 0 } }
  ],
  edges: [
    { id: "start-agent-1", source: "start", target: "agent-1-node" },
    { id: "agent-1-agent-2", source: "agent-1-node", target: "agent-2-node" },
    { id: "agent-2-reply", source: "agent-2-node", target: "reply" }
  ]
};
const visualWorkflowValidation = workflowGraph.validateWorkflowGraph(visualWorkflow, { agentIds: ["agent-1"] });
assert.equal(visualWorkflowValidation.valid, true, "a connected local workflow graph must validate");
assert.deepEqual(visualWorkflowValidation.orderedNodes.map((node) => node.id), ["start", "agent-1-node", "agent-2-node", "reply"]);
assert.equal(workflowGraph.canConnectWorkflowNodes(visualWorkflow, "reply", "agent-1-node"), false, "reply nodes cannot emit edges");
assert.equal(workflowGraph.canConnectWorkflowNodes(visualWorkflow, "agent-2-node", "agent-1-node"), false, "workflow connections must reject cycles");
assert.equal(
  workflowGraph.validateWorkflowGraph(visualWorkflow, { agentIds: [] }).valid,
  false,
  "a graph that references a deleted local agent must fail before provider access"
);

const skillCommand = chatCommands.activeChatCommand("总结发布风险 $发布");
assert.deepEqual(
  skillCommand && { kind: skillCommand.kind, query: skillCommand.query, token: skillCommand.token },
  { kind: "skill", query: "发布", token: "$发布" },
  "the trailing dollar token must open a Skill command"
);
assert.equal(chatCommands.removeChatCommand("总结发布风险 $发布", skillCommand), "总结发布风险", "selecting a command must remove it from the visible draft");
const appCommand = chatCommands.activeChatCommand("/周报");
assert.equal(appCommand?.kind, "app", "the slash token must open an app command");
assert.equal(chatCommands.chatCommandMatches("周", "周报助手", "办公"), true);

assert.equal(
  workflowRuntime.renderWorkflowTemplate("任务：{{task}}\n输入：{{input}}", "发布检查", "上游结果"),
  "任务：发布检查\n输入：上游结果",
  "template nodes must replace only documented placeholders"
);
assert.equal(
  workflowRuntime.renderWorkflowTemplate("{{input}}", "", "x".repeat(20000)).length,
  12000,
  "template output must remain bounded after placeholder expansion"
);
const knowledgeResult = workflowRuntime.retrieveWorkflowKnowledge([
  {
    id: "release-doc",
    name: "发布手册",
    type: "text/plain",
    size: 24,
    text: "发布前验证回滚和监控。",
    chunks: [{ id: "release-doc-0", documentId: "release-doc", documentName: "发布手册", index: 0, text: "发布前验证回滚和监控。" }],
    createdAt: now,
    updatedAt: now
  }
], ["release-doc"], "发布前如何回滚", 4);
assert.match(knowledgeResult.text, /发布手册/);
assert.match(knowledgeResult.text, /回滚/);

const moduleRegistry = fs.readFileSync(path.join(rootDir, "src/app/moduleRegistry.tsx"), "utf8");
const publicOrder = moduleRegistry.match(/portalModuleOrder[\s\S]*?\];/)?.[0] || "";
assert.deepEqual(
  [...publicOrder.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
  ["chat", "image", "agents", "workflows", "ppt", "mindmap", "assistants", "translate"],
  "public menu order must match the exact Figma destinations"
);

const publicRoutes = fs.readFileSync(path.join(rootDir, "src/app/publicRoutes.ts"), "utf8");
assert.deepEqual(
  [...publicRoutes.matchAll(/\{\s*id:\s*"([^"]+)",\s*path:\s*"([^"]+)"\s*\}/g)]
    .map((match) => [match[1], match[2]]),
  [
    ["chat", "/chat"],
    ["image", "/image"],
    ["agents", "/agents"],
    ["workflows", "/workflows"],
    ["ppt", "/ppt"],
    ["mindmap", "/mindmap"],
    ["assistants", "/assistants"],
    ["translate", "/translate"]
  ],
  "public routes must match the exact Figma destinations"
);

const topBar = fs.readFileSync(path.join(rootDir, "src/app/TopBar.tsx"), "utf8");
const navigationBlock = topBar.match(/const navigationMeta[\s\S]*?\n};/)?.[0] || "";
assert.deepEqual(
  [...navigationBlock.matchAll(/^\s*(\w+):\s*\{\s*label:\s*"([^"]+)"/gm)]
    .map((match) => [match[1], match[2]]),
  [
    ["chat", "AI \u5bf9\u8bdd"],
    ["image", "\u56fe\u50cf\u751f\u6210"],
    ["agents", "\u667a\u80fd\u4f53"],
    ["workflows", "\u5de5\u4f5c\u6d41"],
    ["ppt", "AI \u4e00\u952e PPT"],
    ["mindmap", "\u601d\u7ef4\u5bfc\u56fe"],
    ["assistants", "\u52a9\u624b\u5e93"],
    ["translate", "\u7ffb\u8bd1"]
  ],
  "TopBar labels and order must match the exact Figma navigation"
);
assert(topBar.includes('navigation("figma-navigation")'), "TopBar must mount .figma-navigation");
assert(topBar.includes('className="figma-mobile-header"'), "TopBar must mount .figma-mobile-header");
assert(topBar.includes('"figma-sidebar mobile-open"'), "TopBar must expose the mobile .figma-sidebar state");
assert(!topBar.includes("onRequestApiConfig"), "public shell must not mount a persistent API button");

const chatModule = [
  "src/features/chat/ChatModule.tsx",
  "src/features/chat/ChatSessionBlock.tsx"
].map((relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8")).join("\n");
const chatSettingsDialog = fs.readFileSync(path.join(rootDir, "src/features/chat/ChatSessionSettingsDialog.tsx"), "utf8");
const studioModule = [
  "src/features/studio/StudioModule.tsx",
  "src/features/studio/studioShared.tsx",
  "src/features/studio/ImageStudio.tsx",
  "src/features/studio/PptStudio.tsx",
  "src/features/studio/MindmapStudio.tsx",
  "src/features/studio/AssistantsStudio.tsx",
  "src/features/studio/TranslateStudio.tsx"
].map((file) => fs.readFileSync(path.join(rootDir, file), "utf8")).join("\n");
const automationModule = [
  "src/features/automation/AutomationModule.tsx",
  "src/features/automation/automationShared.tsx",
  "src/features/automation/AgentsWorkspace.tsx",
  "src/features/automation/WorkflowsWorkspace.tsx"
].map((file) => fs.readFileSync(path.join(rootDir, file), "utf8")).join("\n");
const assistantLaunch = fs.readFileSync(path.join(rootDir, "src/features/assistants/assistantLaunch.ts"), "utf8");
for (const requiredClass of [
  "figma-workspace-heading",
  "figma-chat-session",
  "figma-session-header",
  "figma-message-history",
  "figma-composer"
]) {
  assert(chatModule.includes(requiredClass), `Chat must include ${requiredClass}`);
}
for (const exactCopy of [
  "AI \u5bf9\u8bdd\u5de5\u4f5c\u53f0",
  "\u7f51\u7edc\u641c\u7d22",
  "\u56fe\u7247\u8f93\u5165",
  "\u6e05\u9664\u6d88\u606f",
  "Shift + Enter"
]) {
  assert(chatModule.includes(exactCopy), `Chat must include exact Figma copy: ${exactCopy}`);
}
assert(chatModule.includes("commitConversations((current) => [conversation, ...current])"), "new Chat sessions must be added at the top");
assert(chatModule.includes("collapsed: true"), "new Chat sessions must fold older sessions");
assert(chatModule.includes("[conversation.id]: defaultSessionUi(false)"), "new Chat sessions must start expanded");
assert(chatModule.includes("ChatSkillManagerDialog"), "Chat must own the local Skill manager");
assert(chatSettingsDialog.includes("管理本地 Skill"), "Chat settings must retain local Skill management");
assert(!chatModule.includes('figma-heading-action-label">Skill'), "Chat heading must not promote Skill management");
assert(chatModule.includes("skillInstructions: selectedSkills.map"), "Chat must send resolved Skill instructions with its request");
assert(chatModule.includes("ChatCommandPalette"), "Chat must expose the inline command palette");
assert(chatModule.includes("activeChatCommand"), "Chat must resolve $ and / command tokens locally");
assert(chatModule.includes("selectedApp.prompt"), "Chat must compose the selected application prompt only for the outbound request");
assert(chatModule.includes("reasoningEffort: ui.reasoningEffort"), "Chat must send the shared reasoning effort value");
assert(chatModule.includes('className="figma-reasoning-menu"'), "Chat must expose the reasoning menu in the composer toolbar");
assert(chatModule.includes("figma-search-provider-menu"), "Chat must expose a vertical search-provider menu");
assert(chatModule.includes("searchServiceForUserProvider"), "Chat search must derive its request config from the active BYOK connection");
assert(!chatModule.includes("SearchServiceDialog"), "Chat must not expose a separate search-credential dialog");
assert(!chatModule.includes("figma-search-settings-action"), "Chat must not expose a separate search settings icon");
assert(chatModule.includes("ConfirmationDialog"), "Chat clear messages must use shared destructive confirmation");
assert(chatModule.includes("maxImageAttachments"), "Chat settings must own the session image limit");
assert(chatModule.includes("multiple"), "Chat image input must accept multiple files");
assert(chatModule.includes("figma-image-attachments"), "Chat must render all pending image attachments");
assert(chatModule.includes("consumeAssistantLaunch"), "Chat must consume the versioned assistant launch contract");
assert(chatModule.includes("conversation.assistantId && item.enabled !== false"), "Chat requests must resolve the exact enabled conversation assistant");
assert(chatModule.includes("figma-session-assistant"), "Chat sessions must expose their bound assistant identity");
assert(studioModule.includes("queueAssistantLaunch(selected.id, selectedStarterPrompt)"), "Assistant library must launch the exact selected assistant and optional visible starter");
assert(!studioModule.includes("assistantProfiles"), "Assistant library must not map decorative hard-coded profiles onto backend assistants");
assert(assistantLaunch.includes('ASSISTANT_LAUNCH_STORAGE_KEY = "xi-ai-web-assistant-launch"'), "Assistant launch must use the versioned session handoff key");
assert(assistantLaunch.includes("window.sessionStorage"), "Assistant launch must stay session-scoped");
assert(!assistantLaunch.includes("localStorage"), "Assistant launch must never persist to localStorage");
assert(automationModule.includes('aria-label="智能体目录"'), "Agents must open as a catalog before the editor");
assert(automationModule.includes('contextChunks'), "Agent knowledge selections must flow into the bounded request");
for (const retiredToken of ["conversation-rail", "thread-main", "composer-status-row", "mask-workflow"]) {
  assert(!chatModule.includes(retiredToken), `retired Chat token must stay absent: ${retiredToken}`);
}

const server = fs.readFileSync(path.join(rootDir, "server/index.mjs"), "utf8");
const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const mainTsx = fs.readFileSync(path.join(rootDir, "src/main.tsx"), "utf8");
assert.deepEqual(
  defaultMenuItems().map((item) => [item.id, item.label]),
  [
    ["chat", "AI \u5bf9\u8bdd"],
    ["image", "\u56fe\u50cf\u751f\u6210"],
    ["agents", "\u667a\u80fd\u4f53"],
    ["workflows", "\u5de5\u4f5c\u6d41"],
    ["ppt", "AI \u4e00\u952e PPT"],
    ["mindmap", "\u601d\u7ef4\u5bfc\u56fe"],
    ["assistants", "\u52a9\u624b\u5e93"],
    ["translate", "\u7ffb\u8bd1"]
  ],
  "server defaults must match the exact Figma navigation"
);
assert(server.includes("conversations: []"), "public bootstrap must keep conversations empty");
assert(server.includes("410"), "legacy public conversation routes must remain unavailable");
assert(!server.includes("/api/conversations/share"), "must not add public share route");
assert(server.includes("displayContent"), "chat stream must separate model content from displayed user content");
assert(server.includes("reasoningEffortAllowlist"), "server must normalize reasoning effort through an allowlist");
assert(server.includes("reasoningEffort"), "server must forward reasoning effort to provider adapters");
assert(server.includes("imageCount > 6") && server.includes("value.slice(0, 10)"), "server must retain the six-image hard limit while allowing bounded text attachments");
assert(indexHtml.includes("/manifest.webmanifest"), "PWA manifest must be linked");
assert(mainTsx.includes("serviceWorker.register"), "PWA service worker must be registered in production");
assert(fs.existsSync(path.join(rootDir, "public/sw.js")), "service worker file must exist");
assert(fs.existsSync(path.join(rootDir, "public/manifest.webmanifest")), "manifest file must exist");

console.log("Chat local contracts passed");
