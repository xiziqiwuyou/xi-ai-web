import {
  expect,
  isMobileProject,
  publicDestinations,
  seedChatConversations,
  seedReadyProvider,
  test,
  visibleScrollOwners,
  waitForPublicModule
} from "./support/app-fixture";
import type { Locator } from "@playwright/test";
import type { Conversation } from "../../src/types";

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedChatConversations(page);
});

const chatSettingsStorageKey = "xi-ai-web-chat-session-settings";

async function chooseSettingsMenuOption(container: Locator, label: string, option: string) {
  const trigger = container.getByRole("button", { name: label, exact: true });
  await trigger.click();
  const menu = container.getByRole("listbox", { name: label, exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: option, exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  return trigger;
}

async function enableMaximumTokenLimit(dialog: Locator) {
  await dialog.getByRole("button", { name: "最大 Token 数", exact: true }).click();
  const confirmation = dialog.page().getByRole("alertdialog", { name: "最大 Token 数", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("数值过大可能导致请求失败");
  await confirmation.getByRole("button", { name: "继续开启", exact: true }).click();
  await expect(dialog).toBeVisible();
}

test("Chat selects a search provider and reuses the current BYOK connection", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const session = page.locator(".figma-chat-session").first();

  await session.getByRole("button", { name: "选择对话模型", exact: true }).click();
  await session.getByRole("option", { name: /OpenAI Fast/ }).click();
  const searchMenu = session.getByRole("button", { name: "网络搜索", exact: true });
  await expect(searchMenu).toBeEnabled();
  await searchMenu.click();

  const providerList = session.getByRole("listbox", { name: "网络搜索", exact: true });
  await expect(providerList).toBeVisible();
  const providerOptions = providerList.getByRole("option");
  await expect(providerOptions).toHaveText([
    /智谱 GLM.*结构化搜索 API/,
    /Kimi.*\$web_search/,
    /关闭联网搜索/
  ]);
  const optionTops = await providerOptions.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
  expect(optionTops.every((top, index) => index === 0 || top > optionTops[index - 1])).toBe(true);
  await providerList.getByRole("option", { name: /智谱 GLM/ }).click();
  await expect(searchMenu).toContainText("网络搜索 · 智谱 GLM");
  await expect(page.getByRole("dialog", { name: "联网搜索服务", exact: true })).toHaveCount(0);
  await expect(session.getByRole("button", { name: "配置联网搜索服务", exact: true })).toHaveCount(0);

  await session.getByLabel("消息内容", { exact: true }).fill("检索并回答这个问题");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0]).toMatchObject({
    modelId: "openai-fast",
    allowedTools: ["web_search"],
    searchService: {
      provider: "glm",
      apiKey: "e2e-session-key",
      count: 8
    }
  });

  await expect(session.getByText("Deterministic assistant response.", { exact: true })).toBeVisible();
  await searchMenu.click();
  await providerList.getByRole("option", { name: /Kimi/ }).click();
  await expect(searchMenu).toContainText("网络搜索 · Kimi");
  await session.getByLabel("消息内容", { exact: true }).fill("切换 Kimi 再检索一次");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(2);
  expect(apiHarness.chatRequests[1]).toMatchObject({
    allowedTools: ["web_search"],
    searchService: {
      provider: "kimi",
      apiKey: "e2e-session-key",
      model: "kimi-k3"
    }
  });
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
  const menuStyleContract = await page.evaluate(() => {
    const publicActive = document.querySelector<HTMLElement>(".figma-nav-item.active");
    const settingsActive = document.querySelector<HTMLElement>(".figma-settings-tab.active");
    const settingsIcon = settingsActive?.querySelector<HTMLElement>(".figma-settings-tab-icon");
    const publicStyle = publicActive ? getComputedStyle(publicActive) : null;
    const settingsStyle = settingsActive ? getComputedStyle(settingsActive) : null;
    const iconStyle = settingsIcon ? getComputedStyle(settingsIcon) : null;
    return {
      public: publicStyle ? {
        background: publicStyle.backgroundColor,
        color: publicStyle.color,
        radius: publicStyle.borderRadius,
        shadow: publicStyle.boxShadow
      } : null,
      settings: settingsStyle ? {
        background: settingsStyle.backgroundColor,
        color: settingsStyle.color,
        radius: settingsStyle.borderRadius,
        shadow: settingsStyle.boxShadow
      } : null,
      icon: iconStyle ? {
        background: iconStyle.backgroundColor,
        borderWidth: iconStyle.borderTopWidth
      } : null
    };
  });
  expect(menuStyleContract.settings).toEqual(menuStyleContract.public);
  expect(menuStyleContract.icon).toEqual({ background: "rgba(0, 0, 0, 0)", borderWidth: "0px" });
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  if (isMobileProject(testInfo.project.name)) {
    expect(dialogBounds!.width).toBeLessThanOrEqual(350);
  } else {
    expect(dialogBounds!.width).toBeGreaterThanOrEqual(800);
    expect(dialogBounds!.width).toBeLessThanOrEqual(860);
  }

  for (const sectionName of ["OpenAI 设置", "代码块", "外观设置"]) {
    await dialog.getByRole("tab", { name: sectionName, exact: true }).click();
    const nextBounds = await dialog.boundingBox();
    const scrollTop = await dialog.evaluate((element) => element.scrollTop);
    expect(nextBounds).not.toBeNull();
    expect(Math.abs(nextBounds!.y - dialogBounds!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextBounds!.height - dialogBounds!.height)).toBeLessThanOrEqual(1);
    expect(scrollTop).toBe(0);
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
  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();

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
    const rangeOutput = element.querySelector<HTMLOutputElement>(".figma-range-control output");

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
      progressColor: rangeProgress ? getComputedStyle(rangeProgress).backgroundColor : "",
      outputColor: rangeOutput ? getComputedStyle(rangeOutput).color : "",
      progressRatio: rangeBounds && progressBounds ? progressBounds.width / rangeBounds.width : 0,
      rangeTrackBorder: rootStyle.getPropertyValue("--xhs-range-track-border").trim(),
      mutedContrast: contrast(muted, surface),
      primaryContrast: contrast(onPrimary, primaryFill)
    };
  });

  expect(metrics.theme).toBe("dark");
  expect(metrics.bodyFont).toContain("Microsoft YaHei UI");
  expect(metrics.labelFont).toContain("Microsoft YaHei UI");
  expect(metrics.labelSize).toBeGreaterThanOrEqual(13);
  expect(metrics.helpSize).toBeGreaterThanOrEqual(12);
  expect(metrics.rangeHeight).toBe(isMobileProject(testInfo.project.name) ? 44 : 24);
  expect(metrics.rangePaddingLeft).toBe("0px");
  expect(metrics.rangePaddingRight).toBe("0px");
  expect(metrics.rangeBorderWidth).toBe("0px");
  expect(metrics.rangeBoxShadow).toBe("none");
  expect(metrics.trackBorderColor).not.toBe("rgb(79, 141, 255)");
  expect(metrics.trackFocusShadow).not.toBe("none");
  expect(metrics.progressColor).not.toBe("rgb(79, 141, 255)");
  expect(metrics.outputColor).not.toBe("rgb(79, 141, 255)");
  expect(metrics.progressRatio).toBeGreaterThan(0.65);
  expect(metrics.progressRatio).toBeLessThan(0.75);
  expect(metrics.rangeTrackBorder).toBe("#637493");
  expect(metrics.mutedContrast).toBeGreaterThanOrEqual(6);
  expect(metrics.primaryContrast).toBeGreaterThanOrEqual(4.5);
});

test("Chat settings expose categorized controls and preserve only saved changes", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const trigger = page.getByRole("button", { name: "会话设置", exact: true }).first();
  const dialog = page.getByRole("dialog", { name: "会话设置", exact: true });
  await trigger.click();

  const sectionNames = ["外观设置", "对话 Skill", "模型设置", "OpenAI 设置", "消息设置", "数学公式", "代码块", "输入设置"];
  const tabs = dialog.getByRole("tab");
  await expect(tabs).toHaveCount(8);
  const appearanceTab = dialog.getByRole("tab", { name: "外观设置", exact: true });
  await expect(appearanceTab).toHaveAttribute("aria-selected", "true");
  await appearanceTab.focus();
  await appearanceTab.press("End");
  await expect(dialog.getByRole("tab", { name: "输入设置", exact: true })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: "输入设置", exact: true }).press("Home");
  await expect(appearanceTab).toHaveAttribute("aria-selected", "true");
  for (const sectionName of sectionNames) {
    const tab = dialog.getByRole("tab", { name: sectionName, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("heading", { name: sectionName, exact: true })).toBeVisible();
  }

  await expect(dialog.getByRole("button", { name: "显示预估 Token 数", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "发送快捷键", exact: true })).toContainText("Enter");
  await dialog.getByRole("tab", { name: "OpenAI 设置", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "OpenAI 详细程度", exact: true })).toContainText("默认");
  await expect(dialog.getByRole("button", { name: "显示 OpenAI 用量", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("tab", { name: "消息设置", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "显示用户提示词", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "自动折叠思考内容", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("tab", { name: "数学公式", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "渲染数学公式", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "启用单美元符号公式", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("tab", { name: "代码块", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "代码显示行号", exact: true })).toHaveAttribute("aria-pressed", "true");

  await dialog.getByRole("tab", { name: "外观设置", exact: true }).click();
  const avatarPresets = dialog.locator('[aria-label="AI 对话头像"] > button');
  const personalAvatarPresets = dialog.locator('[aria-label="个人头像预设"] > button');
  await expect(avatarPresets).toHaveCount(6);
  await expect(personalAvatarPresets).toHaveCount(6);
  const avatarPresetSizes = await avatarPresets.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(avatarPresetSizes.every(({ width, height }) => width === 56 && height === 56)).toBe(true);
  await expect(avatarPresets.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(personalAvatarPresets.nth(5)).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "上传个人头像", exact: true })).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "气泡式", exact: true })).toHaveAttribute("aria-pressed", "true");
  await avatarPresets.nth(1).click();
  await personalAvatarPresets.nth(2).click();
  await dialog.locator('input[type="file"]').setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from("deterministic-avatar") });
  await expect(dialog.getByAltText("个人头像预览", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "列表式", exact: true }).click();

  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  const temperature = dialog.getByRole("slider", { name: "模型温度 · Temperature", exact: true });
  const topP = dialog.getByRole("slider", { name: "TOP-P", exact: true });
  const contextWindow = dialog.getByRole("slider", { name: "模型上下文窗口", exact: true });
  const contextMessageCount = dialog.getByRole("slider", { name: "引用历史消息", exact: true });
  const maxTokens = dialog.getByRole("button", { name: "最大 Token 数", exact: true });
  const stream = dialog.getByRole("button", { name: "流式输出", exact: true });
  const toolMode = dialog.getByRole("button", { name: "工具调用方式", exact: true });
  await expect(temperature).toHaveValue("0.7");
  await expect(topP).toHaveValue("0.9");
  await expect(contextWindow).toHaveAttribute("aria-valuetext", "16K tokens");
  await expect(contextMessageCount).toHaveAttribute("aria-valuetext", "最近 16 条");
  if ((page.viewportSize()?.width || 0) > 760) {
    const contextTracks = dialog.locator([
      ".figma-discrete-range:has(#figma-context-window-range) .figma-range-track",
      ".figma-discrete-range:has(#figma-context-message-count-range) .figma-range-track"
    ].join(", "));
    const trackTops = await contextTracks.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top)
    );
    expect(trackTops).toHaveLength(2);
    expect(Math.abs(trackTops[0] - trackTops[1])).toBeLessThanOrEqual(1);
  }
  await expect(maxTokens).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("spinbutton", { name: "最大 Token 数值", exact: true })).toHaveCount(0);
  await expect(toolMode).toContainText("使用函数调用");
  await maxTokens.click();
  const maxTokenConfirmation = page.getByRole("alertdialog", { name: "最大 Token 数", exact: true });
  await expect(maxTokenConfirmation).toContainText("请根据所选模型的上下文和输出限制设置");
  await maxTokenConfirmation.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(maxTokens).toHaveAttribute("aria-pressed", "false");
  await temperature.fill("0.2");
  await topP.fill("0.4");
  await contextWindow.fill("2");
  await contextMessageCount.fill("3");
  await enableMaximumTokenLimit(dialog);
  const maxTokenInput = dialog.getByRole("spinbutton", { name: "最大 Token 数值", exact: true });
  await maxTokenInput.fill("32768");
  const tokenInputBox = await maxTokenInput.boundingBox();
  const tokenSettingBox = await dialog.locator(".figma-output-token-setting").boundingBox();
  expect(tokenInputBox).not.toBeNull();
  expect(tokenSettingBox).not.toBeNull();
  const maximumInputRatio = (page.viewportSize()?.width || 0) > 760 ? 0.4 : 0.8;
  expect(tokenInputBox!.width).toBeLessThan(tokenSettingBox!.width * maximumInputRatio);
  await stream.click();
  await chooseSettingsMenuOption(dialog, "工具调用方式", "使用提示词");

  await dialog.getByRole("tab", { name: "消息设置", exact: true }).click();
  await dialog.getByRole("button", { name: "使用衬线字体", exact: true }).click();
  await dialog.getByRole("button", { name: "显示消息大纲", exact: true }).click();
  await dialog.getByRole("tab", { name: "输入设置", exact: true }).click();
  await chooseSettingsMenuOption(dialog, "发送快捷键", "Ctrl + Enter");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();

  await trigger.click();
  await expect(dialog.getByRole("tab", { name: "外观设置", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(avatarPresets.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(personalAvatarPresets.nth(5)).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "气泡式", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  await expect(temperature).toHaveValue("0.7");
  await expect(topP).toHaveValue("0.9");
  await expect(contextWindow).toHaveAttribute("aria-valuetext", "16K tokens");
  await expect(contextMessageCount).toHaveAttribute("aria-valuetext", "最近 16 条");
  await expect(maxTokens).toHaveAttribute("aria-pressed", "false");
  await expect(toolMode).toContainText("使用函数调用");
  await dialog.getByRole("tab", { name: "消息设置", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "使用衬线字体", exact: true })).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("tab", { name: "输入设置", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "发送快捷键", exact: true })).toContainText("Enter");

  await dialog.getByRole("tab", { name: "外观设置", exact: true }).click();
  await avatarPresets.nth(2).click();
  await personalAvatarPresets.nth(1).click();
  await dialog.getByRole("button", { name: "列表式", exact: true }).click();
  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  await temperature.fill("0.3");
  await topP.fill("0.6");
  await contextWindow.fill("7");
  await contextMessageCount.fill("4");
  await enableMaximumTokenLimit(dialog);
  await dialog.getByRole("spinbutton", { name: "最大 Token 数值", exact: true }).fill("65536");
  await stream.click();
  await chooseSettingsMenuOption(dialog, "工具调用方式", "使用提示词");
  await dialog.getByRole("tab", { name: "消息设置", exact: true }).click();
  await dialog.getByRole("button", { name: "使用衬线字体", exact: true }).click();
  await dialog.getByRole("button", { name: "显示消息大纲", exact: true }).click();
  await dialog.getByRole("tab", { name: "输入设置", exact: true }).click();
  await chooseSettingsMenuOption(dialog, "发送快捷键", "Ctrl + Enter");
  await dialog.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole("tab", { name: "外观设置", exact: true }).click();
  await expect(avatarPresets.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(personalAvatarPresets.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "列表式", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  await expect(temperature).toHaveValue("0.3");
  await expect(topP).toHaveValue("0.6");
  await expect(contextWindow).toHaveAttribute("aria-valuetext", "1M tokens");
  await expect(contextMessageCount).toHaveAttribute("aria-valuetext", "最近 64 条");
  await expect(maxTokens).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("spinbutton", { name: "最大 Token 数值", exact: true })).toHaveValue("65536");
  await expect(toolMode).toContainText("使用提示词");
  await dialog.getByRole("tab", { name: "消息设置", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "使用衬线字体", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("tab", { name: "输入设置", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "发送快捷键", exact: true })).toContainText("Ctrl + Enter");
});

test("saved sampling settings are sent with the next Chat request", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  const temperature = dialog.getByRole("slider", { name: "\u6a21\u578b\u6e29\u5ea6 \u00b7 Temperature", exact: true });
  const topP = dialog.getByRole("slider", { name: "TOP-P", exact: true });
  const maxTokens = dialog.getByRole("button", { name: "\u6700\u5927 Token \u6570", exact: true });

  await temperature.fill("0.4");
  await topP.fill("0.6");
  await enableMaximumTokenLimit(dialog);
  await dialog.getByRole("spinbutton", { name: "最大 Token 数值", exact: true }).fill("131072");
  await dialog.getByRole("button", { name: "\u4fdd\u5b58\u8bbe\u7f6e", exact: true }).click();

  const composer = page.getByRole("textbox", { name: "\u6d88\u606f\u5185\u5bb9", exact: true });
  await composer.fill("\u9a8c\u8bc1\u4f1a\u8bdd\u53c2\u6570");
  await page.getByRole("button", { name: "\u53d1\u9001", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0]).toMatchObject({
    temperature: 0.4,
    topP: 0.6,
    maxTokens: 131072,
    modelId: "test-chat"
  });
  expect(apiHarness.chatRequests[0]).not.toHaveProperty("responseVerbosity");
});

test("default maximum output leaves the provider request unbounded", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("textbox", { name: "消息内容", exact: true }).fill("验证默认输出上限");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0]).not.toHaveProperty("maxTokens");
});

test("context history count controls how many recent messages are sent", async ({ page, apiHarness }) => {
  const conversation: Conversation = {
    id: "history-count",
    title: "历史消息条数",
    assistantId: "test-assistant",
    pinned: false,
    messages: Array.from({ length: 10 }, (_, index) => ({
      id: `history-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `历史消息 ${index + 1}`,
      status: "done",
      createdAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`
    })),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:10.000Z"
  };
  await seedChatConversations(page, [conversation]);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("button", { name: "会话设置", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "会话设置", exact: true });
  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  await dialog.getByRole("slider", { name: "模型上下文窗口", exact: true }).fill("7");
  await dialog.getByRole("slider", { name: "引用历史消息", exact: true }).fill("0");
  await dialog.getByRole("button", { name: "保存设置", exact: true }).click();

  await page.getByRole("textbox", { name: "消息内容", exact: true }).fill("验证历史消息条数");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].history?.map((message) => message.id)).toEqual([
    "history-7",
    "history-8",
    "history-9",
    "history-10"
  ]);
});

test("context window token budget further limits the selected history", async ({ page, apiHarness }) => {
  const conversation: Conversation = {
    id: "history-budget",
    title: "历史 Token 预算",
    assistantId: "test-assistant",
    pinned: false,
    messages: Array.from({ length: 6 }, (_, index) => ({
      id: `budget-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: String(index + 1).repeat(1600),
      status: "done",
      createdAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`
    })),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:06.000Z"
  };
  await seedChatConversations(page, [conversation]);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("button", { name: "会话设置", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "会话设置", exact: true });
  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  await dialog.getByRole("slider", { name: "模型上下文窗口", exact: true }).fill("0");
  await dialog.getByRole("slider", { name: "引用历史消息", exact: true }).fill("7");
  await dialog.getByRole("button", { name: "保存设置", exact: true }).click();

  await page.getByRole("textbox", { name: "消息内容", exact: true }).fill("验证 Token 预算");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].history?.map((message) => message.id)).toEqual(["budget-5", "budget-6"]);
});

test("saved Chat settings are scoped to sessionStorage and survive reload", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  await dialog.getByRole("button", { name: "\u5217\u8868\u5f0f", exact: true }).click();
  await dialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  await dialog.getByRole("slider", { name: "\u6a21\u578b\u6e29\u5ea6 \u00b7 Temperature", exact: true }).fill("0.2");
  await dialog.getByRole("slider", { name: "TOP-P", exact: true }).fill("0.5");
  await dialog.getByRole("slider", { name: "\u6a21\u578b\u4e0a\u4e0b\u6587\u7a97\u53e3", exact: true }).fill("7");
  await dialog.getByRole("slider", { name: "\u5f15\u7528\u5386\u53f2\u6d88\u606f", exact: true }).fill("7");
  await chooseSettingsMenuOption(dialog, "标题总结模型", "Test Chat");
  await dialog.getByRole("slider", { name: "总结引用消息", exact: true }).fill("3");
  await enableMaximumTokenLimit(dialog);
  await dialog.getByRole("spinbutton", { name: "最大 Token 数值", exact: true }).fill("262144");
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
    contextSize: "1024",
    contextMessageCount: null,
    maxTokensEnabled: true,
    maxTokens: 262144,
    titleSummaryEnabled: true,
    titleSummaryModelId: "test-chat",
    titleSummaryMessageCount: 8,
    streamOutput: false,
    toolInvocationMode: "function",
    responseVerbosity: "default",
    showUsage: true,
    renderMath: true,
    enableSingleDollarMath: true,
    showTokenEstimate: true,
    sendShortcut: "enter"
  });

  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  await page.getByRole("button", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true }).first().click();
  const reloadedDialog = page.getByRole("dialog", { name: "\u4f1a\u8bdd\u8bbe\u7f6e", exact: true });
  await expect(reloadedDialog.getByRole("button", { name: "\u5217\u8868\u5f0f", exact: true })).toHaveAttribute("aria-pressed", "true");
  await reloadedDialog.getByRole("tab", { name: "模型设置", exact: true }).click();
  await expect(reloadedDialog.getByRole("slider", { name: "\u6a21\u578b\u6e29\u5ea6 \u00b7 Temperature", exact: true })).toHaveValue("0.2");
  await expect(reloadedDialog.getByRole("slider", { name: "TOP-P", exact: true })).toHaveValue("0.5");
  await expect(reloadedDialog.getByRole("slider", { name: "\u6a21\u578b\u4e0a\u4e0b\u6587\u7a97\u53e3", exact: true })).toHaveAttribute("aria-valuetext", "1M tokens");
  await expect(reloadedDialog.getByRole("slider", { name: "\u5f15\u7528\u5386\u53f2\u6d88\u606f", exact: true })).toHaveAttribute("aria-valuetext", "不限");
  await expect(reloadedDialog.getByRole("button", { name: "标题总结模型", exact: true })).toContainText("Test Chat");
  await expect(reloadedDialog.getByRole("slider", { name: "总结引用消息", exact: true })).toHaveAttribute("aria-valuetext", "最近 8 条");
  await expect(reloadedDialog.getByRole("button", { name: "\u6700\u5927 Token \u6570", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(reloadedDialog.getByRole("spinbutton", { name: "最大 Token 数值", exact: true })).toHaveValue("262144");
  await expect(reloadedDialog.getByRole("button", { name: "\u6d41\u5f0f\u8f93\u51fa", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("Chat input settings control command menus, token estimates, long paste attachments, and send shortcut", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await page.getByRole("button", { name: "会话设置", exact: true }).first().click();
  const settings = page.getByRole("dialog", { name: "会话设置", exact: true });
  await settings.getByRole("tab", { name: "输入设置", exact: true }).click();
  await chooseSettingsMenuOption(settings, "发送快捷键", "Ctrl + Enter");
  await settings.getByRole("button", { name: "长文本粘贴为文件", exact: true }).click();
  await settings.getByRole("button", { name: "启用 / 和 $ 快捷菜单", exact: true }).click();
  await settings.getByRole("button", { name: "保存设置", exact: true }).click();

  const session = page.locator(".figma-chat-session").first();
  const composer = session.getByLabel("消息内容", { exact: true });
  await composer.fill("普通回车只换行");
  await composer.press("Enter");
  expect(apiHarness.chatRequests).toHaveLength(0);
  await expect(composer).toHaveValue("普通回车只换行\n");
  await composer.press("Control+Enter");
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);

  const pastedText = "长文本附件内容".repeat(320);
  await composer.evaluate((element, value) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: (type: string) => type === "text/plain" ? value : "" }
    });
    element.dispatchEvent(event);
  }, pastedText);
  const attachmentTray = session.getByLabel("待发送附件", { exact: true });
  await expect(attachmentTray).toBeVisible();
  await expect(attachmentTray).toContainText("粘贴内容-");
  await expect(composer).toHaveValue("");

  await composer.fill("/");
  await expect(session.getByRole("listbox")).toHaveCount(0);
  await expect(session.getByText(/预估 .* Token/)).toBeVisible();
  await composer.fill("");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(2);
  expect(apiHarness.chatRequests[1]).toMatchObject({
    content: "请分析我上传的文本附件。",
    displayContent: "请分析我上传的文本附件。",
    attachments: [{ kind: "text", text: pastedText }]
  });
});

test("saved prompt tool mode is carried by the Chat request", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  await page.getByRole("button", { name: "会话设置", exact: true }).first().click();
  const settings = page.getByRole("dialog", { name: "会话设置", exact: true });
  await settings.getByRole("tab", { name: "模型设置", exact: true }).click();
  await chooseSettingsMenuOption(settings, "工具调用方式", "使用提示词");
  await settings.getByRole("button", { name: "保存设置", exact: true }).click();

  const session = page.locator(".figma-chat-session").first();
  await session.getByLabel("消息内容", { exact: true }).fill("验证提示词工具模式");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0]).toMatchObject({ toolInvocationMode: "prompt" });
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
  await settings.getByRole("tab", { name: "模型设置", exact: true }).click();
  const imageLimit = settings.getByRole("button", { name: "单次图片上限", exact: true });
  await expect(imageLimit).toContainText("4 张");
  await chooseSettingsMenuOption(settings, "单次图片上限", "2 张");
  await settings.getByRole("button", { name: "保存设置", exact: true }).click();

  const stored = await page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) || "{}"), chatSettingsStorageKey);
  expect(stored.maxImageAttachments).toBe(2);

  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  await settingsTrigger.click();
  const reloadedSettings = page.getByRole("dialog", { name: "会话设置", exact: true });
  await reloadedSettings.getByRole("tab", { name: "模型设置", exact: true }).click();
  await expect(reloadedSettings.getByRole("button", { name: "单次图片上限", exact: true })).toContainText("2 张");
  await reloadedSettings.getByRole("button", { name: "保存设置", exact: true }).click();

  const session = page.locator(".figma-chat-session").first();
  const input = session.locator('input[type="file"][multiple]');
  await expect(input).toHaveCount(1);
  await input.setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: Buffer.from("one") },
    { name: "two.png", mimeType: "image/png", buffer: Buffer.from("two") }
  ]);
  const attachmentTray = session.getByLabel("待发送附件", { exact: true });
  const attachments = session.locator('[data-testid="chat-image-attachment"]');
  await expect(attachments).toHaveCount(2);
  await expect(session.getByText("已选择 2 / 2", { exact: true })).toBeVisible();
  const attachmentLayout = await attachmentTray.evaluate((element) => ({
    outsideComposer: !element.closest(".figma-composer"),
    followedByComposer: element.nextElementSibling?.classList.contains("figma-composer") || false
  }));
  expect(attachmentLayout).toEqual({ outsideComposer: true, followedByComposer: true });
  const attachmentBoxes = await attachments.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(attachmentBoxes.every(({ width, height }) => width <= 150 && height <= 50)).toBe(true);
  const composerBox = await session.locator(".figma-composer").boundingBox();
  expect(composerBox?.height).toBeLessThanOrEqual(96);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await input.setInputFiles([{ name: "three.png", mimeType: "image/png", buffer: Buffer.from("three") }]);
  await expect(attachments).toHaveCount(2);
  await expect(session.getByRole("alert")).toContainText("最多上传 2 张图片");

  await session.getByRole("button", { name: "移除图片 one.png", exact: true }).click();
  await expect(attachments).toHaveCount(1);
  await expect(session.getByText("已选择 1 / 2", { exact: true })).toBeVisible();

  await session.getByLabel("消息内容", { exact: true }).fill("携带多图发送");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].attachments).toHaveLength(1);
});
