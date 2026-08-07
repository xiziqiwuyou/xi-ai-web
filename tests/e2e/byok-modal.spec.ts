import {
  expect,
  publicBootstrapFixture,
  providerStorageKey,
  test
} from "./support/app-fixture";

async function indexedDbContains(page: import("@playwright/test").Page, value: string) {
  return page.evaluate(async (needle) => {
    if (!("databases" in indexedDB)) return false;
    const databases = await indexedDB.databases();
    for (const { name } of databases) {
      if (!name?.startsWith("xi-ai-web")) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stores = Array.from(database.objectStoreNames);
      if (!stores.length) {
        database.close();
        continue;
      }
      const transaction = database.transaction(stores, "readonly");
      const records = await Promise.all(stores.map((storeName) => new Promise<unknown[]>((resolve, reject) => {
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })));
      database.close();
      if (JSON.stringify(records).includes(needle)) return true;
    }
    return false;
  }, value);
}

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

test("Shell type-3 JWT handoff uses the appended token when the placeholder was not replaced", async ({ page }) => {
  const shellJwt = "header.payload.appended-shell-jwt-value";
  const placeholder = "{{x_s_token}}";
  let exchangeCalls = 0;
  await page.route("**/api/public/shell-token/exchange", async (route) => {
    exchangeCalls += 1;
    expect(route.request().postDataJSON()).toEqual({ token: shellJwt });
    await route.fulfill({ json: { apiKey: "sk-shell-appended-2468" } });
  });

  await page.goto(
    `/#/jwt_auth?x_s_token=${placeholder}/#/jwt_auth?x_s_token=${encodeURIComponent(shellJwt)}`
  );
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).toBe(
    JSON.stringify({ apiKey: "sk-shell-appended-2468", lastModelId: "" })
  );
  expect(exchangeCalls).toBe(1);
  expect(page.url()).not.toContain("x_s_token");
  expect(page.url()).not.toContain(placeholder);
  expect(page.url()).not.toContain(encodeURIComponent(placeholder));
  expect(page.url()).not.toContain(shellJwt);
  await expect(page.locator("body")).not.toContainText(shellJwt);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
  expect(await indexedDbContains(page, shellJwt)).toBe(false);
});

test("OneAPI settings handoff accepts raw settings without calling the Shell JWT exchange", async ({ page, apiHarness }) => {
  const apiKey = "sk-oneapi-raw-session-2468";
  const settings = JSON.stringify({
    key: apiKey,
    url: "https://untrusted.example.test/v1"
  });
  const bootstrap = structuredClone(publicBootstrapFixture);
  bootstrap.settings.oneapiSettingsHandoffEnabled = true;
  apiHarness.setBootstrap(bootstrap);

  let exchangeCalls = 0;
  let externalUrlCalls = 0;
  await page.route("**/api/public/shell-token/exchange", async (route) => {
    exchangeCalls += 1;
    await route.abort();
  });
  await page.route("https://untrusted.example.test/**", async (route) => {
    externalUrlCalls += 1;
    await route.abort();
  });

  await page.goto(`/#/?settings=${settings}`);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).toBe(
    JSON.stringify({ apiKey, lastModelId: "" })
  );
  expect(exchangeCalls).toBe(0);
  expect(externalUrlCalls).toBe(0);
  expect(page.url()).not.toContain("settings=");
  expect(page.url()).not.toContain(apiKey);
  expect(page.url()).not.toContain("untrusted.example.test");
  await expect(page.locator("body")).not.toContainText(apiKey);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
  expect(await indexedDbContains(page, apiKey)).toBe(false);
  expect(apiHarness.requests).not.toContain("POST /api/public/shell-token/exchange");
});

test("OneAPI settings handoff accepts encoded settings and remains session-only after refresh", async ({ page, apiHarness }) => {
  const apiKey = "sk-oneapi-encoded-session-2468";
  const settings = encodeURIComponent(JSON.stringify({
    key: apiKey,
    url: "https://api.xi-ai.cn"
  }));
  const bootstrap = structuredClone(publicBootstrapFixture);
  bootstrap.settings.oneapiSettingsHandoffEnabled = true;
  apiHarness.setBootstrap(bootstrap);

  await page.goto(`/#/?settings=${settings}`);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).toBe(
    JSON.stringify({ apiKey, lastModelId: "" })
  );
  expect(page.url()).not.toContain("settings=");
  expect(page.url()).not.toContain(apiKey);

  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).toBe(
    JSON.stringify({ apiKey, lastModelId: "" })
  );
  expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
  expect(await indexedDbContains(page, apiKey)).toBe(false);
  expect(apiHarness.requests).not.toContain("POST /api/public/shell-token/exchange");
});

test("disabled OneAPI settings handoff is scrubbed and falls back to the manual Key dialog", async ({ page, apiHarness }) => {
  const apiKey = "sk-oneapi-disabled-session-2468";
  const settings = JSON.stringify({ key: apiKey, url: "https://api.xi-ai.cn" });

  await page.goto(`/#/?settings=${settings}`);
  await expect(page).toHaveURL(/\/chat$/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("未启用 OneAPI settings 跳转");
  await expect(dialog.getByLabel("API Key", { exact: true })).toHaveValue("");
  expect(page.url()).not.toContain("settings=");
  expect(page.url()).not.toContain(apiKey);
  expect(await page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).not.toContain(apiKey);
  expect(apiHarness.requests).not.toContain("POST /api/public/shell-token/exchange");
});

for (const scenario of [
  {
    name: "missing settings",
    hash: "#/?mode=oneapi",
    message: "缺少 settings"
  },
  {
    name: "malformed settings JSON",
    hash: "#/?settings=not-json",
    message: "不是有效 JSON"
  },
  {
    name: "empty API Key",
    hash: `#/?settings=${JSON.stringify({ key: "", url: "https://api.xi-ai.cn" })}`,
    message: "缺少 API Key"
  },
  {
    name: "oversized API Key",
    hash: `#/?settings=${encodeURIComponent(JSON.stringify({ key: `sk-${"a".repeat(4_097)}`, url: "https://api.xi-ai.cn" }))}`,
    message: "API Key 过长"
  },
  {
    name: "invalid API Key",
    hash: `#/?settings=${JSON.stringify({ key: "not-an-api-key", url: "https://api.xi-ai.cn" })}`,
    message: "API Key 格式无效"
  },
  {
    name: "invalid ignored URL",
    hash: `#/?settings=${JSON.stringify({ key: "sk-oneapi-invalid-url-2468", url: "ftp://invalid.example.test" })}`,
    message: "API 地址格式无效"
  }
]) {
  test(`OneAPI settings handoff rejects ${scenario.name} without exposing its fragment`, async ({ page, apiHarness }) => {
    const bootstrap = structuredClone(publicBootstrapFixture);
    bootstrap.settings.oneapiSettingsHandoffEnabled = true;
    apiHarness.setBootstrap(bootstrap);

    await page.goto(`/${scenario.hash}`);
    await expect(page).toHaveURL(/\/chat$/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toContainText(scenario.message);
    expect(page.url()).not.toContain("settings=");
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), providerStorageKey)).not.toContain("sk-");
    expect(apiHarness.requests).not.toContain("POST /api/public/shell-token/exchange");
  });
}

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

for (const scenario of [
  {
    name: "more than two JWT route segments",
    fragment: "/#/jwt_auth?x_s_token=header.payload.first-valid-token/#/jwt_auth?x_s_token=header.payload.second-valid-token/#/jwt_auth?x_s_token=header.payload.third-valid-token"
  },
  {
    name: "a repeated route without a final token",
    fragment: "/#/jwt_auth?x_s_token=header.payload.first-valid-token/#/jwt_auth?mode=handoff"
  },
  {
    name: "an invalid final token instead of falling back to the first token",
    fragment: "/#/jwt_auth?x_s_token=header.payload.first-valid-token/#/jwt_auth?x_s_token=not-a-jwt"
  }
]) {
  test(`Shell type-3 handoff rejects ${scenario.name} without an exchange request`, async ({ page, apiHarness }) => {
    await page.goto(scenario.fragment);
    await expect(page).toHaveURL(/\/chat$/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toContainText("外部登录令牌无效");
    expect(apiHarness.requests).not.toContain("POST /api/public/shell-token/exchange");
    expect(page.url()).not.toContain("x_s_token");
    expect(await page.evaluate((key) => window.localStorage.getItem(key), providerStorageKey)).toBeNull();
  });
}
