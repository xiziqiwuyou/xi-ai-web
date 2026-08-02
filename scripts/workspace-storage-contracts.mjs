import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

async function importTsSource(source) {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}

const archiveSource = readProjectFile("src/features/workspace/workspaceArchive.ts");
const databaseSource = readProjectFile("src/features/workspace/workspaceDb.ts");
const migrationSource = readProjectFile("src/features/workspace/workspaceMigration.ts");
const repositorySource = readProjectFile("src/features/workspace/workspaceRepository.ts");
const dialogSource = readProjectFile("src/features/workspace/WorkspaceDataDialog.tsx");
const topBarSource = readProjectFile("src/app/TopBar.tsx");
const searchServiceSource = readProjectFile("src/features/settings/searchServiceConfig.ts");
const archive = await importTsSource(archiveSource);

const now = "2026-07-20T12:00:00.000Z";
const snapshot = {
  ...archive.emptyWorkspaceSnapshot(),
  conversations: [{
    id: "conversation-1",
    title: "工作区测试",
    assistantId: "assistant-1",
    pinned: false,
    messageCount: 1,
    preview: "hello",
    messages: [{ id: "message-1", role: "user", content: "hello", createdAt: now }],
    createdAt: now,
    updatedAt: now
  }],
  userAgents: [{
    id: "agent-1",
    name: "研究助手",
    systemPrompt: "保持准确",
    requiredCapabilities: ["chat", "toolCalling"],
    skillIds: ["skill-1"],
    allowedTools: ["knowledge_search"],
    knowledgeDocumentIds: [],
    createdAt: now,
    updatedAt: now
  }],
  agentSkills: [{
    id: "skill-1",
    name: "资料分析",
    instructions: "分析输入资料",
    allowedTools: ["knowledge_search"],
    requiredCapabilities: ["chat"],
    createdAt: now,
    updatedAt: now
  }],
  workflows: [{
    id: "workflow-1",
    name: "研究工作流",
    steps: [{
      id: "workflow-step-1",
      name: "分析资料",
      instruction: "先分析资料，再输出结论",
      agentId: "agent-1",
      skillIds: ["skill-1"],
      usePreviousOutput: false
    }],
    graph: {
      version: 1,
      nodes: [
        { id: "workflow-start", kind: "start", name: "开始", position: { x: 40, y: 120 } },
        { id: "workflow-step-1", kind: "agent", name: "分析资料", instruction: "先分析资料，再输出结论", agentId: "agent-1", skillIds: ["skill-1"], position: { x: 320, y: 120 } },
        { id: "workflow-reply", kind: "reply", name: "输出结果", position: { x: 600, y: 120 } }
      ],
      edges: [
        { id: "workflow-start->workflow-step-1", source: "workflow-start", target: "workflow-step-1" },
        { id: "workflow-step-1->workflow-reply", source: "workflow-step-1", target: "workflow-reply" }
      ],
      viewport: { x: -24, y: 18, zoom: 0.86 }
    },
    createdAt: now,
    updatedAt: now
  }],
  preferences: [{ key: "theme", value: "dark", updatedAt: now }]
};

const envelope = await archive.createWorkspaceExport(snapshot, now);
assert.equal(envelope.schema, "xi-ai-web.workspace-export");
assert.equal(envelope.version, 1);
assert.equal(envelope.counts.conversations, 1);
assert.equal(envelope.counts.userAgents, 1);
assert.equal(envelope.counts.agentSkills, 1);
assert.equal(envelope.counts.workflows, 1);
assert.deepEqual(envelope.workspace.workflows[0].graph?.viewport, { x: -24, y: 18, zoom: 0.86 });
assert.match(envelope.integrity.digest, /^[a-f0-9]{64}$/);
assert.deepEqual(await archive.previewWorkspaceImportPayload(envelope), envelope);

const presetWorkflow = archive.sanitizeWorkspaceWorkflow({
  id: "workflow-preset-nodes",
  name: "本地资料整理",
  steps: [],
  graph: {
    version: 1,
    nodes: [
      { id: "start", kind: "start", name: "开始", position: { x: 0, y: 0 } },
      { id: "template", kind: "template", name: "整理输入", template: "任务：{{task}}\n{{input}}", position: { x: 220, y: 0 } },
      { id: "knowledge", kind: "knowledge", name: "本地资料", knowledgeDocumentIds: ["document-1"], maxKnowledgeChunks: 6, position: { x: 440, y: 0 } },
      { id: "reply", kind: "reply", name: "结果", position: { x: 660, y: 0 } }
    ],
    edges: [
      { id: "start-template", source: "start", target: "template", sourceHandle: "output", targetHandle: "input" },
      { id: "template-knowledge", source: "template", target: "knowledge", sourceHandle: "output", targetHandle: "input" },
      { id: "knowledge-reply", source: "knowledge", target: "reply", sourceHandle: "output", targetHandle: "input" }
    ]
  },
  createdAt: now,
  updatedAt: now
});
assert.equal(presetWorkflow?.graph?.nodes[1]?.kind, "template");
assert.deepEqual(presetWorkflow?.graph?.nodes[2]?.knowledgeDocumentIds, ["document-1"]);
assert.equal(presetWorkflow?.graph?.edges[0]?.sourceHandle, "output");

const secretBait = {
  baseUrl: "https://secret.example.test/v1",
  apiKey: "sk-workspace-secret",
  adminPassword: "admin-secret"
};
assert(!JSON.stringify(envelope).includes(secretBait.baseUrl));
assert(!JSON.stringify(envelope).includes(secretBait.apiKey));
assert(!JSON.stringify(envelope).includes(secretBait.adminPassword));
assert(!archiveSource.includes("userProviderConfig"), "workspace archive must not import BYOK storage");
assert(!repositorySource.includes("userProviderConfig"), "workspace repository must not import BYOK storage");
assert(!archiveSource.includes("searchServiceConfig"), "workspace archive must not import search credentials");
assert(!repositorySource.includes("searchServiceConfig"), "workspace repository must not import search credentials");
assert(searchServiceSource.includes("window.sessionStorage"), "search credentials must use sessionStorage");
assert(!searchServiceSource.includes("window.localStorage"), "search credentials must not use localStorage");

const tampered = structuredClone(envelope);
tampered.workspace.conversations[0].title = "被篡改";
await assert.rejects(
  archive.previewWorkspaceImportPayload(tampered),
  /完整性校验失败/
);

const future = { ...envelope, version: 2 };
await assert.rejects(
  archive.previewWorkspaceImportPayload(future),
  /未来版本/
);

const duplicateWorkspace = structuredClone(snapshot);
duplicateWorkspace.conversations.push(structuredClone(duplicateWorkspace.conversations[0]));
const duplicateEnvelope = {
  ...envelope,
  workspace: duplicateWorkspace,
  counts: archive.workspaceDataCounts(duplicateWorkspace),
  integrity: {
    algorithm: "SHA-256",
    digest: await archive.workspaceDigest(duplicateWorkspace)
  }
};
await assert.rejects(
  archive.previewWorkspaceImportPayload(duplicateEnvelope),
  /重复记录/
);

const olderLocal = structuredClone(snapshot);
olderLocal.conversations[0].title = "本地旧标题";
olderLocal.conversations[0].updatedAt = "2026-07-19T12:00:00.000Z";
const merged = archive.mergeWorkspaceSnapshots(olderLocal, snapshot);
assert.equal(merged.conversations[0].title, "工作区测试");

for (const storeName of [
  "conversations",
  "galleryItems",
  "imageGenerationHistory",
  "knowledgeDocuments",
  "mediaJobs",
  "userAgents",
  "agentSkills",
  "workflows",
  "agentMemories",
  "preferences",
  "backupRuns"
]) {
  assert(databaseSource.includes(`"${storeName}"`), `workspace database missing ${storeName}`);
}
assert(databaseSource.includes('workspaceDbName = "xi-ai-web-workspace"'));
assert(databaseSource.includes("workspaceDbVersion = 3"));
assert(databaseSource.includes("replaceWorkspaceSnapshot"));
assert(databaseSource.includes("commitLegacyWorkspaceMigration"));
assert(databaseSource.includes("suspendWorkspaceWrites"));
assert(databaseSource.includes("waitForWorkspaceWrites"));
assert(migrationSource.includes("legacyMigrationV1"));
assert(migrationSource.indexOf("commitLegacyWorkspaceMigration") < migrationSource.indexOf("removeLegacyLocalStorage()"));
assert(dialogSource.includes("previewWorkspaceImport"));
assert(dialogSource.includes('value="merge"'));
assert(dialogSource.includes('value="replace"'));
assert(topBarSource.includes('aria-label="管理工作区数据"'));
assert(!topBarSource.includes("onRequestApiConfig"));

console.log("Workspace storage contracts passed");
