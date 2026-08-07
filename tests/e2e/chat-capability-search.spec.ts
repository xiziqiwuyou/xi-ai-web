import {
  expect,
  publicBootstrapFixture,
  publicDestinations,
  seedChatConversations,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";
import type { Locator } from "@playwright/test";
import type { ModelCapability } from "../../src/types";

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedChatConversations(page);
});

async function openModelPicker(session: Locator) {
  await session.getByRole("button", { name: "选择对话模型", exact: true }).click();
}

async function chooseSearchProvider(
  session: Locator,
  provider: "智谱 GLM" | "Kimi" | "关闭联网搜索"
) {
  const trigger = session.getByRole("button", { name: "网络搜索", exact: true });
  await trigger.click();
  const list = session.getByRole("listbox", { name: "网络搜索", exact: true });
  await list.getByRole("option", { name: new RegExp(provider) }).click();
  return trigger;
}

test("Chat image input follows vision only and rejects a tampered non-vision file input", async ({ page, apiHarness }) => {
  const imageTaggedChat = {
    ...publicBootstrapFixture.modelCatalog.find((model) => model.id === "openai-fast")!,
    id: "image-tagged-chat",
    model: "image-tagged-chat",
    label: "Image Tagged Chat",
    capabilities: ["chat", "image", "imageEdit"] as ModelCapability[]
  };
  apiHarness.setBootstrap({
    ...structuredClone(publicBootstrapFixture),
    modelCatalog: [
      ...publicBootstrapFixture.modelCatalog,
      imageTaggedChat
    ]
  });

  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const session = page.locator(".figma-chat-session:not(.collapsed)");
  const imageButton = session.getByRole("button", { name: "图片输入", exact: true });
  const imageInput = session.locator('input[type="file"][multiple]');

  await expect(imageButton).toHaveAttribute("aria-disabled", "false");
  await expect(imageInput).toBeEnabled();

  await openModelPicker(session);
  await session.getByRole("option", { name: /Image Tagged Chat/ }).click();
  await expect(session.getByRole("button", { name: "选择对话模型", exact: true })).toContainText("Image Tagged Chat");
  await expect(imageButton).toHaveAttribute("aria-disabled", "true");
  await expect(imageInput).toBeDisabled();

  await imageButton.click({ force: true });
  await expect(session.getByRole("alert")).toContainText("当前模型不支持图片输入");

  await imageInput.evaluate((element) => element.removeAttribute("disabled"));
  await imageInput.setInputFiles({ name: "blocked.png", mimeType: "image/png", buffer: Buffer.from("blocked") });
  await expect(session.locator('[data-testid="chat-image-attachment"]')).toHaveCount(0);
  await expect(session.getByLabel("消息内容", { exact: true })).toBeEnabled();
});

test("switching to a non-vision model confirms before removing pending images", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const session = page.locator(".figma-chat-session:not(.collapsed)");
  const modelTrigger = session.getByRole("button", { name: "选择对话模型", exact: true });
  const imageInput = session.locator('input[type="file"][multiple]');

  await imageInput.setInputFiles({ name: "keep.png", mimeType: "image/png", buffer: Buffer.from("keep") });
  await expect(session.locator('[data-testid="chat-image-attachment"]')).toHaveCount(1);

  await openModelPicker(session);
  await session.getByRole("option", { name: /OpenAI Fast/ }).click();
  const confirmation = page.getByRole("alertdialog", { name: "切换到不支持图片的模型？", exact: true });
  await expect(confirmation).toContainText("1 张待发送图片");
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  await expect(modelTrigger).toContainText("Test Chat");
  await expect(session.locator('[data-testid="chat-image-attachment"]')).toHaveCount(1);

  await openModelPicker(session);
  await session.getByRole("option", { name: /OpenAI Fast/ }).click();
  await confirmation.getByRole("button", { name: "切换并移除图片", exact: true }).click();
  await expect(modelTrigger).toContainText("OpenAI Fast");
  await expect(session.locator('[data-testid="chat-image-attachment"]')).toHaveCount(0);
  await expect(session.getByRole("button", { name: "图片输入", exact: true })).toHaveAttribute("aria-disabled", "true");
});

test("a refreshed catalog keeps pending images visible but marks them incompatible", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  let activeSession = page.locator(".figma-chat-session:not(.collapsed)");
  await activeSession.locator('input[type="file"][multiple]').setInputFiles({
    name: "catalog-refresh.png",
    mimeType: "image/png",
    buffer: Buffer.from("catalog-refresh")
  });
  await expect(activeSession.locator('[data-testid="chat-image-attachment"]')).toHaveCount(1);

  apiHarness.setBootstrap({
    ...structuredClone(publicBootstrapFixture),
    modelCatalog: publicBootstrapFixture.modelCatalog.map((model) => model.id === "test-chat"
      ? { ...model, capabilities: model.capabilities.filter((capability) => capability !== "vision") }
      : model)
  });

  await page.locator('button[aria-label="新对话"]:visible').first().click();
  activeSession = page.locator(".figma-chat-session:not(.collapsed)");
  await activeSession.getByLabel("消息内容", { exact: true }).fill("刷新模型目录");
  await activeSession.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);

  const collapsedPreviousSession = page.locator(".figma-chat-session").filter({ hasText: "已有对话" });
  await collapsedPreviousSession.getByRole("button", { name: "点击展开", exact: true }).click();
  const previousSession = page.locator(".figma-chat-session:not(.collapsed)");
  await expect(previousSession.locator('[data-testid="chat-image-attachment"]')).toHaveCount(1);
  await expect(previousSession.getByRole("alert")).toContainText("需移除图片或更换模型");
  await expect(previousSession.getByRole("button", { name: "图片输入", exact: true })).toHaveAttribute("aria-disabled", "true");
  await previousSession.getByRole("button", { name: "移除图片", exact: true }).click();
  await expect(previousSession.locator('[data-testid="chat-image-attachment"]')).toHaveCount(0);
});

test("independent search is armed without a request and works with a Chat-only model", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const session = page.locator(".figma-chat-session:not(.collapsed)");

  await openModelPicker(session);
  await session.getByRole("option", { name: /OpenAI Fast/ }).click();
  const searchTrigger = await chooseSearchProvider(session, "智谱 GLM");
  await expect(searchTrigger).toContainText("网络搜索 · 智谱 GLM");
  expect(apiHarness.chatRequests).toHaveLength(0);

  await session.getByLabel("消息内容", { exact: true }).fill("搜索当前问题并回答");
  expect(apiHarness.chatRequests).toHaveLength(0);

  await page.route("**/api/chat/stream", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fallback();
  });
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(searchTrigger).toContainText("搜索中");
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0]).toMatchObject({
    modelId: "openai-fast",
    allowedTools: ["web_search"],
    searchService: { provider: "glm", apiKey: "e2e-session-key" }
  });

  await chooseSearchProvider(session, "关闭联网搜索");
  await session.getByLabel("消息内容", { exact: true }).fill("这次不进行联网搜索");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(2);
  expect(apiHarness.chatRequests[1].allowedTools).toEqual([]);
  expect(apiHarness.chatRequests[1].searchService).toBeUndefined();
});

test("search failure preserves the draft and provider for an explicit retry", async ({ page, apiHarness }) => {
  let rejectOnce = true;
  await page.route("**/api/chat/stream", async (route) => {
    if (rejectOnce) {
      rejectOnce = false;
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "SEARCH_RATE_LIMITED", message: "智谱 GLM 联网搜索请求过于频繁，请稍后重试" }
        })
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const session = page.locator(".figma-chat-session:not(.collapsed)");
  const searchTrigger = await chooseSearchProvider(session, "智谱 GLM");
  const composer = session.getByLabel("消息内容", { exact: true });
  await composer.fill("保留这段重试内容");
  await session.getByRole("button", { name: "发送", exact: true }).click();

  await expect(session.getByRole("alert")).toContainText("请求过于频繁");
  await expect(composer).toHaveValue("保留这段重试内容");
  await expect(searchTrigger).toContainText("搜索失败");
  expect(apiHarness.chatRequests).toHaveLength(0);

  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].searchService?.provider).toBe("glm");
});

test("attachment-only messages cannot trigger an armed search and refresh resets it", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  let session = page.locator(".figma-chat-session:not(.collapsed)");
  const searchTrigger = await chooseSearchProvider(session, "Kimi");
  await expect(searchTrigger).toContainText("网络搜索 · Kimi");
  expect(apiHarness.chatRequests).toHaveLength(0);

  await session.locator('input[type="file"][multiple]').setInputFiles({
    name: "attachment-only.png",
    mimeType: "image/png",
    buffer: Buffer.from("attachment-only")
  });
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(session.getByRole("alert")).toContainText("请先输入要搜索的问题");
  expect(apiHarness.chatRequests).toHaveLength(0);

  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  session = page.locator(".figma-chat-session:not(.collapsed)");
  await expect(session.getByRole("button", { name: "网络搜索", exact: true })).toHaveText(/网络搜索/);
  await expect(session.getByRole("button", { name: "网络搜索", exact: true })).not.toContainText("Kimi");
});
