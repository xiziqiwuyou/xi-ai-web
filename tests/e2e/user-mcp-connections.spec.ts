import {
  documentOverflow,
  expect,
  seedReadyProvider,
  test
} from "./support/app-fixture";

test("personal MCP profiles stay browser-local and connect from Chat without layout drift", async ({ page, apiHarness }) => {
  apiHarness.setUserMcpConnectionsEnabled(true);
  await seedReadyProvider(page);
  const connectBodies: unknown[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat/mcp/connections") {
      connectBodies.push(request.postDataJSON());
    }
  });

  await page.goto("/chat");
  await page.evaluate(() => {
    document.documentElement.dataset.studioTheme = "dark";
  });
  const session = page.locator(".figma-chat-session").first();
  await expect(session).toBeVisible();
  const trigger = session.getByRole("button", { name: "连接", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "个人 MCP 服务" });
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await panel.getByRole("button", { name: "添加服务", exact: true }).click();
  await panel.getByLabel("服务名称", { exact: true }).fill("浏览器本地工具");
  await panel.getByLabel("HTTPS MCP 地址", { exact: true }).fill("https://mcp.example.test/mcp");
  const remember = panel.getByRole("checkbox", { name: /记住此服务/u });
  await expect(remember).not.toBeChecked();
  await remember.check();
  await panel.getByRole("button", { name: "保存并连接", exact: true }).click();

  await expect(panel.getByText("浏览器本地工具", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "断开 浏览器本地工具" })).toBeVisible();
  expect(connectBodies).toEqual([{ endpoint: "https://mcp.example.test/mcp" }]);

  const stored = await page.evaluate(async () => {
    const request = indexedDB.open("xi-ai-web-user-mcp", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("profiles", "readonly");
    const values = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const read = transaction.objectStore("profiles").getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    database.close();
    return values;
  });
  expect(stored).toHaveLength(1);
  expect(Object.keys(stored[0]).sort()).toEqual(["createdAt", "endpoint", "id", "label", "updatedAt"]);
  expect(JSON.stringify(stored)).not.toMatch(/token|secret|approval|argument|result|connection/i);

  await panel.getByRole("button", { name: "关闭" }).click();
  const toolTrigger = session.getByRole("button", { name: "远程 MCP 工具" });
  await toolTrigger.click();
  await page.getByRole("option", { name: /浏览器本地工具/u }).click();
  await session.getByLabel("消息内容", { exact: true }).fill("调用本地保存的 MCP 工具");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(session.getByText("Deterministic assistant response.", { exact: true })).toBeVisible();
  expect(apiHarness.chatRequests.at(-1)?.mcpToolIds).toEqual(["umcp-tool-1"]);
  expect(JSON.stringify(apiHarness.chatRequests.at(-1))).not.toContain("mcp.example.test");
  expect(JSON.stringify(apiHarness.chatRequests.at(-1))).not.toContain("浏览器本地工具");

  await trigger.click();
  await panel.getByRole("button", { name: "断开 浏览器本地工具" }).click();
  await expect(panel.getByRole("button", { name: "连接 浏览器本地工具" })).toBeVisible();
  await panel.getByRole("button", { name: "删除 浏览器本地工具" }).click();
  await expect(panel.getByText("尚未添加个人 MCP 服务。", { exact: true })).toBeVisible();

  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});
