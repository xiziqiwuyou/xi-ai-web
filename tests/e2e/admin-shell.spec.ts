import {
  documentOverflow,
  expect,
  test
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
