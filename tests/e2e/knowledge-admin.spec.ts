import type { Page } from "@playwright/test";
import {
  documentOverflow,
  expect,
  isMobileProject,
  test,
  visibleScrollOwners
} from "./support/app-fixture";

async function openKnowledgeSection(
  page: Page,
  projectName: string,
  value: string,
  label: string
) {
  if (isMobileProject(projectName)) {
    await page.locator(".admin-mobile-section-picker select").selectOption(value);
    return;
  }
  const navigation = page.getByRole("navigation", { name: "后台管理分区", exact: true });
  const group = navigation.locator(".admin-nav-group-toggle", { hasText: "知识库" });
  if (await group.getAttribute("aria-expanded") !== "true") await group.click();
  await navigation.getByRole("button", { name: label, exact: true }).click();
}

test("knowledge Admin exposes six responsive control-plane destinations", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });

  const destinations = [
    ["knowledge-overview", "知识库概览", "#admin-section-knowledge-overview"],
    ["knowledge-accounts", "知识库账号", "#admin-section-knowledge-accounts"],
    ["knowledge-registration", "注册与邀请码", "#admin-section-knowledge-registration"],
    ["knowledge-limits", "运行限额", "#admin-section-knowledge-limits"],
    ["knowledge-jobs", "任务与存储", "#admin-section-knowledge-jobs"],
    ["knowledge-audit", "知识库审计", "#admin-section-knowledge-audit"]
  ] as const;

  for (const [value, label, selector] of destinations) {
    await openKnowledgeSection(page, testInfo.project.name, value, label);
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator(".admin-section")).toHaveCount(1);
  }

  const owners = await visibleScrollOwners(page);
  expect(owners).toHaveLength(1);
  expect(owners[0].overflowY).toBe("auto");
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("knowledge Admin account actions require a reason and show reset plaintext once", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  await openKnowledgeSection(page, testInfo.project.name, "knowledge-accounts", "知识库账号");

  const section = page.locator("#admin-section-knowledge-accounts");
  await expect(section.getByText("knowledge-owner", { exact: true })).toBeVisible();
  await section.locator(".knowledge-admin-table-row").click();
  await expect(section.getByRole("heading", { name: "knowledge-owner", exact: true })).toBeVisible();

  await section.getByRole("button", { name: "签发管理员重置码", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请先填写操作原因");
  await section.getByLabel("操作原因", { exact: true }).fill("账号本人遗失全部凭据");
  await section.getByRole("button", { name: "签发管理员重置码", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("15 分钟后过期");
  await dialog.getByRole("button", { name: "签发重置码", exact: true }).click();

  await expect(section.getByText("一次性重置码", { exact: true })).toBeVisible();
  await expect(section.getByText(/XI-KB-RESET-E2E1-/)).toBeVisible();
  const browserStorage = await page.evaluate(() => [
    ...Object.values(localStorage),
    ...Object.values(sessionStorage)
  ].join("\n"));
  expect(browserStorage).not.toContain("XI-KB-RESET-E2E1-");
  expect(apiHarness.requests).toContain(
    "POST /api/admin/knowledge/accounts/11111111-1111-4111-8111-111111111111/reset"
  );
});

test("knowledge Admin creates one-time invites and lists only status metadata", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  await openKnowledgeSection(page, testInfo.project.name, "knowledge-registration", "注册与邀请码");

  const section = page.locator("#admin-section-knowledge-registration");
  await expect(section.getByText("仅邀请码", { exact: true }).first()).toBeVisible();
  await section.getByRole("radio", { name: /公开注册/ }).check();
  await section.getByLabel("操作原因", { exact: true }).fill("切换本轮注册策略");
  await section.getByRole("button", { name: "保存注册模式", exact: true }).click();
  await expect(section.getByRole("radio", { name: /公开注册/ })).toBeChecked();
  await section.getByLabel("操作原因", { exact: true }).fill("创建本轮内测邀请码");
  await section.getByRole("button", { name: "生成邀请码", exact: true }).click();
  await expect(section.getByText("本次邀请码", { exact: true })).toBeVisible();
  await expect(section.getByText(/XI-KB-INV-E2E1-/)).toBeVisible();
  await expect(section.locator(".knowledge-admin-invite-list")).not.toContainText("XI-KB-INV-E2E1-");
  expect(apiHarness.requests).toContain("POST /api/admin/knowledge/invites");
  expect(apiHarness.requests).toContain("PUT /api/admin/knowledge/settings");
});

test("knowledge Admin can cancel a leased job with a reason and confirmation", async ({ page, apiHarness }, testInfo) => {
  apiHarness.setAdminStatus({
    authRequired: true,
    authenticated: true,
    adminConfigured: true
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-console-layout")).toBeVisible({ timeout: 20_000 });
  await openKnowledgeSection(page, testInfo.project.name, "knowledge-jobs", "任务与存储");

  const section = page.locator("#admin-section-knowledge-jobs");
  await expect(section.getByRole("article").getByText("运行中", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请填写任务操作原因");
  await section.getByLabel("操作原因", { exact: true }).fill("解析任务异常，人工终止");
  await section.getByRole("button", { name: "取消", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("运行中的解析会在租约检查点停止");
  await dialog.getByRole("button", { name: "确认取消", exact: true }).click();
  await expect(section.getByRole("article").getByText("已取消", { exact: true })).toBeVisible();
  expect(apiHarness.requests).toContain(
    "POST /api/admin/knowledge/jobs/44444444-4444-4444-8444-444444444444/cancel"
  );
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});
