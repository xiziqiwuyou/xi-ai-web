import {
  documentOverflow,
  expect,
  isMobileProject,
  mappedRequestModel,
  providerStorageKey,
  readyProvider,
  seedReadyProvider,
  test,
  visibleScrollOwners
} from "./support/app-fixture";

async function openAdminModels(page: Parameters<typeof documentOverflow>[0], projectName: string) {
  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(projectName)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("models");
    return;
  }
  const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
  await navigation.locator(".admin-nav-group-toggle", { hasText: "AI 能力" }).click();
  await navigation.getByRole("button", { name: "模型目录", exact: true }).click();
}

test("private admin route renders a username and password login shell", async ({ page, apiHarness }) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: false,
    adminConfigured: true
  });

  await page.goto("/xizi2333");

  await expect(page).toHaveURL(/\/xizi2333$/);
  await expect(page).toHaveTitle("Admin - xi-ai-web");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByLabel("管理员用户名", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("\u7ba1\u7406\u5458\u5bc6\u7801", { exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "\u8fd4\u56de\u524d\u53f0", exact: true })).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(0);
  expect(apiHarness.requests).toContain("GET /api/admin/status");
  expect(apiHarness.requests).not.toContain("GET /api/public/bootstrap");

  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("legacy admin path never mounts the Admin portal", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator(".admin-portal")).toHaveCount(0);
  await expect(page.getByTestId("chat-module")).toBeVisible({ timeout: 20_000 });
});

test("site settings rotate Admin credentials and return to login", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("site");
  } else {
    await page.locator('.admin-nav-group-toggle[aria-controls="admin-nav-items-system"]').click();
    await page.locator("#admin-nav-items-system button").first().click();
  }

  await page.getByLabel("新管理员用户名", { exact: true }).fill("new-operator");
  await page.getByLabel("当前密码", { exact: true }).fill("current-admin-password");
  const newPassword = page.getByLabel("新密码", { exact: true });
  const confirmedPassword = page.getByLabel("确认新密码", { exact: true });
  await newPassword.fill("discarded-admin-password");
  await confirmedPassword.fill("discarded-admin-password");
  await newPassword.fill("");
  await expect(confirmedPassword).toHaveValue("");
  await newPassword.fill("new-admin-password-2026");
  await confirmedPassword.fill("new-admin-password-2026");
  await page.getByRole("button", { name: "更新登录凭据", exact: true }).click();

  await expect(page.getByLabel("管理员用户名", { exact: true })).toHaveValue("new-operator");
  await expect(page.getByText("管理员凭据已更新，请使用新用户名和密码重新登录。", { exact: true })).toBeVisible();
  expect(apiHarness.requests).toContain("PATCH /api/admin/credentials");
});

test("authenticated admin console keeps responsive navigation and one scroll owner", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  await page.goto("/xizi2333");

  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".admin-console")).toHaveAttribute("data-scroll-owner", "true");
  await expect(page.locator(".admin-model-usage-row")).toHaveCount(2);
  await expect(page.locator(".admin-model-usage-row").first()).toContainText("Test Chat");

  if (isMobileProject(testInfo.project.name)) {
    const picker = page.locator(".admin-mobile-section-picker select");
    await expect(picker).toBeVisible();
    await expect(page.locator(".admin-sidebar")).toBeHidden();
    expect(await picker.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value)
    )).toEqual([
      "overview",
      "models",
      "tools",
      "workflows",
      "assistants",
      "apps",
      "prompts",
      "menus",
      "knowledge-overview",
      "knowledge-accounts",
      "knowledge-registration",
      "knowledge-limits",
      "knowledge-jobs",
      "knowledge-audit",
      "site",
      "audit"
    ]);

    await picker.selectOption("models");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    const overviewGroup = navigation.locator(".admin-nav-group-toggle", { hasText: "运行总览" });
    const modelGroup = navigation.locator(".admin-nav-group-toggle", { hasText: "AI 能力" });
    const modelPage = navigation.getByRole("button", { name: "模型目录", exact: true });

    await expect(navigation).toBeVisible();
    await expect(navigation.locator(".admin-nav-group-toggle")).toHaveCount(5);
    await expect(page.locator(".admin-mobile-section-picker")).toBeHidden();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "288px");
    await expect(overviewGroup).toHaveAttribute("aria-expanded", "true");
    await expect(modelGroup).toHaveAttribute("aria-expanded", "false");
    await expect(modelGroup).toHaveAttribute("aria-controls", "admin-nav-items-ai");

    await modelGroup.click();
    await expect(modelGroup).toHaveAttribute("aria-expanded", "true");
    await expect(overviewGroup).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".admin-nav-group-toggle[aria-expanded='true']")).toHaveCount(1);
    await expect(page.locator("#admin-nav-items-ai")).toBeVisible();
    const navigationGeometry = await page.locator("#admin-nav-items-ai").evaluate((items) => {
      const group = items.parentElement;
      const toggle = group?.querySelector<HTMLElement>(":scope > .admin-nav-group-toggle");
      const firstItem = items.querySelector<HTMLElement>(":scope > button");
      const itemStyle = firstItem ? getComputedStyle(firstItem) : null;
      return {
        toggleLeft: toggle?.getBoundingClientRect().left || 0,
        itemsLeft: items.getBoundingClientRect().left,
        columnCount: getComputedStyle(items).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        itemHeight: firstItem?.getBoundingClientRect().height || 0,
        itemRadius: Number.parseFloat(itemStyle?.borderRadius || "0"),
        itemShadow: itemStyle?.boxShadow || ""
      };
    });
    expect(Math.abs(navigationGeometry.toggleLeft - navigationGeometry.itemsLeft)).toBeLessThanOrEqual(1);
    expect(navigationGeometry.columnCount).toBe(1);
    expect(navigationGeometry.itemHeight).toBeGreaterThanOrEqual(48);
    expect(navigationGeometry.itemRadius).toBeGreaterThanOrEqual(10);
    expect(navigationGeometry.itemShadow).toBe("none");
    await modelPage.click();
    await expect(modelPage).toHaveAttribute("aria-current", "page");

    await modelGroup.click();
    await expect(modelGroup).toHaveAttribute("aria-expanded", "false");
    await expect(modelPage).toBeHidden();
    await expect(page.locator("#admin-section-models")).toBeVisible();

    await modelGroup.click();
    await expect(modelGroup).toHaveAttribute("aria-expanded", "true");
    await expect(modelPage).toHaveAttribute("aria-current", "page");
  }

  await expect(page.locator(".admin-section")).toHaveCount(1);
  await expect(page.locator("#admin-section-models")).toBeVisible();
  await expect(page.locator("#admin-section-overview")).toHaveCount(0);
  await expect(page.getByLabel("助手分类", { exact: true })).toHaveCount(0);
  await expect(page.locator(".admin-page-header > span")).toHaveText("AI 能力");
  await expect(page.getByText("MODELS", { exact: true })).toHaveCount(0);
  await expect(page.locator(".admin-console")).toHaveCSS("border-top-width", "0px");

  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("assistants");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    const contentGroup = navigation.locator(".admin-nav-group-toggle", { hasText: "内容与展示" });
    await contentGroup.click();
    await expect(contentGroup).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".admin-nav-group-toggle[aria-expanded='true']")).toHaveCount(1);
    await navigation.getByRole("button", { name: "助手库", exact: true }).click();
  }

  await expect(page.locator(".admin-section")).toHaveCount(1);
  await expect(page.locator("#admin-section-assistants")).toBeVisible();
  await expect(page.locator("#admin-section-models")).toHaveCount(0);
  await expect(page.getByLabel("前台显示名称", { exact: true })).toHaveCount(0);

  const owners = await visibleScrollOwners(page);
  expect(owners).toHaveLength(1);
  expect(owners[0].overflowY).toBe("auto");

  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(apiHarness.requests).toContain("GET /api/admin/bootstrap");
  expect(apiHarness.requests).not.toContain("GET /api/public/bootstrap");
});

test("legacy admin bootstrap without model vendors remains usable", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  apiHarness.setAdminBootstrapModelVendors(undefined);

  await openAdminModels(page, testInfo.project.name);

  const vendorRail = page.locator("#admin-section-models").getByRole("navigation", {
    name: "选择模型厂商",
    exact: true
  });
  await expect(vendorRail.getByRole("button").filter({ hasText: "OpenAI" }).first()).toBeVisible();
  await expect(vendorRail.getByRole("button").filter({ hasText: "Claude" }).first()).toBeVisible();
});

test("admin reorders model vendors directly in the vendor rail", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await openAdminModels(page, testInfo.project.name);

  const section = page.locator("#admin-section-models");
  const vendorRows = section.locator(".admin-model-vendor-row");
  await expect(vendorRows.nth(0)).toContainText("OpenAI");
  await expect(vendorRows.nth(1)).toContainText("Claude");

  if (isMobileProject(testInfo.project.name)) {
    await vendorRows.nth(0).getByRole("button", { name: "下移厂商 OpenAI", exact: true }).click();
  } else {
    await vendorRows.nth(0).getByRole("button", { name: "拖动 OpenAI 调整厂商顺序", exact: true }).dragTo(vendorRows.nth(1));
  }

  await expect(vendorRows.nth(0)).toContainText("Claude");
  await expect.poll(() => apiHarness.modelVendorMutations.filter((mutation) => mutation.method === "REORDER").length).toBe(1);
  const reorderMutation = apiHarness.modelVendorMutations.find((mutation) => mutation.method === "REORDER");
  expect(reorderMutation?.vendorIds?.slice(0, 2)).toEqual(["anthropic", "openai"]);
  await expect(page.getByText("模型厂商顺序已保存", { exact: true })).toHaveCount(0);
  await expect(section.getByText(/已移至第\s*\d+\s*位/)).toHaveCount(0);

  await page.reload();
  await openAdminModels(page, testInfo.project.name);
  await expect(page.locator("#admin-section-models .admin-model-vendor-row").nth(0)).toContainText("Claude");
});

test("admin reorders current-vendor models directly and keeps the catalog default", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await openAdminModels(page, testInfo.project.name);

  const section = page.locator("#admin-section-models");
  const rows = section.locator(".admin-model-entry-row");
  await expect(rows.nth(0)).toContainText("Test Chat");
  if (isMobileProject(testInfo.project.name)) {
    await rows.nth(0).getByRole("button", { name: "下移模型 Test Chat", exact: true }).click();
  } else {
    await rows.nth(0).getByRole("button", { name: "拖动 Test Chat 调整模型顺序", exact: true }).dragTo(rows.nth(1));
  }
  await expect(rows.nth(0)).toContainText("OpenAI Fast");

  await expect.poll(() => apiHarness.modelCatalogMutations.filter((mutation) => mutation.method === "REORDER").length).toBe(1);
  const reorderMutation = apiHarness.modelCatalogMutations.find((mutation) => mutation.method === "REORDER");
  expect(reorderMutation?.modelIds?.[0]).toBe("openai-fast");
  await expect(page.getByText("模型顺序已保存", { exact: true })).toHaveCount(0);

  await page.reload();
  await openAdminModels(page, testInfo.project.name);
  await expect(page.locator("#admin-section-models .admin-model-entry-row").nth(0)).toContainText("OpenAI Fast");
  await expect(page.getByRole("dialog", { name: "模型排序", exact: true })).toHaveCount(0);

  await page.evaluate(({ key, value }) => {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  }, { key: providerStorageKey, value: { ...readyProvider, lastModelId: undefined } });
  await page.goto("/chat");
  const session = page.locator(".figma-chat-session").first();
  await expect(session.getByRole("button", { name: "选择对话模型", exact: true })).toContainText("OpenAI Fast");

  await page.evaluate(({ key, value }) => {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  }, { key: providerStorageKey, value: readyProvider });
  await page.reload();
  await expect(page.locator(".figma-chat-session").first().getByRole("button", { name: "选择对话模型", exact: true })).toContainText("Test Chat");
});

test("all admin destinations share the responsive wide content boundary", async ({ page, apiHarness }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-1280", "Destination matrix runs at 1920px and the two mobile acceptance viewports");
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  if (testInfo.project.name === "desktop-1440") {
    await page.setViewportSize({ width: 1920, height: 1000 });
  }
  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });

  const sectionIds = [
    "overview",
    "tools",
    "site",
    "menus",
    "models",
    "workflows",
    "assistants",
    "apps",
    "prompts",
    "knowledge-overview",
    "knowledge-accounts",
    "knowledge-registration",
    "knowledge-limits",
    "knowledge-jobs",
    "knowledge-audit",
    "audit"
  ];

  const picker = page.locator(".admin-mobile-section-picker select");
  const shellBaseline = await page.evaluate(() => {
    const layout = document.querySelector(".admin-console-layout")?.getBoundingClientRect();
    const sidebar = document.querySelector(".admin-sidebar")?.getBoundingClientRect();
    return {
      layoutWidth: layout?.width || 0,
      layoutHeight: layout?.height || 0,
      sidebarWidth: sidebar?.width || 0
    };
  });
  for (const sectionId of sectionIds) {
    await picker.evaluate((select, value) => {
      const element = select as HTMLSelectElement;
      element.value = String(value);
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, sectionId);
    await expect(page.locator(`#admin-section-${sectionId}`)).toBeVisible();
    await expect(page.locator(".admin-section:visible")).toHaveCount(1);

    const geometry = await page.evaluate(() => {
      const consoleRect = document.querySelector(".admin-console")?.getBoundingClientRect();
      const innerRect = document.querySelector(".admin-console-inner")?.getBoundingClientRect();
      const consoleElement = document.querySelector<HTMLElement>(".admin-console");
      const layoutRect = document.querySelector(".admin-console-layout")?.getBoundingClientRect();
      const sidebarRect = document.querySelector(".admin-sidebar")?.getBoundingClientRect();
      return {
        layoutWidth: layoutRect?.width || 0,
        layoutHeight: layoutRect?.height || 0,
        sidebarWidth: sidebarRect?.width || 0,
        consoleWidth: consoleRect?.width || 0,
        innerWidth: innerRect?.width || 0,
        consoleClientWidth: consoleElement?.clientWidth || 0,
        consoleScrollWidth: consoleElement?.scrollWidth || 0,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    });
    expect(Math.abs(geometry.layoutWidth - shellBaseline.layoutWidth), `${sectionId} should not resize the Admin shell`).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.layoutHeight - shellBaseline.layoutHeight), `${sectionId} should not change the Admin shell height`).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.sidebarWidth - shellBaseline.sidebarWidth), `${sectionId} should not resize the Admin sidebar`).toBeLessThanOrEqual(1);
    expect(geometry.innerWidth / geometry.consoleWidth, `${sectionId} should use the shared Admin content width`).toBeGreaterThan(0.96);
    expect(geometry.consoleScrollWidth, `${sectionId} should not overflow the Admin content scroller`).toBeLessThanOrEqual(geometry.consoleClientWidth + 1);
    expect(geometry.documentWidth, `${sectionId} should not create horizontal overflow`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  }
});

test("admin model names keep the short label in front of the stable request ID", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await seedReadyProvider(page);

  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("models");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    await navigation.locator(".admin-nav-group-toggle", { hasText: "AI 能力" }).click();
    await navigation.getByRole("button", { name: "模型目录", exact: true }).click();
  }

  const section = page.locator("#admin-section-models");
  const displayName = section.getByLabel("前台显示名称", { exact: true });
  const requestName = section.getByLabel("实际请求模型名", { exact: true });
  const endpointProtocol = section.getByLabel("对话请求端点", { exact: true });
  const contextWindow = section.getByLabel("上下文窗口（Token）", { exact: true });
  const maxInputCharacters = section.getByLabel("最大输入字符数", { exact: true });
  await expect(displayName).toHaveValue("Test Chat");
  await expect(displayName).toHaveAttribute("required", "");
  await expect(requestName).toHaveValue(mappedRequestModel);
  await expect(requestName).toHaveAttribute("required", "");
  await expect(endpointProtocol).toHaveValue("openai-responses");
  await endpointProtocol.selectOption("openai-chat");
  await expect(endpointProtocol).toHaveValue("openai-chat");
  await expect(contextWindow).toHaveValue("32768");
  await expect(contextWindow).toHaveAttribute("min", "4096");
  await expect(maxInputCharacters).toHaveValue("24000");
  await expect(maxInputCharacters).toHaveAttribute("min", "1000");
  await expect(section.getByLabel("模型名称映射预览", { exact: true })).toHaveCount(0);

  await displayName.fill("");
  await requestName.fill("");
  await section.getByRole("button", { name: "保存模型", exact: true }).click();
  await expect(section.getByText("前台显示名称不能为空", { exact: true })).toBeVisible();
  await expect(section.getByText("实际请求模型名不能为空", { exact: true })).toBeVisible();
  expect(apiHarness.requests.some((request) => request.startsWith("PATCH /api/admin/model-catalog/"))).toBe(false);

  await displayName.fill("Test Chat");
  await requestName.fill(mappedRequestModel);
  await section.getByRole("button", { name: "保存模型", exact: true }).click();
  await expect.poll(() => apiHarness.requests.filter((request) => request === "PATCH /api/admin/model-catalog/test-chat").length).toBe(1);

  await page.reload();
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("models");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    await navigation.locator(".admin-nav-group-toggle", { hasText: "AI 能力" }).click();
    await navigation.getByRole("button", { name: "模型目录", exact: true }).click();
  }
  await expect(page.locator("#admin-section-models").getByLabel("对话请求端点", { exact: true })).toHaveValue("openai-chat");

  await page.goto("/chat");
  const session = page.locator(".figma-chat-session").first();
  const modelPicker = session.getByRole("button", { name: "选择对话模型", exact: true });
  await expect(modelPicker).toContainText("Test Chat", { timeout: 20_000 });
  await expect(session).not.toContainText(mappedRequestModel);
  await session.getByLabel("消息内容", { exact: true }).fill("验证模型映射");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].modelId).toBe("test-chat");
});

test("admin media-only models show dedicated image routes instead of chat protocols", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("models");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    await navigation.locator(".admin-nav-group-toggle", { hasText: "AI 能力" }).click();
    await navigation.getByRole("button", { name: "模型目录", exact: true }).click();
  }

  const section = page.locator("#admin-section-models");
  const vendorRail = section.getByRole("navigation", { name: "选择模型厂商", exact: true });
  const configuredModels = section.locator(".admin-model-list-group").first();
  const detail = section.locator(".admin-model-detail-panel");

  if (testInfo.project.name === "desktop-1440") {
    await page.setViewportSize({ width: 1920, height: 1000 });
    const geometry = await page.evaluate(() => {
      const consoleRect = document.querySelector(".admin-console")?.getBoundingClientRect();
      const innerRect = document.querySelector(".admin-console-inner")?.getBoundingClientRect();
      return {
        consoleWidth: consoleRect?.width || 0,
        innerWidth: innerRect?.width || 0
      };
    });
    expect(geometry.innerWidth / geometry.consoleWidth).toBeGreaterThan(0.96);
  }

  await vendorRail.getByRole("button").filter({ hasText: "OpenAI" }).first().click();
  await configuredModels.locator(".admin-model-row", { hasText: "OpenAI Image" }).click();
  await expect(detail.getByLabel("对话请求端点", { exact: true })).toHaveCount(0);
  const openAiChannel = detail.getByLabel("专用请求通道", { exact: true });
  await expect(openAiChannel).toContainText("OpenAI 图片专用接口");
  await expect(openAiChannel).toContainText("/v1/images/generations");
  await expect(openAiChannel).toContainText("/v1/images/edits");
  await expect(detail.getByLabel("模型名称映射预览", { exact: true })).toHaveCount(0);

  await vendorRail.getByRole("button").filter({ hasText: "Gemini" }).click();
  await configuredModels.locator(".admin-model-row", { hasText: "Gemini Image" }).click();
  await expect(detail.getByLabel("对话请求端点", { exact: true })).toHaveCount(0);
  const geminiChannel = detail.getByLabel("专用请求通道", { exact: true });
  await expect(geminiChannel).toContainText("Gemini 图片生成接口");
  await expect(geminiChannel).toContainText("/v1beta/models/{model}:generateContent");
});

test("admin model catalog groups configured models and presets by vendor", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("models");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    await navigation.locator(".admin-nav-group-toggle", { hasText: "AI 能力" }).click();
    await navigation.getByRole("button", { name: "模型目录", exact: true }).click();
  }

  const section = page.locator("#admin-section-models");
  const vendorRail = section.getByRole("navigation", { name: "选择模型厂商", exact: true });
  const modelList = section.locator(".admin-model-list-panel");
  const detail = section.locator(".admin-model-detail-panel");
  const modelListScroll = modelList.locator(".admin-model-list-scroll");
  const vendorListScroll = section.locator(".admin-model-vendor-list");
  const openAiVendor = vendorRail.getByRole("button").filter({ hasText: "OpenAI" }).first();
  const claudeVendor = vendorRail.getByRole("button").filter({ hasText: "Claude" });

  await expect(section.locator(".section-title")).toHaveCount(0);
  await expect(section.getByText("模型目录校验通过", { exact: true })).toHaveCount(0);
  await expect(section.getByText("前台能力预览", { exact: true })).toHaveCount(0);
  await expect(modelListScroll).toBeVisible();
  if (!isMobileProject(testInfo.project.name)) {
    const readViewportGeometry = () => page.evaluate(() => {
      const adminConsole = document.querySelector<HTMLElement>(".admin-console");
      const workbench = document.querySelector<HTMLElement>(".admin-model-workbench");
      const vendorFooter = document.querySelector<HTMLElement>(".admin-model-vendor-management");
      const modelFooter = document.querySelector<HTMLElement>(".admin-model-management");
      const saveButton = document.querySelector<HTMLElement>(".admin-model-detail-form .primary-action");
      return {
        consoleClientHeight: adminConsole?.clientHeight || 0,
        consoleScrollHeight: adminConsole?.scrollHeight || 0,
        workbenchBottom: workbench?.getBoundingClientRect().bottom || 0,
        vendorFooterBottom: vendorFooter?.getBoundingClientRect().bottom || 0,
        modelFooterBottom: modelFooter?.getBoundingClientRect().bottom || 0,
        saveButtonBottom: saveButton?.getBoundingClientRect().bottom || 0,
        viewportHeight: window.innerHeight
      };
    });
    const viewportGeometry = await readViewportGeometry();
    expect(viewportGeometry.consoleScrollHeight).toBeLessThanOrEqual(viewportGeometry.consoleClientHeight + 1);
    expect(viewportGeometry.workbenchBottom).toBeLessThanOrEqual(viewportGeometry.viewportHeight);
    expect(viewportGeometry.vendorFooterBottom).toBeLessThanOrEqual(viewportGeometry.viewportHeight);
    expect(viewportGeometry.modelFooterBottom).toBeLessThanOrEqual(viewportGeometry.viewportHeight);
    expect(viewportGeometry.saveButtonBottom).toBeLessThanOrEqual(viewportGeometry.viewportHeight);

    if (testInfo.project.name === "desktop-1440") {
      await page.setViewportSize({ width: 2048, height: 955 });
      const wideGeometry = await readViewportGeometry();
      expect(wideGeometry.consoleScrollHeight).toBeLessThanOrEqual(wideGeometry.consoleClientHeight + 1);
      expect(wideGeometry.workbenchBottom).toBeLessThanOrEqual(wideGeometry.viewportHeight);
      expect(wideGeometry.vendorFooterBottom).toBeLessThanOrEqual(wideGeometry.viewportHeight);
      expect(wideGeometry.modelFooterBottom).toBeLessThanOrEqual(wideGeometry.viewportHeight);
      expect(wideGeometry.saveButtonBottom).toBeLessThanOrEqual(wideGeometry.viewportHeight);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  }
  const listGeometry = await modelListScroll.evaluate((element) => {
    const style = getComputedStyle(element);
    const row = element.querySelector<HTMLElement>(".admin-model-row");
    return {
      maxHeight: Number.parseFloat(style.maxHeight),
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      rowWidth: row?.getBoundingClientRect().width || 0,
      scrollbarWidth: getComputedStyle(element, "::-webkit-scrollbar").width
    };
  });
  expect(listGeometry.overflowY).toBe("auto");
  expect(listGeometry.maxHeight).toBeLessThanOrEqual(430);
  expect(listGeometry.scrollHeight).toBeGreaterThan(listGeometry.clientHeight);
  expect(listGeometry.scrollbarWidth).toBe("7px");

  const vendorGeometry = await vendorListScroll.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      maxHeight: Number.parseFloat(style.maxHeight),
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollbarWidth: getComputedStyle(element, "::-webkit-scrollbar").width
    };
  });
  expect(vendorGeometry.overflowY).toBe("auto");
  expect(vendorGeometry.maxHeight).toBeLessThanOrEqual(392);
  expect(vendorGeometry.scrollHeight).toBeGreaterThan(vendorGeometry.clientHeight);
  expect(vendorGeometry.scrollbarWidth).toBe("7px");
  if (!isMobileProject(testInfo.project.name)) {
    const desktopRowHeights = await section.evaluate((element) => ({
      vendor: element.querySelector<HTMLElement>(".admin-model-vendor-row")?.getBoundingClientRect().height || 0,
      model: element.querySelector<HTMLElement>(".admin-model-row")?.getBoundingClientRect().height || 0
    }));
    expect(desktopRowHeights.vendor).toBeGreaterThanOrEqual(60);
    expect(Math.abs(desktopRowHeights.vendor - desktopRowHeights.model)).toBeLessThanOrEqual(8);
  }

  await modelListScroll.evaluate((element) => {
    element.scrollTop = Math.min(60, element.scrollHeight - element.clientHeight);
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(modelListScroll).toHaveClass(/is-scrolling/);
  const activeRowWidth = await modelListScroll.locator(".admin-model-row").first().evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(activeRowWidth - listGeometry.rowWidth)).toBeLessThanOrEqual(1);
  await expect(modelListScroll).not.toHaveClass(/is-scrolling/, { timeout: 1_200 });

  await vendorListScroll.evaluate((element) => {
    element.scrollTop = Math.min(40, element.scrollHeight - element.clientHeight);
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(vendorListScroll).toHaveClass(/is-scrolling/);
  await expect(vendorListScroll).not.toHaveClass(/is-scrolling/, { timeout: 1_200 });

  await expect(openAiVendor).toHaveAttribute("aria-pressed", "true");
  await expect(modelList.getByText("Test Chat", { exact: true })).toBeVisible();
  await expect(modelList.getByText("Claude Sonnet", { exact: true })).toHaveCount(0);

  await claudeVendor.click();
  await expect(claudeVendor).toHaveAttribute("aria-pressed", "true");
  await expect(modelList.getByText("Claude Sonnet", { exact: true })).toBeVisible();
  await expect(modelList.getByText("Test Chat", { exact: true })).toHaveCount(0);
  await expect(detail.getByLabel("对话请求端点", { exact: true })).toHaveValue("anthropic-messages");
  await expect(detail.getByRole("combobox", { name: "模型厂商", exact: true })).toHaveCount(0);
  await expect(detail.getByLabel("模型名称映射预览", { exact: true })).toHaveCount(0);
  const capabilityGrid = detail.locator(".admin-model-option-grid");
  const capabilityToggles = capabilityGrid.locator(".admin-model-check-row");
  await expect(capabilityToggles).toHaveCount(14);
  await expect(capabilityGrid.getByRole("button", { name: "流式", exact: true })).toHaveCount(0);
  const capabilityLayout = await capabilityGrid.evaluate((element) => {
    const gridStyle = getComputedStyle(element);
    const firstToggle = element.querySelector<HTMLElement>(".admin-model-check-row");
    const toggleStyle = firstToggle ? getComputedStyle(firstToggle) : null;
    return {
      display: gridStyle.display,
      flexWrap: gridStyle.flexWrap,
      borderRadius: Number.parseFloat(toggleStyle?.borderRadius || "0")
    };
  });
  expect(capabilityLayout.display).toBe("flex");
  expect(capabilityLayout.flexWrap).toBe("wrap");
  expect(capabilityLayout.borderRadius).toBeGreaterThanOrEqual(8);
  const capabilityLabelsFit = await capabilityGrid.locator(".admin-model-check-label").evaluateAll((labels) =>
    labels.every((label) => label.scrollWidth <= label.clientWidth + 1)
  );
  expect(capabilityLabelsFit).toBe(true);
  const imageEditToggle = capabilityGrid.getByRole("button", { name: "图片编辑", exact: true });
  await expect(imageEditToggle).toHaveAttribute("aria-pressed", "false");
  await imageEditToggle.click();
  await expect(imageEditToggle).toHaveAttribute("aria-pressed", "true");
  await imageEditToggle.click();
  await expect(imageEditToggle).toHaveAttribute("aria-pressed", "false");
  const modelManagement = section.locator(".admin-model-management");
  await expect(modelManagement.getByRole("button", { name: "删除模型 Claude Sonnet", exact: true })).toBeEnabled();

  const preset = modelList.locator(".admin-model-preset-list .admin-model-row", { hasText: "Claude Sonnet 5" });
  await preset.click();
  await expect(detail.getByLabel("前台显示名称", { exact: true })).toHaveValue("Claude Sonnet 5");
  await expect(detail.getByLabel("实际请求模型名", { exact: true })).toHaveValue("claude-sonnet-5");
  await expect(modelManagement.getByRole("button", { name: "删除模型", exact: true })).toBeDisabled();
  expect(apiHarness.requests.filter((request) => request === "POST /api/admin/model-catalog")).toHaveLength(0);

  await detail.getByRole("button", { name: "保存模型", exact: true }).click();
  await expect.poll(() => apiHarness.requests.filter((request) => request === "POST /api/admin/model-catalog").length).toBe(1);
  await expect(modelList.getByText("Claude Sonnet 5", { exact: true })).toBeVisible();
  await expect(modelManagement.getByRole("button", { name: "删除模型 Claude Sonnet 5", exact: true })).toBeEnabled();

  await page.reload();
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("models");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    await navigation.locator(".admin-nav-group-toggle", { hasText: "AI 能力" }).click();
    await navigation.getByRole("button", { name: "模型目录", exact: true }).click();
  }
  const reloadedSection = page.locator("#admin-section-models");
  await reloadedSection.getByRole("navigation", { name: "选择模型厂商", exact: true })
    .getByRole("button")
    .filter({ hasText: "Claude" })
    .click();
  const reloadedModelList = reloadedSection.locator(".admin-model-list-panel");
  const createdRow = reloadedModelList.locator(".admin-model-row", { hasText: "Claude Sonnet 5" });
  await expect(createdRow).toBeVisible();
  await createdRow.click();
  await reloadedSection.getByRole("button", { name: "删除模型 Claude Sonnet 5", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Claude Sonnet 5");
  await confirmation.getByRole("button", { name: "删除模型", exact: true }).click();
  await expect.poll(() => apiHarness.requests.filter((request) => request.startsWith("DELETE /api/admin/model-catalog/")).length).toBe(1);
  await expect(reloadedModelList.locator(".admin-model-list-group").first().getByText("Claude Sonnet 5", { exact: true })).toHaveCount(0);
  await expect(reloadedModelList.locator(".admin-model-preset-list").getByText("Claude Sonnet 5", { exact: true })).toBeVisible();
  await expect(reloadedSection.getByRole("navigation", { name: "选择模型厂商", exact: true })
    .getByRole("button")
    .filter({ hasText: "Claude" })).toHaveAttribute("aria-pressed", "true");
});

test("admin creates a model under a newly added vendor without losing vendorId", async ({ page, apiHarness }, testInfo) => {
  test.setTimeout(60_000);
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await openAdminModels(page, testInfo.project.name);

  const section = page.locator("#admin-section-models");
  const vendorRail = section.getByRole("navigation", { name: "选择模型厂商", exact: true });
  await section.getByRole("button", { name: "新增模型厂商", exact: true }).click();
  const vendorForm = section.locator("#admin-model-vendor-form");
  await vendorForm.getByRole("textbox", { name: "厂商名称", exact: true }).fill("E2E 团队网关");
  await vendorForm.getByRole("combobox", { name: "请求适配器", exact: true }).selectOption("qwen");
  await vendorForm.getByRole("button", { name: "新增", exact: true }).click();

  const createdVendorButton = vendorRail.getByRole("button").filter({ hasText: "E2E 团队网关" });
  await expect(createdVendorButton).toHaveAttribute("aria-pressed", "true");
  const vendorMutation = apiHarness.modelVendorMutations.find(
    (mutation) => mutation.method === "POST" && mutation.payload?.label === "E2E 团队网关"
  );
  expect(vendorMutation?.payload).toEqual({ label: "E2E 团队网关", adapter: "qwen" });
  expect(vendorMutation?.result?.id).toBeTruthy();

  const duplicateResponse = await page.evaluate(async () => {
    const response = await fetch("/api/admin/model-vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "E2E 团队网关", adapter: "openai" })
    });
    return { status: response.status, body: await response.json() as { error?: string } };
  });
  expect(duplicateResponse.status).toBe(409);
  expect(duplicateResponse.body.error).toContain("已存在");

  await section.getByRole("button", { name: "新增 E2E 团队网关 模型", exact: true }).click();
  const detail = section.locator(".admin-model-detail-panel");
  const selectedVendorId = vendorMutation?.result?.id;
  expect(selectedVendorId).toBeTruthy();
  await expect(detail.getByRole("combobox", { name: "模型厂商", exact: true })).toHaveCount(0);
  await detail.getByLabel("前台显示名称", { exact: true }).fill("E2E Qwen Chat");
  await detail.getByLabel("实际请求模型名", { exact: true }).fill("qwen-e2e-chat");
  await detail.getByRole("button", { name: "保存模型", exact: true }).click();

  await expect.poll(() => apiHarness.modelCatalogMutations.filter((mutation) => mutation.method === "POST").length).toBe(1);
  const modelMutation = apiHarness.modelCatalogMutations.find((mutation) => mutation.method === "POST");
  expect(modelMutation?.payload.vendorId).toBe(selectedVendorId);
  await expect(section.locator(".admin-model-list-panel").getByText("E2E Qwen Chat", { exact: true })).toBeVisible();
});

test("admin guards populated vendors and confirms empty vendor deletion", async ({ page, apiHarness }, testInfo) => {
  test.setTimeout(60_000);
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await openAdminModels(page, testInfo.project.name);

  const section = page.locator("#admin-section-models");
  const vendorRail = section.getByRole("navigation", { name: "选择模型厂商", exact: true });
  await vendorRail.getByRole("button").filter({ hasText: "OpenAI" }).first().click();
  await expect(section.getByRole("button", { name: "删除厂商 OpenAI", exact: true })).toBeDisabled();
  await expect(section.getByText(/该厂商仍有 \d+ 个模型，请先迁移或删除这些模型。/)).toBeVisible();

  const populatedDeleteResponse = await page.evaluate(async () => {
    const response = await fetch("/api/admin/model-vendors/openai", { method: "DELETE" });
    return { status: response.status, body: await response.json() as { error?: string } };
  });
  expect(populatedDeleteResponse.status).toBe(409);
  expect(populatedDeleteResponse.body.error).toContain("仍包含模型");

  await section.getByRole("button", { name: "新增模型厂商", exact: true }).click();
  const vendorForm = section.locator("#admin-model-vendor-form");
  await vendorForm.getByRole("textbox", { name: "厂商名称", exact: true }).fill("E2E 空厂商");
  await vendorForm.getByRole("combobox", { name: "请求适配器", exact: true }).selectOption("openai-compatible");
  await vendorForm.getByRole("button", { name: "新增", exact: true }).click();

  const emptyVendorButton = vendorRail.getByRole("button").filter({ hasText: "E2E 空厂商" });
  await expect(emptyVendorButton).toHaveAttribute("aria-pressed", "true");
  const deleteVendor = section.getByRole("button", { name: "删除厂商 E2E 空厂商", exact: true });
  await expect(deleteVendor).toBeEnabled();
  await deleteVendor.click();
  const confirmation = page.getByRole("alertdialog", { name: "删除模型厂商“E2E 空厂商”？", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "删除厂商", exact: true }).click();

  await expect(emptyVendorButton).toHaveCount(0);
  const createdVendor = apiHarness.modelVendorMutations.find(
    (mutation) => mutation.method === "POST" && mutation.payload?.label === "E2E 空厂商"
  )?.result;
  expect(createdVendor?.id).toBeTruthy();
  expect(apiHarness.modelVendorMutations).toContainEqual({ method: "DELETE", id: createdVendor?.id });
});

test("admin assistant editor exposes the public library metadata contract", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("assistants");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    await navigation.locator(".admin-nav-group-toggle", { hasText: "内容与展示" }).click();
    await navigation.getByRole("button", { name: "助手库", exact: true }).click();
  }

  const section = page.locator("#admin-section-assistants");
  await expect(section.getByRole("heading", { name: "助手库", exact: true })).toBeVisible();
  await expect(section.getByLabel("助手分类", { exact: true })).toHaveValue("通用效率");
  await expect(section.getByLabel("助手标签", { exact: true })).toHaveValue("战略, 拆解");
  await expect(section.getByLabel("助手开场问题", { exact: true })).toHaveValue(/帮我把一个模糊目标拆成行动计划/);
  await expect(section.getByLabel("助手头像", { exact: true })).toHaveValue("sparkles");
  await section.getByLabel("助手头像", { exact: true }).selectOption("presentation");
  await expect(section.locator('[data-assistant-avatar="presentation"]')).toBeVisible();
  await expect(section.getByRole("checkbox", { name: "前台启用", exact: true })).toBeChecked();
});
