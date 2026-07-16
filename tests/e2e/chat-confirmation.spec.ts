import {
  expect,
  isMobileProject,
  publicDestinations,
  seedReadyProvider,
  test,
  visibleScrollOwners,
  waitForPublicModule
} from "./support/app-fixture";

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
});

test("conversation deletion uses the shared confirmation contract", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  if (isMobileProject(testInfo.project.name)) {
    await page.getByRole("button", { name: "打开会话列表", exact: true }).click();
  }
  await page.getByRole("button", { name: "新建对话", exact: true }).click();

  if (isMobileProject(testInfo.project.name)) {
    await page.getByRole("button", { name: "打开会话列表", exact: true }).click();
  }
  const deleteButton = page.getByRole("button", { name: "删除会话 新对话", exact: true });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();

  const dialog = page.getByRole("alertdialog", { name: "删除这个会话？", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-scroll-owner", "dialog");
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
  expect(await visibleScrollOwners(page)).toHaveLength(1);

  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeVisible();
});
