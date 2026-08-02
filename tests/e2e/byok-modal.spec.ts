import {
  expect,
  providerStorageKey,
  test
} from "./support/app-fixture";

test("public root resolves to Chat and requires BYOK credentials", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("required BYOK modal gates dismissal and persists only in sessionStorage", async ({ page }) => {
  await page.goto("/chat");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await expect(page.getByRole("button", { name: "\u5173\u95ed\u5bf9\u8bdd\u6846", exact: true })).toHaveCount(0);
  await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();

  const closeButton = dialog.locator(".api-config-head .icon-button");
  await expect(closeButton).toBeDisabled();
  await expect(closeButton).toBeHidden();

  await dialog.getByLabel("API Key", { exact: true }).fill("session-only-key");

  await expect.poll(() =>
    page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)
  ).toBe(JSON.stringify({
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

test("Shell type-3 JWT handoff exchanges into a session-only API Key", async ({ page }) => {
  const shellJwt = "header.payload.external-shell-jwt-value";
  let exchangeCalls = 0;
  await page.route("**/api/public/shell-token/exchange", async (route) => {
    exchangeCalls += 1;
    expect(route.request().postDataJSON()).toEqual({ token: shellJwt });
    await route.fulfill({ json: { apiKey: "sk-shell-default-2468" } });
  });

  await page.goto(`/#/jwt_auth?x_s_token=${encodeURIComponent(shellJwt)}`);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).toBe(
    JSON.stringify({ apiKey: "sk-shell-default-2468", lastModelId: "" })
  );
  expect(exchangeCalls).toBe(1);
  expect(page.url()).not.toContain("x_s_token");
  expect(page.url()).not.toContain(shellJwt);
  await expect(page.locator("body")).not.toContainText(shellJwt);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
});

test("failed Shell type-3 handoff falls back to the required Key dialog", async ({ page }) => {
  const shellJwt = "header.payload.expired-shell-jwt-value";
  let exchangeCalls = 0;
  await page.route("**/api/public/shell-token/exchange", async (route) => {
    exchangeCalls += 1;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "外部登录令牌无效或已过期" } })
    });
  });

  await page.goto(`/#/jwt_auth?x_s_token=${encodeURIComponent(shellJwt)}`);
  await expect(page).toHaveURL(/\/chat$/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("外部登录令牌无效或已过期");
  await expect(dialog.getByLabel("API Key", { exact: true })).toHaveValue("");
  expect(exchangeCalls).toBe(1);
  expect(page.url()).not.toContain("x_s_token");
  expect(page.url()).not.toContain(shellJwt);
  await expect(page.locator("body")).not.toContainText(shellJwt);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
});

test("malformed Shell type-3 handoff is scrubbed without an exchange request", async ({ page, apiHarness }) => {
  await page.goto("/#/jwt_auth?x_s_token=short");
  await expect(page).toHaveURL(/\/chat$/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("外部登录令牌无效");
  expect(apiHarness.requests).not.toContain("POST /api/public/shell-token/exchange");
  expect(page.url()).not.toContain("x_s_token");
});
