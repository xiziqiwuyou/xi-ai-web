import {
  expect,
  isMobileProject,
  navigationAction,
  openMobileNavigation,
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

    if (mobile) await openMobileNavigation(page);

    await expect(visibleModuleNavigation(page)).toHaveClass(/figma-navigation/);
    await expect(navigationAction(page, destination.label)).toHaveClass(/figma-nav-item/);
    await expect(navigationAction(page, destination.label)).toHaveAttribute("aria-current", "page");
  }
});

test("public root resolves to the Chat workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page).toHaveTitle("AI \u5bf9\u8bdd - xi-ai-web");
});

test("invalid public paths resolve to the configured default", async ({ page }) => {
  await page.goto("/not-a-public-module");

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page).toHaveTitle("AI \u5bf9\u8bdd - xi-ai-web");
  await openMobileNavigation(page);
  await expect(navigationAction(page, publicDestinations[0].label)).toHaveAttribute("aria-current", "page");
});

test("legacy Skill route resolves to Chat and never appears in navigation", async ({ page }) => {
  await page.goto("/skills");
  await expect(page).toHaveURL(/\/chat$/);
  await waitForPublicModule(page, publicDestinations[0]);
  await expect(visibleModuleNavigation(page).getByRole("button", { name: "Skill", exact: true })).toHaveCount(0);
});

test("menu navigation participates in browser back and forward history", async ({ page }, testInfo) => {
  const mobile = isMobileProject(testInfo.project.name);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  if (mobile) await openMobileNavigation(page);

  await navigationAction(page, publicDestinations[1].label).click();
  await expect(page).toHaveURL(/\/image$/);
  await expect(page).toHaveTitle("\u56fe\u50cf\u751f\u6210 - xi-ai-web");

  if (mobile) await openMobileNavigation(page);
  const mindmap = publicDestinations.find((destination) => destination.id === "mindmap")!;
  await navigationAction(page, mindmap.label).click();
  await expect(page).toHaveURL(/\/mindmap$/);
  await expect(page).toHaveTitle("\u601d\u7ef4\u5bfc\u56fe - xi-ai-web");

  await page.goBack();
  await expect(page).toHaveURL(/\/image$/);
  if (mobile) await openMobileNavigation(page);
  await expect(navigationAction(page, publicDestinations[1].label)).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/\/chat$/);
  if (mobile) await openMobileNavigation(page);
  await expect(navigationAction(page, publicDestinations[0].label)).toHaveAttribute("aria-current", "page");

  await page.goForward();
  await expect(page).toHaveURL(/\/image$/);
  if (mobile) await openMobileNavigation(page);
  await expect(navigationAction(page, publicDestinations[1].label)).toHaveAttribute("aria-current", "page");

  await page.goForward();
  await expect(page).toHaveURL(/\/mindmap$/);
  if (mobile) await openMobileNavigation(page);
  await expect(navigationAction(page, mindmap.label)).toHaveAttribute("aria-current", "page");
});

test("automation destinations are reachable from the public menu", async ({ page }, testInfo) => {
  const mobile = isMobileProject(testInfo.project.name);
  const automationDestinations = publicDestinations.filter((destination) =>
    destination.id === "agents" || destination.id === "workflows"
  );

  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  for (const destination of automationDestinations) {
    if (mobile) await openMobileNavigation(page);
    await navigationAction(page, destination.label).click();
    await waitForPublicModule(page, destination);
    await expect(page.getByTestId(`${destination.id}-module`)).toBeVisible();
  }
});

test("public menu keeps the approved order and has no admin entry", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  if (isMobileProject(testInfo.project.name)) await openMobileNavigation(page);
  const navigation = visibleModuleNavigation(page);
  const actions = navigation.locator(".figma-nav-item");
  const names = await actions.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label"))
  );

  const expectedNames = publicDestinations.map((destination) => destination.label);

  await expect(actions).toHaveCount(publicDestinations.length);
  expect(names).toEqual(expectedNames);
  for (const retiredLabel of ["\u5bf9\u8bdd", "\u7ed8\u753b", "\u5e94\u7528", "\u753b\u5eca"]) {
    await expect(navigation.getByRole("button", { name: retiredLabel, exact: true })).toHaveCount(0);
  }
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
});

test("mobile menu closes on Escape and restores its trigger", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile navigation contract");
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const trigger = page.getByRole("button", { name: "\u6253\u5f00\u529f\u80fd\u83dc\u5355", exact: true });
  await trigger.click();
  await expect(page.locator(".figma-sidebar.mobile-open")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".figma-sidebar")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("mobile menu closes on route selection, moves focus, and resets across the desktop breakpoint", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile navigation contract");
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await openMobileNavigation(page);
  await navigationAction(page, publicDestinations[1].label).click();
  await expect(page).toHaveURL(/\/image$/);
  await waitForPublicModule(page, publicDestinations[1]);
  await expect(page.locator(".figma-sidebar.mobile-open")).toHaveCount(0);
  await expect(page.locator("#workspace-main")).toBeFocused();

  await openMobileNavigation(page);
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.locator(".figma-sidebar.mobile-open")).toHaveCount(0);
  await expect(page.locator(".figma-mobile-header")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".figma-mobile-header")).toBeVisible();
  await expect(page.locator(".figma-sidebar")).toBeHidden();
});
