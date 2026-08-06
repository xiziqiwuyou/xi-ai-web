import { expect, test, type Page, type Request } from "@playwright/test";

const providerStorageKey = "cherry-web-user-provider";

async function initializeProvider(page: Page, url: string, apiKey: string, lastModelId: string) {
  await page.goto(url);
  await page.evaluate(
    ({ key, value }) => window.sessionStorage.setItem(key, JSON.stringify(value)),
    { key: providerStorageKey, value: { apiKey, lastModelId } }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "AI 对话工作台", exact: true })).toBeVisible();
}

async function openSyncDialog(page: Page, action: "同步到手机" | "从手机同步" | "同步到电脑") {
  await page.locator('button[aria-label="跨设备同步"]:visible').click();
  const dialog = page.getByRole("dialog", { name: "跨设备同步", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: action, exact: true }).click();
  return dialog;
}

type SyncDialogGeometry = Record<"dialog" | "header" | "tabs" | "body" | "panel", {
  x: number;
  y: number;
  width: number;
  height: number;
}>;

async function readSyncDialogGeometry(page: Page): Promise<SyncDialogGeometry> {
  return page.getByRole("dialog", { name: "跨设备同步", exact: true }).evaluate((dialog) => {
    const selectors = {
      dialog: ".progress-sync-dialog",
      header: ".workspace-data-header",
      tabs: ".progress-sync-mode",
      body: ".progress-sync-dialog-body",
      panel: ".progress-sync-panel"
    } as const;
    return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
      const element = dialog.matches(selector) ? dialog : dialog.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing sync geometry element: ${selector}`);
      const bounds = element.getBoundingClientRect();
      return [key, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      }];
    })) as SyncDialogGeometry;
  });
}

function expectStableSyncGeometry(actual: SyncDialogGeometry, expected: SyncDialogGeometry) {
  for (const key of Object.keys(expected) as Array<keyof SyncDialogGeometry>) {
    for (const metric of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(actual[key][metric] - expected[key][metric]), `${key}.${metric} changed`).toBeLessThanOrEqual(1);
    }
  }
}

async function expectQrApprovalStage(page: Page, baseline: SyncDialogGeometry) {
  const dialog = page.getByRole("dialog", { name: "跨设备同步", exact: true });
  const qrStage = dialog.locator(".progress-sync-qr");
  const approval = qrStage.locator(".progress-sync-approval");
  const confirm = approval.getByRole("button", { name: "确认并发送", exact: true });
  await expect(approval).toBeVisible();
  await expect(confirm).toBeFocused();
  await expect(qrStage.locator("img")).toHaveCount(0);

  const visibility = await dialog.locator(".progress-sync-dialog-body").evaluate((body) => {
    const approvalElement = body.querySelector<HTMLElement>(".progress-sync-approval");
    const button = body.querySelector<HTMLButtonElement>(".progress-sync-approval button.workspace-data-primary");
    const qr = body.querySelector<HTMLElement>(".progress-sync-qr");
    if (!approvalElement || !button || !qr) throw new Error("Missing QR approval stage elements");
    const bodyBounds = body.getBoundingClientRect();
    const approvalBounds = approvalElement.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const qrBounds = qr.getBoundingClientRect();
    return {
      bodyScrollTop: body.scrollTop,
      approvalInsideQr: approvalBounds.top >= qrBounds.top && approvalBounds.bottom <= qrBounds.bottom,
      buttonVisible: buttonBounds.top >= bodyBounds.top && buttonBounds.bottom <= bodyBounds.bottom
    };
  });
  expect(visibility.bodyScrollTop).toBe(0);
  expect(visibility.approvalInsideQr).toBe(true);
  expect(visibility.buttonVisible).toBe(true);
  expectStableSyncGeometry(await readSyncDialogGeometry(page), baseline);
}

async function seedConversation(page: Page, id: string, title: string) {
  await page.evaluate(async ({ id, title }) => {
    const dynamicImport = new Function("path", "return import(path)") as (path: string) => Promise<Record<string, any>>;
    const database = await dynamicImport("/src/features/workspace/workspaceDb.ts");
    const timestamp = new Date().toISOString();
    await database.putWorkspaceRecord("conversations", {
      id,
      title,
      assistantId: "",
      pinned: false,
      messageCount: 1,
      preview: title,
      messages: [{ id: `${id}-message`, role: "assistant", content: title, status: "done", createdAt: timestamp }],
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }, { id, title });
}

async function conversationIds(page: Page) {
  return page.evaluate(async () => {
    const dynamicImport = new Function("path", "return import(path)") as (path: string) => Promise<Record<string, any>>;
    const database = await dynamicImport("/src/features/workspace/workspaceDb.ts");
    return (await database.getAllWorkspaceRecords("conversations")).map((item: { id: string }) => item.id);
  });
}

async function createSyncCode(page: Page, action: "同步到手机" | "同步到电脑", includeApiKey = false) {
  let dialog = await openSyncDialog(page, action);
  const checkbox = dialog.getByRole("checkbox", { name: /同时传输 API Key/ });
  await expect(checkbox).not.toBeChecked();
  if (includeApiKey) {
    await checkbox.click();
    const confirmation = page.getByRole("alertdialog", { name: "同时传输 API Key？", exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "确认包含 API Key", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "跨设备同步", exact: true });
    await expect(dialog.getByRole("checkbox", { name: /同时传输 API Key/ })).toBeChecked();
  }
  const createLabel = action === "同步到手机" ? "生成手机同步二维码" : "创建 6 位授权码";
  if (action === "同步到手机") {
    await expect(dialog.getByText("使用手机扫码同步", { exact: true })).toBeVisible();
  }
  await dialog.getByRole("button", { name: createLabel, exact: true }).click();
  const code = dialog.locator(".progress-sync-code-row strong");
  await expect(code).toHaveText(/^\d{6}$/u);
  if (action === "同步到手机") {
    const qr = dialog.locator(".progress-sync-qr");
    await expect(qr.locator('img[alt="同步到手机二维码"]')).toHaveAttribute("src", /^data:image\/png;base64,/u);
    await expect(qr.locator(".progress-sync-code-row")).toBeVisible();
    await expect(dialog.locator(".progress-sync-session > .progress-sync-code-row")).toHaveCount(0);
  }
  return {
    dialog,
    code: await code.innerText(),
    geometry: await readSyncDialogGeometry(page),
    shareUrl: action === "同步到手机"
      ? await dialog.locator(".progress-sync-qr").getAttribute("data-sync-url")
      : null
  };
}

async function joinSync(page: Page, code: string) {
  const dialog = await openSyncDialog(page, "从手机同步");
  const codeInput = dialog.getByLabel("6 位同步授权码", { exact: true });
  if (!await codeInput.isVisible()) {
    await dialog.getByRole("button", { name: "改用手机授权码", exact: true }).click();
  }
  await codeInput.fill(code);
  await dialog.getByRole("button", { name: "确认连接", exact: true }).click();
  const fingerprint = dialog.locator(".progress-sync-fingerprint strong");
  await expect(fingerprint).toHaveText(/^\d{6}$/u);
  return { dialog, fingerprint: await fingerprint.innerText() };
}

async function joinSyncFromQr(page: Page, shareUrl: string, code: string) {
  await page.goto(new URL("/image", shareUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/chat$/u);
  const dialog = page.getByRole("dialog", { name: "跨设备同步", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("6 位同步授权码", { exact: true })).toHaveValue(code);
  await dialog.getByRole("button", { name: "确认连接", exact: true }).click();
  const fingerprint = dialog.locator(".progress-sync-fingerprint strong");
  await expect(fingerprint).toHaveText(/^\d{6}$/u);
  return { dialog, fingerprint: await fingerprint.innerText() };
}

async function createPhoneSendQr(page: Page) {
  const dialog = await openSyncDialog(page, "从手机同步");
  await expect(dialog.getByText("让手机扫码发送", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "生成手机发送二维码", exact: true }).click();
  const qr = dialog.locator(".progress-sync-qr");
  await expect(qr.locator('img[alt="从手机同步二维码"]')).toHaveAttribute("src", /^data:image\/png;base64,/u);
  const code = qr.locator(".progress-sync-code-row strong");
  await expect(code).toHaveText(/^\d{6}$/u);
  return {
    dialog,
    code: await code.innerText(),
    shareUrl: await qr.getAttribute("data-sync-url")
  };
}

async function sendFromReverseQr(page: Page, shareUrl: string, includeApiKey = false) {
  const protocolRequests: string[] = [];
  const trackRequest = (request: Request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST" && (
      pathname === "/api/progress-sync/sessions"
      || pathname === "/api/progress-sync/sessions/join"
    )) protocolRequests.push(pathname);
  };
  page.on("request", trackRequest);
  try {
    await page.goto(new URL("/image", shareUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/chat$/u);
    const dialog = page.getByRole("dialog", { name: "跨设备同步", exact: true });
    await expect(dialog).toBeVisible();
    const sendTab = dialog.getByRole("tab", { name: "同步到电脑", exact: true });
    await expect(sendTab).toHaveAttribute("aria-selected", "true");
    expect(protocolRequests).toEqual([]);
    await dialog.getByRole("tab", { name: "接收电脑进度", exact: true }).click();
    await expect(dialog.getByLabel("6 位同步授权码", { exact: true })).toHaveValue("");
    await sendTab.click();
    if (includeApiKey) {
      await dialog.getByRole("checkbox", { name: /同时传输 API Key/ }).click();
      const confirmation = page.getByRole("alertdialog", { name: "同时传输 API Key？", exact: true });
      await confirmation.getByRole("button", { name: "确认包含 API Key", exact: true }).click();
    }
    await dialog.getByRole("button", { name: "确认发送到电脑", exact: true }).click();
    const fingerprint = dialog.locator(".progress-sync-fingerprint strong");
    await expect(fingerprint).toHaveText(/^\d{6}$/u);
    expect(protocolRequests).toEqual(["/api/progress-sync/sessions/join"]);
    return { dialog, fingerprint: await fingerprint.innerText() };
  } finally {
    page.off("request", trackRequest);
  }
}

async function approveAndRestore(senderPage: Page, receiverPage: Page) {
  const senderDialog = senderPage.getByRole("dialog", { name: "跨设备同步", exact: true });
  const senderFingerprint = senderDialog.locator(".progress-sync-fingerprint strong");
  await expect(senderFingerprint).toHaveText(/^\d{6}$/u);
  if (await senderDialog.locator(".progress-sync-qr").count() === 0) {
    const senderSession = senderDialog.locator(".progress-sync-session");
    await expect(senderSession.locator(":scope > .progress-sync-approval")).toBeVisible();
    await expect(senderSession.locator(":scope > *").first()).toHaveClass(/progress-sync-approval/u);
  }
  const receiverFingerprint = receiverPage.locator(".progress-sync-fingerprint strong");
  await expect(receiverFingerprint).toHaveText(await senderFingerprint.innerText());
  await senderDialog.getByRole("button", { name: "确认并发送", exact: true }).click();

  const receiverDialog = receiverPage.getByRole("dialog", { name: "跨设备同步", exact: true });
  await expect(receiverDialog.getByText(/修订 #/)).toBeVisible();
  await Promise.all([
    receiverPage.waitForNavigation({ waitUntil: "domcontentloaded" }),
    receiverDialog.getByRole("button", { name: "合并并打开进度", exact: true }).click()
  ]);
  await expect(receiverPage.getByRole("heading", { name: "AI 对话工作台", exact: true })).toBeVisible();
  await expect(senderDialog.getByText("加密快照已发送，另一台设备可以完成恢复。", { exact: true })).toBeVisible();
  await senderDialog.getByRole("button", { name: "关闭跨设备同步", exact: true }).click();
}

test("progress sync dialog keeps stable desktop geometry across direction and receive-method switches", async ({ page, baseURL }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop-"), "Desktop geometry has a fixed shell contract");
  await initializeProvider(page, `${baseURL}/chat`, "geometry-test-key", "gpt-5.4-mini");
  const dialog = await openSyncDialog(page, "同步到手机");
  const baseline = await readSyncDialogGeometry(page);

  for (let index = 0; index < 10; index += 1) {
    await dialog.getByRole("tab", { name: "从手机同步", exact: true }).click();
    expectStableSyncGeometry(await readSyncDialogGeometry(page), baseline);

    await dialog.getByRole("button", { name: "改用手机授权码", exact: true }).click();
    await expect(dialog.getByLabel("6 位同步授权码", { exact: true })).toBeVisible();
    expectStableSyncGeometry(await readSyncDialogGeometry(page), baseline);

    await dialog.getByRole("button", { name: "改用扫码接收", exact: true }).click();
    expectStableSyncGeometry(await readSyncDialogGeometry(page), baseline);

    await dialog.getByRole("tab", { name: "同步到手机", exact: true }).click();
    expectStableSyncGeometry(await readSyncDialogGeometry(page), baseline);
  }

  await expect(dialog).toHaveCSS("overflow-y", "hidden");
  await expect(dialog.locator(".progress-sync-dialog-body")).toHaveCSS("overflow-y", "auto");
});

test("progress sync dialog stays viewport-safe on mobile", async ({ page, baseURL }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Mobile viewport contract runs on mobile projects");
  await initializeProvider(page, `${baseURL}/chat`, "mobile-geometry-key", "gpt-5.4-mini");
  const dialog = await openSyncDialog(page, "同步到电脑");
  await dialog.getByRole("tab", { name: "接收电脑进度", exact: true }).click();
  await expect(dialog.getByLabel("6 位同步授权码", { exact: true })).toBeVisible();

  const layout = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>(".progress-sync-dialog");
    if (!dialog) throw new Error("Missing progress sync dialog");
    const bounds = dialog.getBoundingClientRect();
    const visibleOwners = [...document.querySelectorAll<HTMLElement>("[data-scroll-owner]")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    return {
      bounds: { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left },
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      visibleOwnerCount: visibleOwners.length
    };
  });

  expect(layout.bounds.top).toBeGreaterThanOrEqual(0);
  expect(layout.bounds.left).toBeGreaterThanOrEqual(0);
  expect(layout.bounds.right).toBeLessThanOrEqual(layout.viewport.width + 1);
  expect(layout.bounds.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport.width + 1);
  expect(layout.visibleOwnerCount).toBe(1);
});

test("encrypted progress sync supports both QR directions and the manual phone fallback", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "desktop-1440", "Cross-device flow creates its own desktop and mobile contexts");
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const desktop = await desktopContext.newPage();
  const phone = await phoneContext.newPage();

  try {
    await Promise.all([
      initializeProvider(desktop, `${baseURL}/chat`, "desktop-original-key", "desktop-captured-model"),
      initializeProvider(phone, `${baseURL}/chat`, "phone-transfer-key", "phone-original-model")
    ]);

    await seedConversation(desktop, "desktop-transfer-conversation", "电脑端临时同步内容");
    const first = await createSyncCode(desktop, "同步到手机");
    expect(first.shareUrl).toBe(`${baseURL}/chat#sync=${first.code}`);
    expect(first.shareUrl).not.toContain("desktop-original-key");
    const prematureRequests: string[] = [];
    const trackPrematureRequest = (request: Request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() === "POST" && /\/sessions\/[^/]+\/(approve|payload)$/u.test(pathname)) {
        prematureRequests.push(pathname);
      }
    };
    desktop.on("request", trackPrematureRequest);
    const firstJoin = await joinSyncFromQr(phone, first.shareUrl!, first.code);
    await expect(desktop.locator(".progress-sync-fingerprint strong")).toHaveText(firstJoin.fingerprint);
    await expectQrApprovalStage(desktop, first.geometry);
    expect(prematureRequests).toEqual([]);
    desktop.off("request", trackPrematureRequest);
    await approveAndRestore(desktop, phone);
    await expect.poll(() => conversationIds(phone)).toContain("desktop-transfer-conversation");
    expect(await phone.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) || "{}"), providerStorageKey))
      .toMatchObject({ apiKey: "phone-transfer-key", lastModelId: "desktop-captured-model" });

    await seedConversation(phone, "phone-transfer-conversation", "手机端扫码回传内容");
    const second = await createPhoneSendQr(desktop);
    expect(second.shareUrl).toBe(`${baseURL}/chat#sync-send=${second.code}`);
    expect(second.shareUrl).not.toContain("phone-transfer-key");
    const secondJoin = await sendFromReverseQr(phone, second.shareUrl!, true);
    await expect(desktop.locator(".progress-sync-fingerprint strong")).toHaveText(secondJoin.fingerprint);
    await approveAndRestore(phone, desktop);
    await expect.poll(() => conversationIds(desktop)).toContain("phone-transfer-conversation");
    expect(await desktop.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) || "{}").apiKey, providerStorageKey))
      .toBe("phone-transfer-key");

    await seedConversation(phone, "phone-manual-fallback", "手机端授权码回传内容");
    const fallback = await createSyncCode(phone, "同步到电脑");
    const fallbackJoin = await joinSync(desktop, fallback.code);
    await expect(phone.locator(".progress-sync-fingerprint strong")).toHaveText(fallbackJoin.fingerprint);
    await approveAndRestore(phone, desktop);
    await expect.poll(() => conversationIds(desktop)).toContain("phone-manual-fallback");
  } finally {
    await Promise.all([desktopContext.close(), phoneContext.close()]);
  }
});
