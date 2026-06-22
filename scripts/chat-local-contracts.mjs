import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivePath = path.join(rootDir, "src/features/chat/conversationArchive.ts");
const maskPath = path.join(rootDir, "src/features/chat/maskWorkflow.ts");
const archiveSource = fs.readFileSync(archivePath, "utf8");
function importTsSource(source) {
  const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}
const archive = await importTsSource(archiveSource);
const masks = await importTsSource(fs.readFileSync(maskPath, "utf8"));

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

const moduleRegistry = fs.readFileSync(path.join(rootDir, "src/app/moduleRegistry.tsx"), "utf8");
const publicOrder = moduleRegistry.match(/portalModuleOrder[\s\S]*?\];/)?.[0] || "";
assert.deepEqual(
  [...publicOrder.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
  ["chat", "image", "mindmap", "agents", "apps", "gallery"],
  "public menu order must stay unchanged"
);

const server = fs.readFileSync(path.join(rootDir, "server/index.mjs"), "utf8");
const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const mainTsx = fs.readFileSync(path.join(rootDir, "src/main.tsx"), "utf8");
assert(server.includes("conversations: []"), "public bootstrap must keep conversations empty");
assert(server.includes("410"), "legacy public conversation routes must remain unavailable");
assert(!server.includes("/api/conversations/share"), "must not add public share route");
assert(server.includes("displayContent"), "chat stream must separate model content from displayed user content");
assert(indexHtml.includes("/manifest.webmanifest"), "PWA manifest must be linked");
assert(mainTsx.includes("serviceWorker.register"), "PWA service worker must be registered in production");
assert(fs.existsSync(path.join(rootDir, "public/sw.js")), "service worker file must exist");
assert(fs.existsSync(path.join(rootDir, "public/manifest.webmanifest")), "manifest file must exist");

console.log("Chat local contracts passed");
