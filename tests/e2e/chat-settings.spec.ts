import {
  expect,
  isMobileProject,
  publicDestinations,
  searchServiceStorageKey,
  seedChatConversations,
  seedReadyProvider,
  test,
  visibleScrollOwners,
  waitForPublicModule
} from "./support/app-fixture";

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedChatConversations(page);
});

const chatSettingsStorageKey = "xi-ai-web-chat-session-settings";

test("independent web search config works with a model that has no hosted-search capability", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const session = page.locator(".figma-chat-session").first();

  await session.getByRole("button", { name: "选择对话模型", exact: true }).click();
  await session.getByRole("option", { name: /OpenAI Fast/ }).click();
  const searchToggle = session.getByRole("button", { name: "网络搜索", exact: true });
  await expect(searchToggle).toBeEnabled();
  await searchToggle.click();

  const dialog = page.getByRole("dialog", { name: "联网搜索服务", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("联网搜索 API Key", { exact: true }).fill("search-session-key");
  await dialog.getByLabel("联网搜索结果数量", { exact: true }).fill("6");
  await dialog.getByRole("button", { name: "保存搜索服务", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(searchToggle).toHaveAttribute("aria-pressed", "true");

  await session.getByLabel("消息内容", { exact: true }).fill("检索并回答这个问题");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0]).toMatchObject({
    modelId: "openai-fast",
    allowedTools: ["web_search"],
    searchService: {
      provider: "glm",
      apiKey: "search-session-key",
      count: 6
    }
  });

  const storage = await page.evaluate((key) => ({
    session: window.sessionStorage.getItem(key),
    local: window.localStorage.getItem(key)
  }), searchServiceStorageKey);
  expect(storage.session).toContain("search-session-key");
  expect(storage.local).toBeNull();
});

test("Chat settings use the shared Figma dialog contract", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const trigger = page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/figma-session-settings/);
  await expect(dialog).toHaveAttribute("data-scroll-owner", "dialog");
  await expect(dialog.getByRole("button", { name: "\u5173\u95ed\u4f1a\u8bdd\u8bbe\u7f6e", exact: true })).toBeFocused();
  expect(await visibleScrollOwners(page)).toHaveLength(1);
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  if (isMobileProject(testInfo.project.name)) {
    expect(dialogBounds!.width).toBeLessThanOrEqual(350);
  } else {
    expect(dialogBounds!.width).toBeGreaterThanOrEqual(650);
    expect(dialogBounds!.width).toBeLessThanOrEqual(672);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("dark Chat settings keep crisp typography and legible range controls", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  await expect(dialog).toBeVisible();

  const temperature = dialog.getByRole("slider", { name: "\u6a21\u578b\u6e29\u5ea6 \u00b7 Temperature", exact: true });
  const topP = dialog.getByRole("slider", { name: "TOP-P", exact: true });
  await expect(temperature).toBeVisible();
  await expect(topP).toBeVisible();
  await temperature.focus();

  const metrics = await dialog.evaluate((element) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const rangeLabel = element.querySelector<HTMLElement>(".figma-range-control > span");
    const rangeHelp = element.querySelector<HTMLElement>(".figma-range-control > small");
    const range = element.querySelector<HTMLInputElement>('.figma-range-control input[type="range"]');
    const rangeTrack = element.querySelector<HTMLElement>(".figma-range-track");
    const rangeProgress = element.querySelector<HTMLElement>(".figma-range-track > i");

    const luminance = (hex: string) => {
      const normalized = hex.trim().replace("#", "");
      const channels = [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255);
      const linear = channels.map((channel) => channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4);
      return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
    };
    const contrast = (foreground: string, background: string) => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };

    const muted = rootStyle.getPropertyValue("--xhs-muted").trim();
    const surface = rootStyle.getPropertyValue("--xhs-surface").trim();
    const primaryFill = rootStyle.getPropertyValue("--xhs-primary-fill").trim();
    const onPrimary = rootStyle.getPropertyValue("--xhs-on-primary").trim();
    const rangeStyle = range ? getComputedStyle(range) : null;
    const rangeTrackStyle = rangeTrack ? getComputedStyle(rangeTrack, "::before") : null;
    const rangeBounds = rangeTrack?.getBoundingClientRect();
    const progressBounds = rangeProgress?.getBoundingClientRect();
    return {
      theme: document.documentElement.dataset.studioTheme,
      bodyFont: getComputedStyle(document.body).fontFamily,
      labelFont: rangeLabel ? getComputedStyle(rangeLabel).fontFamily : "",
      labelSize: rangeLabel ? Number.parseFloat(getComputedStyle(rangeLabel).fontSize) : 0,
      helpSize: rangeHelp ? Number.parseFloat(getComputedStyle(rangeHelp).fontSize) : 0,
      rangeHeight: range?.getBoundingClientRect().height || 0,
      rangePaddingLeft: rangeStyle?.paddingLeft || "",
      rangePaddingRight: rangeStyle?.paddingRight || "",
      rangeBorderWidth: rangeStyle?.borderTopWidth || "",
      rangeBoxShadow: rangeStyle?.boxShadow || "",
      trackBorderColor: rangeTrackStyle?.borderTopColor || "",
      trackFocusShadow: rangeTrackStyle?.boxShadow || "",
      progressRatio: rangeBounds && progressBounds ? progressBounds.width / rangeBounds.width : 0,
      rangeTrackBorder: rootStyle.getPropertyValue("--xhs-range-track-border").trim(),
      mutedContrast: contrast(muted, surface),
      primaryContrast: contrast(onPrimary, primaryFill)
    };
  });

  expect(metrics.theme).toBe("dark");
  expect(metrics.bodyFont).toContain("Microsoft YaHei UI");
  expect(metrics.labelFont).toContain("Microsoft YaHei UI");
  expect(metrics.labelSize).toBeGreaterThanOrEqual(10);
  expect(metrics.helpSize).toBeGreaterThanOrEqual(10);
  expect(metrics.rangeHeight).toBe(isMobileProject(testInfo.project.name) ? 44 : 24);
  expect(metrics.rangePaddingLeft).toBe("0px");
  expect(metrics.rangePaddingRight).toBe("0px");
  expect(metrics.rangeBorderWidth).toBe("0px");
  expect(metrics.rangeBoxShadow).toBe("none");
  expect(metrics.trackBorderColor).toBe("rgb(79, 141, 255)");
  expect(metrics.trackFocusShadow).not.toBe("none");
  expect(metrics.progressRatio).toBeGreaterThan(0.65);
  expect(metrics.progressRatio).toBeLessThan(0.75);
  expect(metrics.rangeTrackBorder).toBe("#637493");
  expect(metrics.mutedContrast).toBeGreaterThanOrEqual(6);
  expect(metrics.primaryContrast).toBeGreaterThanOrEqual(4.5);
});

test("Chat settings expose the complete controls and preserve only saved changes", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const trigger = page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first();
  const dialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  await trigger.click();

  const avatarPresets = dialog.locator(".figma-avatar-presets > button");
  const temperature = dialog.locator("label.figma-range-control").filter({ hasText: "Temperature" }).getByRole("slider");
  const topP = dialog.locator("label.figma-range-control").filter({ hasText: "TOP-P" }).getByRole("slider");
  const context = dialog.getByRole("combobox", { name: "\u4e0a\u4e0b\u6587\u6570", exact: true });
  const maxTokens = dialog.getByRole("combobox", { name: "\u6700\u5927 Token \u6570", exact: true });
  const stream = dialog.getByRole("button", { name: "\u6d41\u5f0f\u8f93\u51fa", exact: true });
  const toolButtons = dialog.locator(".figma-tool-mode .figma-segmented > button");

  await expect(avatarPresets).toHaveCount(4);
  await expect(avatarPresets.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "\u4e0a\u4f20\u4e2a\u4eba\u5934\u50cf", exact: true })).toHaveCount(2);
  await expect(dialog.locator('input[type="file"][accept="image/png,image/jpeg"]')).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "\u6c14\u6ce1\u5f0f", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(temperature).toHaveAttribute("min", "0");
  await expect(temperature).toHaveAttribute("max", "1");
  await expect(temperature).toHaveValue("0.7");
  await expect(topP).toHaveAttribute("min", "0.1");
  await expect(topP).toHaveAttribute("max", "1");
  await expect(topP).toHaveValue("0.9");
  await expect(context).toHaveValue("16");
  await expect(maxTokens).toHaveValue("4096");
  await expect(stream).toHaveAttribute("aria-pressed", "true");
  await expect(toolButtons).toHaveText([
    "\u81ea\u52a8",
    "\u8be2\u95ee\u540e\u8c03\u7528",
    "\u7981\u7528"
  ]);

  await avatarPresets.nth(1).click();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from("deterministic-avatar")
  });
  await expect(dialog.getByAltText("\u4e2a\u4eba\u5934\u50cf\u9884\u89c8", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "\u79fb\u9664\u5934\u50cf", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "\u5217\u8868\u5f0f", exact: true }).click();
  await temperature.fill("0.2");
  await topP.fill("0.4");
  await context.selectOption("32");
  await maxTokens.selectOption("8192");
  await stream.click();
  await toolButtons.filter({ hasText: "\u7981\u7528" }).click();
  await dialog.getByRole("button", { name: "\u53d6\u6d88", exact: true }).click();
  await expect(dialog).toBeHidden();

  await trigger.click();
  await expect(avatarPresets.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByAltText("\u4e2a\u4eba\u5934\u50cf\u9884\u89c8", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "\u6c14\u6ce1\u5f0f", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(temperature).toHaveValue("0.7");
  await expect(topP).toHaveValue("0.9");
  await expect(context).toHaveValue("16");
  await expect(maxTokens).toHaveValue("4096");
  await expect(stream).toHaveAttribute("aria-pressed", "true");
  await expect(toolButtons.filter({ hasText: "\u81ea\u52a8" })).toHaveAttribute("aria-pressed", "true");

  await avatarPresets.nth(2).click();
  await dialog.getByRole("button", { name: "\u5217\u8868\u5f0f", exact: true }).click();
  await temperature.fill("0.3");
  await topP.fill("0.6");
  await context.selectOption("128");
  await maxTokens.selectOption("2048");
  await stream.click();
  await toolButtons.filter({ hasText: "\u8be2\u95ee\u540e\u8c03\u7528" }).click();
  await dialog.getByRole("button", { name: "\u4fdd\u5b58\u8bbe\u7f6e", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(avatarPresets.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "\u5217\u8868\u5f0f", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(temperature).toHaveValue("0.3");
  await expect(topP).toHaveValue("0.6");
  await expect(context).toHaveValue("128");
  await expect(maxTokens).toHaveValue("2048");
  await expect(stream).toHaveAttribute("aria-pressed", "false");
  await expect(toolButtons.filter({ hasText: "\u8be2\u95ee\u540e\u8c03\u7528" })).toHaveAttribute("aria-pressed", "true");
});

test("saved sampling settings are sent with the next Chat request", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  const temperature = dialog.getByRole("slider", { name: "\u6a21\u578b\u6e29\u5ea6 \u00b7 Temperature", exact: true });
  const topP = dialog.getByRole("slider", { name: "TOP-P", exact: true });
  const maxTokens = dialog.getByRole("combobox", { name: "\u6700\u5927 Token \u6570", exact: true });

  await temperature.fill("0.4");
  await topP.fill("0.6");
  await maxTokens.selectOption("8192");
  await dialog.getByRole("button", { name: "\u4fdd\u5b58\u8bbe\u7f6e", exact: true }).click();

  const composer = page.getByRole("textbox", { name: "\u6d88\u606f\u5185\u5bb9", exact: true });
  await composer.fill("\u9a8c\u8bc1\u4f1a\u8bdd\u53c2\u6570");
  await page.getByRole("button", { name: "\u53d1\u9001", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0]).toMatchObject({
    temperature: 0.4,
    topP: 0.6,
    maxTokens: 8192,
    modelId: "test-chat"
  });
});

test("saved Chat settings are scoped to sessionStorage and survive reload", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  await dialog.getByRole("button", { name: "\u5217\u8868\u5f0f", exact: true }).click();
  await dialog.getByRole("slider", { name: "\u6a21\u578b\u6e29\u5ea6 \u00b7 Temperature", exact: true }).fill("0.2");
  await dialog.getByRole("slider", { name: "TOP-P", exact: true }).fill("0.5");
  await dialog.getByRole("combobox", { name: "\u4e0a\u4e0b\u6587\u6570", exact: true }).selectOption("128");
  await dialog.getByRole("combobox", { name: "\u6700\u5927 Token \u6570", exact: true }).selectOption("8192");
  await dialog.getByRole("button", { name: "\u6d41\u5f0f\u8f93\u51fa", exact: true }).click();
  await dialog.getByRole("button", { name: "\u4fdd\u5b58\u8bbe\u7f6e", exact: true }).click();

  const storage = await page.evaluate((key) => ({
    session: window.sessionStorage.getItem(key),
    local: window.localStorage.getItem(key)
  }), chatSettingsStorageKey);
  expect(storage.local).toBeNull();
  expect(JSON.parse(storage.session || "{}")).toMatchObject({
    messageStyle: "list",
    temperature: 0.2,
    topP: 0.5,
    contextSize: "128",
    maxTokens: "8192",
    streamOutput: false
  });

  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  await page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first().click();
  const reloadedDialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  await expect(reloadedDialog.getByRole("button", { name: "\u5217\u8868\u5f0f", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(reloadedDialog.getByRole("slider", { name: "\u6a21\u578b\u6e29\u5ea6 \u00b7 Temperature", exact: true })).toHaveValue("0.2");
  await expect(reloadedDialog.getByRole("slider", { name: "TOP-P", exact: true })).toHaveValue("0.5");
  await expect(reloadedDialog.getByRole("combobox", { name: "\u4e0a\u4e0b\u6587\u6570", exact: true })).toHaveValue("128");
  await expect(reloadedDialog.getByRole("combobox", { name: "\u6700\u5927 Token \u6570", exact: true })).toHaveValue("8192");
  await expect(reloadedDialog.getByRole("button", { name: "\u6d41\u5f0f\u8f93\u51fa", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("reasoning menu exposes six levels, keyboard selection, and the shared request value", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const session = page.locator(".figma-chat-session").first();
  const trigger = session.getByRole("button", { name: "思维链长度", exact: true });
  await expect(trigger).toContainText("思维链 · 默认");

  await trigger.click();
  const menu = session.getByRole("listbox", { name: "思维链长度", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(6);
  await expect(menu.getByRole("option")).toHaveText([
    /默认/,
    /关闭/,
    /浅想/,
    /斟酌/,
    /沉思/,
    /穷究/
  ]);

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("思维链 · 穷究");
  await expect(trigger).toBeFocused();

  await trigger.press("ArrowDown");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await session.getByLabel("消息内容", { exact: true }).fill("验证思维链参数");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0]).toMatchObject({ reasoningEffort: "xhigh" });
});

test("Clear Messages uses confirmation and leaves the conversation unchanged on cancel", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const session = page.locator(".figma-chat-session").first();
  const clear = session.getByRole("button", { name: "清除消息", exact: true });
  await expect(session.getByText("这是确定性历史消息。", { exact: true })).toBeVisible();
  await clear.click();

  const confirmation = page.getByRole("alertdialog", { name: "清除当前对话消息？", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(clear).toBeFocused();
  await expect(session.getByText("这是确定性历史消息。", { exact: true })).toBeVisible();

  await clear.click();
  await page.getByRole("alertdialog", { name: "清除当前对话消息？", exact: true })
    .getByRole("button", { name: "清除消息", exact: true })
    .click();
  await expect(session.getByText("这是确定性历史消息。", { exact: true })).toHaveCount(0);
  await expect(clear).toBeVisible();
});

test("image attachment limit persists in sessionStorage and supports multi-image input", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const settingsTrigger = page.getByRole("button", { name: "会话设置", exact: true }).first();
  await settingsTrigger.click();
  const settings = page.getByRole("dialog", { name: "会话设置", exact: true });
  const imageLimit = settings.getByRole("combobox", { name: "单次图片上限", exact: true });
  await expect(imageLimit).toHaveValue("4");
  await imageLimit.selectOption("2");
  await settings.getByRole("button", { name: "保存设置", exact: true }).click();

  const stored = await page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) || "{}"), chatSettingsStorageKey);
  expect(stored.maxImageAttachments).toBe(2);

  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  await settingsTrigger.click();
  await expect(page.getByRole("dialog", { name: "会话设置", exact: true }).getByRole("combobox", { name: "单次图片上限", exact: true })).toHaveValue("2");
  await page.getByRole("dialog", { name: "会话设置", exact: true }).getByRole("button", { name: "保存设置", exact: true }).click();

  const session = page.locator(".figma-chat-session").first();
  const input = session.locator('input[type="file"][multiple]');
  await expect(input).toHaveCount(1);
  await input.setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: Buffer.from("one") },
    { name: "two.png", mimeType: "image/png", buffer: Buffer.from("two") }
  ]);
  await expect(session.locator('[data-testid="chat-image-attachment"]')).toHaveCount(2);
  await expect(session.getByText("已选择 2 / 2", { exact: true })).toBeVisible();

  await input.setInputFiles([{ name: "three.png", mimeType: "image/png", buffer: Buffer.from("three") }]);
  await expect(session.locator('[data-testid="chat-image-attachment"]')).toHaveCount(2);
  await expect(session.getByRole("alert")).toContainText("最多上传 2 张图片");

  await session.getByRole("button", { name: "移除图片 one.png", exact: true }).click();
  await expect(session.locator('[data-testid="chat-image-attachment"]')).toHaveCount(1);
  await expect(session.getByText("已选择 1 / 2", { exact: true })).toBeVisible();

  await session.getByLabel("消息内容", { exact: true }).fill("携带多图发送");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].attachments).toHaveLength(1);
});
