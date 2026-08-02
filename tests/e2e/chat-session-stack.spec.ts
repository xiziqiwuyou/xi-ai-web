import type { Locator } from "@playwright/test";
import type { Conversation } from "../../src/types";
import {
  expect,
  readWorkspaceRecords,
  seedChatConversations,
  seedReadyProvider,
  test,
  waitForPublicModule,
  publicDestinations
} from "./support/app-fixture";

async function chooseMenuOption(container: Locator, label: string, option: string) {
  await container.getByRole("button", { name: label, exact: true }).click();
  const menu = container.getByRole("listbox", { name: label, exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: option, exact: true }).click();
}

function conversation(id: string, title: string, updatedAt: string, messageCount: number): Conversation {
  return {
    id,
    title,
    assistantId: "test-assistant",
    pinned: false,
    messageCount,
    preview: `${title} preview`,
    messages: Array.from({ length: messageCount }, (_, index) => ({
      id: `${id}-message-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `${title} 消息 ${index + 1}`,
      status: "done",
      createdAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`
    })),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt
  };
}

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedChatConversations(page, [
    conversation("recent-chat", "最近使用对话", "2026-01-02T00:00:00.000Z", 6),
    conversation("older-chat", "较早对话", "2026-01-01T00:00:00.000Z", 5)
  ]);
});

test("Chat sessions support pinning, expanded-first ordering, and model-generated collapsed titles", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const sessions = page.locator(".figma-chat-session");
  const recent = page.locator('[data-conversation-id="recent-chat"]');
  const older = page.locator('[data-conversation-id="older-chat"]');
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "recent-chat");

  await older.getByRole("button", { name: "置顶对话", exact: true }).click();
  await expect(older).toHaveAttribute("data-pinned", "true");
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "recent-chat");
  await expect.poll(async () => {
    const records = await readWorkspaceRecords<Conversation>(page, "conversations");
    return records.find((item) => item.id === "older-chat")?.pinned;
  }).toBe(true);

  await page.getByRole("button", { name: "会话设置", exact: true }).first().click();
  const settings = page.getByRole("dialog", { name: "会话设置", exact: true });
  await settings.getByRole("tab", { name: "模型设置", exact: true }).click();
  await expect(settings.getByRole("button", { name: "最大 Token 数", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(settings.getByRole("button", { name: "自动总结折叠标题", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(settings.getByRole("button", { name: "标题总结模型", exact: true })).toContainText("gpt-5.4-mini");
  await expect(settings.getByRole("slider", { name: "总结引用消息", exact: true })).toHaveAttribute("aria-valuetext", "最近 4 条");
  await chooseMenuOption(settings, "标题总结模型", "Test Chat");
  await settings.getByRole("button", { name: "保存设置", exact: true }).click();

  await recent.getByRole("button", { name: "点击折叠", exact: true }).click();
  await expect.poll(() => apiHarness.chatTitleRequests.length).toBe(1);
  expect(apiHarness.chatTitleRequests[0]).toMatchObject({
    modelId: "test-chat",
    connection: {
      apiKey: "e2e-session-key"
    }
  });
  expect(apiHarness.chatTitleRequests[0].history.map((message) => message.id)).toEqual([
    "recent-chat-message-3",
    "recent-chat-message-4",
    "recent-chat-message-5",
    "recent-chat-message-6"
  ]);
  await expect(recent.locator(".figma-session-preview strong")).toHaveText("自动总结标题");
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "older-chat");
  const collapsedTypography = await recent.evaluate((element) => {
    const model = element.querySelector<HTMLElement>(".figma-model-trigger");
    const assistant = element.querySelector<HTMLElement>(".figma-session-assistant");
    const toggle = element.querySelector<HTMLElement>(".figma-session-toggle");
    const title = element.querySelector<HTMLElement>(".figma-session-preview strong");
    const preview = element.querySelector<HTMLElement>(".figma-session-preview small");
    const readTypography = (target: HTMLElement) => {
      const style = getComputedStyle(target);
      return {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        lineHeight: style.lineHeight
      };
    };
    return {
      bodyFamily: getComputedStyle(document.body).fontFamily,
      model: readTypography(model!),
      assistant: readTypography(assistant!),
      toggle: readTypography(toggle!),
      title: readTypography(title!),
      preview: readTypography(preview!)
    };
  });
  expect(collapsedTypography.model).toEqual({
    family: collapsedTypography.bodyFamily,
    size: "13px",
    weight: "700",
    lineHeight: "17px"
  });
  expect(collapsedTypography.assistant).toEqual({
    family: collapsedTypography.bodyFamily,
    size: "11px",
    weight: "600",
    lineHeight: "16px"
  });
  expect(collapsedTypography.toggle).toEqual(collapsedTypography.assistant);
  expect(collapsedTypography.title).toEqual({
    family: collapsedTypography.bodyFamily,
    size: "14px",
    weight: "700",
    lineHeight: "20px"
  });
  expect(collapsedTypography.preview).toEqual({
    family: collapsedTypography.bodyFamily,
    size: "12px",
    weight: "400",
    lineHeight: "18px"
  });

  await recent.getByRole("button", { name: "点击展开", exact: true }).click();
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "recent-chat");
  await recent.getByRole("button", { name: "点击折叠", exact: true }).click();
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "older-chat");

  await older.getByRole("button", { name: "取消置顶对话", exact: true }).click();
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "recent-chat");

  await recent.getByRole("button", { name: "点击展开", exact: true }).click();
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "recent-chat");
  await older.getByRole("button", { name: "点击展开", exact: true }).click();
  await expect(recent).toHaveClass(/collapsed/);
  await expect(older).not.toHaveClass(/collapsed/);
  await expect(page.locator(".figma-chat-session:not(.collapsed)")).toHaveCount(1);
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "older-chat");
  await older.getByRole("button", { name: "点击折叠", exact: true }).click();
  await expect(sessions.first()).toHaveAttribute("data-conversation-id", "recent-chat");
});
