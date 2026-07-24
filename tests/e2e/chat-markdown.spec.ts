import type { Conversation } from "../../src/types";
import {
  expect,
  isMobileProject,
  publicDestinations,
  seedChatConversations,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";

const code = "const total = items.reduce((sum, item) => sum + item.value, 0); // " + "x".repeat(180);
const markdownConversation: Conversation[] = [
  {
    id: "chat-markdown",
    title: "公式与代码",
    assistantId: "test-assistant",
    pinned: false,
    messageCount: 1,
    preview: "公式与代码渲染",
    messages: [
      {
        id: "chat-markdown-message",
        role: "assistant",
        content: [
          "行内公式 $E = mc^2$ 与行内代码 `npm run check`。",
          "",
          "$$",
          "\\int_0^1 x^2\\,dx = \\frac{1}{3}",
          "$$",
          "",
          "```typescript",
          code,
          "console.log(total);",
          "```",
          "",
          "```",
          "echo unlabeled fence",
          "```",
          "",
          "<script>window.__chatMarkdownXss = true</script>"
        ].join("\n"),
        status: "done",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      get: () => undefined
    });
    document.execCommand = (commandId: string) => {
      const active = document.activeElement as HTMLTextAreaElement | null;
      (window as typeof window & { __copiedChatCode?: string }).__copiedChatCode = active?.value;
      return commandId === "copy";
    };
  });
  await seedReadyProvider(page);
  await seedChatConversations(page, markdownConversation);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
});

test("Chat renders math and dedicated fenced code without raw HTML execution", async ({ page }, testInfo) => {
  const session = page.locator(".figma-chat-session").first();
  const bubble = session.locator(".figma-message-bubble").first();

  await expect(bubble.locator(".katex")).toHaveCount(2);
  await expect(bubble.locator(".katex-display")).toBeVisible();
  await expect(bubble.locator(".figma-inline-code")).toHaveText("npm run check");

  const codeBlock = bubble.locator(".figma-code-block");
  await expect(codeBlock).toHaveCount(2);
  const typedCodeBlock = codeBlock.first();
  await expect(typedCodeBlock.locator(":scope > header > span")).toHaveText("typescript");
  await expect(codeBlock.nth(1).locator(":scope > header > span")).toHaveText("text");
  const copyButton = typedCodeBlock.getByRole("button", { name: "复制代码", exact: true });
  const copyBounds = await copyButton.boundingBox();
  expect(copyBounds?.width).toBeGreaterThanOrEqual(isMobileProject(testInfo.project.name) ? 44 : 30);
  expect(copyBounds?.height).toBeGreaterThanOrEqual(isMobileProject(testInfo.project.name) ? 44 : 30);
  expect(copyBounds?.x).toBeGreaterThanOrEqual(0);
  expect((copyBounds?.x || 0) + (copyBounds?.width || 0)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth)
  );

  await copyButton.focus();
  await copyButton.click();
  await expect(copyButton).toContainText("已复制");
  await expect(copyButton).toBeFocused();
  expect(await page.evaluate(() => (window as typeof window & { __copiedChatCode?: string }).__copiedChatCode)).toBe(`${code}\nconsole.log(total);`);
  await expect(page.locator("body > textarea")).toHaveCount(0);

  const overflow = await typedCodeBlock.locator("pre").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    codeBlockRight: element.parentElement?.getBoundingClientRect().right || 0,
    bubbleRight: element.closest(".figma-message-bubble")?.getBoundingClientRect().right || 0,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.codeBlockRight).toBeLessThanOrEqual(overflow.bubbleRight + 1);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  await expect(bubble.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __chatMarkdownXss?: boolean }).__chatMarkdownXss)).toBeUndefined();
});
