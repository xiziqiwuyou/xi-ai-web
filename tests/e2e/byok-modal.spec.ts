import {
  expect,
  providerStorageKey,
  test
} from "./support/app-fixture";

test("required BYOK modal gates dismissal and persists only in sessionStorage", async ({ page }) => {
  await page.goto("/chat");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await page
    .getByRole("button", { name: "\u5173\u95ed\u5bf9\u8bdd\u6846", exact: true })
    .click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeVisible();

  const closeButton = dialog.getByRole("button", { name: "\u5173\u95ed", exact: true });
  await expect(closeButton).toBeDisabled();

  await dialog
    .getByRole("textbox", { name: "API URL", exact: true })
    .fill("https://session.example.test/v1");
  await dialog.getByLabel("API Key", { exact: true }).fill("session-only-key");

  await expect.poll(() =>
    page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)
  ).toBe(JSON.stringify({
    baseUrl: "https://session.example.test/v1",
    apiKey: "session-only-key",
    lastModelId: ""
  }));

  expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
  await dialog
    .getByRole("button", { name: "\u4fdd\u5b58\u5e76\u5f00\u59cb\u4f7f\u7528", exact: true })
    .click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
});
