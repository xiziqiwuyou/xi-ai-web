import {
  expect,
  publicDestinations,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";

const workflowsDestination = publicDestinations.find((item) => item.id === "workflows")!;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: undefined
    });
  });
  await seedReadyProvider(page);
  await page.goto("/workflows");
  await waitForPublicModule(page, workflowsDestination);
});

test("starter conditional workflow executes only the selected branch", async ({ page, apiHarness }) => {
  const module = page.getByTestId("workflows-module");
  await module.getByRole("tab", { name: "模板库", exact: true }).click();
  await expect(module.locator(".workflow-template-card")).toHaveCount(10);
  await module.getByRole("button", { name: "使用模板 条件内容分流", exact: true }).click();

  const canvas = module.getByTestId("workflow-canvas");
  await expect(canvas.locator('[data-testid^="workflow-node-"]')).toHaveCount(6);
  await expect(canvas.locator(".workflow-canvas-node.conditional .react-flow__handle.source")).toHaveCount(2);

  await module.getByLabel("工作流初始任务", { exact: true }).fill("紧急：请给出立即行动方案");
  await module.getByRole("button", { name: "运行工作流", exact: true }).click();
  await expect(module.locator(".workflow-run-timeline li.skipped")).toContainText("常规处理");
  await expect(module.locator(".workflow-run-timeline li.completed").filter({ hasText: "紧急响应" })).toBeVisible();
  await expect.poll(() => apiHarness.agentRequests.filter((request) => request.moduleId === "workflows").length).toBe(1);
});

test("Langflow import preserves arbitrary code as a blocked visible node", async ({ page, apiHarness }) => {
  const module = page.getByTestId("workflows-module");
  const langflowWorkflow = {
    id: "langflow-safety-flow",
    name: "Langflow Safety Flow",
    data: {
      nodes: [
        {
          id: "chat-input",
          type: "ChatInput",
          position: { x: 20, y: 120 },
          data: { type: "ChatInput", node: { type: "ChatInput", display_name: "Chat Input" } }
        },
        {
          id: "python-runner",
          type: "PythonCode",
          position: { x: 320, y: 120 },
          data: {
            type: "PythonCode",
            node: {
              type: "PythonCode",
              display_name: "Python Runner",
              template: { code: { value: "print('must not execute')" } }
            }
          }
        },
        {
          id: "chat-output",
          type: "ChatOutput",
          position: { x: 620, y: 120 },
          data: { type: "ChatOutput", node: { type: "ChatOutput", display_name: "Chat Output" } }
        }
      ],
      edges: [
        { id: "input-python", source: "chat-input", target: "python-runner" },
        { id: "python-output", source: "python-runner", target: "chat-output" }
      ]
    }
  };

  await module.getByLabel("选择 Langflow JSON 文件", { exact: true }).setInputFiles({
    name: "langflow-safety-flow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(langflowWorkflow))
  });

  const canvas = module.getByTestId("workflow-canvas");
  await expect(canvas.locator(".workflow-canvas-node.unsupported")).toHaveCount(1);
  await expect(module.locator(".workflow-graph-validation")).toContainText("PythonCode");
  await module.getByLabel("工作流初始任务", { exact: true }).fill("验证安全导入");
  await module.getByRole("button", { name: "运行工作流", exact: true }).click();
  await expect(module).toContainText("尚未支持的 Langflow 组件");
  expect(apiHarness.agentRequests.filter((request) => request.moduleId === "workflows")).toHaveLength(0);
});
