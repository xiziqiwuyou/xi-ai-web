import {
  documentOverflow,
  expect,
  isMobileProject,
  test
} from "./support/app-fixture";

async function openMcpSection(page: Parameters<typeof documentOverflow>[0], projectName: string) {
  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  if (isMobileProject(projectName)) {
    await page.locator(".admin-mobile-section-picker select").selectOption("mcp");
    return;
  }
  const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
  await navigation.locator('.admin-nav-group-toggle[aria-controls="admin-nav-items-ai"]').click();
  await navigation.getByRole("button", { name: "MCP 服务", exact: true }).click();
}

test("Admin MCP profiles create, discover, and explicitly allow remote tools", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  let discoveryPayload: unknown = null;
  page.on("request", (request) => {
    if (/\/api\/admin\/mcp-servers\/[^/]+\/discover$/u.test(new URL(request.url()).pathname)) {
      discoveryPayload = request.postDataJSON();
    }
  });

  await openMcpSection(page, testInfo.project.name);
  await expect(page.locator("#admin-section-mcp")).toBeVisible();
  await expect(page.locator(".admin-section:visible")).toHaveCount(1);
  await expect(page.getByText("管理员受控的远程 MCP", { exact: true })).toBeVisible();

  await page.getByLabel("服务显示名称", { exact: true }).fill("E2E MCP");
  await page.getByLabel("MCP 服务地址", { exact: true }).fill("https://mcp.example.test/mcp");
  await page.getByRole("button", { name: "保存 MCP 服务", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("MCP 服务已保存");
  expect(apiHarness.requests).toContain("POST /api/admin/mcp-servers");

  await page.getByRole("button", { name: "发现工具", exact: true }).click();
  await expect(page.getByText("Fixture read", { exact: true })).toBeVisible();
  await expect(page.getByText("fixture.read", { exact: true })).toBeVisible();
  await expect(page.getByText("允许在 AI 对话中请求此工具", { exact: true })).toBeVisible();
  const globalExecution = page.locator(".admin-mcp-execution-switch input[type=checkbox]").first();
  await expect(globalExecution).not.toBeChecked();
  await globalExecution.click();
  await expect(globalExecution).toBeChecked();
  const userConnections = page.locator(".admin-mcp-execution-switch input[type=checkbox]").nth(1);
  await expect(userConnections).toBeEnabled();
  await userConnections.click();
  await expect(userConnections).toBeChecked();
  await page.getByText("允许在 AI 对话中请求此工具", { exact: true }).locator("..")
    .locator("input[type=checkbox]").check();
  await page.locator(".admin-mcp-execution-config input[type=checkbox]").check();
  await page.getByRole("button", { name: "保存执行权限", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("MCP 工具执行权限已保存");
  expect(apiHarness.requests.some((request) => request.includes("/execution"))).toBe(true);
  expect(discoveryPayload).toEqual({});
  expect(apiHarness.requests.some((request) => request.includes("/tools/call"))).toBe(false);
  expect(apiHarness.requests.some((request) => request.startsWith("POST /api/chat"))).toBe(false);

  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});
