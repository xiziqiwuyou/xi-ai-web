import { expect, test } from "@playwright/test";

const recoveryCode = "XI-KB-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111-2222-3333";
const adminResetCode = "XI-KB-RESET-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111-2222-3333";

async function installKnowledgeApi(page: import("@playwright/test").Page) {
  let authenticated = false;
  const requests: string[] = [];

  await page.route("**/api/kb/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${pathname}`);

    if (request.method() === "GET" && pathname === "/api/kb/public-config") {
      await route.fulfill({
        json: {
          registrationMode: "open",
          accountRules: {
            usernameMinLength: 3,
            usernameMaxLength: 64,
            passwordMinLength: 10,
            passwordMaxLength: 128
          },
          recoveryCodeShownOnce: true
        }
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/kb/auth/session") {
      await route.fulfill({
        json: authenticated
          ? {
              authenticated: true,
              csrfToken: "fixture-csrf-refresh",
              account: { id: "fixture-account", username: "Alice", status: "active", quotaBytes: 5368709120 }
            }
          : { authenticated: false }
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/kb/embedding-profiles") {
      await route.fulfill({ json: { items: [] } });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/kb/bases") {
      await route.fulfill({ json: { items: [] } });
      return;
    }

    if (request.method() === "POST" && pathname === "/api/kb/auth/register") {
      const body = request.postDataJSON() as { username: string; password: string };
      expect(body.password).toBe("correct-horse-battery-staple");
      authenticated = true;
      await route.fulfill({
        status: 201,
        headers: { "Set-Cookie": "xi_kb_session=fixture; Path=/api; HttpOnly; SameSite=Lax" },
        json: {
          csrfToken: "fixture-csrf",
          recoveryCode,
          account: { id: "fixture-account", username: body.username, status: "active", quotaBytes: 5368709120 }
        }
      });
      return;
    }

    if (request.method() === "POST" && pathname === "/api/kb/auth/login") {
      authenticated = true;
      await route.fulfill({
        json: {
          csrfToken: "fixture-csrf",
          account: { id: "fixture-account", username: "Alice", status: "active", quotaBytes: 5368709120 }
        }
      });
      return;
    }

    if (request.method() === "POST" && pathname === "/api/kb/auth/recover") {
      const body = request.postDataJSON() as { recoveryCode: string };
      expect(body.recoveryCode).toBe(recoveryCode);
      authenticated = true;
      await route.fulfill({
        json: {
          csrfToken: "fixture-recovered-csrf",
          recoveryCode: "XI-KB-9999-8888-7777-6666-5555-4444-3333-2222-1111-0000",
          account: { id: "fixture-account", username: "Alice", status: "active", quotaBytes: 5368709120 }
        }
      });
      return;
    }

    if (request.method() === "POST" && pathname === "/api/kb/auth/admin-reset") {
      const body = request.postDataJSON() as { resetCode: string };
      expect(body.resetCode).toBe(adminResetCode);
      authenticated = true;
      await route.fulfill({
        json: {
          csrfToken: "fixture-admin-reset-csrf",
          recoveryCode: "XI-KB-ABCD-EF01-2345-6789-ABCD-EF01-2345-6789-ABCD-EF01",
          account: { id: "fixture-account", username: "Alice", status: "active", quotaBytes: 5368709120 }
        }
      });
      return;
    }

    if (request.method() === "POST" && pathname === "/api/kb/auth/logout") {
      expect(request.headers()["x-knowledge-csrf"]).toBeTruthy();
      authenticated = false;
      await route.fulfill({
        headers: { "Set-Cookie": "xi_kb_session=; Path=/api; Max-Age=0" },
        json: { ok: true }
      });
      return;
    }

    if (request.method() === "POST" && pathname === "/api/kb/auth/recovery-code") {
      expect(request.headers()["x-knowledge-csrf"]).toBeTruthy();
      await route.fulfill({
        json: {
          recoveryCode: "XI-KB-1111-2222-3333-4444-5555-6666-7777-8888-9999-AAAA",
          account: { id: "fixture-account", username: "Alice", status: "active", quotaBytes: 5368709120 }
        }
      });
      return;
    }

    await route.fulfill({ status: 500, json: { error: "unexpected knowledge request" } });
  });

  return requests;
}

test("knowledge account registration requires recovery acknowledgement before entering", async ({ page }) => {
  const requests = await installKnowledgeApi(page);
  await page.goto("/knowledge");

  await expect(page.getByRole("heading", { name: "登录知识库" })).toBeVisible();
  await page.getByRole("tab", { name: "注册" }).click();
  await page.getByRole("textbox", { name: "知识库账号", exact: true }).fill("Alice");
  await page.locator('input[type="password"]').fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "创建账号" }).click();

  await expect(page.getByRole("heading", { name: "请立即保存恢复码" })).toBeVisible();
  await expect(page.getByText(recoveryCode, { exact: true })).toBeVisible();
  const enter = page.getByRole("button", { name: /进入知识空间/ });
  await expect(enter).toBeDisabled();
  await page.getByRole("checkbox", { name: "我已将恢复码保存在安全位置" }).check();
  await expect(enter).toBeEnabled();
  await enter.click();
  await expect(page.getByRole("heading", { name: "Alice 的知识空间" })).toBeVisible();
  await page.getByRole("button", { name: "退出知识库账号" }).click();
  await expect(page.getByRole("heading", { name: "登录知识库" })).toBeVisible();
  expect(requests).toContain("POST /api/kb/auth/register");
  expect(requests).toContain("POST /api/kb/auth/logout");
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain("xi-ai-knowledge-recovery-code");
  const persistedValues = await page.evaluate(() => [
    ...Object.values(localStorage),
    ...Object.values(sessionStorage)
  ].join("\n"));
  expect(persistedValues).not.toContain(recoveryCode);
  expect(persistedValues).not.toContain("correct-horse-battery-staple");
});

test("recovery code remains selectable when clipboard APIs are unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      get: () => undefined
    });
    document.execCommand = () => false;
  });
  await installKnowledgeApi(page);
  await page.goto("/knowledge");

  await page.locator(".knowledge-cloud-tabs button").nth(1).click();
  await page.locator('.knowledge-cloud-form input[autocomplete="username"]').fill("Alice");
  await page.locator('.knowledge-cloud-form input[type="password"]').fill("correct-horse-battery-staple");
  await page.locator('.knowledge-cloud-form button[type="submit"]').click();
  await expect(page.locator(".knowledge-cloud-recovery-code")).toHaveText(recoveryCode);

  await page.locator(".knowledge-cloud-recovery-actions button").first().click();
  await expect(page.locator(".knowledge-cloud-notice")).toBeVisible();
  await expect(page.locator(".knowledge-cloud-error")).toHaveCount(0);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(recoveryCode);
});

test("knowledge recovery uses the one-time code and repeats the acknowledgement gate", async ({ page }) => {
  await installKnowledgeApi(page);
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "忘记密码？使用恢复码" }).click();
  await page.getByRole("textbox", { name: "知识库账号", exact: true }).fill("Alice");
  await page.getByRole("textbox", { name: "恢复码", exact: true }).fill(recoveryCode);
  await page.locator('input[type="password"]').fill("new-correct-password");
  await page.getByRole("button", { name: "验证恢复码" }).click();
  await expect(page.getByRole("heading", { name: "请立即保存恢复码" })).toBeVisible();
  await expect(page.getByRole("button", { name: /进入知识空间/ })).toBeDisabled();
  await page.getByRole("checkbox", { name: "我已将恢复码保存在安全位置" }).check();
  await page.getByRole("button", { name: /进入知识空间/ }).click();
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
});

test("knowledge Admin reset code creates a new password and recovery acknowledgement gate", async ({ page }) => {
  const requests = await installKnowledgeApi(page);
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "忘记密码？使用恢复码" }).click();
  await page.getByRole("button", { name: "恢复码也已丢失？使用管理员重置码" }).click();
  await page.getByRole("textbox", { name: "知识库账号", exact: true }).fill("Alice");
  await page.getByRole("textbox", { name: "管理员重置码", exact: true }).fill(adminResetCode);
  await page.locator('input[type="password"]').fill("new-admin-reset-password");
  await page.getByRole("button", { name: "验证管理员重置码" }).click();
  await expect(page.getByRole("heading", { name: "请立即保存恢复码" })).toBeVisible();
  await expect(page.getByRole("button", { name: /进入知识空间/ })).toBeDisabled();
  const persistedValues = await page.evaluate(() => [
    ...Object.values(localStorage),
    ...Object.values(sessionStorage)
  ].join("\n"));
  expect(persistedValues).not.toContain(adminResetCode);
  expect(persistedValues).not.toContain("new-admin-reset-password");
  expect(requests).toContain("POST /api/kb/auth/admin-reset");
});

test("knowledge login and session restore stay outside the public bootstrap flow", async ({ page }) => {
  await installKnowledgeApi(page);
  await page.goto("/knowledge");
  await page.getByRole("textbox", { name: "知识库账号", exact: true }).fill("Alice");
  await page.locator('input[type="password"]').fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "登录并继续" }).click();
  await expect(page.getByRole("heading", { name: "Alice 的知识空间" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Alice 的知识空间" })).toBeVisible();
});

test("signed-in accounts confirm recovery-code rotation and repeat the save gate", async ({ page }) => {
  const requests = await installKnowledgeApi(page);
  await page.goto("/knowledge");
  await page.locator('.knowledge-cloud-form input[autocomplete="username"]').fill("Alice");
  await page.locator('.knowledge-cloud-form input[type="password"]').fill("correct-horse-battery-staple");
  await page.locator('.knowledge-cloud-form button[type="submit"]').click();

  await page.locator(".knowledge-cloud-account-security > button").click();
  await expect(page.locator(".knowledge-cloud-account-actions")).toBeVisible();
  await page.locator(".knowledge-cloud-account-actions .knowledge-cloud-primary").click();
  await expect(page.locator(".knowledge-cloud-recovery-code")).toContainText("XI-KB-1111-");
  await expect(page.locator(".knowledge-cloud-primary", { hasText: "进入知识空间" })).toBeDisabled();
  expect(requests).toContain("POST /api/kb/auth/recovery-code");
});
