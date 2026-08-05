import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import {
  expect,
  providerStorageKey,
  searchServiceStorageKey,
  readWorkspaceRecords,
  seedChatConversations,
  seedReadyProvider,
  seedReadySearchService,
  test,
  waitForPublicModule,
  publicDestinations,
  publicBootstrapFixture
} from "./support/app-fixture";

const now = "2026-07-20T12:00:00.000Z";

function workspaceEnvelope(title = "恢复后的对话") {
  const workspace = {
    conversations: [{
      id: "workspace-import-conversation",
      title,
      assistantId: "test-assistant",
      pinned: false,
      messageCount: 1,
      preview: "恢复消息",
      messages: [{ id: "workspace-import-message", role: "assistant", content: "恢复消息", status: "done", createdAt: now }],
      createdAt: now,
      updatedAt: now
    }],
    galleryItems: [],
    imageGenerationHistory: [],
    knowledgeDocuments: [],
    mediaJobs: [],
    userAgents: [],
    agentSkills: [],
    workflows: [],
    agentMemories: [],
    preferences: [{ key: "theme", value: "light", updatedAt: now }],
    backupRuns: []
  };
  const counts = Object.fromEntries(
    Object.entries(workspace).map(([key, value]) => [key, value.length])
  );
  return {
    schema: "xi-ai-web.workspace-export",
    version: 1,
    exportedAt: now,
    app: { name: "xi-ai-web", version: "0.1.0" },
    integrity: {
      algorithm: "SHA-256",
      digest: createHash("sha256").update(JSON.stringify(workspace)).digest("hex")
    },
    counts,
    workspace
  };
}

async function openWorkspaceDialog(page: Parameters<typeof readWorkspaceRecords>[0]) {
  await page.locator('button[aria-label="管理工作区数据"]:visible').click();
  const dialog = page.getByRole("dialog", { name: "工作区数据", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
});

test("temporary sync entry stays hidden when the administrator disables it", async ({ page, apiHarness }) => {
  const bootstrap = structuredClone(publicBootstrapFixture);
  bootstrap.settings.progressSync.enabled = false;
  apiHarness.setBootstrap(bootstrap);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  await expect(page.getByRole("button", { name: "跨设备同步", exact: true })).toHaveCount(0);
  const dialog = await openWorkspaceDialog(page);
  await expect(dialog.getByRole("heading", { name: "跨设备同步", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "导出工作区", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "关闭工作区数据", exact: true }).click();

  await page.goto("/image");
  await page.goto("/chat#sync=123456");
  await waitForPublicModule(page, publicDestinations[0]);
  await expect(page).toHaveURL(/\/chat$/u);
  await expect(page.getByRole("dialog", { name: "跨设备同步", exact: true })).toHaveCount(0);

  await page.goto("/chat#sync-send=123456");
  await waitForPublicModule(page, publicDestinations[0]);
  await expect(page).toHaveURL(/\/chat$/u);
  await expect(page.getByRole("dialog", { name: "跨设备同步", exact: true })).toHaveCount(0);
});

test("legacy conversations migrate and exported workspace excludes BYOK credentials", async ({ page }) => {
  await seedReadySearchService(page);
  await seedChatConversations(page);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  await expect(page.getByText("确定性历史消息。")).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("cherry-web-local-conversations"))).toBeNull();
  const migrated = await readWorkspaceRecords<Array<{ id: string }>[number]>(page, "conversations");
  expect(migrated.map((item) => item.id)).toContain("chat-e2e-existing");

  const dialog = await openWorkspaceDialog(page);
  await expect(dialog.getByText("IndexedDB 可用", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出工作区", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^xi-ai-web-workspace-.*\.xiworkspace\.json$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const serialized = await fs.readFile(path!, "utf8");
  const provider = await page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey);
  const searchService = await page.evaluate((key) => window.sessionStorage.getItem(key), searchServiceStorageKey);
  expect(provider).toContain("e2e-session-key");
  expect(searchService).toContain("e2e-search-session-key");
  expect(serialized).not.toContain("e2e-session-key");
  expect(serialized).not.toContain("e2e-search-session-key");
  expect(serialized).not.toContain("https://api.example.test/v1");
  expect(serialized).not.toContain("https://open.bigmodel.cn/api");
  expect(JSON.parse(serialized).counts.conversations).toBeGreaterThan(0);
});

test("validated replace import atomically restores the workspace", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const dialog = await openWorkspaceDialog(page);
  const envelope = workspaceEnvelope();
  await dialog.getByLabel("选择工作区文件", { exact: true }).setInputFiles({
    name: "restore.xiworkspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(envelope))
  });
  await expect(dialog.getByText("导入预览", { exact: true })).toBeVisible();
  await dialog.getByRole("radio", { name: /替换/ }).check();
  await dialog.getByRole("button", { name: "替换工作区", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "替换完整工作区？", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(page.locator('[data-scroll-owner="dialog"]:visible')).toHaveCount(1);
  await expect(page.locator(".workspace-data-dialog:visible")).toHaveCount(0);
  await confirmation.getByRole("button", { name: "确认替换", exact: true }).click();
  await page.waitForLoadState("domcontentloaded");
  await waitForPublicModule(page, publicDestinations[0]);

  await expect.poll(async () => {
    const conversations = await readWorkspaceRecords<Array<{ title: string }>[number]>(page, "conversations");
    return conversations.map((item) => item.title);
  }).toEqual(["恢复后的对话"]);
  await expect(page.getByText("恢复消息")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.studioTheme)).toBe("light");
  expect(await page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).toContain("e2e-session-key");
});

test("tampered workspace is rejected without changing existing data", async ({ page }) => {
  await seedChatConversations(page);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const dialog = await openWorkspaceDialog(page);
  const envelope = workspaceEnvelope("篡改数据");
  envelope.workspace.conversations[0].title = "摘要计算后被修改";
  await dialog.getByLabel("选择工作区文件", { exact: true }).setInputFiles({
    name: "tampered.xiworkspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(envelope))
  });
  await expect(dialog.getByRole("alert")).toContainText("完整性校验失败");
  const conversations = await readWorkspaceRecords<Array<{ id: string }>[number]>(page, "conversations");
  expect(conversations.map((item) => item.id)).toContain("chat-e2e-existing");
});
