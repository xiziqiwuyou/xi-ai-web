import {
  documentOverflow,
  expect,
  isMobileProject,
  navigationAction,
  publicDestinations,
  seedReadyProvider,
  test,
  visibleModuleNavigation,
  visibleScrollOwners,
  waitForPublicModule
} from "./support/app-fixture";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile layout contract");
  await seedReadyProvider(page);
});

test("each public module has one scroll owner and no page overflow", async ({ page }) => {
  for (const destination of publicDestinations) {
    await page.goto(destination.path);
    await waitForPublicModule(page, destination);

    await expect.poll(async () => (await visibleScrollOwners(page)).length).toBe(1);

    const owners = await visibleScrollOwners(page);
    expect(owners, `${destination.path} must expose exactly one visible data-scroll-owner`).toHaveLength(1);
    expect(["auto", "scroll"]).toContain(owners[0].overflowY);
    expect(owners[0].scrollHeight).toBeGreaterThanOrEqual(owners[0].clientHeight);

    const overflow = await documentOverflow(page);
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  }
});

test("mobile navigation and More sheet use 44px touch targets", async ({ page }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const navigation = visibleModuleNavigation(page);
  const actions = navigation.locator("button:visible, a[href]:visible");
  await expect(actions).toHaveCount(5);

  for (const action of await actions.all()) {
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await navigationAction(page, "\u66f4\u591a\u529f\u80fd").click();
  const moreSheet = page.getByRole("dialog").filter({ visible: true });
  await expect(moreSheet).toHaveCount(1);
  await expect(moreSheet.getByText("API", { exact: false })).toBeVisible();
  await expect(moreSheet.locator('a[href="/admin"]')).toHaveCount(0);

  for (const label of ["\u5e94\u7528", "\u753b\u5eca"]) {
    const action = moreSheet
      .getByRole("button", { name: label, exact: true })
      .or(moreSheet.getByRole("link", { name: label, exact: true }))
      .first();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  const owners = await visibleScrollOwners(page);
  expect(owners, "Open More sheet must remain the sole visible scroll owner").toHaveLength(1);
  await expect(moreSheet).toHaveAttribute("data-scroll-owner", "dialog");
});
