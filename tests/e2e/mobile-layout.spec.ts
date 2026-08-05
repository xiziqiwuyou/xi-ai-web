import {
  documentOverflow,
  expect,
  isMobileProject,
  openMobileNavigation,
  publicBootstrapFixture,
  publicDestinations,
  seedReadyProvider,
  test,
  visibleModuleNavigation,
  visibleScrollOwners,
  waitForPublicModule
} from "./support/app-fixture";
import type { Locator, Page } from "@playwright/test";

const mobileMatrixProject = "mobile-390";

function destination(id: (typeof publicDestinations)[number]["id"]) {
  const value = publicDestinations.find((item) => item.id === id);
  if (!value) throw new Error(`Missing public destination: ${id}`);
  return value;
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function expectHorizontalContainment(page: Page) {
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

async function expectVisualViewportContainment(
  page: Page,
  locator: Locator,
  options: { vertical?: boolean; tolerance?: number } = {}
) {
  const { vertical = true, tolerance = 1 } = options;
  await expect(locator).toBeVisible();
  const metrics = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    return {
      visualViewportSupported: Boolean(viewport),
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      viewportLeft,
      viewportTop,
      viewportRight: viewportLeft + (viewport?.width ?? window.innerWidth),
      viewportBottom: viewportTop + (viewport?.height ?? window.innerHeight)
    };
  });

  expect(metrics.visualViewportSupported).toBe(true);
  expect(metrics.left).toBeGreaterThanOrEqual(metrics.viewportLeft - tolerance);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportRight + tolerance);
  if (vertical) {
    expect(metrics.top).toBeGreaterThanOrEqual(metrics.viewportTop - tolerance);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportBottom + tolerance);
  }
}

async function expectSingleScrollOwner(page: Page, className?: string) {
  await expect.poll(async () => (await visibleScrollOwners(page)).length).toBe(1);
  const owners = await visibleScrollOwners(page);
  expect(owners).toHaveLength(1);
  if (className) expect(owners[0].className).toContain(className);
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

test("360, 412, tablet, and landscape transitions contain every public module", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== mobileMatrixProject, "One deterministic mobile matrix pass is sufficient");

  const portraitCases = [
    { viewport: { width: 360, height: 800 }, moduleIds: ["chat", "image"] as const },
    { viewport: { width: 412, height: 915 }, moduleIds: ["agents", "workflows"] as const },
    { viewport: { width: 768, height: 1024 }, moduleIds: ["ppt", "mindmap"] as const }
  ];

  for (const entry of portraitCases) {
    await page.setViewportSize(entry.viewport);
    for (const moduleId of entry.moduleIds) {
      const target = destination(moduleId);
      await page.goto(target.path);
      await waitForPublicModule(page, target);
      await expect(page.locator(".figma-mobile-header")).toBeVisible();
      await expectSingleScrollOwner(page, "figma-workspace");
      await expectHorizontalContainment(page);
      await expectVisualViewportContainment(page, page.locator(".figma-studio-shell"));
    }
  }

  const assistants = destination("assistants");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(assistants.path);
  await waitForPublicModule(page, assistants);
  await page.setViewportSize({ width: 800, height: 360 });
  await expect(page.locator(".figma-mobile-header")).toBeVisible();
  await expectSingleScrollOwner(page, "figma-workspace");
  await expectHorizontalContainment(page);

  const translate = destination("translate");
  await page.goto(translate.path);
  await waitForPublicModule(page, translate);
  await expectSingleScrollOwner(page, "figma-workspace");
  await expectHorizontalContainment(page);
  await expectVisualViewportContainment(page, page.locator(".figma-studio-shell"));
});

test("long Chinese labels remain accessible and contained with 200 percent mobile text scaling", async ({
  page,
  apiHarness
}, testInfo) => {
  test.skip(testInfo.project.name !== mobileMatrixProject, "One deterministic long-label pass is sufficient");
  const longWorkflowLabel = "跨设备临时同步工作区进度与安全确认";
  apiHarness.setBootstrap({
    ...publicBootstrapFixture,
    menuItems: publicBootstrapFixture.menuItems.map((item) => (
      item.id === "workflows" ? { ...item, label: longWorkflowLabel } : item
    ))
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/chat");
  await waitForPublicModule(page, destination("chat"));
  await page.addStyleTag({
    content: "html { -webkit-text-size-adjust: 200% !important; text-size-adjust: 200% !important; }"
  });
  expect(await page.evaluate(() => (
    getComputedStyle(document.documentElement).getPropertyValue("text-size-adjust")
      || getComputedStyle(document.documentElement).getPropertyValue("-webkit-text-size-adjust")
  ))).toBe("200%");

  await openMobileNavigation(page);
  const longLabelAction = visibleModuleNavigation(page).getByRole("button", {
    name: longWorkflowLabel,
    exact: true
  });
  await expect(longLabelAction).toBeVisible();
  await expectTouchTarget(longLabelAction);
  const labelContainment = await longLabelAction.evaluate((element) => {
    const action = element.getBoundingClientRect();
    const label = element.querySelector("strong")?.getBoundingClientRect();
    return label ? {
      left: label.left - action.left,
      right: action.right - label.right,
      actionScrollWidth: element.scrollWidth,
      actionClientWidth: element.clientWidth
    } : null;
  });
  expect(labelContainment).not.toBeNull();
  expect(labelContainment!.left).toBeGreaterThanOrEqual(-1);
  expect(labelContainment!.right).toBeGreaterThanOrEqual(-1);
  expect(labelContainment!.actionScrollWidth).toBeLessThanOrEqual(labelContainment!.actionClientWidth + 1);
  await expectHorizontalContainment(page);
});

test("mobile themes retain contrast tokens and reduced motion removes practical animation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== mobileMatrixProject, "One deterministic theme and motion pass is sufficient");
  await page.addInitScript(() => window.localStorage.setItem("aistudio-theme", "light"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/chat");
  await waitForPublicModule(page, destination("chat"));

  const readPalette = () => page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.dataset.studioTheme,
      background: style.getPropertyValue("--xhs-bg").trim(),
      ink: style.getPropertyValue("--xhs-ink").trim(),
      colorScheme: style.colorScheme
    };
  });
  const light = await readPalette();
  expect(light.theme).toBe("light");
  expect(light.colorScheme).toContain("light");

  await page.locator('.figma-mobile-header button[aria-label="切换日夜主题"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-studio-theme", "dark");
  const dark = await readPalette();
  expect(dark.colorScheme).toContain("dark");
  expect(dark.background).not.toBe(light.background);
  expect(dark.ink).not.toBe(light.ink);

  await openMobileNavigation(page);
  await visibleModuleNavigation(page).getByRole("button", { name: "图像生成", exact: true }).click();
  await waitForPublicModule(page, destination("image"));
  const motion = await page.locator(".figma-workspace-canvas").evaluate((element) => {
    const durationMs = (value: string) => Math.max(...value.split(",").map((duration) => {
      const normalized = duration.trim();
      return normalized.endsWith("ms")
        ? Number.parseFloat(normalized)
        : Number.parseFloat(normalized) * 1000;
    }));
    const style = getComputedStyle(element);
    return {
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDurationMs: durationMs(style.animationDuration),
      transitionDurationMs: durationMs(style.transitionDuration)
    };
  });
  expect(motion.reduced).toBe(true);
  expect(motion.animationDurationMs).toBeLessThanOrEqual(1);
  expect(motion.transitionDurationMs).toBeLessThanOrEqual(1);
  await expectHorizontalContainment(page);
});

test("shared mobile overlays and keyboard-height changes stay inside visualViewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== mobileMatrixProject, "One deterministic visualViewport pass is sufficient");
  await page.route("**/api/progress-sync/status", (route) => route.fulfill({
    json: { enabled: false, ttlSeconds: 600, maxPayloadBytes: 32 * 1024 * 1024 }
  }));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/chat");
  await waitForPublicModule(page, destination("chat"));
  const session = page.locator(".figma-chat-session").first();

  const modelTrigger = session.getByRole("button", { name: "选择对话模型", exact: true });
  await modelTrigger.scrollIntoViewIfNeeded();
  await modelTrigger.click();
  const modelPicker = session.locator('.figma-model-popover[aria-label="对话模型菜单"]');
  await expectVisualViewportContainment(page, modelPicker);
  await expectSingleScrollOwner(page, "figma-workspace");
  await page.keyboard.press("Escape");
  await expect(modelPicker).toHaveCount(0);

  await session.getByRole("button", { name: "会话设置", exact: true }).click();
  const settingsDialog = page.getByRole("dialog", { name: "会话设置", exact: true });
  await expectVisualViewportContainment(page, settingsDialog, { tolerance: 4 });
  await expectSingleScrollOwner(page, "figma-session-settings");
  await settingsDialog.getByRole("button", { name: "关闭会话设置", exact: true }).click();

  await page.locator('button[aria-label="管理工作区数据"]:visible').click();
  const workspaceDialog = page.getByRole("dialog", { name: "工作区数据", exact: true });
  await expectVisualViewportContainment(page, workspaceDialog);
  await expectSingleScrollOwner(page, "workspace-data-dialog");
  await workspaceDialog.getByRole("button", { name: "关闭工作区数据", exact: true }).click();

  await openMobileNavigation(page);
  await page.locator(".figma-sidebar.mobile-open").getByRole("button", {
    name: /^更换 API Key，当前 /
  }).click();
  const apiDialog = page.getByRole("dialog", { name: "连接 API", exact: true });
  await expectVisualViewportContainment(page, apiDialog);
  await expectSingleScrollOwner(page, "api-config-dialog");
  await page.keyboard.press("Escape");
  await expect(apiDialog).toHaveCount(0);

  const composer = session.locator(".figma-composer");
  const message = session.getByLabel("消息内容", { exact: true });
  await message.scrollIntoViewIfNeeded();
  await message.focus();
  await page.setViewportSize({ width: 360, height: 500 });
  await message.scrollIntoViewIfNeeded();
  await expect(message).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.visualViewport?.height)).toBeLessThanOrEqual(500);
  await expectVisualViewportContainment(page, composer);
  await expectSingleScrollOwner(page, "figma-workspace");
  await expectHorizontalContainment(page);
});

test("image preview, Assistant details, and workflow editor stay contained at expanded mobile sizes", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== mobileMatrixProject, "One deterministic shared-surface pass is sufficient");
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/image");
  await waitForPublicModule(page, destination("image"));
  const imageModule = page.getByTestId("image-module");
  await imageModule.getByRole("button", { name: "立即生成", exact: true }).click();
  await imageModule.getByRole("button", { name: "预览生成结果 1", exact: true }).click();
  const imagePreview = page.getByRole("dialog", { name: "图片预览", exact: true });
  await expectVisualViewportContainment(page, imagePreview);
  await expectSingleScrollOwner(page, "figma-image-preview-dialog");
  await imagePreview.getByRole("button", { name: "关闭图片预览", exact: true }).click();

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/assistants");
  await waitForPublicModule(page, destination("assistants"));
  await page.getByRole("button", { name: /查看助手 Product Partner/ }).click();
  const assistantDialog = page.getByRole("dialog", { name: "Product Partner", exact: true });
  await expectVisualViewportContainment(page, assistantDialog);
  await expectSingleScrollOwner(page, "figma-agent-dialog");
  await assistantDialog.getByRole("button", { name: "关闭助手详情", exact: true }).click();

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const workflowsModule = page.getByTestId("workflows-module");
  await workflowsModule.locator(".workflow-catalog-card").first().click();
  await expect(workflowsModule.getByTestId("workflow-canvas")).toBeVisible();
  await expectVisualViewportContainment(page, workflowsModule.locator(".workflow-detail-content"), {
    vertical: false
  });
  await expectSingleScrollOwner(page, "figma-workspace");
  await expectHorizontalContainment(page);
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
  await expect(page.locator('a[href="/xizi2333"]')).toHaveCount(0);

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
