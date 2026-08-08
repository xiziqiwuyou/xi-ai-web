import type { Conversation } from "../../src/types";
import { readFile } from "node:fs/promises";
import {
  documentOverflow,
  expect,
  isMobileProject,
  publicDestinations,
  readWorkspaceRecords,
  seedChatConversations,
  seedReadyProvider,
  test,
  visibleScrollOwners,
  waitForPublicModule
} from "./support/app-fixture";

const artifactConversation: Conversation = {
  id: "artifact-e2e-conversation",
  title: "作品测试对话",
  assistantId: "",
  pinned: false,
  messageCount: 1,
  preview: "保存一个本地作品",
  messages: [{
    id: "artifact-e2e-message",
    role: "assistant",
    content: [
      "下面是一个应该被安全预览的作品：",
      "",
      "```html",
      "<!doctype html><html><body><h1>本地作品</h1><script>window.__artifactScript = true</script><img src=\"https://tracking.example.test/pixel\"><p>不会访问网络</p></body></html>",
      "```"
    ].join("\n"),
    status: "done",
    createdAt: "2026-08-08T00:00:00.000Z"
  }],
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z"
};

type ArtifactRecordFixture = {
  id: string;
  title: string;
  currentVersion: number;
  versions: Array<{
    version: number;
    kind: string;
    content: string;
    sourceConversationId?: string;
    sourceMessageId?: string;
  }>;
};

async function openArtifactWorkspace(page: Parameters<typeof waitForPublicModule>[0]) {
  const trigger = page.locator('button[aria-label="作品空间"]:visible').first();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "作品空间", exact: true });
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedChatConversations(page, [structuredClone(artifactConversation)]);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  await expect.poll(async () => {
    const conversations = await readWorkspaceRecords<{ id: string }>(page, "conversations");
    return conversations.some((conversation) => conversation.id === artifactConversation.id);
  }).toBe(true);
});

test("Chat saves a fenced HTML block to the local artifact workspace and exports it", async ({ page, apiHarness }, testInfo) => {
  const session = page.locator(`[data-conversation-id="${artifactConversation.id}"]`);
  await expect(session).toBeVisible();
  const requestsBeforeArtifactActions = apiHarness.requests.length;
  const externalRequests: string[] = [];
  const requestListener = (request: { url: () => string }) => {
    const url = request.url();
    if (url.includes("tracking.example.test") || url.includes("api.example.test")) externalRequests.push(url);
  };
  page.on("request", requestListener);
  await session.getByRole("button", { name: "保存为作品", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "作品空间", exact: true });
  const title = dialog.getByLabel("作品名称", { exact: true });
  await expect(title).toBeFocused();
  await title.fill("安全 HTML 卡片");
  await expect(dialog.locator(".figma-artifact-content-field textarea")).toHaveValue(/本地作品/u);

  await dialog.getByRole("button", { name: "保存作品", exact: true }).click();
  await expect(dialog.getByText("作品已保存到当前浏览器", { exact: true })).toBeVisible();

  const records = await readWorkspaceRecords<ArtifactRecordFixture>(page, "artifacts");
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    title: "安全 HTML 卡片",
    currentVersion: 1
  });
  expect(records[0].versions[0]).toMatchObject({
    version: 1,
    kind: "html",
    sourceConversationId: artifactConversation.id,
    sourceMessageId: "artifact-e2e-message"
  });
  expect(records[0].versions[0].content).toContain("本地作品");
  expect(records[0].versions[0].content).not.toContain("<script");
  expect(records[0].versions[0].content).not.toContain("tracking.example.test");

  const preview = dialog.locator("iframe[title='作品 HTML 安全预览']");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("sandbox", "");
  const previewSource = await preview.getAttribute("srcdoc");
  expect(previewSource).toContain("default-src 'none'");
  expect(previewSource).toContain("本地作品");
  expect(previewSource).not.toContain("<script");
  expect(previewSource).not.toContain("tracking.example.test");
  await expect(preview.contentFrame().getByText("不会访问网络", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出当前版本", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("安全-HTML-卡片-v1.html");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const downloaded = await readFile(downloadPath!, "utf8");
  expect(downloaded).toContain("本地作品");
  expect(downloaded).not.toContain("<script");

  expect(apiHarness.chatRequests).toHaveLength(0);
  expect(apiHarness.requests.slice(requestsBeforeArtifactActions)).toEqual([]);
  expect(apiHarness.unexpectedRequests).toEqual([]);
  expect(externalRequests).toEqual([]);

  const owners = await visibleScrollOwners(page);
  expect(owners).toHaveLength(1);
  expect(owners[0].className).toContain("figma-artifact-dialog");
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);

  await page.evaluate(() => {
    document.documentElement.dataset.studioTheme = "dark";
  });
  const darkTheme = await dialog.evaluate((element) => {
    const surface = getComputedStyle(element);
    const field = getComputedStyle(element.querySelector("input")!);
    return {
      surfaceColor: surface.color,
      surfaceBackground: surface.backgroundColor,
      fieldColor: field.color,
      fieldBackground: field.backgroundColor,
      fieldBorderWidths: [field.borderTopWidth, field.borderRightWidth, field.borderBottomWidth, field.borderLeftWidth]
    };
  });
  expect(darkTheme.surfaceColor).not.toBe(darkTheme.surfaceBackground);
  expect(darkTheme.fieldColor).not.toBe(darkTheme.fieldBackground);
  expect(new Set(darkTheme.fieldBorderWidths)).toEqual(new Set(["1px"]));

  await dialog.getByRole("button", { name: "新建作品", exact: true }).click();
  await dialog.locator(".figma-artifact-fields select").selectOption("markdown");
  await dialog.locator(".figma-artifact-content-field textarea").fill([
    "![远程图片](https://tracking.example.test/markdown.png)",
    "[外部链接](https://api.example.test/open)"
  ].join("\n"));
  const markdownPreview = dialog.locator(".figma-artifact-markdown-preview");
  await expect(markdownPreview).toBeVisible();
  await expect(markdownPreview.locator("img, a")).toHaveCount(0);
  await expect(markdownPreview.getByText("远程图片", { exact: false })).toBeVisible();
  await expect(markdownPreview.getByText("外部链接", { exact: true })).toBeVisible();

  if (isMobileProject(testInfo.project.name)) {
    const controls = await dialog.locator("button, input, select, textarea").evaluateAll((elements) =>
      elements.filter((element) => !element.hasAttribute("aria-hidden"))
        .map((element) => ({ tag: element.tagName, height: element.getBoundingClientRect().height }))
    );
    const touchControls = controls.filter(({ tag }) => tag === "BUTTON" || tag === "INPUT" || tag === "SELECT");
    expect(touchControls.every(({ height }) => height >= 44)).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(session.getByRole("button", { name: "保存为作品", exact: true })).toBeFocused();
  page.removeListener("request", requestListener);
});

test("artifact versions and safe preview survive reload without silently saving drafts", async ({ page, apiHarness }, testInfo) => {
  const session = page.locator(`[data-conversation-id="${artifactConversation.id}"]`);
  await session.getByRole("button", { name: "保存为作品", exact: true }).click();
  const first = page.getByRole("dialog", { name: "作品空间", exact: true });
  await first.getByLabel("作品名称", { exact: true }).fill("版本化作品");
  await first.getByRole("button", { name: "保存作品", exact: true }).click();
  await expect(first.getByText("作品已保存到当前浏览器", { exact: true })).toBeVisible();
  await first.getByRole("button", { name: "关闭作品空间", exact: true }).click();
  await expect(first).toHaveCount(0);

  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  const reopened = await openArtifactWorkspace(page);
  const dialog = reopened.dialog;
  await expect(dialog.getByRole("button", { name: /版本化作品/u, exact: false })).toBeVisible();
  const content = dialog.locator(".figma-artifact-content-field textarea");
  await content.fill("<!doctype html><html><body><h1>第二版</h1><script>alert('blocked')</script></body></html>");
  await dialog.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(dialog.getByText("已保存版本 2", { exact: true })).toBeVisible();

  let records = await readWorkspaceRecords<ArtifactRecordFixture>(page, "artifacts");
  expect(records[0].currentVersion).toBe(2);
  expect(records[0].versions.map((version) => version.version)).toEqual([1, 2]);
  expect(records[0].versions[1].content).not.toContain("<script");

  await dialog.getByRole("button", { name: "新建作品", exact: true }).click();
  await dialog.getByLabel("作品名称", { exact: true }).fill("未保存草稿");
  await dialog.locator(".figma-artifact-content-field textarea").fill("这段内容没有点击保存");
  await dialog.getByRole("button", { name: /版本化作品/u, exact: false }).click();
  await expect(dialog.getByLabel("作品名称", { exact: true })).toHaveValue("版本化作品");
  await dialog.getByRole("button", { name: "关闭作品空间", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  records = await readWorkspaceRecords<ArtifactRecordFixture>(page, "artifacts");
  expect(records).toHaveLength(1);
  expect(records[0].title).toBe("版本化作品");
  expect(records[0].versions).toHaveLength(2);

  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  const afterReload = await openArtifactWorkspace(page);
  await expect(afterReload.dialog.getByLabel("作品名称", { exact: true })).toHaveValue("版本化作品");
  await expect(afterReload.dialog.getByRole("button", { name: "v2", exact: true })).toHaveClass(/active/u);
  await expect(afterReload.dialog.locator("iframe[title='作品 HTML 安全预览']")).toBeVisible();
  expect(apiHarness.chatRequests).toHaveLength(0);
  expect(apiHarness.unexpectedRequests).toEqual([]);

  const owners = await visibleScrollOwners(page);
  expect(owners).toHaveLength(1);
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  if (isMobileProject(testInfo.project.name)) {
    await expect(afterReload.dialog).toBeVisible();
    expect(await afterReload.dialog.boundingBox()).toMatchObject({ width: expect.any(Number) });
  }
});
