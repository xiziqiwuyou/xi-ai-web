import {
  expect,
  isMobileProject,
  navigationAction,
  publicDestinations,
  seedReadyProvider,
  test,
  visibleModuleNavigation,
  waitForPublicModule
} from "./support/app-fixture";

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
});

test("public routes are canonical, titled, and selected", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const mobile = isMobileProject(testInfo.project.name);

  for (const destination of publicDestinations) {
    await page.goto(destination.path);
    await waitForPublicModule(page, destination);

    const activeLabel = mobile ? destination.mobileLabel : destination.label;
    await expect(navigationAction(page, activeLabel)).toHaveAttribute("aria-current", "page");
  }
});

test("invalid public paths resolve to the configured default", async ({ page }) => {
  await page.goto("/not-a-public-module");

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page).toHaveTitle("\u5bf9\u8bdd - xi-ai-web");
  await expect(navigationAction(page, "\u5bf9\u8bdd")).toHaveAttribute("aria-current", "page");
});

test("menu navigation participates in browser back and forward history", async ({ page }) => {
  await page.goto("/chat");

  await navigationAction(page, "\u7ed8\u753b").click();
  await expect(page).toHaveURL(/\/image$/);
  await expect(page).toHaveTitle("\u7ed8\u753b - xi-ai-web");

  await navigationAction(page, "\u601d\u7ef4\u5bfc\u56fe").click();
  await expect(page).toHaveURL(/\/mindmap$/);
  await expect(page).toHaveTitle("\u601d\u7ef4\u5bfc\u56fe - xi-ai-web");

  await page.goBack();
  await expect(page).toHaveURL(/\/image$/);
  await expect(navigationAction(page, "\u7ed8\u753b")).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(navigationAction(page, "\u5bf9\u8bdd")).toHaveAttribute("aria-current", "page");

  await page.goForward();
  await expect(page).toHaveURL(/\/image$/);
  await expect(navigationAction(page, "\u7ed8\u753b")).toHaveAttribute("aria-current", "page");
});

test("public menu keeps the approved order and has no admin entry", async ({ page }, testInfo) => {
  await page.goto("/chat");
  const navigation = visibleModuleNavigation(page);
  const names = await navigation.locator("button:visible, a[href]:visible").evaluateAll((elements) =>
    elements.map((element) =>
      (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim()
    )
  );

  const expectedNames = isMobileProject(testInfo.project.name)
    ? ["\u5bf9\u8bdd", "\u7ed8\u753b", "\u601d\u7ef4\u5bfc\u56fe", "\u667a\u80fd\u4f53", "\u66f4\u591a\u529f\u80fd"]
    : publicDestinations.map((destination) => destination.label);

  expect(names).toEqual(expectedNames);
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
});
