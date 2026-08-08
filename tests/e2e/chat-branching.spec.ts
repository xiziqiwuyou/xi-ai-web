import type { Conversation } from "../../src/types";
import {
  expect,
  isMobileProject,
  publicDestinations,
  readWorkspaceRecords,
  seedChatConversations,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";

const sourceConversation: Conversation = {
  id: "branch-source",
  title: "分支来源对话",
  assistantId: "test-assistant",
  pinned: true,
  messageCount: 4,
  preview: "第二个回答",
  messages: [
    {
      id: "branch-user-1",
      role: "user",
      content: "第一个问题",
      status: "done",
      createdAt: "2026-08-08T00:00:00.000Z"
    },
    {
      id: "branch-assistant-1",
      role: "assistant",
      content: "第一个回答",
      status: "done",
      createdAt: "2026-08-08T00:00:01.000Z"
    },
    {
      id: "branch-user-2",
      role: "user",
      content: "第二个问题",
      attachments: [{
        id: "branch-note",
        kind: "text",
        name: "branch-note.txt",
        mimeType: "text/plain",
        size: 12,
        text: "branch note"
      }],
      status: "done",
      createdAt: "2026-08-08T00:00:02.000Z"
    },
    {
      id: "branch-assistant-2",
      role: "assistant",
      content: "第二个回答",
      status: "done",
      createdAt: "2026-08-08T00:00:03.000Z"
    }
  ],
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:03.000Z"
};

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedChatConversations(page, [structuredClone(sourceConversation)]);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
});

test("user messages copy and edit into one immutable top branch", async ({ page, apiHarness, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const sourceSession = page.locator('[data-conversation-id="branch-source"]');
  const sourceMessage = sourceSession.locator('[data-message-id="branch-user-1"]');
  if (!isMobileProject(testInfo.project.name)) await sourceMessage.hover();

  await sourceMessage.getByRole("button", { name: "复制消息", exact: true }).click();
  await expect(sourceMessage.getByRole("button", { name: "消息已复制", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(sourceConversation.messages[0].content);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    document.execCommand = (command) => {
      const active = document.activeElement;
      (window as Window & { __branchFallbackCopy?: string }).__branchFallbackCopy =
        active instanceof HTMLTextAreaElement ? active.value : "";
      return command === "copy";
    };
  });
  await sourceMessage.locator(".figma-message-actions > button").first().click();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __branchFallbackCopy?: string }).__branchFallbackCopy
  )).toBe(sourceConversation.messages[0].content);

  await sourceMessage.getByRole("button", { name: "编辑并分支", exact: true }).click();
  let editor = sourceMessage.getByRole("textbox", { name: "编辑消息内容", exact: true });
  await expect(editor).toBeFocused();
  await page.evaluate(() => {
    document.documentElement.dataset.studioTheme = "dark";
  });
  const editorGeometry = await editor.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      borderColors: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
      left: box.left,
      right: box.right
    };
  });
  expect(new Set(editorGeometry.borderWidths)).toEqual(new Set(["1px"]));
  expect(new Set(editorGeometry.borderColors).size).toBe(1);
  expect(editorGeometry.left).toBeGreaterThanOrEqual(0);
  expect(editorGeometry.right).toBeLessThanOrEqual(page.viewportSize()?.width || 1440);
  const editorButtonHeights = await sourceMessage.locator(".figma-message-editor button").evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().height)
  );
  const minimumEditorTarget = isMobileProject(testInfo.project.name) ? 44 : 36;
  expect(editorButtonHeights.every((height) => height >= minimumEditorTarget)).toBe(true);
  await editor.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(sourceMessage.getByRole("button", { name: "编辑并分支", exact: true })).toBeFocused();

  await sourceMessage.getByRole("button", { name: "编辑并分支", exact: true }).click();
  editor = sourceMessage.getByRole("textbox", { name: "编辑消息内容", exact: true });
  await editor.fill("修改后的第一个问题");
  await sourceMessage.getByRole("button", { name: "创建分支并发送", exact: true }).click();

  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].displayContent).toBe("修改后的第一个问题");
  expect(apiHarness.chatRequests[0].history).toEqual([]);

  await expect.poll(async () => (await readWorkspaceRecords<Conversation>(page, "conversations")).length).toBe(2);
  const records = await readWorkspaceRecords<Conversation>(page, "conversations");
  const parent = records.find((conversation) => conversation.id === sourceConversation.id);
  const branch = records.find((conversation) => conversation.branch?.mode === "edit");
  expect(parent?.messages).toEqual(sourceConversation.messages);
  expect(parent?.pinned).toBe(true);
  expect(branch?.branch).toMatchObject({
    parentConversationId: sourceConversation.id,
    sourceMessageId: "branch-user-1",
    mode: "edit"
  });
  expect(branch?.pinned).toBe(false);
  expect(branch?.messages.map((message) => message.content)).toEqual([
    "修改后的第一个问题",
    "Deterministic assistant response."
  ]);

  const sessions = page.locator(".figma-chat-session");
  await expect(sessions.first()).toHaveAttribute("data-branch-mode", "edit");
  await expect(sessions.first()).not.toHaveClass(/collapsed/);
  await expect(sourceSession).toHaveClass(/collapsed/);
});

test("assistant retry replays its user turn once while continue branches without a request", async ({ page, apiHarness }) => {
  const sourceSession = page.locator('[data-conversation-id="branch-source"]');
  await sourceSession.locator('[data-message-id="branch-assistant-2"]')
    .getByRole("button", { name: "在新分支重新生成", exact: true })
    .click();

  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].displayContent).toBe("第二个问题");
  expect(apiHarness.chatRequests[0].history?.map((message) => message.id)).toEqual([
    "branch-user-1",
    "branch-assistant-1"
  ]);
  expect(apiHarness.chatRequests[0].attachments?.map((attachment) => attachment.id)).toContain("branch-note");

  let records = await readWorkspaceRecords<Conversation>(page, "conversations");
  const retryBranch = records.find((conversation) => conversation.branch?.mode === "retry");
  expect(retryBranch?.branch?.sourceMessageId).toBe("branch-assistant-2");
  expect(records.find((conversation) => conversation.id === sourceConversation.id)?.messages).toEqual(sourceConversation.messages);

  const retrySession = page.locator(`[data-conversation-id="${retryBranch?.id}"]`);
  await retrySession.locator('[data-message-id="branch-assistant-1"]')
    .getByRole("button", { name: "从此消息创建分支", exact: true })
    .click();
  await page.waitForTimeout(50);
  expect(apiHarness.chatRequests).toHaveLength(1);

  await expect.poll(async () => (await readWorkspaceRecords<Conversation>(page, "conversations")).length).toBe(3);
  records = await readWorkspaceRecords<Conversation>(page, "conversations");
  const continueBranch = records.find((conversation) => conversation.branch?.mode === "continue");
  expect(continueBranch?.messages.map((message) => message.id)).toEqual([
    "branch-user-1",
    "branch-assistant-1"
  ]);
  expect(continueBranch?.branch?.parentConversationId).toBe(retryBranch?.id);
  await expect(page.locator(".figma-chat-session").first()).toHaveAttribute("data-branch-mode", "continue");
});

test("failed automatic branch send keeps the branch draft and attachments recoverable", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/chat/stream", async (route) => {
    requestCount += 1;
    await route.abort("failed");
  });

  const sourceSession = page.locator('[data-conversation-id="branch-source"]');
  await sourceSession.locator('[data-message-id="branch-assistant-2"]')
    .getByRole("button", { name: "在新分支重新生成", exact: true })
    .click();

  const branchSession = page.locator('[data-branch-mode="retry"]').first();
  await expect(branchSession).toBeVisible();
  await expect(branchSession.getByLabel("消息内容", { exact: true })).toHaveValue(sourceConversation.messages[2].content);
  await expect(branchSession.getByTestId("chat-image-attachment")).toContainText("branch-note.txt");
  await expect(branchSession.locator(".figma-session-notice")).toBeVisible();
  expect(requestCount).toBe(1);

  const records = await readWorkspaceRecords<Conversation>(page, "conversations");
  expect(records.find((conversation) => conversation.id === sourceConversation.id)?.messages).toEqual(sourceConversation.messages);
});

test("streaming locks branch mutations and mobile actions remain contained", async ({ page }, testInfo) => {
  let releaseRequest: (() => void) | undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/chat/stream", async (route) => {
    await requestGate;
    await route.abort("aborted");
  });

  const session = page.locator('[data-conversation-id="branch-source"]');
  await session.getByLabel("消息内容", { exact: true }).fill("保持请求进行中");
  await page.evaluate(() => {
    const sessionElement = document.querySelector<HTMLElement>('[data-conversation-id="branch-source"]');
    sessionElement?.querySelector<HTMLButtonElement>('button[aria-label="发送"]')?.click();
    sessionElement
      ?.querySelector<HTMLButtonElement>('[data-message-id="branch-user-1"] button[aria-label="从此消息创建分支"]')
      ?.click();
  });
  await expect(session.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await expect.poll(async () => (await readWorkspaceRecords<Conversation>(page, "conversations")).length).toBe(1);

  await expect(session.getByRole("button", { name: "编辑并分支", exact: true }).first()).toBeDisabled();
  await expect(session.getByRole("button", { name: "在新分支重新生成", exact: true }).first()).toBeDisabled();
  await expect(session.getByRole("button", { name: "从此消息创建分支", exact: true }).first()).toBeDisabled();

  const buttonBoxes = await session.locator(".figma-message-actions > button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { width: box.width, left: box.left, right: box.right };
    })
  );
  const viewportWidth = page.viewportSize()?.width || 390;
  const minimumTarget = isMobileProject(testInfo.project.name) ? 44 : 36;
  expect(buttonBoxes.every((box) =>
    box.width >= minimumTarget && box.left >= 0 && box.right <= viewportWidth
  )).toBe(true);

  releaseRequest?.();
  await expect(session.locator(".figma-session-notice")).toBeVisible();
});
