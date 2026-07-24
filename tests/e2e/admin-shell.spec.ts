import {
  documentOverflow,
  expect,
  isMobileProject,
  mappedRequestModel,
  seedReadyProvider,
  test,
  visibleScrollOwners
} from "./support/app-fixture";

test("admin route renders an isolated login shell", async ({ page, apiHarness }) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: false,
    adminConfigured: true
  });

  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page).toHaveTitle("Admin - xi-ai-web");
  await expect(page.getByRole("main")).toBeVisible();
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

test("authenticated admin console keeps responsive navigation and one scroll owner", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  await page.goto("/admin");

  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".admin-console")).toHaveAttribute("data-scroll-owner", "true");

  if (isMobileProject(testInfo.project.name)) {
    const picker = page.locator(".admin-mobile-section-picker select");
    await expect(picker).toBeVisible();
    await expect(page.locator(".admin-sidebar")).toBeHidden();
    expect(await picker.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value)
    )).toEqual([
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
    ]);

    await picker.selectOption("models");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    const modelGroup = navigation.locator(".admin-nav-group-toggle", { hasText: "模型管理" });
    const modelPage = navigation.getByRole("button", { name: "模型目录", exact: true });

    await expect(navigation).toBeVisible();
    await expect(page.locator(".admin-mobile-section-picker")).toBeHidden();
    await expect(modelGroup).toHaveAttribute("aria-expanded", "false");
    await expect(modelGroup).toHaveAttribute("aria-controls", "admin-nav-items-models");

    await modelGroup.click();
    await expect(modelGroup).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#admin-nav-items-models")).toBeVisible();
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

  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("assistants");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    const contentGroup = navigation.locator(".admin-nav-group-toggle", { hasText: "内容管理" });
    await contentGroup.click();
    await expect(contentGroup).toHaveAttribute("aria-expanded", "true");
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

test("admin model mapping keeps the short label in front of the stable request ID", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await seedReadyProvider(page);

  await page.goto("/admin");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("models");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    await navigation.locator(".admin-nav-group-toggle", { hasText: "模型管理" }).click();
    await navigation.getByRole("button", { name: "模型目录", exact: true }).click();
  }

  const section = page.locator("#admin-section-models");
  const displayName = section.getByLabel("前台显示名称", { exact: true });
  const requestName = section.getByLabel("实际请求模型名", { exact: true });
  const preview = section.getByLabel("模型名称映射预览", { exact: true });
  await expect(displayName).toHaveValue("Test Chat");
  await expect(displayName).toHaveAttribute("required", "");
  await expect(requestName).toHaveValue(mappedRequestModel);
  await expect(requestName).toHaveAttribute("required", "");
  await expect(preview).toContainText("Test Chat");
  await expect(preview.getByText(mappedRequestModel, { exact: true })).toBeVisible();

  await displayName.fill("");
  await requestName.fill("");
  await section.getByRole("button", { name: "保存模型", exact: true }).click();
  await expect(section.getByText("前台显示名称不能为空", { exact: true })).toBeVisible();
  await expect(section.getByText("实际请求模型名不能为空", { exact: true })).toBeVisible();
  expect(apiHarness.requests.some((request) => request.startsWith("PATCH /api/admin/model-catalog/"))).toBe(false);

  await displayName.fill("Test Chat");
  await requestName.fill(mappedRequestModel);

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

test("admin assistant editor exposes the public library metadata contract", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  await page.goto("/admin");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(testInfo.project.name)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("assistants");
  } else {
    const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
    await navigation.locator(".admin-nav-group-toggle", { hasText: "内容管理" }).click();
    await navigation.getByRole("button", { name: "助手库", exact: true }).click();
  }

  const section = page.locator("#admin-section-assistants");
  await expect(section.getByRole("heading", { name: "助手库", exact: true })).toBeVisible();
  await expect(section.getByLabel("助手分类", { exact: true })).toHaveValue("通用效率");
  await expect(section.getByLabel("助手标签", { exact: true })).toHaveValue("战略, 拆解");
  await expect(section.getByLabel("助手开场问题", { exact: true })).toHaveValue(/帮我把一个模糊目标拆成行动计划/);
  await expect(section.getByRole("checkbox", { name: "前台启用", exact: true })).toBeChecked();
});
