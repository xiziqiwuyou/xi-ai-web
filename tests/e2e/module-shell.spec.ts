import type { Locator } from "@playwright/test";
import {
  documentOverflow,
  expect,
  isMobileProject,
  publicDestinations,
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

  for (const path of ["/ppt", "/mindmap", "/translate"]) {
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
  const promptChips = module.getByLabel("\u5f53\u524d\u521b\u4f5c\u53c2\u6570", { exact: true });
  await expect(promptChips.getByRole("button")).toHaveText(["1:1", "\u5199\u5b9e"]);
  await expect(module.getByRole("button", { name: "\u7acb\u5373\u751f\u6210", exact: true })).toBeEnabled();

  await expect(module.getByRole("heading", { name: "\u521b\u4f5c\u53c2\u6570", exact: true })).toBeVisible();
  const imageModel = module.getByRole("button", { name: "\u56fe\u50cf\u751f\u6210\u6a21\u578b", exact: true });
  const aspectRatio = module.getByRole("button", { name: "\u753b\u9762\u6bd4\u4f8b", exact: true });
  const resolution = module.getByRole("button", { name: "\u56fe\u50cf\u5206\u8fa8\u7387", exact: true });
  const generationCount = module.getByRole("button", { name: "\u751f\u6210\u6570\u91cf", exact: true });
  await expect(imageModel).toBeVisible();
  await expect(aspectRatio).toContainText("1 : 1");
  await expect(resolution).toContainText("1K");
  await expect(generationCount).toContainText("4 \u5f20");

  await imageModel.click();
  const modelListbox = module.getByRole("listbox", { name: "\u56fe\u50cf\u751f\u6210\u6a21\u578b", exact: true });
  await expect(modelListbox).toBeVisible();
  await expect(modelListbox.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(modelListbox).toHaveCount(0);
  await expect(imageModel).toBeFocused();

  await aspectRatio.focus();
  await aspectRatio.press("ArrowDown");
  const ratioListbox = module.getByRole("listbox", { name: "\u753b\u9762\u6bd4\u4f8b", exact: true });
  const selectedRatio = ratioListbox.getByRole("option", { name: "1 : 1", exact: false });
  const lastRatio = ratioListbox.getByRole("option", { name: "9 : 16", exact: false });
  await expect(selectedRatio).toBeFocused();
  await selectedRatio.press("End");
  await expect(lastRatio).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(ratioListbox).toHaveCount(0);
  await expect(aspectRatio).toBeFocused();

  await chooseFigmaMenu(module, "\u753b\u9762\u6bd4\u4f8b", "9 : 16");
  await expect(aspectRatio).toContainText("9 : 16");
  await chooseFigmaMenu(module, "\u751f\u6210\u6570\u91cf", "2 \u5f20");
  await expect(generationCount).toContainText("2 \u5f20");

  await expect(module.getByRole("heading", { name: "\u7075\u611f\u7011\u5e03\u6d41", exact: true })).toBeVisible();
  const inspiration = module.getByRole("list", { name: "\u56fe\u50cf\u7075\u611f", exact: true });
  await expect(inspiration.getByRole("listitem")).toHaveCount(6);
  await inspiration.getByRole("listitem", { name: "\u590d\u7528\u7075\u611f\uff1a\u9ed1\u8272\u5c0f\u72d7\u8096\u50cf", exact: true }).click();
  await expect(prompt).toHaveValue(/\u9ed1\u8272\u5c0f\u72d7/);

  await module.getByRole("button", { name: "\u6362\u4e00\u6279 \u2192", exact: true }).click();
  await expect(inspiration.getByRole("listitem").first()).toHaveAccessibleName("\u590d\u7528\u7075\u611f\uff1a\u84dd\u7d2b\u8272\u6df1\u7a7a\u661f\u4e91");
});

test("Image sends provider-aware generation and edit options and renders every asset", async ({ page, apiHarness }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic image request pass is sufficient");
  await openPublicModule(page, 1);
  const module = page.getByTestId("image-module");

  await chooseFigmaMenu(module, "\u753b\u9762\u6bd4\u4f8b", "16 : 9");
  await chooseFigmaMenu(module, "\u56fe\u50cf\u5206\u8fa8\u7387", "2K");
  await chooseFigmaMenu(module, "\u751f\u6210\u8d28\u91cf", "\u9ad8");
  await chooseFigmaMenu(module, "\u8f93\u51fa\u683c\u5f0f", "JPEG");
  await chooseFigmaMenu(module, "\u538b\u7f29\u8d28\u91cf", "60%");

  await module.getByRole("button", { name: "\u7acb\u5373\u751f\u6210", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.length).toBe(1);
  expect(apiHarness.generationRequests[0]).toMatchObject({
    moduleId: "image",
    payload: {
      modelId: "test-image",
      options: {
        mode: "generate",
        count: 4,
        aspectRatio: "16:9",
        imageSize: "2K",
        size: "2048x1152",
        quality: "high",
        outputFormat: "jpeg",
        outputCompression: 60
      }
    }
  });
  await expect(module.getByRole("list", { name: "\u672c\u6b21\u751f\u6210\u56fe\u7247", exact: true }).getByRole("listitem")).toHaveCount(4);

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
    count: 4,
    aspectRatio: "16:9",
    imageSize: "2K",
    outputFormat: "jpeg",
    outputCompression: 60
  });
  expect(editOptions?.inputImage?.dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(editOptions?.maskImage?.dataUrl).toMatch(/^data:image\/png;base64,/);
  await expect(module.getByRole("list", { name: "\u672c\u6b21\u751f\u6210\u56fe\u7247", exact: true }).getByRole("listitem")).toHaveCount(4);
});

test("authored menus keep selected state, focus restoration, and mobile touch targets", async ({ page }, testInfo) => {
  await openPublicModule(page, 1);
  const image = page.getByTestId("image-module");
  for (const name of ["图像生成模型", "画面比例", "图像分辨率", "生成数量", "生成质量", "输出格式"]) {
    await assertMenuLifecycle(image, name);
  }

  await openPublicModule(page, 2);
  const ppt = page.getByTestId("ppt-module");
  for (const name of ["PPT 生成模型", "目标受众", "演示时长", "视觉气质"]) {
    await assertMenuLifecycle(ppt, name);
  }
  if (isMobileProject(testInfo.project.name)) {
    for (const trigger of await ppt.locator(".figma-ppt-options .figma-menu-trigger").all()) {
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
  expect(imageComposer).not.toBeNull();
  expect(imageParameters).not.toBeNull();
  expect(Math.abs(imageComposer!.x - imageParameters!.x)).toBeLessThanOrEqual(1);
  expect(imageParameters!.y - (imageComposer!.y + imageComposer!.height)).toBeGreaterThanOrEqual(19);

  await openPublicModule(page, 2);
  const pptInput = await page.locator(".figma-ppt-input-panel").boundingBox();
  const pptStages = await page.locator(".figma-ppt-stages").boundingBox();
  expect(pptInput).not.toBeNull();
  expect(pptStages).not.toBeNull();
  expect(Math.abs(pptInput!.x - pptStages!.x)).toBeLessThanOrEqual(1);
  expect(pptStages!.y).toBeGreaterThanOrEqual(pptInput!.y + pptInput!.height - 1);
});

test("creative builders keep their desktop split from 1024px upward", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic breakpoint pass is sufficient");

  for (const width of [1024, 1279]) {
    await page.setViewportSize({ width, height: 800 });

    await openPublicModule(page, 1);
    const imageComposer = await page.locator(".figma-image-composer").boundingBox();
    const imageParameters = await page.locator(".figma-image-parameters").boundingBox();
    expect(imageComposer).not.toBeNull();
    expect(imageParameters).not.toBeNull();
    expect(imageParameters!.x).toBeGreaterThan(imageComposer!.x + imageComposer!.width - 1);
    expect(Math.abs(imageParameters!.y - imageComposer!.y)).toBeLessThanOrEqual(1);

    await openPublicModule(page, 2);
    const pptInput = await page.locator(".figma-ppt-input-panel").boundingBox();
    const pptStages = await page.locator(".figma-ppt-stages").boundingBox();
    expect(pptInput).not.toBeNull();
    expect(pptStages).not.toBeNull();
    expect(pptStages!.x).toBeGreaterThan(pptInput!.x + pptInput!.width - 1);
    expect(Math.abs(pptStages!.y - pptInput!.y)).toBeLessThanOrEqual(1);
  }
});

test("mobile image actions and mind map branches keep the authored compact geometry", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile Figma geometry contract");

  await openPublicModule(page, 1);
  const imageActionMetrics = await page.locator(".figma-image-composer-footer").evaluate((element) => {
    const chips = element.querySelector<HTMLElement>(".figma-prompt-chips");
    const action = element.querySelector<HTMLElement>(".figma-primary-action");
    if (!chips || !action) return null;
    const chipsBox = chips.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    return {
      direction: getComputedStyle(element).flexDirection,
      chipsCenter: chipsBox.y + chipsBox.height / 2,
      actionCenter: actionBox.y + actionBox.height / 2
    };
  });
  expect(imageActionMetrics).not.toBeNull();
  expect(imageActionMetrics!.direction).toBe("row");
  expect(Math.abs(imageActionMetrics!.chipsCenter - imageActionMetrics!.actionCenter)).toBeLessThanOrEqual(1);

  await openPublicModule(page, 3);
  const branchHeights = await page.locator(".figma-map-branch").evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height)
  );
  expect(branchHeights).toHaveLength(4);
  expect(Math.max(...branchHeights)).toBeLessThanOrEqual(70);
  expect(Math.max(...branchHeights) - Math.min(...branchHeights)).toBeLessThanOrEqual(1);
});

test("shared authored menus use the Figma base radius", async ({ page }) => {
  await openPublicModule(page, 1);
  const image = page.getByTestId("image-module");
  const trigger = image.getByRole("button", { name: "\u753b\u9762\u6bd4\u4f8b", exact: true });
  await trigger.click();
  const popover = image.getByRole("listbox", { name: "\u753b\u9762\u6bd4\u4f8b", exact: true });
  await expect(popover).toBeVisible();
  await expect.poll(() => trigger.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("16px");
  await expect.poll(() => popover.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("16px");
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
});

test("authored menu popovers stay inside their viewport and clipping ancestors", async ({ page }) => {
  const menuCases = [
    { index: 1, names: ["图像生成模型", "画面比例", "生成数量"] },
    { index: 2, names: ["PPT 生成模型", "目标受众", "演示时长", "视觉气质"] },
    { index: 3, names: ["思维导图生成模型"] },
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
  const pptOption = page.locator(".figma-ppt-options > .figma-menu").first();
  const pptTrigger = pptOption.locator(".figma-menu-trigger");
  const pptBoxes = await Promise.all([pptOption.boundingBox(), pptTrigger.boundingBox()]);
  expect(pptBoxes[0]).not.toBeNull();
  expect(pptBoxes[1]).not.toBeNull();
  expect(Math.abs(pptBoxes[0]!.height - 60)).toBeLessThanOrEqual(1);
  expect(Math.abs(pptBoxes[1]!.height - 60)).toBeLessThanOrEqual(1);

  await openPublicModule(page, 3);
  const mapCanvas = page.locator(".figma-map-canvas");
  const mapBranches = page.locator(".figma-map-branch");
  const mapBox = await mapCanvas.boundingBox();
  const branchBoxes = await mapBranches.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  expect(mapBox).not.toBeNull();
  expect(branchBoxes).toHaveLength(4);
  expect(branchBoxes.every((box) => box.width >= 112 && box.width <= 122)).toBe(true);
  expect(Math.abs((branchBoxes[0].y - mapBox!.y) / mapBox!.height - 0.26)).toBeLessThanOrEqual(0.02);
  expect(Math.abs((branchBoxes[1].y - mapBox!.y) / mapBox!.height - 0.62)).toBeLessThanOrEqual(0.02);

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
  expect(assistantMetrics!.gridGap).toBe("16px");
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

test("PPT matches the options, creation stages, and prompt ideas contract", async ({ page, apiHarness }) => {
  await openPublicModule(page, 2);
  const module = page.getByTestId("ppt-module");

  await expect(module.locator(".figma-ppt-hero > p")).toHaveText("06 / AUTO-DECK");
  await expect(module.getByRole("heading", { name: "\u4e00\u53e5\u4e3b\u9898\uff0c\u4e00\u4efd\u597d PPT\u3002", exact: true })).toBeVisible();
  const topic = module.getByRole("textbox", { name: "\u6f14\u793a\u4e3b\u9898", exact: true });
  await expect(topic).toHaveValue("\u751f\u6210\u5f0f AI \u5982\u4f55\u91cd\u5851\u4f01\u4e1a\u521b\u65b0");
  const audience = module.getByRole("button", { name: "\u76ee\u6807\u53d7\u4f17", exact: true });
  const duration = module.getByRole("button", { name: "\u6f14\u793a\u65f6\u957f", exact: true });
  const visualTone = module.getByRole("button", { name: "\u89c6\u89c9\u6c14\u8d28", exact: true });
  const model = module.getByRole("button", { name: "PPT \u751f\u6210\u6a21\u578b", exact: true });
  await expect(model).toContainText("Test Chat");
  await chooseFigmaMenu(module, "PPT \u751f\u6210\u6a21\u578b", "OpenAI Code");
  await expect(audience).toContainText("\u4f01\u4e1a\u7ba1\u7406\u5c42");
  await expect(duration).toContainText("8\u201310 \u5206\u949f");
  await expect(visualTone).toContainText("\u672a\u6765\u4e13\u4e1a");

  await audience.click();
  const audienceListbox = module.getByRole("listbox", { name: "\u76ee\u6807\u53d7\u4f17", exact: true });
  await expect(audienceListbox.getByRole("option")).toHaveCount(4);
  const creatorBox = await module.locator(".figma-ppt-creator").boundingBox();
  const audienceBox = await audienceListbox.boundingBox();
  expect(creatorBox).not.toBeNull();
  expect(audienceBox).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(audienceBox!.x).toBeGreaterThanOrEqual(-0.5);
  expect(audienceBox!.y).toBeGreaterThanOrEqual(-0.5);
  expect(audienceBox!.x + audienceBox!.width).toBeLessThanOrEqual(viewport!.width + 0.5);
  expect(audienceBox!.y + audienceBox!.height).toBeLessThanOrEqual(viewport!.height + 0.5);
  await page.keyboard.press("Escape");

  await chooseFigmaMenu(module, "\u76ee\u6807\u53d7\u4f17", "\u5185\u90e8\u56e2\u961f");
  await expect(audience).toContainText("\u5185\u90e8\u56e2\u961f");
  await chooseFigmaMenu(module, "\u6f14\u793a\u65f6\u957f", "20 \u5206\u949f");
  await expect(duration).toContainText("20 \u5206\u949f");
  await chooseFigmaMenu(module, "\u89c6\u89c9\u6c14\u8d28", "\u4e13\u4e1a\u5546\u52a1");
  await expect(visualTone).toContainText("\u4e13\u4e1a\u5546\u52a1");
  await expect(module.getByRole("button", { name: "\u8ba9 AI \u5f00\u59cb\u521b\u4f5c", exact: true })).toBeEnabled();
  await expect(module.getByText("\u9884\u8ba1 40 \u79d2 \u00b7 \u7ea6 8 \u9875\u5185\u5bb9 \u00b7 \u652f\u6301\u540e\u7eed\u5bfc\u51fa PDF", { exact: true })).toBeVisible();

  const stages = module.locator(".figma-ppt-stages");
  await expect(stages.getByText("WHAT AI CREATES", { exact: true })).toBeVisible();
  await expect(stages.locator("ol > li")).toHaveCount(4);
  await expect(stages.locator("ol > li > span")).toHaveText(["01", "02", "03", "04"]);

  const ideas = module.locator(".figma-ppt-ideas");
  await expect(ideas.getByText("PROMPT IDEAS", { exact: true })).toBeVisible();
  await expect(ideas.getByRole("button")).toHaveCount(4);
  const selectedIdea = "\u5e02\u573a\u8fdb\u5165\u7b56\u7565";
  await topic.fill("temporary topic");
  await ideas.getByRole("button", { name: selectedIdea, exact: true }).click();
  await expect(topic).toHaveValue(selectedIdea);
  await module.getByRole("button", { name: "\u8ba9 AI \u5f00\u59cb\u521b\u4f5c", exact: true }).click();
  await expect(module.getByRole("heading", { name: "\u6f14\u793a\u5927\u7eb2", exact: true })).toBeVisible();
  expect(apiHarness.generationRequests.at(-1)).toMatchObject({ moduleId: "ppt" });
  expect(apiHarness.generationRequests.at(-1)?.payload).toMatchObject({ modelId: "openai-code" });
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
  await module.getByRole("button", { name: "\u8ba9 AI \u5f00\u59cb\u521b\u4f5c", exact: true }).click();
  await expect(model).toBeDisabled();
  await expect(module.getByRole("heading", { name: "\u6f14\u793a\u5927\u7eb2", exact: true })).toBeVisible();
  await expect(model).toBeEnabled();
});

test("Mind Map matches branch, canvas, zoom, and capability contracts", async ({ page, apiHarness }) => {
  await openPublicModule(page, 3);
  const module = page.getByTestId("mindmap-module");

  await expect(module.locator(".figma-mindmap-hero > p")).toHaveText("07 / THINKING MAP");
  await expect(module.getByRole("heading", { name: "\u628a\u6a21\u7cca\u60f3\u6cd5\uff0c\u53d8\u6210\u6e05\u6670\u8def\u5f84\u3002", exact: true })).toBeVisible();
  await chooseFigmaMenu(module, "\u601d\u7ef4\u5bfc\u56fe\u751f\u6210\u6a21\u578b", "Claude Haiku");
  await expect(module.getByRole("textbox", { name: "\u5bfc\u56fe\u4e3b\u9898", exact: true })).toHaveValue("\u6784\u5efa AI \u9a71\u52a8\u7684\u4ea7\u54c1\u589e\u957f\u4f53\u7cfb");
  await expect(module.getByRole("button", { name: "AI \u751f\u6210\u5bfc\u56fe", exact: true })).toBeEnabled();

  const mapStage = module.locator(".figma-map-stage");
  const branchButtons = mapStage.locator(".figma-map-branch");
  await expect(branchButtons).toHaveCount(4);
  expect(await branchButtons.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-pressed"))))
    .toEqual(["false", "false", "false", "false"]);
  for (const branch of ["\u7528\u6237\u6d1e\u5bdf", "\u4ef7\u503c\u4e3b\u5f20", "\u4ea7\u54c1\u7b56\u7565", "\u589e\u957f\u5b9e\u9a8c"]) {
    await expect(mapStage.getByRole("button", { name: new RegExp(branch) })).toContainText("AI \u5df2\u6269\u5c55 3 \u4e2a\u8282\u70b9");
  }
  await mapStage.getByRole("button", { name: /\u4ea7\u54c1\u7b56\u7565/ }).click();
  await expect(mapStage.getByRole("button", { name: /\u4ea7\u54c1\u7b56\u7565/ })).toHaveAttribute("aria-pressed", "true");

  const toolbar = module.locator(".figma-map-zoom");
  await expect(toolbar.getByText("100%", { exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "\u653e\u5927", exact: true }).click();
  await expect(toolbar.getByText("110%", { exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "\u7f29\u5c0f", exact: true }).click();
  await expect(toolbar.getByText("100%", { exact: true })).toBeVisible();

  const capabilities = module.getByLabel("\u601d\u7ef4\u5bfc\u56fe\u80fd\u529b", { exact: true });
  await expect(capabilities.locator(":scope > button")).toHaveCount(3);
  await expect(capabilities).toContainText("\u4e00\u952e\u5c55\u5f00");
  await expect(capabilities).toContainText("AI \u91cd\u7ec4");
  await expect(capabilities).toContainText("\u5bfc\u51fa\u56fe\u7247");
  await capabilities.getByRole("button", { name: /\u4e00\u952e\u5c55\u5f00/ }).click();
  await expect(module.getByRole("alert")).toContainText("\u5df2\u5c55\u5f00");
  await capabilities.getByRole("button", { name: /AI \u91cd\u7ec4/ }).click();
  await expect(module.getByRole("alert")).toHaveText("\u5df2\u91cd\u65b0\u6392\u5217\u5bfc\u56fe\u5206\u652f\u3002");
  await module.getByRole("button", { name: "AI \u751f\u6210\u5bfc\u56fe", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.at(-1)?.moduleId).toBe("mindmap");
  expect(apiHarness.generationRequests.at(-1)).toMatchObject({ moduleId: "mindmap" });
  expect(apiHarness.generationRequests.at(-1)?.payload).toMatchObject({ modelId: "anthropic-haiku" });
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
  await expect(filters.getByRole("button")).toHaveText(["全部", "通用效率", "内容创作", "编程开发", "学习研究", "商业办公", "生活创意"]);
  const cards = module.getByRole("region", { name: "\u52a9\u624b\u5217\u8868", exact: true }).getByRole("button");
  await expect(cards).toHaveCount(7);

  await filters.getByRole("button", { name: "商业办公", exact: true }).click();
  await expect(filters.getByRole("button", { name: "商业办公", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Product Partner");
  await expect(cards.first()).toContainText("产品");
  await expect(cards.first()).toContainText("需求");

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
  expect(conversations[0].assistantId).toBe("test-assistant");
  await expect(chat.getByLabel("消息内容", { exact: true })).toHaveValue("");
  expect(apiHarness.chatRequests).toHaveLength(0);
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
  await expect(source).toHaveAttribute("maxlength", "5000");
  const clear = module.getByRole("button", { name: "\u6e05\u7a7a", exact: true });
  const copy = module.getByRole("button", { name: "\u590d\u5236\u8bd1\u6587", exact: true });
  await expect(copy).toBeEnabled();
  await expect(module.getByText(/Today, we are officially launching/)).toBeVisible();
  await source.fill("hello");
  await expect(module.getByText("5 / 5,000", { exact: true })).toBeVisible();
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
  await expect(capabilities).toContainText("\u6587\u4ef6\u7ffb\u8bd1");
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
  await expect(page.locator(".figma-sidebar").getByRole("button", { name: /API/i })).toHaveCount(0);
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);

  const forbiddenEffects = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("*")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      const blur = style.getPropertyValue("backdrop-filter") || style.getPropertyValue("-webkit-backdrop-filter");
      const extraGradient = style.backgroundImage.includes("gradient") && !element.matches(".figma-brand-mark, .figma-ppt-stages, .figma-map-canvas");
      return visible && (extraGradient || (blur && blur !== "none"));
    }).length
  );
  expect(forbiddenEffects).toBe(0);
});
