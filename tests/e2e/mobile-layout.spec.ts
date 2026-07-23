import {
  documentOverflow,
  expect,
  isMobileProject,
  openMobileNavigation,
  publicDestinations,
  seedReadyProvider,
  test,
  visibleModuleNavigation,
  visibleScrollOwners,
  waitForPublicModule
} from "./support/app-fixture";
import type { Locator } from "@playwright/test";

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile layout contract");
  await seedReadyProvider(page);
});

test("each public module has one scroll owner and no page overflow", async ({ page }) => {
  for (const destination of publicDestinations) {
    await page.goto(destination.path);
    await waitForPublicModule(page, destination);

    await expect.poll(async () => (await visibleScrollOwners(page)).length).toBe(1);

    const owners = await visibleScrollOwners(page);
    expect(owners, `${destination.path} must expose exactly one visible data-scroll-owner`).toHaveLength(1);
    expect(["auto", "scroll"]).toContain(owners[0].overflowY);
    expect(owners[0].scrollHeight).toBeGreaterThanOrEqual(owners[0].clientHeight);

    const overflow = await documentOverflow(page);
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  }
});

test("mobile function menu uses 44px touch targets", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const trigger = page.getByRole("button", { name: "\u6253\u5f00\u529f\u80fd\u83dc\u5355", exact: true });
  await expect(page.locator(".figma-mobile-header")).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await openMobileNavigation(page);

  await expect(page.locator(".figma-sidebar.mobile-open")).toBeVisible();
  await expect(page.getByRole("button", { name: "\u5173\u95ed\u529f\u80fd\u83dc\u5355", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  const navigation = visibleModuleNavigation(page);
  const actions = navigation.locator(".figma-nav-item");
  await expect(actions).toHaveCount(publicDestinations.length);
  expect(await actions.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .toEqual(publicDestinations.map((destination) => destination.label));

  for (const action of await actions.all()) {
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await expect(navigation.getByRole("button", { name: /API/i })).toHaveCount(0);
  await expect(page.locator(".figma-access-card")).toBeHidden();
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);

  const owners = await visibleScrollOwners(page);
  expect(owners, "Open navigation must keep the Figma workspace as the sole scroll owner").toHaveLength(1);
  expect(owners[0].className).toContain("figma-workspace");

  await page.mouse.click(4, 4);
  await expect(page.locator(".figma-sidebar.mobile-open")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开功能菜单", exact: true })).toBeFocused();

  await openMobileNavigation(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".figma-sidebar.mobile-open")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开功能菜单", exact: true })).toBeFocused();
});

test("mobile Chat controls keep touch-safe hit areas", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  for (const target of await page.locator(".figma-mobile-header .figma-icon-button").all()) {
    await expectTouchTarget(target);
  }

  const session = page.locator(".figma-chat-session").first();
  for (const target of await session.locator(".figma-session-action-mobile, .figma-session-tools button, .figma-send-button").all()) {
    await expectTouchTarget(target);
  }

  await session.getByRole("button", { name: "会话设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "会话设置", exact: true });
  await expect(dialog).toBeVisible();
  await expectTouchTarget(dialog.getByRole("button", { name: "关闭会话设置", exact: true }));
  await dialog.getByRole("button", { name: "关闭会话设置", exact: true }).click();
});

test("mobile creative and library controls keep touch-safe hit areas", async ({ page }) => {
  await page.goto("/image");
  await waitForPublicModule(page, publicDestinations[1]);
  for (const target of await page.locator(".figma-prompt-chips button, .figma-inspiration-section > header button").all()) {
    await expectTouchTarget(target);
  }

  await page.goto("/ppt");
  await waitForPublicModule(page, publicDestinations.find((destination) => destination.id === "ppt")!);
  for (const target of await page.locator(".figma-ppt-ideas button").all()) {
    await expectTouchTarget(target);
  }

  await page.goto("/mindmap");
  await waitForPublicModule(page, publicDestinations.find((destination) => destination.id === "mindmap")!);
  for (const target of await page.locator(".figma-map-zoom button").all()) {
    await expectTouchTarget(target);
  }

  await page.goto("/assistants");
  await waitForPublicModule(page, publicDestinations.find((destination) => destination.id === "assistants")!);
  await page.getByRole("button", { name: /查看助手 Product Partner/ }).click();
  const assistantDialog = page.getByRole("dialog", { name: "Product Partner", exact: true });
  await expect(assistantDialog).toBeVisible();
  await expectTouchTarget(assistantDialog.getByRole("button", { name: "关闭助手详情", exact: true }));
  await assistantDialog.getByRole("button", { name: "关闭助手详情", exact: true }).click();

  await page.goto("/translate");
  await waitForPublicModule(page, publicDestinations.find((destination) => destination.id === "translate")!);
  await expectTouchTarget(page.getByRole("button", { name: "交换语言", exact: true }));
  await expectTouchTarget(page.getByRole("button", { name: "复制译文", exact: true }));
  for (const target of await page.getByRole("group", { name: "翻译语气", exact: true }).getByRole("button").all()) {
    await expectTouchTarget(target);
  }
});
