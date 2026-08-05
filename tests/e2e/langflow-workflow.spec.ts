import {
  expect,
  isMobileProject,
  publicBootstrapFixture,
  publicDestinations,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";
import type { LangflowWorkflow } from "../../src/types";

async function openWorkflowPublishing(page, mobile: boolean) {
  if (mobile) {
    await page.locator(".admin-mobile-section-picker select").selectOption("workflows");
    return;
  }
  const navigation = page.getByRole("navigation", { name: /后台管理分区/ });
  const group = navigation.locator(".admin-nav-group-toggle", { hasText: "AI 能力" });
  await group.click();
  await navigation.getByRole("button", { name: "工作流发布", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
});

test("admin publishes a Langflow mapping and the public chat-style page runs it", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });

  await page.goto("/xizi2333");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  await openWorkflowPublishing(page, isMobileProject(testInfo.project.name));

  const section = page.locator("#admin-section-workflows");
  await expect(section).toBeVisible();
  await section.getByLabel("Langflow Flow ID", { exact: true }).fill("e2e-langflow-flow");
  await section.getByLabel(/前台显示名称/).fill("E2E 流程");
  await section.getByRole("button", { name: /保存发布映射/ }).click();
  await expect(page.getByRole("status")).toContainText("Langflow 工作流已保存");
  expect(apiHarness.requests).toContain("POST /api/admin/langflow-workflows");

  const publishedWorkflow: LangflowWorkflow = {
    id: "langflow-e2e-published",
    name: "E2E 流程",
    description: "A published Langflow workflow",
    welcomeMessage: "Tell me what to do.",
    inputPlaceholder: "Describe the task",
    tags: ["e2e"],
    enabled: true,
    order: 10
  };
  apiHarness.setBootstrap({
    ...publicBootstrapFixture,
    langflow: {
      enabled: true,
      available: true,
      state: "ready",
      reasonCode: null
    },
    langflowWorkflows: [publishedWorkflow]
  });

  await page.goto("/workflows");
  await waitForPublicModule(page, publicDestinations.find((item) => item.id === "workflows"));
  const module = page.getByTestId("langflow-workflows-module");
  await expect(module).toContainText("E2E 流程");
  const composer = module.locator(".langflow-workflow-composer");
  await composer.locator("textarea").fill("请整理这项任务");
  await composer.getByRole("button", { name: /发送|运行/ }).click();

  await expect.poll(() => apiHarness.langflowRequests.length).toBe(1);
  expect(apiHarness.langflowRequests[0]).toMatchObject({
    workflowId: "langflow-e2e-published",
    payload: {
      input: "请整理这项任务",
      modelId: "test-chat"
    }
  });
  await expect(module).toContainText("Workflow result: 请整理这项任务");
  expect(apiHarness.unexpectedRequests).toEqual([]);
});
