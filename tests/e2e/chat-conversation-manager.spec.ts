import type { Conversation } from "../../src/types";
import {
  expect,
  isMobileProject,
  publicDestinations,
  readWorkspaceRecords,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";

const now = "2026-08-08T08:00:00.000Z";

const conversationFixtures: Conversation[] = [
  {
    id: "manager-parent",
    title: "发布计划",
    assistantId: "",
    pinned: true,
    messageCount: 2,
    preview: "整理发布步骤和回滚检查",
    messages: [
      {
        id: "manager-parent-user",
        role: "user",
        content: "请整理发布步骤和回滚检查",
        status: "done",
        createdAt: "2026-08-08T07:58:00.000Z"
      },
      {
        id: "manager-parent-assistant",
        role: "assistant",
        content: "先完成验证，再执行发布。",
        status: "done",
        createdAt: "2026-08-08T07:59:00.000Z"
      }
    ],
    createdAt: "2026-08-08T07:58:00.000Z",
    updatedAt: now
  },
  {
    id: "manager-branch",
    title: "发布计划 · 分支",
    assistantId: "",
    pinned: false,
    messageCount: 1,
    preview: "分支中的普通消息",
    messages: [{
      id: "manager-branch-user",
      role: "user",
      content: "分支中的普通消息",
      attachments: [{
        id: "manager-private-attachment",
        kind: "text",
        name: "private-needle.txt",
        mimeType: "text/plain",
        size: 14,
        text: "private needle"
      }],
      status: "done",
      createdAt: "2026-08-08T07:50:00.000Z"
    }],
    branch: {
      parentConversationId: "manager-parent",
      sourceMessageId: "manager-parent-assistant",
      mode: "continue"
    },
    createdAt: "2026-08-08T07:50:00.000Z",
    updatedAt: "2026-08-08T07:50:00.000Z"
  },
  {
    id: "manager-archived",
    title: "旧版会议记录",
    assistantId: "",
    pinned: false,
    messageCount: 1,
    preview: "已经归档的历史内容",
    messages: [{
      id: "manager-archived-user",
      role: "user",
      content: "已经归档的历史内容",
      status: "done",
      createdAt: "2026-08-01T08:00:00.000Z"
    }],
    archivedAt: "2026-08-02T08:00:00.000Z",
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z"
  }
];

async function seedConversationsOnce(page: Parameters<typeof seedReadyProvider>[0]) {
  await page.addInitScript((conversations) => {
    const marker = "xi-ai-web-manager-e2e-seeded";
    if (window.sessionStorage.getItem(marker)) return;
    window.localStorage.setItem("cherry-web-local-conversations", JSON.stringify(conversations));
    window.sessionStorage.setItem(marker, "1");
  }, structuredClone(conversationFixtures));
}

async function openConversationManager(page: Parameters<typeof seedReadyProvider>[0]) {
  await page.getByRole("button", { name: "管理会话", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "管理会话", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox", { name: "搜索会话", exact: true })).toBeFocused();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedConversationsOnce(page);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
});

test("local search stays request-free and the manager is stable across themes and viewports", async ({ page, apiHarness }, testInfo) => {
  const requestCount = apiHarness.requests.length;
  const chatRequestCount = apiHarness.chatRequests.length;
  const dialog = await openConversationManager(page);
  const search = dialog.getByRole("searchbox", { name: "搜索会话", exact: true });

  await search.fill("发布计划");
  await expect(dialog.locator('[data-conversation-manager-id="manager-parent"]')).toBeVisible();
  await expect(dialog.locator('[data-conversation-manager-id="manager-branch"]')).toBeVisible();
  await expect(dialog.locator('[data-conversation-manager-id="manager-archived"]')).toHaveCount(0);

  await search.fill("private needle");
  await expect(dialog.getByText("没有匹配的会话", { exact: true })).toBeVisible();

  await dialog.getByRole("tab", { name: /已归档/ }).click();
  await search.fill("历史内容");
  await expect(dialog.locator('[data-conversation-manager-id="manager-archived"]')).toBeVisible();
  expect(apiHarness.requests).toHaveLength(requestCount);
  expect(apiHarness.chatRequests).toHaveLength(chatRequestCount);

  await page.evaluate(() => {
    document.documentElement.dataset.studioTheme = "dark";
  });
  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      background: style.backgroundColor
    };
  });
  const viewport = page.viewportSize() || { width: 1440, height: 900 };
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(viewport.width);
  expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
  expect(geometry.background).not.toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator('[data-scroll-owner="dialog"]:visible')).toHaveCount(1);

  const controlHeights = await dialog.locator("button").evaluateAll((buttons) =>
    buttons.filter((button) => button.getClientRects().length > 0).map((button) => button.getBoundingClientRect().height)
  );
  const minimumTarget = isMobileProject(testInfo.project.name) ? 44 : 36;
  expect(controlHeights.every((height) => height >= minimumTarget)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("archive survives reload, keeps the branch independent, and restore opens the conversation on top", async ({ page, apiHarness }) => {
  let dialog = await openConversationManager(page);
  const parentRow = dialog.locator('[data-conversation-manager-id="manager-parent"]');
  const requestsBeforeArchive = apiHarness.requests.length;
  await parentRow.getByRole("button", { name: "归档会话 发布计划", exact: true }).click();
  await expect(parentRow).toHaveCount(0);
  expect(apiHarness.requests).toHaveLength(requestsBeforeArchive);

  await expect.poll(async () => {
    const records = await readWorkspaceRecords<Conversation>(page, "conversations");
    return records.find((conversation) => conversation.id === "manager-parent")?.archivedAt || "";
  }).toMatch(/Z$/u);
  let records = await readWorkspaceRecords<Conversation>(page, "conversations");
  expect(records.find((conversation) => conversation.id === "manager-parent")?.pinned).toBe(false);
  expect(records.find((conversation) => conversation.id === "manager-branch")?.archivedAt).toBeUndefined();
  await expect(page.locator('[data-conversation-id="manager-parent"]')).toHaveCount(0);

  await dialog.getByRole("button", { name: "关闭会话管理", exact: true }).click();
  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  await expect(page.locator('[data-conversation-id="manager-parent"]')).toHaveCount(0);

  dialog = await openConversationManager(page);
  await dialog.getByRole("tab", { name: /已归档/ }).click();
  const requestsBeforeRestore = apiHarness.requests.length;
  await dialog.locator('[data-conversation-manager-id="manager-parent"]')
    .getByRole("button", { name: "恢复会话 发布计划", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(apiHarness.requests).toHaveLength(requestsBeforeRestore);

  const sessions = page.locator(".figma-chat-session");
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "manager-parent");
  await expect(sessions.first()).not.toHaveClass(/collapsed/);
  await expect(page.locator('[data-conversation-id="manager-branch"]')).toHaveClass(/collapsed/);
  await expect.poll(async () => {
    const records = await readWorkspaceRecords<Conversation>(page, "conversations");
    return records.find((conversation) => conversation.id === "manager-parent")?.archivedAt;
  }).toBeUndefined();
  records = await readWorkspaceRecords<Conversation>(page, "conversations");
  expect(records.find((conversation) => conversation.id === "manager-branch")?.branch?.parentConversationId).toBe("manager-parent");
  expect(apiHarness.chatRequests).toHaveLength(0);
});

test("archiving every active conversation creates one neutral fallback", async ({ page, apiHarness }) => {
  const chatRequestCount = apiHarness.chatRequests.length;
  await page.evaluate(() => {
    window.sessionStorage.setItem("xi-ai-web-assistant-launch", JSON.stringify({
      version: 1,
      assistantId: "test-assistant",
      starterPrompt: "",
      requestedAt: new Date().toISOString()
    }));
    window.dispatchEvent(new Event("xi-ai-web:assistant-launch"));
  });
  await expect.poll(async () => {
    const records = await readWorkspaceRecords<Conversation>(page, "conversations");
    return records.filter((conversation) => !conversation.archivedAt).length;
  }).toBe(3);

  const dialog = await openConversationManager(page);
  await dialog.getByRole("button", { name: "归档会话 新对话", exact: true }).click();
  await dialog.locator('[data-conversation-manager-id="manager-parent"]')
    .getByRole("button", { name: "归档会话 发布计划", exact: true })
    .click();
  await dialog.locator('[data-conversation-manager-id="manager-branch"]')
    .getByRole("button", { name: "归档会话 发布计划 · 分支", exact: true })
    .click();

  await expect.poll(async () => {
    const records = await readWorkspaceRecords<Conversation>(page, "conversations");
    return records.filter((conversation) => !conversation.archivedAt).length;
  }).toBe(1);
  const records = await readWorkspaceRecords<Conversation>(page, "conversations");
  const fallback = records.find((conversation) => !conversation.archivedAt);
  expect(fallback?.assistantId).toBe("");
  expect(fallback?.messages).toEqual([]);
  await expect(dialog.getByRole("tab", { name: /活跃 1/ })).toBeVisible();
  await dialog.getByRole("button", { name: "关闭会话管理", exact: true }).click();
  await expect(page.locator(".figma-chat-session:not(.collapsed)")).toHaveCount(1);
  expect(apiHarness.chatRequests).toHaveLength(chatRequestCount);
});

test("streaming keeps search available but blocks open, archive, and handler bypass", async ({ page }) => {
  let releaseRequest: (() => void) | undefined;
  let requestCount = 0;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/chat/stream", async (route) => {
    requestCount += 1;
    await requestGate;
    await route.abort("aborted");
  });

  const session = page.locator('[data-conversation-id="manager-parent"]');
  await session.getByLabel("消息内容", { exact: true }).fill("保持请求进行中");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(session.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();

  const dialog = await openConversationManager(page);
  const search = dialog.getByRole("searchbox", { name: "搜索会话", exact: true });
  await search.fill("分支");
  const branchRow = dialog.locator('[data-conversation-manager-id="manager-branch"]');
  await expect(branchRow).toBeVisible();
  await expect(branchRow.getByRole("button", { name: "打开会话", exact: false })).toBeDisabled();
  const archiveButton = branchRow.getByRole("button", { name: "归档会话 发布计划 · 分支", exact: true });
  await expect(archiveButton).toBeDisabled();

  await archiveButton.evaluate((button) => {
    (button as HTMLButtonElement).disabled = false;
    (button as HTMLButtonElement).click();
  });
  const records = await readWorkspaceRecords<Conversation>(page, "conversations");
  expect(records.find((conversation) => conversation.id === "manager-branch")?.archivedAt).toBeUndefined();
  expect(requestCount).toBe(1);

  releaseRequest?.();
  await dialog.getByRole("button", { name: "关闭会话管理", exact: true }).click();
  await expect(session.locator(".figma-session-notice")).toBeVisible();
});
