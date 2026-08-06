import { readFile } from "node:fs/promises";
import type { Locator } from "@playwright/test";
import {
  documentOverflow,
  expect,
  isMobileProject,
  providerStorageKey,
  publicDestinations,
  publicBootstrapFixture,
  readWorkspaceRecords,
  seedReadyProvider,
  test,
  visibleScrollOwners,
  waitForPublicModule
} from "./support/app-fixture";

async function chooseFigmaMenu(container: Locator, name: string, option: string) {
  const trigger = container.getByRole("button", { name, exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const listbox = container.getByRole("listbox", { name, exact: true });
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: option, exact: false }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText(option);
  const descriptionId = await trigger.getAttribute("aria-describedby");
  expect(descriptionId).toBeTruthy();
  await expect(container.locator(`[id="${descriptionId}"]`)).toContainText(option);
  return trigger;
}

async function assertMenuLifecycle(container: Locator, name: string) {
  const trigger = container.getByRole("button", { name, exact: true });
  await trigger.click();
  const listbox = container.getByRole("listbox", { name, exact: true });
  await expect(listbox).toBeVisible();
  const listboxId = await listbox.getAttribute("id");
  await expect(trigger).toHaveAttribute("aria-controls", listboxId || "");
  await expect(trigger).toHaveAttribute("aria-describedby", /.+/);
  await expect(listbox.getByRole("option").first()).toBeVisible();
  await expect(listbox.getByRole("option", { selected: true })).toHaveCount(1);
  await expect(listbox.locator('[role="option"][aria-selected="true"] svg')).toHaveCount(1);
  await expect(listbox.locator('[role="option"][aria-selected="false"] svg')).toHaveCount(0);

  await pageKeyboardEscape(container);
  await expect(listbox).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(listbox).toBeVisible();
  await container.page().mouse.click(2, 2);
  await expect(listbox).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function pageKeyboardEscape(container: Locator) {
  await container.page().keyboard.press("Escape");
}

async function openPublicModule(
  page: Parameters<typeof waitForPublicModule>[0],
  index: number
) {
  const legacyDestinations = publicDestinations.filter((destination) =>
    ["chat", "image", "ppt", "mindmap", "assistants", "translate"].includes(destination.id)
  );
  const destination = legacyDestinations[index];
  await page.goto(destination.path);
  await waitForPublicModule(page, destination);
}

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
});

test("public shell masks and replaces the session API Key", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  if (isMobileProject(testInfo.project.name)) {
    await page.getByRole("button", { name: "\u6253\u5f00\u529f\u80fd\u83dc\u5355", exact: true }).click();
  }

  const replaceKey = page.getByRole("button", { name: /\u66f4\u6362 API Key/ });
  await expect(replaceKey).toBeVisible();
  await expect(replaceKey).toContainText("\u2022\u2022\u2022\u2022-key");
  await expect(page.locator(".figma-studio-shell")).not.toContainText("e2e-session-key");

  if (!isMobileProject(testInfo.project.name)) {
    const accessCard = page.getByRole("region", { name: "\u8bbf\u95ee\u72b6\u6001", exact: true });
    const details = accessCard.locator(".figma-access-details");
    const endpoint = details.locator(".figma-access-endpoint");
    await expect(details).toBeVisible();
    await expect(endpoint).toContainText("\u670d\u52a1\u5730\u5740");
    await expect(endpoint).toContainText("api.xi-ai.cn");
    await expect(accessCard.getByText("\u5df2\u52a0\u5bc6\u8bbf\u95ee", { exact: true })).toHaveCount(0);
    const rowGeometry = await details.locator(".figma-access-detail").evaluateAll((rows) =>
      rows.map((row) => {
        const rect = row.getBoundingClientRect();
        const icon = row.querySelector<HTMLElement>(".figma-access-detail-icon")?.getBoundingClientRect();
        const copy = row.querySelector<HTMLElement>(".figma-access-detail-copy")?.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          iconX: icon?.x ?? -1,
          copyX: copy?.x ?? -1
        };
      })
    );
    expect(rowGeometry).toHaveLength(2);
    expect(Math.abs(rowGeometry[0].width - rowGeometry[1].width)).toBeLessThanOrEqual(1);
    expect(Math.abs(rowGeometry[0].height - rowGeometry[1].height)).toBeLessThanOrEqual(1);
    expect(Math.abs(rowGeometry[0].iconX - rowGeometry[1].iconX)).toBeLessThanOrEqual(1);
    expect(Math.abs(rowGeometry[0].copyX - rowGeometry[1].copyX)).toBeLessThanOrEqual(1);
  }

  await replaceKey.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("API Key", { exact: true })).toHaveValue("e2e-session-key");
  await dialog.getByLabel("API Key", { exact: true }).fill("sk-replaced-4321");
  await dialog.getByRole("button", { name: "\u4fdd\u5b58\u5e76\u5f00\u59cb\u4f7f\u7528", exact: true }).click();
  await expect(dialog).toBeHidden();

  if (isMobileProject(testInfo.project.name)) {
    await page.getByRole("button", { name: "\u6253\u5f00\u529f\u80fd\u83dc\u5355", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: /\u66f4\u6362 API Key/ })).toContainText("\u2022\u2022\u2022\u20224321");
  await expect(page.locator(".figma-studio-shell")).not.toContainText("sk-replaced-4321");
  await expect.poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).toBe(
    JSON.stringify({ apiKey: "sk-replaced-4321", lastModelId: "test-chat" })
  );
  expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
});

test("public modules use the Figma shell and heading contract without overflow", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const mobile = isMobileProject(testInfo.project.name);

  for (const destination of publicDestinations) {
    await page.goto(destination.path);
    await waitForPublicModule(page, destination);

    await expect(page.locator(".figma-studio-shell")).toBeVisible();
    await expect(page.locator(".figma-workspace")).toHaveAttribute("data-scroll-owner", "public-workspace");
    await expect(page.locator(".figma-workspace-canvas")).toBeVisible();
    await expect(page.getByRole("main").getByRole("heading", {
      name: destination.heading,
      exact: true
    })).toBeVisible();

    if (mobile) {
      await expect(page.locator(".figma-mobile-header")).toBeVisible();
      await expect(page.locator(".figma-sidebar")).toBeHidden();
    } else {
      await expect(page.locator(".figma-sidebar")).toBeVisible();
      await expect(page.locator(".figma-mobile-header")).toBeHidden();
    }

    const overflow = await documentOverflow(page);
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  }
});

test("tablet navigation preserves the single-column menu and heading actions", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await expect(page.locator(".figma-mobile-header")).toBeVisible();
  await expect(page.locator(".figma-sidebar")).toBeHidden();
  await expect(page.getByRole("button", { name: "新对话", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "会话设置", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "打开功能菜单", exact: true }).click();
  const navigation = page.locator(".figma-navigation:visible");
  const actions = navigation.locator(".figma-nav-item");
  await expect(actions).toHaveCount(publicDestinations.length);
  const boxes = await actions.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  expect(boxes.every((box) => box.height >= 44)).toBe(true);
  expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(1);
  expect(boxes.every((box, index) => index === 0 || box.y > boxes[index - 1].y)).toBe(true);

  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("the desktop rail keeps the authored geometry at the 1024px breakpoint", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo.project.name), "Desktop breakpoint contract");
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const shell = page.locator(".figma-studio-shell");
  const geometry = await shell.evaluate((element) => {
    const style = getComputedStyle(element);
    const sidebar = element.querySelector<HTMLElement>(".figma-sidebar");
    return {
      columns: style.gridTemplateColumns,
      gap: style.columnGap,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0
    };
  });

  expect(geometry.columns.startsWith("224px")).toBe(true);
  expect(geometry.sidebarWidth).toBe(224);
  expect(geometry.gap).toBe("32px");
  expect(geometry.paddingLeft).toBe("32px");
  expect(geometry.paddingRight).toBe("32px");
});

test("mobile hero emphasis stays together as one authored phrase", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  for (const path of ["/mindmap", "/translate"]) {
    await page.goto(path);
    const destination = publicDestinations.find((item) => item.path === path);
    if (!destination) throw new Error(`Missing public destination for ${path}`);
    await waitForPublicModule(page, destination);

    const emphasis = page.locator(".figma-page-hero h1 em");
    await expect(emphasis).toBeVisible();
    const layout = await emphasis.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        display: style.display,
        whiteSpace: style.whiteSpace,
        lineBoxes: element.getClientRects().length
      };
    });
    expect(layout.display).toBe("inline");
    expect(layout.whiteSpace).toBe("nowrap");
    expect(layout.lineBoxes).toBe(1);
  }
});

test("Image matches the prompt, parameter, and inspiration waterfall contract", async ({ page }) => {
  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");

  await expect(module.locator(".figma-image-hero > p")).toHaveText("02 / VISUALS");
  await expect(module.getByRole("heading", { name: "\u56fe\u50cf\u751f\u6210", exact: true })).toBeVisible();
  await expect(module.getByText("\u628a\u6587\u5b57\u7075\u611f\u8f6c\u6362\u4e3a\u4e00\u5e45\u72ec\u6709\u753b\u9762\u3002", { exact: true })).toBeVisible();

  const prompt = module.getByRole("textbox", { name: "\u56fe\u50cf\u63d0\u793a\u8bcd", exact: true });
  await expect(prompt).toHaveValue("\u4e00\u5ea7\u6f02\u6d6e\u5728\u6df1\u6d77\u4e2d\u7684\u672a\u6765\u56fe\u4e66\u9986\uff0c\u84dd\u7d2b\u8272\u751f\u7269\u8367\u5149\uff0c\u7535\u5f71\u611f");
  await expect(module.getByRole("button", { name: "\u7acb\u5373\u751f\u6210", exact: true })).toBeEnabled();

  await expect(module.getByRole("heading", { name: "\u521b\u4f5c\u53c2\u6570", exact: true })).toBeVisible();
  const composer = module.locator(".figma-image-composer");
  const controlDeck = module.locator(".figma-image-control-deck");
  await expect(composer.locator(".figma-image-control-deck")).toHaveCount(1);
  await expect(controlDeck.locator(".figma-image-parameter-grid")).toHaveCount(1);
  const imageModel = module.getByRole("button", { name: "\u56fe\u50cf\u751f\u6210\u6a21\u578b", exact: true });
  const imageSize = module.getByRole("button", { name: "\u56fe\u50cf\u5c3a\u5bf8", exact: true });
  const imageQuality = module.getByRole("button", { name: "\u751f\u6210\u8d28\u91cf", exact: true });
  await expect(imageModel).toBeVisible();
  await expect(imageSize).toContainText("1K \u00b7 \u6b63\u65b9\u5f62");
  await expect(imageQuality).toContainText("\u4f4e");
  const promptToolGroup = module.locator(".figma-image-prompt-tool-group");
  const optimizeButton = module.getByRole("button", { name: "\u4f18\u5316\u63d0\u793a\u8bcd", exact: true });
  const optimizerMenu = module.getByRole("button", { name: "\u63d0\u793a\u8bcd\u4f18\u5316\u6a21\u578b", exact: true });
  const promptToolGeometry = await Promise.all([optimizeButton.boundingBox(), optimizerMenu.boundingBox()]);
  expect(promptToolGeometry[0]).not.toBeNull();
  expect(promptToolGeometry[1]).not.toBeNull();
  expect(Math.abs(promptToolGeometry[0]!.y - promptToolGeometry[1]!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(promptToolGeometry[0]!.height - promptToolGeometry[1]!.height)).toBeLessThanOrEqual(1);
  await expect(promptToolGroup).toBeVisible();
  for (const removedMenu of ["\u751f\u6210\u6570\u91cf", "\u753b\u9762\u6bd4\u4f8b", "\u56fe\u50cf\u5206\u8fa8\u7387", "\u80cc\u666f", "\u8f93\u51fa\u683c\u5f0f", "\u538b\u7f29\u8d28\u91cf"]) {
    await expect(module.getByRole("button", { name: removedMenu, exact: true })).toHaveCount(0);
  }

  const promptField = module.locator(".figma-image-prompt-field");
  const promptFieldBeforeOptimization = await promptField.boundingBox();
  await module.getByRole("button", { name: "\u4f18\u5316\u63d0\u793a\u8bcd", exact: true }).click();
  const promptVariants = module.getByRole("group", { name: "\u63d0\u793a\u8bcd\u7248\u672c\u5207\u6362", exact: true });
  await expect(promptVariants).toBeVisible();
  await expect(prompt).toHaveValue(/\u672a\u6765\u6df1\u6d77\u56fe\u4e66\u9986\u60ac\u6d6e\u4e8e\u5e7d\u84dd\u6d77\u6c34\u4e2d/);
  await expect(prompt).not.toHaveValue(/<!doctype html>/);
  const promptFieldAfterOptimization = await promptField.boundingBox();
  expect(promptFieldBeforeOptimization).not.toBeNull();
  expect(promptFieldAfterOptimization).not.toBeNull();
  expect(Math.abs(promptFieldAfterOptimization!.height - promptFieldBeforeOptimization!.height)).toBeLessThanOrEqual(1);

  await promptVariants.getByRole("button", { name: "\u4f7f\u7528\u4f18\u5316\u524d\u7684\u63d0\u793a\u8bcd", exact: true }).click();
  await expect(prompt).toHaveValue("\u4e00\u5ea7\u6f02\u6d6e\u5728\u6df1\u6d77\u4e2d\u7684\u672a\u6765\u56fe\u4e66\u9986\uff0c\u84dd\u7d2b\u8272\u751f\u7269\u8367\u5149\uff0c\u7535\u5f71\u611f");
  await promptVariants.getByRole("button", { name: "\u4f7f\u7528\u4f18\u5316\u540e\u7684\u63d0\u793a\u8bcd", exact: true }).click();
  await expect(prompt).toHaveValue(/\u672a\u6765\u6df1\u6d77\u56fe\u4e66\u9986\u60ac\u6d6e\u4e8e\u5e7d\u84dd\u6d77\u6c34\u4e2d/);

  await imageModel.click();
  const modelListbox = module.getByRole("listbox", { name: "\u56fe\u50cf\u751f\u6210\u6a21\u578b", exact: true });
  await expect(modelListbox).toBeVisible();
  await expect(modelListbox.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(modelListbox).toHaveCount(0);
  await expect(imageModel).toBeFocused();

  await imageSize.focus();
  await imageSize.press("ArrowDown");
  const sizeListbox = module.getByRole("listbox", { name: "\u56fe\u50cf\u5c3a\u5bf8", exact: true });
  const selectedSize = sizeListbox.getByRole("option", { name: "1K \u00b7 \u6b63\u65b9\u5f62", exact: false });
  const lastSize = sizeListbox.getByRole("option", { name: "4K \u00b7 \u7ad6\u7248", exact: false });
  await expect(selectedSize).toBeFocused();
  await selectedSize.press("End");
  await expect(lastSize).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sizeListbox).toHaveCount(0);
  await expect(imageSize).toBeFocused();

  await chooseFigmaMenu(module, "\u56fe\u50cf\u5c3a\u5bf8", "1K \u00b7 \u7ad6\u7248");
  await expect(imageSize).toContainText("1K \u00b7 \u7ad6\u7248");

  await expect(module.getByRole("heading", { name: "\u7075\u611f\u7011\u5e03\u6d41", exact: true })).toBeVisible();
  const inspiration = module.getByRole("list", { name: "\u56fe\u50cf\u7075\u611f", exact: true });
  await expect(inspiration.getByRole("listitem")).toHaveCount(6);
  await inspiration.getByRole("listitem", { name: "\u590d\u7528\u7075\u611f\uff1a\u9ed1\u8272\u5c0f\u72d7\u8096\u50cf", exact: true }).click();
  await expect(prompt).toHaveValue(/\u9ed1\u8272\u5c0f\u72d7/);

  await module.getByRole("button", { name: "\u6362\u4e00\u6279 \u2192", exact: true }).click();
  await expect(inspiration.getByRole("listitem").first()).toHaveAccessibleName("\u590d\u7528\u7075\u611f\uff1a\u84dd\u7d2b\u8272\u6df1\u7a7a\u661f\u4e91");
});

test("Image parameter menus share one width and open upward with motion", async ({ page }) => {
  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");
  const menuRoots = module.locator(".figma-image-parameter-grid > .figma-menu");
  await expect(menuRoots).toHaveCount(3);
  const widths = await menuRoots.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);

  for (const name of ["\u56fe\u50cf\u751f\u6210\u6a21\u578b", "\u56fe\u50cf\u5c3a\u5bf8", "\u751f\u6210\u8d28\u91cf"]) {
    const trigger = module.getByRole("button", { name, exact: true });
    await trigger.click();
    const popover = module.getByRole("listbox", { name, exact: true });
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute("data-placement", "up");
    await expect.poll(() => popover.evaluate((element) => getComputedStyle(element).animationName)).toContain("figma-image-menu-popover-in");
    const geometry = await Promise.all([trigger.boundingBox(), popover.boundingBox()]);
    expect(geometry[0]).not.toBeNull();
    expect(geometry[1]).not.toBeNull();
    expect(Math.abs(geometry[0]!.width - geometry[1]!.width)).toBeLessThanOrEqual(1);
    expect(geometry[1]!.y + geometry[1]!.height).toBeLessThanOrEqual(geometry[0]!.y - 7);
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
  }
});

test("Image uses a stable split workbench with inline loading and one result", async ({ page, apiHarness }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Desktop split geometry needs one deterministic viewport");
  apiHarness.setGenerationDelayMs(800);
  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");
  const form = module.locator(".figma-image-form");
  const outputPane = module.locator(".figma-image-output-pane");

  await expect(module.getByRole("button", { name: "生成数量", exact: true })).toHaveCount(0);
  await expect(outputPane.getByText("等待生成", { exact: true }).first()).toBeVisible();
  await expect(outputPane.getByText("预计 29 秒", { exact: true })).toBeVisible();
  const initialGeometry = await Promise.all([form.boundingBox(), outputPane.boundingBox()]);
  expect(initialGeometry[0]).not.toBeNull();
  expect(initialGeometry[1]).not.toBeNull();
  expect(initialGeometry[1]!.x).toBeGreaterThan(initialGeometry[0]!.x + initialGeometry[0]!.width);
  expect(Math.abs(initialGeometry[1]!.y - initialGeometry[0]!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(
    (initialGeometry[1]!.y + initialGeometry[1]!.height) -
    (initialGeometry[0]!.y + initialGeometry[0]!.height)
  )).toBeLessThanOrEqual(1);

  await module.getByRole("button", { name: "立即生成", exact: true }).click();
  const loadingStatus = outputPane.getByRole("status");
  await expect(loadingStatus).toBeVisible();
  await expect(loadingStatus).toContainText("正在生成");
  await expect(loadingStatus).toContainText("预计 29 秒");
  await expect.poll(() => outputPane.locator(".figma-image-loading-spinner").evaluate((element) => (
    getComputedStyle(element).animationName
  ))).toBe("figma-image-loading-spin");
  const loadingGeometry = await outputPane.boundingBox();
  expect(loadingGeometry).not.toBeNull();
  expect(Math.abs(loadingGeometry!.x - initialGeometry[1]!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(loadingGeometry!.width - initialGeometry[1]!.width)).toBeLessThanOrEqual(1);

  const resultList = outputPane.getByRole("list", { name: "本次生成图片", exact: true });
  await expect(resultList.getByRole("listitem")).toHaveCount(1);
  const resultImage = resultList.getByRole("img", { name: "生成结果 1", exact: true });
  const imageBounds = await resultImage.boundingBox();
  expect(imageBounds).not.toBeNull();
  expect(imageBounds!.width).toBeGreaterThan(260);
  expect(imageBounds!.width).toBeLessThanOrEqual(initialGeometry[1]!.width + 1);
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("Image sends provider-aware generation and edit options and renders every asset", async ({ page, apiHarness }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic image request pass is sufficient");
  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");

  await chooseFigmaMenu(module, "\u56fe\u50cf\u5c3a\u5bf8", "2K \u00b7 \u6a2a\u7248");
  await chooseFigmaMenu(module, "\u751f\u6210\u8d28\u91cf", "\u9ad8");

  await module.getByRole("button", { name: "\u7acb\u5373\u751f\u6210", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.length).toBe(1);
  expect(apiHarness.generationRequests[0]).toMatchObject({
    moduleId: "image",
    payload: {
      modelId: "test-image",
      options: {
        mode: "generate",
        count: 1,
        aspectRatio: "16:9",
        imageSize: "2K",
        size: "2048x1152",
        quality: "high",
        outputFormat: "png"
      }
    }
  });
  expect(apiHarness.generationRequests[0].payload.options).not.toHaveProperty("outputCompression");
  expect(apiHarness.generationRequests[0].payload.options).not.toHaveProperty("background");
  await expect(module.getByRole("list", { name: "\u672c\u6b21\u751f\u6210\u56fe\u7247", exact: true }).getByRole("listitem")).toHaveCount(1);

  await module.getByRole("button", { name: "\u56fe\u7247\u7f16\u8f91", exact: true }).click();
  await module.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({
    name: "source.png",
    mimeType: "image/png",
    buffer: Buffer.from("source-image")
  });
  await module.locator('input[type="file"][accept="image/png"]').setInputFiles({
    name: "mask.png",
    mimeType: "image/png",
    buffer: Buffer.from("mask-image")
  });
  await expect(module.getByRole("button", { name: "\u66f4\u6362\u539f\u56fe", exact: true })).toBeVisible();
  await expect(module.getByRole("button", { name: "\u66f4\u6362\u8499\u7248", exact: true })).toBeVisible();

  await module.getByRole("button", { name: "\u7acb\u5373\u751f\u6210", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.length).toBe(2);
  const editOptions = apiHarness.generationRequests[1].payload.options;
  expect(editOptions).toMatchObject({
    mode: "edit",
    count: 1,
    aspectRatio: "16:9",
    imageSize: "2K",
    quality: "high",
    outputFormat: "png"
  });
  expect(editOptions).not.toHaveProperty("outputCompression");
  expect(editOptions).not.toHaveProperty("background");
  expect(editOptions?.inputImage?.dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(editOptions?.maskImage?.dataUrl).toMatch(/^data:image\/png;base64,/);
  await expect(module.getByRole("list", { name: "\u672c\u6b21\u751f\u6210\u56fe\u7247", exact: true }).getByRole("listitem")).toHaveCount(1);
});

test("Image results use compact thumbnails and a complete preview action flow", async ({ page, apiHarness }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic image preview pass is sufficient");
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __imageClipboard?: { writes: number; width: number; height: number; text: string };
    };
    state.__imageClipboard = { writes: 0, width: 0, height: 0, text: "" };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async (items: ClipboardItem[]) => {
          const blob = await items[0].getType("image/png");
          const bitmap = await createImageBitmap(blob);
          state.__imageClipboard = {
            writes: items.length,
            width: bitmap.width,
            height: bitmap.height,
            text: ""
          };
          bitmap.close();
        },
        writeText: async (text: string) => {
          state.__imageClipboard = { writes: -1, width: 0, height: 0, text };
        }
      }
    });
  });

  const bootstrap = structuredClone(publicBootstrapFixture);
  bootstrap.modelCatalog.push({
    id: "preview-only-image",
    vendor: "openai",
    endpointProtocol: "openai-responses",
    model: "preview-only-image",
    label: "Preview Only Image",
    capabilities: ["image"],
    defaultFor: [],
    enabled: true
  });
  apiHarness.setBootstrap(bootstrap);

  const sourceDataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable in image test");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 2, 2);
    context.fillStyle = "#0000ff";
    context.fillRect(2, 0, 2, 2);
    return canvas.toDataURL("image/png");
  });
  const sourceBody = Buffer.from(sourceDataUrl.split(",")[1], "base64");
  apiHarness.setImageAssetUrls(["/test-assets/asymmetric-result.png"]);
  await page.route("**/test-assets/asymmetric-result.png", (route) => route.fulfill({
    contentType: "image/png",
    body: sourceBody
  }));

  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");
  await chooseFigmaMenu(module, "图像生成模型", "Preview Only Image");
  await expect(module.getByText("基于服务端最近 10 次记录（最多 10 次）", { exact: true })).toBeVisible();
  await expect.poll(() => apiHarness.imageTimingEstimateRequests.at(-1)?.modelId).toBe("preview-only-image");

  await module.getByRole("button", { name: "立即生成", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.length).toBe(1);
  expect(apiHarness.generationRequests[0].payload.modelId).toBe("preview-only-image");
  const resultItem = module.getByRole("list", { name: "本次生成图片", exact: true }).getByRole("listitem").first();
  const resultBounds = await resultItem.boundingBox();
  expect(resultBounds?.width).toBeGreaterThan(320);
  expect(resultBounds?.width).toBeLessThanOrEqual(560);

  const previewTrigger = module.getByRole("button", { name: "预览生成结果 1", exact: true });
  await previewTrigger.click();
  let dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("button", { name: "关闭图片预览", exact: true })).toBeFocused();
  expect(await visibleScrollOwners(page)).toHaveLength(1);
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "下载图片", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(previewTrigger).toBeFocused();

  await previewTrigger.click();
  dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  const stage = dialog.locator(".figma-image-preview-stage");

  await dialog.getByRole("button", { name: "向右旋转", exact: true }).click();
  await expect(stage).toHaveAttribute("data-rotation", "90");
  await dialog.getByRole("button", { name: "水平翻转", exact: true }).click();
  await expect(stage).toHaveAttribute("data-flip-horizontal", "true");
  const rotatedContainment = await stage.evaluate((element) => {
    const image = element.querySelector("img");
    if (!image) return null;
    const stageBounds = element.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    return {
      left: imageBounds.left - stageBounds.left,
      top: imageBounds.top - stageBounds.top,
      right: stageBounds.right - imageBounds.right,
      bottom: stageBounds.bottom - imageBounds.bottom
    };
  });
  expect(rotatedContainment).not.toBeNull();
  expect(Math.min(...Object.values(rotatedContainment!))).toBeGreaterThanOrEqual(-1);
  await dialog.getByRole("button", { name: "放大图片", exact: true }).click();
  await expect(stage).toHaveAttribute("data-zoom", "1.25");

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载图片", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("xi-ai-image-1.png");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exportedDataUrl = `data:image/png;base64,${(await readFile(downloadPath!)).toString("base64")}`;
  const exportedImage = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable while reading downloaded PNG");
    context.drawImage(image, 0, 0);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      top: [...context.getImageData(1, 0, 1, 1).data],
      bottom: [...context.getImageData(1, image.naturalHeight - 1, 1, 1).data]
    };
  }, exportedDataUrl);
  expect(exportedImage).toEqual({
    width: 2,
    height: 4,
    top: [0, 0, 255, 255],
    bottom: [255, 0, 0, 255]
  });

  await dialog.getByRole("button", { name: "复制图片", exact: true }).click();
  await expect(dialog.getByText("图片已复制", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (
    window as typeof window & { __imageClipboard?: { writes: number; width: number; height: number } }
  ).__imageClipboard)).toMatchObject({ writes: 1, width: 2, height: 4 });

  await dialog.getByRole("button", { name: "重置图片变换", exact: true }).click();
  await expect(stage).toHaveAttribute("data-rotation", "0");
  await expect(stage).toHaveAttribute("data-flip-horizontal", "false");
  await expect(stage).toHaveAttribute("data-zoom", "1.00");

  await dialog.getByRole("button", { name: "重新生成", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => apiHarness.generationRequests.length).toBe(2);
  expect(apiHarness.generationRequests[1].payload.modelId).toBe("preview-only-image");

  await previewTrigger.click();
  dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await dialog.getByRole("button", { name: "向左旋转", exact: true }).click();
  await expect(dialog.locator(".figma-image-preview-stage")).toHaveAttribute("data-rotation", "270");
  await dialog.getByRole("button", { name: "编辑图片", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(module.getByRole("button", { name: "图片编辑", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(module.getByRole("button", { name: "更换原图", exact: true })).toBeVisible();
  await expect(module.getByRole("button", { name: "图像生成模型", exact: true })).toContainText("OpenAI Image");
  await expect.poll(() => module.getByRole("img", { name: "参考图 1", exact: true }).evaluate((image) => ({
    width: (image as HTMLImageElement).naturalWidth,
    height: (image as HTMLImageElement).naturalHeight
  }))).toEqual({ width: 2, height: 4 });
});

test("Image result actions use the same-origin importer for CORS images", async ({ page, apiHarness }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "One deterministic cross-origin pass is sufficient");
  await page.addInitScript(() => {
    const state = window as typeof window & { __remoteClipboard?: { writes: number; text: string } };
    state.__remoteClipboard = { writes: 0, text: "" };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async () => {
          state.__remoteClipboard = { writes: (state.__remoteClipboard?.writes || 0) + 1, text: "" };
        },
        writeText: async (text: string) => {
          state.__remoteClipboard = { writes: state.__remoteClipboard?.writes || 0, text };
        }
      }
    });
  });
  const imageBody = await readFile("public/assets/figma/inspiration-01.jpg");
  const importedDataUrl = `data:image/jpeg;base64,${imageBody.toString("base64")}`;
  const corsUrl = "https://images.example.test/cors-result.jpg";
  const noCorsUrl = "https://images.example.test/no-cors-result.jpg";
  let importedUrl = "";
  await page.route("**/api/image/import", (route) => {
    importedUrl = String(route.request().postDataJSON()?.url || "");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ dataUrl: importedDataUrl, mimeType: "image/jpeg" })
    });
  });
  await page.route(corsUrl, (route) => route.fulfill({
    contentType: "image/jpeg",
    headers: { "access-control-allow-origin": "*" },
    body: imageBody
  }));
  await page.route(noCorsUrl, (route) => (
    route.request().resourceType() === "fetch"
      ? route.abort("blockedbyclient")
      : route.fulfill({ contentType: "image/jpeg", body: imageBody })
  ));
  apiHarness.setImageAssetUrls([corsUrl]);

  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");
  await module.getByRole("button", { name: "立即生成", exact: true }).click();
  await module.getByRole("button", { name: "预览生成结果 1", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await dialog.getByRole("button", { name: "复制图片", exact: true }).click();
  await expect(dialog.getByText("图片已复制", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (
    window as typeof window & { __remoteClipboard?: { writes: number } }
  ).__remoteClipboard?.writes)).toBe(1);

  apiHarness.setImageAssetUrls([noCorsUrl]);
  await dialog.getByRole("button", { name: "重新生成", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.length).toBe(2);
  await module.getByRole("button", { name: "预览生成结果 1", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await dialog.getByRole("button", { name: "复制图片", exact: true }).click();
  await expect(dialog.getByText("图片已复制", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (
    window as typeof window & { __remoteClipboard?: { writes: number; text: string } }
  ).__remoteClipboard)).toEqual({ writes: 2, text: "" });

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载图片", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("xi-ai-image-1.png");
  await expect(dialog.getByText("图片下载已开始", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "编辑图片", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(importedUrl).toBe(noCorsUrl);
  await expect(module.getByRole("button", { name: "图片编辑", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(module.getByRole("button", { name: "更换原图", exact: true })).toBeVisible();
  await expect(module.getByRole("img", { name: "参考图 1", exact: true })).toBeVisible();
  await expect.poll(() => module.locator(".figma-image-form").evaluate((form) => {
    const bounds = form.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < Math.min(window.innerHeight / 2, 240);
  })).toBeTruthy();
});

test("Image result preview remains bounded and touch-safe on mobile", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile preview geometry is covered by both accepted viewports");
  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");
  await module.getByRole("button", { name: "立即生成", exact: true }).click();
  await module.getByRole("button", { name: "预览生成结果 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await expect(dialog).toBeVisible();

  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds?.x).toBeGreaterThanOrEqual(0);
  expect((dialogBounds?.x || 0) + (dialogBounds?.width || 0)).toBeLessThanOrEqual(viewportWidth);
  for (const label of ["关闭图片预览", "向左旋转", "向右旋转", "水平翻转", "垂直翻转", "缩小图片", "放大图片", "重置图片变换", "重新生成", "编辑图片", "复制图片", "下载图片"]) {
    const bounds = await dialog.getByRole("button", { name: label, exact: true }).boundingBox();
    expect(bounds?.height, label).toBeGreaterThanOrEqual(44);
  }
  const owners = await visibleScrollOwners(page);
  expect(owners).toHaveLength(1);
  expect(owners[0].className).toContain("figma-image-preview-dialog");
  const dialogOverflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(dialogOverflow.scrollWidth).toBeLessThanOrEqual(dialogOverflow.clientWidth + 1);
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("Image keeps orientation while falling back to a supported model size", async ({ page, apiHarness }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic size fallback pass is sufficient");
  const bootstrap = structuredClone(publicBootstrapFixture);
  bootstrap.modelCatalog.push({
    id: "gpt-image-1-e2e",
    vendor: "openai",
    model: "gpt-image-1",
    label: "GPT Image 1",
    capabilities: ["image", "imageEdit"],
    defaultFor: [],
    enabled: true
  });
  apiHarness.setBootstrap(bootstrap);

  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");
  await chooseFigmaMenu(module, "\u56fe\u50cf\u5c3a\u5bf8", "4K \u00b7 \u7ad6\u7248");
  await chooseFigmaMenu(module, "\u56fe\u50cf\u751f\u6210\u6a21\u578b", "GPT Image 1");
  const sizeTrigger = module.getByRole("button", { name: "\u56fe\u50cf\u5c3a\u5bf8", exact: true });
  await expect(sizeTrigger).toContainText("1K \u00b7 \u7ad6\u7248");
  await sizeTrigger.click();
  const sizeOptions = module.getByRole("listbox", { name: "\u56fe\u50cf\u5c3a\u5bf8", exact: true }).getByRole("option");
  await expect(sizeOptions).toHaveCount(3);
  await expect(sizeOptions).toHaveText(["1K \u00b7 \u6b63\u65b9\u5f62\u6807\u51c6\u65b9\u5f62\u753b\u5e03", "1K \u00b7 \u6a2a\u7248\u6807\u51c6\u6a2a\u5411\u6784\u56fe", "1K \u00b7 \u7ad6\u7248\u6807\u51c6\u7ad6\u5411\u6784\u56fe"]);
  await page.keyboard.press("Escape");

  await module.getByRole("button", { name: "\u7acb\u5373\u751f\u6210", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.length).toBe(1);
  expect(apiHarness.generationRequests[0]).toMatchObject({
    moduleId: "image",
    payload: {
      modelId: "gpt-image-1-e2e",
      options: {
        aspectRatio: "9:16",
        imageSize: "1K",
        size: "1024x1536",
        quality: "low",
        outputFormat: "png"
      }
    }
  });
  expect(apiHarness.generationRequests[0].payload.options).not.toHaveProperty("outputCompression");
  expect(apiHarness.generationRequests[0].payload.options).not.toHaveProperty("background");
});

test("Image keeps the requested catalog and sends Nano Banana edits through the official Gemini model", async ({ page, apiHarness }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic Gemini image request pass is sufficient");
  const bootstrap = structuredClone(publicBootstrapFixture);
  bootstrap.modelCatalog.push(
    {
      id: "botcf-image2-e2e",
      vendor: "botcf",
      model: "gpt-image-2",
      label: "BotCF Image2",
      capabilities: ["image", "imageEdit"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "gemini-nano-banana-2",
      vendor: "gemini",
      model: "gemini-3.1-flash-image",
      label: "Nano Banana 2",
      capabilities: ["image", "imageEdit", "vision"],
      defaultFor: [],
      enabled: true
    }
  );
  apiHarness.setBootstrap(bootstrap);

  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");

  const modelTrigger = module.getByRole("button", { name: "\u56fe\u50cf\u751f\u6210\u6a21\u578b", exact: true });
  await modelTrigger.click();
  const modelList = module.getByRole("listbox", { name: "\u56fe\u50cf\u751f\u6210\u6a21\u578b", exact: true });
  await expect(modelList.getByRole("option", { name: "BotCF Image2" })).toHaveCount(0);
  await modelList.getByRole("option", { name: "Nano Banana 2", exact: false }).click();
  await module.getByRole("button", { name: "\u56fe\u7247\u7f16\u8f91", exact: true }).click();
  await module.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({
    name: "reference-one.png",
    mimeType: "image/png",
    buffer: Buffer.from("reference-one")
  });
  await expect(module.getByRole("img", { name: "\u53c2\u8003\u56fe 1", exact: true })).toBeVisible();
  await expect(module.getByRole("textbox", { name: "\u53c2\u8003\u56fe\u94fe\u63a5", exact: true })).toHaveCount(0);

  await module.getByRole("button", { name: "\u7acb\u5373\u751f\u6210", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.length).toBe(1);
  const options = apiHarness.generationRequests[0].payload.options;
  expect(apiHarness.generationRequests[0].payload.modelId).toBe("gemini-nano-banana-2");
  expect(options?.inputImages).toHaveLength(1);
  expect(options?.inputImage?.dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(options).not.toHaveProperty("quality");
  expect(options).not.toHaveProperty("background");
});

test("authored menus keep selected state, focus restoration, and mobile touch targets", async ({ page }, testInfo) => {
  await openPublicModule(page, 1);
  const image = page.getByTestId("image-module");
  for (const name of ["图像生成模型", "图像尺寸", "生成质量"]) {
    await assertMenuLifecycle(image, name);
  }

  await openPublicModule(page, 2);
  const ppt = page.getByTestId("ppt-module");
  for (const name of ["PPT 生成模型", "演示类型", "目标受众", "演示页数", "叙事方式", "主题模板"]) {
    await assertMenuLifecycle(ppt, name);
  }
  if (isMobileProject(testInfo.project.name)) {
    for (const trigger of await ppt.locator(".figma-ppt-option-grid .figma-menu-trigger").all()) {
      const box = await trigger.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }

  await openPublicModule(page, 3);
  const mindmap = page.getByTestId("mindmap-module");
  await assertMenuLifecycle(mindmap, "思维导图生成模型");

  await openPublicModule(page, 5);
  const translate = page.getByTestId("translate-module");
  for (const name of ["翻译模型", "源语言", "目标语言"]) {
    await assertMenuLifecycle(translate, name);
  }
});

test("tablet creative builders follow the authored stacked breakpoint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic tablet geometry pass is sufficient");
  await page.setViewportSize({ width: 915, height: 671 });

  await openPublicModule(page, 1);
  const imageComposer = await page.locator(".figma-image-composer").boundingBox();
  const imageParameters = await page.locator(".figma-image-parameters").boundingBox();
  const imageForm = await page.locator(".figma-image-form").boundingBox();
  const imageOutput = await page.locator(".figma-image-output-pane").boundingBox();
  expect(imageComposer).not.toBeNull();
  expect(imageParameters).not.toBeNull();
  expect(imageForm).not.toBeNull();
  expect(imageOutput).not.toBeNull();
  expect(imageParameters!.x).toBeGreaterThanOrEqual(imageComposer!.x);
  expect(imageParameters!.x + imageParameters!.width).toBeLessThanOrEqual(imageComposer!.x + imageComposer!.width + 1);
  expect(imageParameters!.y).toBeGreaterThan(imageComposer!.y);
  expect(imageParameters!.y + imageParameters!.height).toBeLessThanOrEqual(imageComposer!.y + imageComposer!.height + 1);
  expect(Math.abs(imageOutput!.x - imageForm!.x)).toBeLessThanOrEqual(1);
  expect(imageOutput!.y).toBeGreaterThanOrEqual(imageForm!.y + imageForm!.height - 1);

  await openPublicModule(page, 2);
  const pptConfig = await page.locator(".figma-ppt-config-panel").boundingBox();
  const pptPreview = await page.locator(".figma-ppt-preview-panel").boundingBox();
  expect(pptConfig).not.toBeNull();
  expect(pptPreview).not.toBeNull();
  expect(Math.abs(pptConfig!.x - pptPreview!.x)).toBeLessThanOrEqual(1);
  expect(pptPreview!.y).toBeGreaterThanOrEqual(pptConfig!.y + pptConfig!.height - 1);
});

test("Image keeps parameters inside the composer while PPT follows its 1100px breakpoint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic breakpoint pass is sufficient");

  for (const { width, stacked } of [
    { width: 1099, stacked: true },
    { width: 1100, stacked: false },
    { width: 1279, stacked: false }
  ]) {
    await page.setViewportSize({ width, height: 800 });

    await openPublicModule(page, 1);
    const imageComposer = await page.locator(".figma-image-composer").boundingBox();
    const imageParameters = await page.locator(".figma-image-parameters").boundingBox();
    expect(imageComposer).not.toBeNull();
    expect(imageParameters).not.toBeNull();
    expect(imageParameters!.x).toBeGreaterThanOrEqual(imageComposer!.x);
    expect(imageParameters!.x + imageParameters!.width).toBeLessThanOrEqual(imageComposer!.x + imageComposer!.width + 1);
    expect(imageParameters!.y).toBeGreaterThan(imageComposer!.y);
    expect(imageParameters!.y + imageParameters!.height).toBeLessThanOrEqual(imageComposer!.y + imageComposer!.height + 1);

    await openPublicModule(page, 2);
    const pptConfig = await page.locator(".figma-ppt-config-panel").boundingBox();
    const pptPreview = await page.locator(".figma-ppt-preview-panel").boundingBox();
    expect(pptConfig).not.toBeNull();
    expect(pptPreview).not.toBeNull();
    if (stacked) {
      expect(Math.abs(pptConfig!.x - pptPreview!.x)).toBeLessThanOrEqual(1);
      expect(pptPreview!.y).toBeGreaterThanOrEqual(pptConfig!.y + pptConfig!.height - 1);
    } else {
      expect(pptPreview!.x).toBeGreaterThan(pptConfig!.x + pptConfig!.width - 1);
      expect(Math.abs(pptPreview!.y - pptConfig!.y)).toBeLessThanOrEqual(1);
    }
  }
});

test("mobile image actions and structured mind map keep the authored compact geometry", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile Figma geometry contract");

  await openPublicModule(page, 1);
  const mobileForm = await page.locator(".figma-image-form").boundingBox();
  const mobileOutput = await page.locator(".figma-image-output-pane").boundingBox();
  expect(mobileForm).not.toBeNull();
  expect(mobileOutput).not.toBeNull();
  expect(Math.abs(mobileOutput!.x - mobileForm!.x)).toBeLessThanOrEqual(1);
  expect(mobileOutput!.y).toBeGreaterThanOrEqual(mobileForm!.y + mobileForm!.height - 1);
  const imageActionMetrics = await page.locator(".figma-image-composer-footer").evaluate((element) => {
    const action = element.querySelector<HTMLElement>(".figma-primary-action");
    if (!action) return null;
    const footerBox = element.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    return {
      direction: getComputedStyle(element).flexDirection,
      footerWidth: footerBox.width,
      actionWidth: actionBox.width
    };
  });
  expect(imageActionMetrics).not.toBeNull();
  expect(imageActionMetrics!.direction).toBe("column");
  expect(Math.abs(imageActionMetrics!.footerWidth - imageActionMetrics!.actionWidth)).toBeLessThanOrEqual(1);
  const imageOverflow = await documentOverflow(page);
  expect(imageOverflow.documentWidth).toBeLessThanOrEqual(imageOverflow.viewportWidth + 1);

  await openPublicModule(page, 3);
  const mapMain = await page.locator(".figma-map-main").boundingBox();
  const mapInspector = await page.locator(".figma-map-inspector").boundingBox();
  expect(mapMain).not.toBeNull();
  expect(mapInspector).not.toBeNull();
  expect(Math.abs(mapInspector!.x - mapMain!.x)).toBeLessThanOrEqual(1);
  expect(mapInspector!.y).toBeGreaterThanOrEqual(mapMain!.y + mapMain!.height - 1);
  await expect(page.locator(".figma-map-tree-node")).toHaveCount(14);
  await expect(page.locator(".figma-map-connectors path")).toHaveCount(13);
  const mapOverflow = await documentOverflow(page);
  expect(mapOverflow.documentWidth).toBeLessThanOrEqual(mapOverflow.viewportWidth + 1);
});

test("shared authored menus use the Figma base radius", async ({ page }) => {
  await openPublicModule(page, 1);
  const image = page.getByTestId("image-module");
  const trigger = image.getByRole("button", { name: "\u56fe\u50cf\u5c3a\u5bf8", exact: true });
  await trigger.click();
  const popover = image.getByRole("listbox", { name: "\u56fe\u50cf\u5c3a\u5bf8", exact: true });
  await expect(popover).toBeVisible();
  await expect.poll(() => trigger.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("16px");
  await expect.poll(() => popover.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("16px");
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
});

test("authored menu popovers stay inside their viewport and clipping ancestors", async ({ page }) => {
  const menuCases = [
    { index: 1, names: ["图像生成模型", "图像尺寸", "生成质量"] },
    { index: 2, names: ["PPT 生成模型", "演示类型", "目标受众", "演示页数", "叙事方式", "主题模板"] },
    { index: 3, names: ["思维导图生成模型", "思维导图类型", "思维导图最大层级", "思维导图内容密度"] },
    { index: 5, names: ["翻译模型", "源语言", "目标语言"] }
  ] as const;

  for (const menuCase of menuCases) {
    await openPublicModule(page, menuCase.index);
    const module = page.locator("[data-testid$='-module']:visible");

    for (const name of menuCase.names) {
      await page.locator(".figma-workspace").evaluate((element) => {
        element.scrollTop = 0;
      });
      const trigger = module.getByRole("button", { name, exact: true });
      await trigger.click();
      const popover = module.getByRole("listbox", { name, exact: true });
      await expect(popover).toBeVisible();

      const geometry = await popover.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const clippedBy: string[] = [];
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== document.body) {
          const style = getComputedStyle(ancestor);
          const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
          const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
          if (clipsX || clipsY) {
            const ancestorRect = ancestor.getBoundingClientRect();
            const intersection = {
              left: Math.max(rect.left, ancestorRect.left),
              top: Math.max(rect.top, ancestorRect.top),
              right: Math.min(rect.right, ancestorRect.right),
              bottom: Math.min(rect.bottom, ancestorRect.bottom)
            };
            if (
              (clipsX && (intersection.left > rect.left + 0.5 || intersection.right < rect.right - 0.5)) ||
              (clipsY && (intersection.top > rect.top + 0.5 || intersection.bottom < rect.bottom - 0.5))
            ) {
              clippedBy.push(ancestor.className || ancestor.tagName);
            }
          }
          ancestor = ancestor.parentElement;
        }
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          clippedBy
        };
      });
      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();
      expect(geometry.left).toBeGreaterThanOrEqual(-0.5);
      expect(geometry.top).toBeGreaterThanOrEqual(-0.5);
      expect(geometry.right).toBeLessThanOrEqual(viewport!.width + 0.5);
      expect(geometry.bottom).toBeLessThanOrEqual(viewport!.height + 0.5);
      expect(geometry.clippedBy).toEqual([]);

      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
    }
  }
});

test("desktop secondary controls keep the compact Version 24 geometry", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo.project.name), "Desktop Figma geometry contract");
  await page.setViewportSize({ width: 1440, height: 900 });

  await openPublicModule(page, 2);
  const pptOption = page.locator(".figma-ppt-option-grid > .figma-menu").first();
  const pptTrigger = pptOption.locator(".figma-menu-trigger");
  const pptBoxes = await Promise.all([pptOption.boundingBox(), pptTrigger.boundingBox()]);
  expect(pptBoxes[0]).not.toBeNull();
  expect(pptBoxes[1]).not.toBeNull();
  expect(Math.abs(pptBoxes[0]!.height - 56)).toBeLessThanOrEqual(1);
  expect(Math.abs(pptBoxes[1]!.height - 56)).toBeLessThanOrEqual(1);

  await openPublicModule(page, 3);
  const mapCanvas = page.locator(".figma-map-canvas");
  const mapNodes = page.locator(".figma-map-tree-node");
  const mapBox = await mapCanvas.boundingBox();
  const nodeGeometry = await mapNodes.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      width: element.offsetWidth,
      minHeight: Number.parseFloat(style.minHeight),
      root: element.classList.contains("root"),
      side: element.getAttribute("data-side")
    };
  }));
  expect(mapBox).not.toBeNull();
  expect(nodeGeometry).toHaveLength(14);
  expect(nodeGeometry.filter((node) => node.root)).toEqual([
    expect.objectContaining({ width: 196, minHeight: 72, side: "0" })
  ]);
  expect(nodeGeometry.filter((node) => !node.root).every((node) => node.width === 176 && node.minHeight === 58)).toBe(true);
  expect(nodeGeometry.some((node) => node.side === "-1")).toBe(true);
  expect(nodeGeometry.some((node) => node.side === "1")).toBe(true);
  await expect(page.locator(".figma-map-connectors path")).toHaveCount(13);

  await openPublicModule(page, 4);
  const assistantMetrics = await page.locator(".figma-assistants-page").evaluate((element) => {
    const filter = element.querySelector<HTMLElement>(".figma-agent-filters button");
    const grid = element.querySelector<HTMLElement>(".figma-agent-grid");
    const description = element.querySelector<HTMLElement>(".figma-agent-card > p");
    const tag = element.querySelector<HTMLElement>(".figma-agent-tags small");
    if (!filter || !grid || !description || !tag) return null;
    const filterBox = filter.getBoundingClientRect();
    return {
      filterHeight: filterBox.height,
      filterRadius: parseFloat(getComputedStyle(filter).borderRadius),
      gridGap: getComputedStyle(grid).gap,
      descriptionSize: getComputedStyle(description).fontSize,
      tagSize: getComputedStyle(tag).fontSize
    };
  });
  expect(assistantMetrics).not.toBeNull();
  expect(Math.abs(assistantMetrics!.filterHeight - 34)).toBeLessThanOrEqual(1);
  expect(assistantMetrics!.filterRadius).toBeGreaterThanOrEqual(17);
  expect(assistantMetrics!.gridGap).toBe("12px");
  expect(assistantMetrics!.descriptionSize).toBe("12px");
  expect(assistantMetrics!.tagSize).toBe("10px");

  await openPublicModule(page, 5);
  const translateMetrics = await page.locator(".figma-translate-toolbar").evaluate((element) => {
    const box = (selector: string) => {
      const target = element.querySelector<HTMLElement>(selector);
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };
    return {
      source: box(".figma-language-menu.source .figma-menu-trigger"),
      swap: box(".figma-language-row > button"),
      target: box(".figma-language-menu.target .figma-menu-trigger"),
      tone: box(".figma-tone-tabs button")
    };
  });
  for (const key of ["source", "swap", "target", "tone"] as const) {
    expect(translateMetrics[key]).not.toBeNull();
  }
  expect(Math.abs(translateMetrics.source!.width - 96)).toBeLessThanOrEqual(1);
  expect(Math.abs(translateMetrics.target!.width - 96)).toBeLessThanOrEqual(1);
  expect(Math.abs(translateMetrics.swap!.width - 28)).toBeLessThanOrEqual(1);
  expect(Math.abs(translateMetrics.source!.height - 28)).toBeLessThanOrEqual(1);
  expect(Math.abs(translateMetrics.tone!.height - 27)).toBeLessThanOrEqual(1);
});

test("tablet translation controls remain touch safe inside the mobile shell", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic tablet touch pass is sufficient");
  await page.setViewportSize({ width: 768, height: 900 });
  await openPublicModule(page, 5);

  const module = page.getByTestId("translate-module");
  for (const control of [
    module.getByRole("button", { name: "\u7ffb\u8bd1\u6a21\u578b", exact: true }),
    module.getByRole("button", { name: "\u6e90\u8bed\u8a00", exact: true }),
    module.getByRole("button", { name: "\u4ea4\u6362\u8bed\u8a00", exact: true }),
    module.getByRole("button", { name: "\u76ee\u6807\u8bed\u8a00", exact: true }),
    module.getByRole("button", { name: "\u81ea\u7136\u4e13\u4e1a", exact: true })
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await visibleScrollOwners(page)).toHaveLength(1);
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("Chat model submenu keeps vendor state, visible counts, and focus restoration", async ({ page }) => {
  await openPublicModule(page, 0);
  const chat = page.getByTestId("chat-module");
  const trigger = chat.getByRole("button", { name: "选择对话模型", exact: true });

  await trigger.click();
  const popover = chat.locator(".figma-model-popover");
  const listbox = chat.getByRole("listbox", { name: /OpenAI 模型|Claude 模型|Gemini 模型|Kimi 模型|DeepSeek 模型|通义千问 模型/ });
  await expect(popover).toBeVisible();
  const viewport = page.viewportSize();
      const popoverBox = await popover.boundingBox();
      expect(viewport).not.toBeNull();
      expect(popoverBox).not.toBeNull();
      expect(popoverBox!.x).toBeGreaterThanOrEqual(-0.5);
      expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(viewport!.width + 0.5);
  await expect(popover).toHaveAttribute("data-placement", /up|down/);
  await expect(popover.getByRole("tab")).toHaveText(["OpenAI", "Claude", "Gemini", "Kimi", "DeepSeek", "通义千问"]);

  const openAiCount = await listbox.getByRole("option").count();
  await expect(popover.locator(".figma-model-popover-heading > span")).toHaveText(`显示 ${Math.min(3, openAiCount)} 个`);
  await popover.getByRole("tab", { name: "Claude", exact: true }).click();
  const claudeList = chat.getByRole("listbox", { name: "Claude 模型", exact: true });
  const claudeOptions = claudeList.getByRole("option");
  const claudeCount = await claudeOptions.count();
  const firstClaudeOption = claudeOptions.first();
  await expect(popover.locator(".figma-model-popover-heading > span")).toHaveText(`显示 ${Math.min(3, claudeCount)} 个`);
  await expect(firstClaudeOption).toHaveAttribute("tabindex", "0");
  await expect(firstClaudeOption).toBeFocused();
  await firstClaudeOption.click();
  await expect(popover).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(popover).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(popover).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Chat vendor tabs activate from horizontal keyboard navigation", async ({ page }) => {
  await openPublicModule(page, 0);
  const chat = page.getByTestId("chat-module");
  const trigger = chat.getByRole("button", { name: "选择对话模型", exact: true });

  await trigger.click();
  const popover = chat.locator(".figma-model-popover");
  const tabs = popover.getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");

  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(chat.getByRole("listbox", { name: "Claude 模型", exact: true })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(chat.getByRole("listbox", { name: "Gemini 模型", exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Chat model submenu closes when keyboard focus leaves its list", async ({ page }) => {
  await openPublicModule(page, 0);
  const chat = page.getByTestId("chat-module");
  const trigger = chat.getByRole("button", { name: "选择对话模型", exact: true });

  await trigger.click();
  const popover = chat.locator(".figma-model-popover");
  await expect(popover).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(popover).toHaveCount(0);
});

test("Chat model submenu keeps its horizontal correction stable after scrolling", async ({ page }) => {
  await openPublicModule(page, 0);
  const chat = page.getByTestId("chat-module");
  const trigger = chat.getByRole("button", { name: "选择对话模型", exact: true });

  await trigger.click();
  const picker = chat.locator(".figma-session-model");
  const popover = chat.locator(".figma-model-popover");
  await picker.evaluate((element) => {
    (element as HTMLElement).style.transform = "translateX(240px)";
  });

  for (let index = 0; index < 3; index += 1) {
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await page.waitForTimeout(30);
  }

  const viewport = page.viewportSize();
  const box = await popover.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 0.5);
});

test("PPT sends structured options and renders an interactive 16:9 deck", async ({ page, apiHarness }, testInfo) => {
  await openPublicModule(page, 2);
  const module = page.getByTestId("ppt-module");

  await expect(module.locator(".figma-ppt-hero > p")).toHaveText("06 / AUTO-DECK");
  await expect(module.getByRole("heading", { name: "AI \u4e00\u952e PPT", exact: true })).toBeVisible();
  const topic = module.getByRole("textbox", { name: "\u6f14\u793a\u4e3b\u9898", exact: true });
  await expect(topic).toHaveValue("\u751f\u6210\u5f0f AI \u5982\u4f55\u91cd\u5851\u4f01\u4e1a\u521b\u65b0");

  await chooseFigmaMenu(module, "PPT \u751f\u6210\u6a21\u578b", "OpenAI Code");
  await chooseFigmaMenu(module, "\u6f14\u793a\u7c7b\u578b", "\u4ea7\u54c1\u53d1\u5e03");
  await expect(module.locator(".figma-ppt-preset-summary")).toContainText("产品发布");
  await expect(module.getByRole("button", { name: "目标受众", exact: true })).toContainText("客户与合作伙伴");
  await expect(module.getByRole("button", { name: "演示时长", exact: true })).toContainText("15 分钟");
  await expect(module.getByRole("button", { name: "演示页数", exact: true })).toContainText("10 页");
  await expect(module.getByRole("button", { name: "叙事方式", exact: true })).toContainText("故事叙事");
  await expect(module.getByRole("button", { name: "视觉气质", exact: true })).toContainText("明快创意");
  await expect(module.getByRole("button", { name: "主题模板", exact: true })).toContainText("红白简报");
  await chooseFigmaMenu(module, "\u76ee\u6807\u53d7\u4f17", "\u5185\u90e8\u56e2\u961f");
  await chooseFigmaMenu(module, "\u6f14\u793a\u9875\u6570", "12 \u9875");
  await chooseFigmaMenu(module, "\u6f14\u793a\u65f6\u957f", "30 \u5206\u949f");
  await chooseFigmaMenu(module, "\u53d9\u4e8b\u65b9\u5f0f", "\u6570\u636e\u9a71\u52a8");
  await chooseFigmaMenu(module, "\u5185\u5bb9\u5bc6\u5ea6", "\u8be6\u7ec6");
  await chooseFigmaMenu(module, "\u6f14\u793a\u8bed\u8a00", "\u4e2d\u82f1\u53cc\u8bed");
  await chooseFigmaMenu(module, "\u89c6\u89c9\u6c14\u8d28", "\u7a33\u91cd\u5546\u52a1");
  await chooseFigmaMenu(module, "\u4e3b\u9898\u6a21\u677f", "\u5546\u52a1\u84dd");
  await module.getByRole("textbox", { name: "\u5fc5\u987b\u5305\u542b\u7684\u5185\u5bb9", exact: true }).fill("\u5e02\u573a\u6570\u636e\u4e0e\u4e0b\u4e00\u6b65\u884c\u52a8");
  await module.getByRole("textbox", { name: "\u9700\u8981\u907f\u514d\u7684\u5185\u5bb9", exact: true }).fill("\u7a7a\u6d1e\u53e3\u53f7");

  const configBox = await module.locator(".figma-ppt-config-panel").boundingBox();
  const previewBox = await module.locator(".figma-ppt-preview-panel").boundingBox();
  expect(configBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  await module.getByRole("button", { name: "\u751f\u6210\u6f14\u793a\u7a3f", exact: true }).click();

  await expect.poll(() => apiHarness.generationRequests.length).toBe(1);
  expect(apiHarness.generationRequests.at(-1)).toMatchObject({
    moduleId: "ppt",
    payload: {
      modelId: "openai-code",
      options: {
        ppt: {
          presentationType: "product-launch",
          audience: "\u5185\u90e8\u56e2\u961f",
          duration: "30 \u5206\u949f",
          slideCount: 12,
          narrative: "data-first",
          contentDensity: "detailed",
          language: "bilingual",
          visualTone: "\u7a33\u91cd\u5546\u52a1",
          themeId: "business-blue",
          mustInclude: "\u5e02\u573a\u6570\u636e\u4e0e\u4e0b\u4e00\u6b65\u884c\u52a8",
          avoidContent: "\u7a7a\u6d1e\u53e3\u53f7"
        }
      }
    }
  });

  const thumbnails = module.locator(".figma-ppt-thumbnails > button");
  await expect(thumbnails).toHaveCount(12);
  const renderedSlideTypes = await thumbnails.locator(".figma-ppt-slide").evaluateAll((slides) => (
    slides.map((slide) => slide.getAttribute("data-slide-type"))
  ));
  expect(renderedSlideTypes).toEqual([
    "cover",
    "quote",
    "two-column",
    "data",
    "timeline",
    "section",
    "content",
    "quote",
    "two-column",
    "data",
    "timeline",
    "summary"
  ]);
  for (let index = 2; index < renderedSlideTypes.length; index += 1) {
    expect(
      renderedSlideTypes[index] === renderedSlideTypes[index - 1]
      && renderedSlideTypes[index] === renderedSlideTypes[index - 2]
    ).toBe(false);
  }

  const layoutSelectors = [
    ["cover", ".figma-ppt-slide-cover"],
    ["summary", ".figma-ppt-slide-summary"],
    ["data", ".figma-ppt-slide-data"],
    ["timeline", ".figma-ppt-slide-timeline"],
    ["two-column", ".figma-ppt-slide-columns"],
    ["quote", "blockquote"]
  ] as const;
  for (const [type, selector] of layoutSelectors) {
    await module.locator(`.figma-ppt-thumbnails > button:has(.figma-ppt-slide[data-slide-type="${type}"])`).first().click();
    await expect(module.locator(".figma-ppt-stage-frame .figma-ppt-slide")).toHaveAttribute("data-slide-type", type);
    await expect(module.locator(`.figma-ppt-stage-frame ${selector}`)).toBeVisible();
  }

  if (!isMobileProject(testInfo.project.name)) {
    expect(configBox!.width).toBeGreaterThanOrEqual(288);
    expect(configBox!.width).toBeLessThanOrEqual(300);
    const thumbnailRail = await module.locator(".figma-ppt-thumbnails").boundingBox();
    const firstThumbnail = await thumbnails.first().locator(".figma-ppt-slide").boundingBox();
    expect(thumbnailRail).not.toBeNull();
    expect(firstThumbnail).not.toBeNull();
    expect(thumbnailRail!.width).toBeGreaterThanOrEqual(144);
    expect(thumbnailRail!.width).toBeLessThanOrEqual(153);
    expect(firstThumbnail!.width).toBeGreaterThanOrEqual(106);
    expect(firstThumbnail!.width).toBeLessThanOrEqual(116);
    expect(Math.abs(firstThumbnail!.width / firstThumbnail!.height - 16 / 9)).toBeLessThanOrEqual(0.05);
  }

  await thumbnails.nth(2).click();
  await expect(thumbnails.nth(2)).toHaveAttribute("aria-current", "page");
  const activeSlide = module.locator(".figma-ppt-stage-frame .figma-ppt-slide");
  await expect(activeSlide).toHaveAttribute("aria-label", /\u7b2c 3 \u9875/);
  await expect(activeSlide).toHaveAttribute("data-theme", "business-blue");

  await expect(module.locator(".figma-ppt-preview-actions > span")).toHaveText("100%");
  await expect(module.getByRole("button", { name: "\u653e\u5927\u9884\u89c8", exact: true })).toBeDisabled();
  await expect(activeSlide.locator(":scope > footer")).not.toContainText("xi-ai-web");
  await module.getByRole("button", { name: "\u7f29\u5c0f\u9884\u89c8", exact: true }).click();
  await expect(module.locator(".figma-ppt-preview-actions > span")).toHaveText("90%");
  await module.getByRole("button", { name: "\u653e\u5927\u9884\u89c8", exact: true }).click();
  await expect(module.locator(".figma-ppt-preview-actions > span")).toHaveText("100%");
  await module.getByRole("button", { name: "\u5168\u5c4f\u9884\u89c8", exact: true }).click();
  const fullscreen = page.locator(".figma-ppt-fullscreen-dialog");
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen.locator(".figma-ppt-slide")).toHaveAttribute("data-theme", "business-blue");
  await fullscreen.getByRole("button", { name: "\u5173\u95ed\u5168\u5c4f\u9884\u89c8", exact: true }).click();
  await expect(fullscreen).toHaveCount(0);

  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("PPT model selection locks while a generation request is in flight", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic in-flight state pass is sufficient");
  await page.route("**/api/generate/ppt", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      json: {
        id: "delayed-ppt-result",
        module: "ppt",
        title: "Delayed PPT result",
        status: "completed",
        text: "# Delayed deck\n\n## Slide 1",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    });
  });
  await openPublicModule(page, 2);

  const module = page.getByTestId("ppt-module");
  const model = module.getByRole("button", { name: "PPT \u751f\u6210\u6a21\u578b", exact: true });
  await module.getByRole("button", { name: "\u751f\u6210\u6f14\u793a\u7a3f", exact: true }).click();
  await expect(model).toBeDisabled();
  await expect(module.locator(".figma-ppt-preview-loading")).toBeVisible();
  await expect(module.locator(".figma-ppt-preview-loading")).toHaveCount(0);
  await expect(model).toBeEnabled();
});

test("Mind Map renders a complete structured canvas and sends bounded generation options", async ({ page, apiHarness }) => {
  await openPublicModule(page, 3);
  const module = page.getByTestId("mindmap-module");

  await expect(module.locator(".figma-mindmap-hero > p")).toHaveText("07 / THINKING MAP");
  await expect(module.getByRole("heading", { name: "\u628a\u6a21\u7cca\u60f3\u6cd5\uff0c\u53d8\u6210\u6e05\u6670\u8def\u5f84\u3002", exact: true })).toBeVisible();
  await chooseFigmaMenu(module, "\u601d\u7ef4\u5bfc\u56fe\u751f\u6210\u6a21\u578b", "Claude Haiku");
  await chooseFigmaMenu(module, "\u601d\u7ef4\u5bfc\u56fe\u7c7b\u578b", "\u9879\u76ee\u8ba1\u5212");
  await chooseFigmaMenu(module, "\u601d\u7ef4\u5bfc\u56fe\u6700\u5927\u5c42\u7ea7", "3 \u5c42");
  await chooseFigmaMenu(module, "\u601d\u7ef4\u5bfc\u56fe\u5185\u5bb9\u5bc6\u5ea6", "\u8be6\u7ec6");

  const prompt = module.getByRole("textbox", { name: "\u5bfc\u56fe\u4e3b\u9898", exact: true });
  await expect(prompt).toHaveValue("");
  await expect(module.getByText("\u793a\u4f8b\u5bfc\u56fe", { exact: true })).toBeVisible();
  await expect(module.locator(".figma-map-tree-node")).toHaveCount(14);
  await prompt.fill("\u5236\u5b9a\u65b0\u4ea7\u54c1\u4e0a\u7ebf\u8ba1\u5212");
  await module.getByRole("button", { name: "AI \u751f\u6210\u5bfc\u56fe", exact: true }).click();
  await expect(module.getByRole("status")).toContainText("\u601d\u7ef4\u5bfc\u56fe\u5df2\u751f\u6210");
  await expect(module.getByText("\u793a\u4f8b\u5bfc\u56fe", { exact: true })).toHaveCount(0);
  await expect(module.locator(".figma-map-tree-node")).toHaveCount(6);

  const toolbar = module.locator(".figma-map-zoom");
  await expect(toolbar.getByText(/%$/)).toBeVisible();
  await toolbar.getByRole("button", { name: "\u653e\u5927", exact: true }).click();
  await expect(toolbar.getByText(/%$/)).toBeVisible();
  await toolbar.getByRole("button", { name: "\u6298\u53e0\u5168\u90e8\u8282\u70b9", exact: true }).click();
  await expect(module.locator(".figma-map-tree-node")).toHaveCount(1);
  await toolbar.getByRole("button", { name: "\u5c55\u5f00\u5168\u90e8\u8282\u70b9", exact: true }).click();
  await expect(module.locator(".figma-map-tree-node")).toHaveCount(6);

  await expect.poll(() => apiHarness.generationRequests.at(-1)?.moduleId).toBe("mindmap");
  expect(apiHarness.generationRequests.at(-1)?.payload).toMatchObject({
    modelId: "anthropic-haiku",
    options: {
      mindmap: {
        presetId: "project-plan",
        maxDepth: 3,
        density: "detailed",
        operation: "generate"
      }
    }
  });
});

test("Assistants use backend categories and bind the exact template to Chat", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  await expect.poll(async () => (await readWorkspaceRecords<{ id: string }>(page, "conversations")).length).toBe(1);
  const existingConversation = (await readWorkspaceRecords<{ id: string; assistantId: string }>(page, "conversations"))[0];

  await openPublicModule(page, 4);
  const module = page.getByTestId("assistants-module");

  await expect(module.locator(".figma-assistants-hero > div > p")).toHaveText("08 / AGENT LIBRARY");
  await expect(module.getByRole("heading", { name: /\u7ed9\u4efb\u52a1\u627e\u4e00\u4f4d\s*\u771f\u6b63\u61c2\u884c\u7684\u4f19\u4f34\u3002/ })).toBeVisible();
  await expect(module.getByText("07 CURATED AGENTS", { exact: true })).toBeVisible();

  const filters = module.getByRole("navigation", { name: "\u52a9\u624b\u5206\u7c7b", exact: true });
  await expect(filters.getByRole("button")).toHaveCount(7);
  for (const category of ["全部", "通用效率", "内容创作", "编程开发", "学习研究", "商业办公", "生活创意"]) {
    await expect(filters.getByRole("button", { name: category, exact: true })).toBeVisible();
  }
  const cards = module.getByRole("region", { name: "\u52a9\u624b\u5217\u8868", exact: true }).getByRole("button");
  await expect(cards).toHaveCount(7);

  await filters.getByRole("button", { name: "商业办公", exact: true }).click();
  await expect(filters.getByRole("button", { name: "商业办公", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Product Partner");
  await expect(cards.first()).toContainText("产品");
  await expect(cards.first()).toContainText("需求");
  await expect(cards.first().locator('[data-assistant-avatar="panels-top-left"]')).toBeVisible();

  const productCard = cards.first();
  await productCard.click();
  const dialog = page.getByRole("dialog", { name: "Product Partner", exact: true });
  await expect(dialog.getByText("SPECIALIST AGENT", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "\u542f\u52a8\u6b64\u52a9\u624b", exact: true })).toHaveCount(1);
  await dialog.getByRole("button", { name: "\u5173\u95ed\u52a9\u624b\u8be6\u60c5", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(productCard).toBeFocused();

  await productCard.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "把这个想法整理成产品需求", exact: true }).click();
  await dialog.getByRole("button", { name: "\u542f\u52a8\u6b64\u52a9\u624b", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await waitForPublicModule(page, publicDestinations[0]);
  const chat = page.getByTestId("chat-module");
  await expect(chat).toBeVisible();
  const launchedSession = chat.locator(".figma-chat-session").first();
  await expect(launchedSession.getByText("Product Partner", { exact: true })).toBeVisible();
  await expect(launchedSession.getByLabel("消息内容", { exact: true })).toHaveValue("把这个想法整理成产品需求");
  expect(apiHarness.chatRequests).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("aistudio-selected-assistant"))).toBeNull();
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("xi-ai-web-assistant-launch"))).toBeNull();
  await expect.poll(async () => {
    const conversations = await readWorkspaceRecords<Array<{ assistantId?: string }>[number]>(page, "conversations");
    return conversations.some((conversation) => conversation.assistantId === "product-assistant");
  }).toBe(true);
  const conversations = await readWorkspaceRecords<{ id: string; assistantId: string }>(page, "conversations");
  expect(conversations).toHaveLength(2);
  expect(conversations.find((conversation) => conversation.id === existingConversation.id)?.assistantId).toBe(existingConversation.assistantId);

  await launchedSession.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  await expect(launchedSession.locator('.figma-message-avatar[data-assistant-avatar="panels-top-left"]')).toBeVisible();
  expect(apiHarness.chatRequests[0]).toMatchObject({
    assistantId: "product-assistant",
    displayContent: "把这个想法整理成产品需求"
  });
});

test("Chat clears an unavailable assistant launch without rebinding or sending", async ({ page, apiHarness }) => {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      assistantId: "removed-assistant",
      starterPrompt: "这条草稿不能绑定到其他助手",
      requestedAt: new Date().toISOString()
    }));
  }, "xi-ai-web-assistant-launch");

  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const chat = page.getByTestId("chat-module");
  await expect(chat.getByRole("alert")).toContainText("所选助手已停用或不存在");
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("xi-ai-web-assistant-launch"))).toBeNull();
  await expect.poll(async () => (await readWorkspaceRecords<{ assistantId: string }>(page, "conversations")).length).toBe(1);
  const conversations = await readWorkspaceRecords<{ assistantId: string }>(page, "conversations");
  expect(conversations[0].assistantId).toBe("");
  await expect(chat.getByLabel("消息内容", { exact: true })).toHaveValue("");
  expect(apiHarness.chatRequests).toHaveLength(0);
});

test("ordinary Chat starts without an Assistant and omits assistantId from requests", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const chat = page.getByTestId("chat-module");
  await expect.poll(async () => (await readWorkspaceRecords<{ assistantId: string }>(page, "conversations")).length).toBe(1);
  const conversations = await readWorkspaceRecords<{ assistantId: string }>(page, "conversations");
  expect(conversations[0].assistantId).toBe("");
  await expect(chat.locator(".figma-session-assistant")).toHaveCount(0);

  await chat.getByLabel("消息内容", { exact: true }).fill("普通对话不使用助手");
  await chat.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(Object.hasOwn(apiHarness.chatRequests[0], "assistantId")).toBe(false);
  expect(apiHarness.chatRequests[0].displayContent).toBe("普通对话不使用助手");
});

test("Translation exposes tone, language, clear, result, and copy interactions", async ({ page, context, apiHarness }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openPublicModule(page, 5);
  const module = page.getByTestId("translate-module");

  await expect(module.locator(".figma-translate-hero > p")).toHaveText("09 / TRANSLATE");
  await expect(module.getByRole("heading", { name: "\u4e0d\u53ea\u662f\u7ffb\u8bd1\uff0c\u66f4\u50cf\u6bcd\u8bed\u8868\u8fbe\u3002", exact: true })).toBeVisible();
  await chooseFigmaMenu(module, "\u7ffb\u8bd1\u6a21\u578b", "Gemini Flash");
  const sourceLanguage = module.getByRole("button", { name: "\u6e90\u8bed\u8a00", exact: true });
  const targetLanguage = module.getByRole("button", { name: "\u76ee\u6807\u8bed\u8a00", exact: true });
  await expect(sourceLanguage).toContainText("\u4e2d\u6587\uff08\u7b80\u4f53\uff09");
  await chooseFigmaMenu(module, "\u6e90\u8bed\u8a00", "\u81ea\u52a8\u68c0\u6d4b");
  await chooseFigmaMenu(module, "\u76ee\u6807\u8bed\u8a00", "\u65e5\u672c\u8a9e");
  await module.getByRole("button", { name: "\u4ea4\u6362\u8bed\u8a00", exact: true }).click();
  await expect(sourceLanguage).toContainText("\u65e5\u672c\u8a9e");
  await expect(targetLanguage).toContainText("\u4e2d\u6587\uff08\u7b80\u4f53\uff09");

  const toneGroup = module.getByRole("group", { name: "\u7ffb\u8bd1\u8bed\u6c14", exact: true });
  await expect(toneGroup.getByRole("button")).toHaveText(["\u81ea\u7136\u4e13\u4e1a", "\u7b80\u6d01", "\u8425\u9500\u611f"]);
  await toneGroup.getByRole("button", { name: "\u8425\u9500\u611f", exact: true }).click();
  await expect(toneGroup.getByRole("button", { name: "\u8425\u9500\u611f", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(module.getByText("TRANSLATION \u00b7 \u8425\u9500\u611f", { exact: true })).toBeVisible();

  const source = module.getByRole("textbox", { name: "\u5f85\u7ffb\u8bd1\u5185\u5bb9", exact: true });
  await expect(source).toHaveAttribute("maxlength", "600000");
  await chooseFigmaMenu(module, "\u7ffb\u8bd1\u6a21\u578b", "Test Chat");
  await expect(source).toHaveAttribute("maxlength", "24000");
  await expect(module.getByText(/\/ 24,000 \u5b57\u7b26$/)).toBeVisible();
  await chooseFigmaMenu(module, "\u7ffb\u8bd1\u6a21\u578b", "Gemini Flash");
  await expect(source).toHaveAttribute("maxlength", "600000");
  await source.focus();
  const editorGeometry = await module.locator(".figma-translate-editor").evaluate((element) => {
    const sourcePanel = element.querySelector<HTMLElement>(".figma-translate-source");
    const resultPanel = element.querySelector<HTMLElement>(".figma-translate-result");
    const textarea = sourcePanel?.querySelector<HTMLTextAreaElement>("textarea");
    const sourceFooter = sourcePanel?.querySelector<HTMLElement>(":scope > footer");
    const output = resultPanel?.querySelector<HTMLElement>(".figma-translate-output");
    if (!sourcePanel || !resultPanel || !textarea || !sourceFooter || !output) return null;
    const sourceBox = sourcePanel.getBoundingClientRect();
    const resultBox = resultPanel.getBoundingClientRect();
    const textareaBox = textarea.getBoundingClientRect();
    const outputBox = output.getBoundingClientRect();
    const footerBox = sourceFooter.getBoundingClientRect();
    const textareaStyle = getComputedStyle(textarea);
    const outputStyle = getComputedStyle(output);
    return {
      panelHeightDelta: Math.abs(sourceBox.height - resultBox.height),
      inputFooterOverlap: Math.max(0, textareaBox.bottom - footerBox.top),
      inputContained: textareaBox.top >= sourceBox.top && textareaBox.bottom <= sourceBox.bottom,
      contentInsetDelta: Math.abs(textareaBox.left - sourceBox.left - (outputBox.left - resultBox.left)),
      borderStyle: textareaStyle.borderStyle,
      borderRadius: textareaStyle.borderRadius,
      outputBorderStyle: outputStyle.borderStyle,
      outputBorderRadius: outputStyle.borderRadius,
      boxShadow: textareaStyle.boxShadow,
      outlineStyle: textareaStyle.outlineStyle
    };
  });
  expect(editorGeometry).not.toBeNull();
  expect(editorGeometry!.panelHeightDelta).toBeLessThanOrEqual(1);
  expect(editorGeometry!.inputFooterOverlap).toBe(0);
  expect(editorGeometry!.inputContained).toBe(true);
  expect(editorGeometry!.contentInsetDelta).toBeLessThanOrEqual(1);
  expect(editorGeometry!.borderStyle).toBe("solid");
  expect(editorGeometry!.borderRadius).toBe("12px");
  expect(editorGeometry!.outputBorderStyle).toBe("solid");
  expect(editorGeometry!.outputBorderRadius).toBe("12px");
  expect(editorGeometry!.boxShadow).toBe("none");
  expect(editorGeometry!.outlineStyle).toBe("none");
  const clear = module.getByRole("button", { name: "\u6e05\u7a7a", exact: true });
  const copy = module.getByRole("button", { name: "\u590d\u5236\u8bd1\u6587", exact: true });
  await expect(module.getByText("\u8bed\u4e49\u4fdd\u771f", { exact: true })).toHaveCount(0);
  await expect(module.getByText("\u672c\u5730\u5316\u8868\u8fbe", { exact: true })).toHaveCount(0);
  await expect(copy).toBeEnabled();
  await expect(module.getByText(/Today, we are officially launching/)).toBeVisible();
  await source.fill("hello");
  await expect(module.getByText("5 / 600,000 字符", { exact: true })).toBeVisible();
  await clear.click();
  await expect(source).toHaveValue("");
  await expect(clear).toBeDisabled();
  await expect(copy).toBeDisabled();

  await source.fill("hello");
  await module.getByRole("button", { name: "\u7ffb\u8bd1\u6587\u672c", exact: true }).click();
  await expect(module.getByText("Deterministic translated result.", { exact: true })).toBeVisible();
  expect(apiHarness.generationRequests.at(-1)).toMatchObject({ moduleId: "translate" });
  expect(apiHarness.generationRequests.at(-1)?.payload).toMatchObject({
    modelId: "gemini-flash",
    prompt: expect.stringContaining("\u8bed\u6c14\u8981\u6c42\uff1a\u8425\u9500\u611f")
  });
  await copy.click();
  await expect(copy).toContainText("\u5df2\u590d\u5236");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Deterministic translated result.");

  const capabilities = module.getByLabel("\u7ffb\u8bd1\u80fd\u529b", { exact: true });
  await expect(capabilities.locator(":scope > button")).toHaveCount(3);
  await expect(capabilities).toContainText("\u957f\u6587\u7ffb\u8bd1");
  await expect(capabilities).toContainText("\u672f\u8bed\u5e93");
  await expect(capabilities).toContainText("\u53cc\u8bed\u5bf9\u7167");
});

test("public shell excludes retired modules, layouts, and persistent API actions", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  if (isMobileProject(testInfo.project.name)) {
    await page.getByRole("button", { name: "\u6253\u5f00\u529f\u80fd\u83dc\u5355", exact: true }).click();
  }

  const navigation = page.locator(".figma-navigation:visible");
  for (const retiredLabel of ["\u5bf9\u8bdd", "\u7ed8\u753b", "\u5e94\u7528", "\u753b\u5eca"]) {
    await expect(navigation.getByRole("button", { name: retiredLabel, exact: true })).toHaveCount(0);
  }

  await expect(
    page.locator([
      ".studio-sidebar",
      ".studio-mobile-header",
      ".studio-nav",
      ".studio-mobile-nav",
      ".top-module-nav",
      ".mobile-nav",
      ".conversation-rail",
      ".image-history-grid",
      ".agent-template-grid",
      ".app-card-grid",
      ".gallery-grid"
    ].join(", "))
  ).toHaveCount(0);
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  await expect(page.locator('a[href="/xizi2333"]')).toHaveCount(0);

  const forbiddenEffects = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("*")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      const blur = style.getPropertyValue("backdrop-filter") || style.getPropertyValue("-webkit-backdrop-filter");
      const extraGradient = style.backgroundImage.includes("gradient") && !element.matches(".figma-brand-mark, .figma-map-canvas");
      return visible && (extraGradient || (blur && blur !== "none"));
    }).length
  );
  expect(forbiddenEffects).toBe(0);
});
