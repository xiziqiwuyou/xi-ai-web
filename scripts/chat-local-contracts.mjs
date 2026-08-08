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
const clientIdUrl = moduleUrlFromSource(
  fs.readFileSync(path.join(rootDir, "src/utils/clientId.ts"), "utf8")
);
const artifactWorkspaceUrl = moduleUrlFromSource(
  fs.readFileSync(path.join(rootDir, "src/features/chat/artifactWorkspace.ts"), "utf8"),
  { "../../utils/clientId": clientIdUrl }
);
const workspaceArchiveUrl = moduleUrlFromSource(
  fs.readFileSync(path.join(rootDir, "src/features/workspace/workspaceArchive.ts"), "utf8"),
  {
    "../chat/artifactWorkspace": artifactWorkspaceUrl
  }
);
const workspaceArchive = await import(workspaceArchiveUrl);
const archive = await importTsSource(archiveSource, {
  "../workspace/workspaceArchive": workspaceArchiveUrl
});
const retrievalUrl = moduleUrlFromSource(
  fs.readFileSync(path.join(rootDir, "src/features/chat/conversationRetrieval.ts"), "utf8"),
  { "../workspace/workspaceArchive": workspaceArchiveUrl }
);
const retrieval = await import(retrievalUrl);
const branchHistory = await importTsSource(
  fs.readFileSync(path.join(rootDir, "src/features/chat/conversationBranchHistory.ts"), "utf8"),
  { "./conversationRetrieval": retrievalUrl }
);
const artifacts = await import(artifactWorkspaceUrl);
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
const chatSessionSettings = await importTsSource(
  fs.readFileSync(path.join(rootDir, "src/features/chat/chatSessionSettings.ts"), "utf8")
);
const chatCapabilities = await importTsSource(
  fs.readFileSync(path.join(rootDir, "src/features/chat/chatCapabilities.ts"), "utf8")
);
const workflowRuntime = await importTsSource(
  fs.readFileSync(path.join(rootDir, "src/features/automation/workflowRuntime.ts"), "utf8")
);

const now = "2026-06-13T13:50:00.000Z";
assert.equal(chatSessionSettings.defaultChatSessionSettings.messageFontSize, 13, "new Chat sessions must default to 13px message text");
assert.equal(chatSessionSettings.sanitizeChatSessionSettings({ messageFontSize: 18 }).messageFontSize, 18, "saved valid Chat message sizes must be preserved");
assert.equal(chatSessionSettings.sanitizeChatSessionSettings({ messageFontSize: 12 }).messageFontSize, 13, "invalid saved Chat message sizes must fall back to the current default");
assert.equal(chatCapabilities.supportsChatImageInput({ capabilities: ["chat", "vision"] }), true, "vision must enable Chat image input");
assert.equal(chatCapabilities.supportsChatImageInput({ capabilities: ["chat", "image", "imageEdit"] }), false, "image generation/edit capabilities must not enable Chat image input");
const budgetMessages = Array.from({ length: 6 }, (_, index) => ({
  id: `budget-${index}`,
  role: index % 2 ? "assistant" : "user",
  content: String(index).repeat(1600),
  createdAt: "2026-01-01T00:00:00.000Z"
}));
const budgetSettings = {
  contextSize: "4",
  contextMessageCount: null,
  maxTokensEnabled: false,
  maxTokens: 16_384
};
assert.equal(
  chatSessionSettings.selectChatHistory(budgetMessages, budgetSettings, 2_048).length,
  2,
  "disabled manual output limits must reserve the selected model output ceiling"
);
assert.equal(
  chatSessionSettings.selectChatHistory(budgetMessages, { ...budgetSettings, maxTokensEnabled: true, maxTokens: 512 }, 2_048).length,
  3,
  "enabled manual output limits must reserve the lower session value"
);
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

assert.equal(
  retrieval.normalizeConversationQuery(`  ${"A".repeat(260)}  `),
  "a".repeat(240),
  "conversation queries must trim, normalize Latin case, and stay bounded"
);
const retrievalFixtures = [
  {
    ...structuredClone(conversation),
    id: "title-match",
    title: "Release PLAN",
    preview: "unrelated preview",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    ...structuredClone(conversation),
    id: "preview-match",
    title: "Preview record",
    preview: "release plan overview",
    updatedAt: "2026-02-01T00:00:00.000Z"
  },
  {
    ...structuredClone(conversation),
    id: "body-match-newer",
    title: "Body record newer",
    preview: "unrelated",
    messages: [{ id: "body-new", role: "user", content: "release plan body", createdAt: now }],
    updatedAt: "2026-04-01T00:00:00.000Z"
  },
  {
    ...structuredClone(conversation),
    id: "body-match-older",
    title: "Body record older",
    preview: "unrelated",
    messages: [{ id: "body-old", role: "assistant", content: "release plan notes", createdAt: now }],
    updatedAt: "2026-03-01T00:00:00.000Z"
  },
  {
    ...structuredClone(conversation),
    id: "cjk-match",
    title: "中文检索",
    preview: "无关预览",
    messages: [{ id: "cjk", role: "user", content: "请整理发布计划和回滚步骤", createdAt: now }]
  },
  {
    ...structuredClone(conversation),
    id: "attachment-only",
    title: "Attachment privacy",
    preview: "safe preview",
    messages: [{
      id: "attachment-only-message",
      role: "user",
      content: "ordinary persisted content",
      attachments: [{
        id: "private-attachment",
        kind: "text",
        name: "private-needle.txt",
        mimeType: "text/plain",
        size: 14,
        text: "private needle"
      }],
      createdAt: now
    }]
  }
];
assert.deepEqual(
  retrieval.searchConversations(retrievalFixtures, "RELEASE PLAN").map((result) => result.id),
  ["title-match", "preview-match", "body-match-newer", "body-match-older"],
  "title, preview, and body matches must rank in that order with recency breaking ties"
);
assert.deepEqual(
  retrieval.searchConversations(retrievalFixtures, "发布计划").map((result) => result.id),
  ["cjk-match"],
  "contiguous Chinese text must remain searchable"
);
assert.equal(
  retrieval.searchConversations(retrievalFixtures, "private needle").length,
  0,
  "attachment names and text must not enter local conversation search"
);
const projectedResult = retrieval.searchConversations(retrievalFixtures, "release plan")[0];
assert(!("messages" in projectedResult), "search results must not expose message bodies");
assert(!JSON.stringify(projectedResult).includes("private needle"), "search result projections must exclude attachment data");
const cappedResults = retrieval.searchConversations(
  Array.from({ length: 60 }, (_, index) => ({
    ...structuredClone(conversation),
    id: `bounded-${index}`,
    title: `bounded match ${index}`,
    updatedAt: new Date(Date.parse(now) + index * 1000).toISOString()
  })),
  "bounded match"
);
assert.equal(cappedResults.length, 50, "conversation search must cap displayed results at 50");
assert.equal(retrieval.searchConversations(retrievalFixtures, "release plan", 2).length, 2);

const archivedAt = "2026-06-14T08:00:00.000Z";
const restoredAt = "2026-06-15T09:30:00.000Z";
const archiveSourceConversation = {
  ...structuredClone(conversation),
  pinned: true,
  branch: {
    parentConversationId: "parent-thread",
    sourceMessageId: "parent-message",
    mode: "continue"
  }
};
const archiveSourceBefore = structuredClone(archiveSourceConversation);
const archivedConversation = retrieval.archiveConversation(archiveSourceConversation, archivedAt);
assert.deepEqual(archiveSourceConversation, archiveSourceBefore, "archiving must not mutate the source conversation");
assert.equal(archivedConversation.archivedAt, archivedAt);
assert.equal(archivedConversation.pinned, false);
assert.deepEqual(archivedConversation.branch, archiveSourceConversation.branch, "archive must preserve branch provenance");
assert.deepEqual(archivedConversation.messages, archiveSourceConversation.messages, "archive must preserve persisted messages");
const independentBranch = { ...structuredClone(archiveSourceConversation), id: "independent-branch" };
assert.equal(retrieval.archiveConversation(archiveSourceConversation, archivedAt).id, archiveSourceConversation.id);
assert.equal(independentBranch.archivedAt, undefined, "archiving a parent must not cascade to a child branch");
assert.deepEqual(retrieval.activeConversations([archiveSourceConversation, archivedConversation]), [archiveSourceConversation]);
assert.deepEqual(retrieval.archivedConversations([archiveSourceConversation, archivedConversation]), [archivedConversation]);
const restoredConversation = retrieval.restoreConversation(archivedConversation, restoredAt);
assert.equal(restoredConversation.archivedAt, undefined);
assert.equal(restoredConversation.pinned, false);
assert.equal(restoredConversation.updatedAt, restoredAt);
assert.equal(archivedConversation.archivedAt, archivedAt, "restoring must not mutate the archived source");

const branchRoot = {
  ...structuredClone(conversation),
  id: "branch-root",
  title: "Branch root",
  preview: "root preview"
};
const branchChild = {
  ...structuredClone(conversation),
  id: "branch-child",
  title: "Branch child",
  preview: "child preview",
  branch: {
    parentConversationId: branchRoot.id,
    sourceMessageId: "m2",
    mode: "edit"
  }
};
const archivedSibling = {
  ...structuredClone(conversation),
  id: "branch-archived",
  title: "Archived sibling",
  preview: "archived preview",
  archivedAt,
  branch: {
    parentConversationId: branchRoot.id,
    sourceMessageId: "m2",
    mode: "retry"
  }
};
const nestedBranch = {
  ...structuredClone(conversation),
  id: "branch-nested",
  title: "Nested needle",
  preview: "nested preview",
  branch: {
    parentConversationId: branchChild.id,
    sourceMessageId: "m3",
    mode: "continue"
  }
};
nestedBranch.messages = [{
  id: "nested-message",
  role: "user",
  content: "ordinary nested content",
  attachments: [{
    id: "nested-private",
    kind: "text",
    name: "private-lineage.txt",
    mimeType: "text/plain",
    size: 15,
    text: "private lineage"
  }],
  createdAt: now
}];
const orphanBranch = {
  ...structuredClone(conversation),
  id: "branch-orphan",
  title: "Orphan branch",
  branch: {
    parentConversationId: "missing-parent",
    sourceMessageId: "missing-message",
    mode: "continue"
  }
};
const cycleFirst = {
  ...structuredClone(conversation),
  id: "cycle-first",
  title: "Cycle first",
  branch: {
    parentConversationId: "cycle-second",
    sourceMessageId: "cycle-message-1",
    mode: "continue"
  }
};
const cycleSecond = {
  ...structuredClone(conversation),
  id: "cycle-second",
  title: "Cycle second",
  branch: {
    parentConversationId: "cycle-first",
    sourceMessageId: "cycle-message-2",
    mode: "edit"
  }
};
const neutralConversation = {
  ...structuredClone(conversation),
  id: "branch-neutral",
  title: "Neutral conversation"
};
const branchFixtures = [
  branchRoot,
  branchChild,
  archivedSibling,
  nestedBranch,
  orphanBranch,
  cycleFirst,
  cycleSecond,
  neutralConversation,
  { ...structuredClone(branchRoot), title: "Duplicate root" }
];
const branchFixturesBefore = JSON.stringify(branchFixtures);
const branchProjection = branchHistory.buildConversationBranchHistory(branchFixtures);
assert.equal(JSON.stringify(branchFixtures), branchFixturesBefore, "branch history projection must not mutate input");
assert.deepEqual(
  branchProjection.families.map((family) => family.id),
  ["branch-root", "branch-orphan", "cycle-second"],
  "neutral and duplicate records must not create branch families"
);
assert.equal(branchProjection.families[0].nodeCount, 4);
assert.equal(branchProjection.families[0].hasArchived, true);
assert.deepEqual(
  branchProjection.families[0].root.children.map((node) => node.conversation.id),
  ["branch-child", "branch-archived"],
  "siblings must retain the current conversation order"
);
assert.equal(branchProjection.families[0].root.children[0].children[0].conversation.id, "branch-nested");
assert.equal(branchProjection.families[1].root.status, "orphan");
assert.equal(branchProjection.families[2].root.status, "invalid");
assert.equal(branchProjection.families[2].root.children[0].conversation.id, "cycle-first");

const filteredBranchProjection = branchHistory.filterConversationBranchHistory(branchProjection, "nested needle");
assert.deepEqual(
  filteredBranchProjection.families[0].root.children.map((node) => node.conversation.id),
  ["branch-child"],
  "branch search must remove unrelated siblings"
);
assert.equal(
  filteredBranchProjection.families[0].root.children[0].children[0].conversation.id,
  "branch-nested",
  "branch search must retain every matching descendant ancestor"
);
assert.equal(
  branchHistory.filterConversationBranchHistory(branchProjection, "private lineage").families.length,
  0,
  "branch search must not inspect attachment text"
);

const deepBranches = [branchRoot];
let deepParentId = branchRoot.id;
for (let index = 0; index < branchHistory.conversationBranchHistoryLimits.maxDepth + 3; index += 1) {
  const id = `deep-branch-${index}`;
  deepBranches.push({
    ...structuredClone(conversation),
    id,
    title: id,
    branch: {
      parentConversationId: deepParentId,
      sourceMessageId: `deep-message-${index}`,
      mode: "continue"
    }
  });
  deepParentId = id;
}
const deepProjection = branchHistory.buildConversationBranchHistory(deepBranches);
assert.equal(deepProjection.truncated, true, "deep branch histories must report bounded truncation");
assert.equal(
  deepProjection.families[0].nodeCount,
  branchHistory.conversationBranchHistoryLimits.maxDepth + 1,
  "branch traversal must stop at the configured depth"
);

const artifactHtml = artifacts.createArtifact({
  title: "安全页面",
  kind: "html",
  language: "html",
  content: '<script>fetch("https://example.com")</script><div onclick="alert(1)">hello</div>',
  sourceConversationId: "conversation-1",
  sourceMessageId: "message-1"
}, { id: "artifact-1", versionId: "artifact-version-1", now });
assert.equal(artifactHtml.currentVersion, 1);
assert.equal(artifacts.currentArtifactVersion(artifactHtml).kind, "html");
assert.equal(artifacts.currentArtifactVersion(artifactHtml).sourceConversationId, "conversation-1");
assert(!artifacts.sanitizeArtifactHtml(artifacts.currentArtifactVersion(artifactHtml).content).includes("<script"), "artifact HTML must remove scripts");
assert(!artifacts.sanitizeArtifactHtml(artifacts.currentArtifactVersion(artifactHtml).content).includes("onclick"), "artifact HTML must remove inline handlers");
assert(!artifacts.artifactPreviewDocument(artifacts.currentArtifactVersion(artifactHtml).content).includes("https://example.com"), "artifact preview must remove external resource URLs");
assert(!artifacts.sanitizeArtifactHtml("<script>alert('blocked')").includes("<script"), "artifact HTML must remove unclosed scripts");
const artifactBeforeVersion = structuredClone(artifactHtml);
const artifactWithVersion = artifacts.appendArtifactVersion(artifactHtml, {
  title: "安全页面",
  kind: "markdown",
  language: "markdown",
  content: "# 新版本"
}, { versionId: "artifact-version-2", now: restoredAt });
assert.deepEqual(artifactHtml, artifactBeforeVersion, "adding an artifact version must not mutate the source");
assert.equal(artifactWithVersion.currentVersion, 2);
assert.equal(artifacts.currentArtifactVersion(artifactWithVersion).kind, "markdown");
assert.equal(artifacts.sanitizeArtifact({
  ...artifactWithVersion,
  versions: [
    ...artifactWithVersion.versions,
    { ...artifactWithVersion.versions[0], id: "duplicate-version", version: 1 }
  ]
}).versions.length, 2, "duplicate artifact versions must be normalized");
assert.equal(artifacts.sanitizeArtifact({
  ...artifactWithVersion,
  versions: [
    ...artifactWithVersion.versions,
    { ...artifactWithVersion.versions[1], version: 3 }
  ]
}).versions.length, 2, "duplicate artifact version IDs must be normalized");
assert.throws(
  () => artifacts.createArtifact({ kind: "text", content: "" }, { id: "empty-artifact" }),
  /作品内容不能为空/u,
  "empty artifacts must not be persisted"
);
let boundedArtifact = artifactHtml;
for (let index = 0; index < 24; index += 1) {
  boundedArtifact = artifacts.appendArtifactVersion(boundedArtifact, {
    title: "有界作品",
    kind: "code",
    language: "javascript",
    content: `version ${index}`
  }, { versionId: `artifact-version-${index + 3}`, now: restoredAt });
}
assert.equal(boundedArtifact.versions.length, artifacts.artifactMaxVersions, "artifact versions must be bounded");
assert.equal(artifacts.currentArtifactVersion(boundedArtifact).content, "version 23");
const artifactDownload = artifacts.artifactDownloadDetails(artifactWithVersion);
assert.equal(artifactDownload.filename, "安全页面-v2.md");
assert.equal(artifactDownload.mime, "text/markdown;charset=utf-8");

const envelope = archive.createConversationExport([conversation], [
  archive.createConversationSummaryArtifact(conversation)
]);
assert.equal(envelope.schema, archive.conversationExportSchema);
assert.equal(envelope.version, archive.conversationExportVersion);
assert.equal(envelope.conversations.length, 1);

const archivedEnvelope = archive.createConversationExport([archivedConversation]);
assert.equal(archivedEnvelope.conversations[0].archivedAt, archivedAt);
assert.equal(archivedEnvelope.conversations[0].pinned, false);
assert.equal(archive.previewConversationImport(archivedEnvelope).valid[0].archivedAt, archivedAt);

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

const chatModuleSource = fs.readFileSync(path.join(rootDir, "src/features/chat/ChatModule.tsx"), "utf8");
const tokenBranchStart = chatModuleSource.indexOf('if (event.type === "token")');
const tokenBranchEnd = chatModuleSource.indexOf('if (event.type === "error")', tokenBranchStart);
const tokenBranch = chatModuleSource.slice(tokenBranchStart, tokenBranchEnd);
assert(tokenBranch.includes("stream.content += event.token"), "Chat token events must accumulate in memory");
assert(tokenBranch.includes("scheduleStreamingRender()"), "Chat token events must schedule frame rendering");
assert(tokenBranch.includes("scheduleStreamingPersistence()"), "Chat token events must throttle persistence");
assert(tokenBranch.includes("setTokenRequestPhase(conversationId)"), "Chat token events must preserve an explicit buffered delivery phase");
assert(!tokenBranch.includes("commitConversations("), "Chat token events must not persist every fragment");
assert(chatModuleSource.includes("requestAnimationFrame(() =>"), "Chat streaming UI must batch React rendering by frame");
assert(chatModuleSource.includes("STREAMING_PERSIST_INTERVAL_MS = 300"), "Chat streaming persistence cadence must stay bounded");
assert(chatModuleSource.includes("renderStreamingConversation(true)"), "Chat failure handling must persist the final buffered text");
assert(chatModuleSource.includes('event.deliveryMode === "buffered" ? "buffering" : "generating"'), "Chat meta events must expose native versus buffered delivery");
assert(chatModuleSource.includes("streamOutput: chatSettings.streamOutput"), "Chat requests must send the saved stream preference to the server");
assert(chatModuleSource.includes("createConversationBranchSeed"), "Chat must create branches through the pure branch seed helper");
assert(chatModuleSource.includes("messageActionsDisabled={Boolean(streamingConversationId)}"), "Chat must lock branch actions while any response streams");
assert(chatModuleSource.includes("requestInFlightConversationIdRef.current"), "Chat branch handlers must share a synchronous request lock");
assert(chatModuleSource.includes("await sendMessage(seed.conversation, branchUi, selectedModel)"), "edit/retry branches must use the existing send pipeline");
const sessionBlockSource = fs.readFileSync(path.join(rootDir, "src/features/chat/ChatSessionBlock.tsx"), "utf8");
for (const actionLabel of ["复制消息", "编辑并分支", "在新分支重新生成", "从此消息创建分支"]) {
  assert(sessionBlockSource.includes(actionLabel), `Chat message action missing: ${actionLabel}`);
}
assert(sessionBlockSource.includes("创建分支并发送"), "inline message editing must expose an explicit send action");

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

const branchSource = structuredClone(conversation);
branchSource.messages[2].attachments = [{
  id: "branch-image",
  kind: "image",
  name: "branch.png",
  mimeType: "image/png",
  size: 4,
  dataUrl: "data:image/png;base64,AAAA"
}];
const sourceBeforeBranch = JSON.stringify(branchSource);
const continueSeed = archive.createConversationBranchSeed(branchSource, "m2", "continue", {
  branchId: "branch-continue",
  now
});
assert.equal(continueSeed.conversation.messages.at(-1).id, "m2");
assert.equal(continueSeed.conversation.branch.mode, "continue");
assert.equal(continueSeed.conversation.branch.parentConversationId, conversation.id);
assert.equal(continueSeed.draft, "");

const editSeed = archive.createConversationBranchSeed(branchSource, "m3", "edit", {
  branchId: "branch-edit",
  editedContent: "edited plan",
  now
});
assert.equal(editSeed.conversation.messages.length, 2);
assert.equal(editSeed.draft, "edited plan");
assert.equal(editSeed.attachments[0].id, "branch-image");
assert.equal(editSeed.conversation.branch.sourceMessageId, "m3");

const retrySeed = archive.createConversationBranchSeed(branchSource, "m4", "retry", {
  branchId: "branch-retry",
  now
});
assert.equal(retrySeed.conversation.messages.length, 2);
assert.equal(retrySeed.draft, "draft a plan");
assert.equal(retrySeed.attachments[0].id, "branch-image");
assert.equal(retrySeed.conversation.branch.mode, "retry");
continueSeed.conversation.messages[0].content = "branch-only mutation";
editSeed.attachments[0].name = "branch-only.png";
assert.equal(branchSource.messages[0].content, "hello", "branch history must not retain source message references");
assert.equal(branchSource.messages[2].attachments[0].name, "branch.png", "staged attachments must be cloned");
assert.equal(JSON.stringify(branchSource), sourceBeforeBranch, "branch creation must not mutate the source conversation");
assert.equal(archive.createConversationBranchSeed(branchSource, "m4", "edit", {
  branchId: "invalid-mode",
  editedContent: "no"
}), null);
assert.equal(archive.createConversationBranchSeed(branchSource, "missing", "continue", {
  branchId: "invalid-message"
}), null);
assert.equal(archive.createConversationBranchSeed(branchSource, "m2", "continue", {
  branchId: "x".repeat(121)
}), null, "oversized branch IDs must be rejected instead of truncated");

const sanitizedBranch = workspaceArchive.sanitizeWorkspaceConversation({
  ...continueSeed.conversation,
  branch: {
    parentConversationId: conversation.id,
    sourceMessageId: "m2",
    mode: "continue"
  }
});
assert.equal(sanitizedBranch.branch.mode, "continue");
assert.equal(workspaceArchive.sanitizeWorkspaceConversation({
  ...continueSeed.conversation,
  branch: {
    parentConversationId: continueSeed.conversation.id,
    sourceMessageId: "m2",
    mode: "continue"
  }
}).branch, undefined, "self-referential branch metadata must be removed");
assert.equal(workspaceArchive.sanitizeWorkspaceConversation({
  ...continueSeed.conversation,
  branch: {
    parentConversationId: "p".repeat(121),
    sourceMessageId: "m2",
    mode: "continue"
  }
}).branch, undefined, "oversized branch metadata must be removed instead of truncated");
const sanitizedArchivedConversation = workspaceArchive.sanitizeWorkspaceConversation({
  ...continueSeed.conversation,
  pinned: true,
  archivedAt
});
assert.equal(sanitizedArchivedConversation.archivedAt, archivedAt);
assert.equal(sanitizedArchivedConversation.pinned, false, "archived conversations must remain unpinned at the storage boundary");
for (const invalidArchivedAt of [
  "2026-06-14T16:00:00+08:00",
  " 2026-06-14T08:00:00.000Z ",
  "2026-02-30T08:00:00.000Z",
  "x".repeat(81)
]) {
  const sanitized = workspaceArchive.sanitizeWorkspaceConversation({
    ...continueSeed.conversation,
    archivedAt: invalidArchivedAt
  });
  assert(sanitized, "invalid optional archive metadata must not drop the containing conversation");
  assert.equal(sanitized.archivedAt, undefined, "archive metadata must be strict canonical ISO");
}
assert.equal(archive.sanitizeConversation({
  ...archivedConversation,
  archivedAt: "2026-06-14T16:00:00+08:00"
}).archivedAt, undefined, "conversation imports must drop malformed archive metadata only");
assert.equal(archive.sanitizeConversation({
  ...continueSeed.conversation,
  assistantId: ""
}).assistantId, "", "neutral conversations remain exportable");

const localConversationStoreSource = fs.readFileSync(
  path.join(rootDir, "src/features/chat/localConversationStore.ts"),
  "utf8"
);
assert(
  localConversationStoreSource.includes("activeConversations(conversations)"),
  "public conversation summaries must omit archived local records"
);

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
const localConversationStore = fs.readFileSync(path.join(rootDir, "src/features/chat/localConversationStore.ts"), "utf8");
const types = fs.readFileSync(path.join(rootDir, "src/types.ts"), "utf8");
const studioModule = [
  "src/features/studio/StudioModule.tsx",
  "src/features/studio/studioShared.tsx",
  "src/features/studio/ImageStudio.tsx",
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
assert(chatModule.includes("你好，今天想从哪里开始？可以直接提问、整理资料，或一起完成一项具体任务。"), "empty Chat sessions must keep the single welcome message");
assert(!chatModule.includes("帮我梳理一份关于生成式 AI 在企业落地的简短介绍。"), "empty Chat sessions must not render a sample user question");
assert(!chatModule.includes("生成式 AI 正在成为企业的创造力基础设施"), "empty Chat sessions must not render a sample assistant answer");
assert(localConversationStore.includes('assistantId: assistant?.id || ""'), "ordinary local Chat conversations must use the neutral empty Assistant binding");
assert(!chatModule.includes("defaultAssistantId") && chatModule.includes('assistantId: assistant?.id || ""'), "ordinary Chat requests must not fall back to the first Assistant");
assert(chatModule.includes("collapsed: true"), "new Chat sessions must fold older sessions");
assert(chatModule.includes("[conversation.id]: defaultSessionUi(false)"), "new Chat sessions must start expanded");
assert(!chatModule.includes("ChatSkillManagerDialog"), "Chat must keep the local Skill manager out of Session Settings");
assert(!chatSettingsDialog.includes("管理本地 Skill") && !chatSettingsDialog.includes('id: "skills"'), "Chat settings must keep Skill controls hidden");
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
assert(chatModule.includes("supportsChatImageInput"), "Chat image entry and send paths must share the vision capability predicate");
assert(chatModule.includes('disabled={streaming || !imageInputEnabled}'), "the hidden Chat image input must be disabled for non-vision models");
assert(chatModule.includes("setPendingModelChange"), "switching away from a vision model with pending images must require confirmation");
assert(chatModule.includes("启用联网搜索时，请先输入要搜索的问题"), "attachment-only messages must not trigger independent search");
assert(chatModule.includes('setRequestPhase(conversation.id, ui.searchProvider ? "searching" : "generating")'), "Chat must distinguish independent search from model generation");
assert(!chatModule.includes("inferredSearchProvider"), "Chat must not infer an independent search provider from the selected model");
assert(chatModule.includes("当前 Skill 需要联网搜索，请先选择智谱 GLM 或 Kimi"), "Skills must not bypass explicit independent-search provider selection");
assert(chatModule.includes("consumeAssistantLaunch"), "Chat must consume the versioned assistant launch contract");
assert(chatModule.includes("conversation.assistantId && item.enabled !== false"), "Chat requests must resolve the exact enabled conversation assistant");
assert(chatModule.includes("figma-session-assistant"), "Chat sessions must expose their bound assistant identity");
assert(studioModule.includes("queueAssistantLaunch(selected.id, selectedStarterPrompt)"), "Assistant library must launch the exact selected assistant and optional visible starter");
assert(!studioModule.includes("assistantProfiles"), "Assistant library must not map decorative hard-coded profiles onto backend assistants");
assert(types.includes("export type MindmapDocument") && types.includes("mindmap?: MindmapDocument"), "Mind Map generation results must expose the shared document contract");
assert(studioModule.includes("function MindmapTreeCanvas(") && studioModule.includes("layoutMindmapDocument(document, collapsedNodeIds)"), "Mind Map must render the normalized tree through MindmapTreeCanvas");
assert(
  studioModule.includes('runAiOperation("generate")')
    && studioModule.includes('runAiOperation("expand")')
    && studioModule.includes('runAiOperation("reorganize")')
    && studioModule.includes('currentDocument: operation === "generate" ? undefined : mindmap'),
  "Mind Map AI actions must use real generate, expand, and reorganize requests"
);
for (const mindmapExport of [
  "mindmapDocumentToMarkdown",
  "mindmapDocumentToMermaid",
  "mindmapDocumentToSvg",
  "mindmapDocumentToPngBlob",
  "copyMindmapText"
]) {
  assert(studioModule.includes(mindmapExport), `Mind Map current-document export is missing ${mindmapExport}`);
}
assert(!studioModule.includes("activeBranchId") && !studioModule.includes("branchSource") && !studioModule.includes("figma-map-branch"), "Mind Map must not restore decorative branch-card behavior");
assert(assistantLaunch.includes('ASSISTANT_LAUNCH_STORAGE_KEY = "xi-ai-web-assistant-launch"'), "Assistant launch must use the versioned session handoff key");
assert(assistantLaunch.includes("window.sessionStorage"), "Assistant launch must stay session-scoped");
assert(!assistantLaunch.includes("localStorage"), "Assistant launch must never persist to localStorage");
assert(automationModule.includes('aria-label="智能体目录"'), "Agents must open as a catalog before the editor");
assert(automationModule.includes('contextChunks'), "Agent knowledge selections must flow into the bounded request");
for (const retiredToken of ["conversation-rail", "thread-main", "composer-status-row", "mask-workflow"]) {
  assert(!chatModule.includes(retiredToken), `retired Chat token must stay absent: ${retiredToken}`);
}

const server = fs.readFileSync(path.join(rootDir, "server/index.mjs"), "utf8");
assert(server.includes("getOptionalAssistant") && server.includes("assistant?.systemPrompt"), "the Chat server must allow a request without an Assistant prompt");
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
assert(server.includes('if (module === "mindmap")') && server.includes("mindmapGenerationMessages") && server.includes("mergeMindmapExpansion") && server.includes('if (module === "translate")'), "server must keep structured Mind Map operations separate from Translation");
assert(server.includes("imageCount > 6") && server.includes("value.slice(0, 10)"), "server must retain the six-image hard limit while allowing bounded text attachments");
assert(indexHtml.includes("/manifest.webmanifest"), "PWA manifest must be linked");
assert(mainTsx.includes("serviceWorker.register"), "PWA service worker must be registered in production");
assert(fs.existsSync(path.join(rootDir, "public/sw.js")), "service worker file must exist");
assert(fs.existsSync(path.join(rootDir, "public/manifest.webmanifest")), "manifest file must exist");

console.log("Chat local contracts passed");
