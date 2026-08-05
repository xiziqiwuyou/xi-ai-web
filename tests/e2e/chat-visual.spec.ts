import {
  expect,
  isMobileProject,
  publicDestinations,
  seedChatConversations,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedChatConversations(page);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
});

test("Chat renders the exact Figma stacked-session structure and copy", async ({ page }, testInfo) => {
  const heading = page.locator(".figma-workspace-heading");
  await expect(heading.getByRole("heading", { name: "AI \u5bf9\u8bdd\u5de5\u4f5c\u53f0", exact: true })).toBeVisible();
  if (isMobileProject(testInfo.project.name)) {
    await expect(heading.locator(".figma-heading-actions")).toBeHidden();
  } else {
    await expect(heading.locator(".figma-heading-actions button")).toHaveText([
      "\u65b0\u5bf9\u8bdd",
      "\u4f1a\u8bdd\u8bbe\u7f6e"
    ]);
  }

  const stack = page.locator(".figma-session-stack");
  const sessions = stack.locator(":scope > .figma-chat-session");
  await expect(sessions).toHaveCount(1);

  const activeSession = sessions.first();
  await expect(activeSession).not.toHaveClass(/collapsed/);
  await expect(activeSession.locator(".figma-session-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(activeSession.locator(".figma-message-history")).toBeVisible();

  const toolLabels = await activeSession.locator(".figma-session-tools > button, .figma-session-tools > .figma-menu > .figma-menu-trigger").allTextContents();
  expect(toolLabels.map((label) => label.replace(/\s+/g, " ").trim())).toEqual([
    "\u7f51\u7edc\u641c\u7d22",
    "\u56fe\u7247\u8f93\u5165",
    "\u601d\u7ef4\u94fe \u00b7 \u9ed8\u8ba4",
    "上下文 · 最近 16 条",
    "\u6e05\u9664\u6d88\u606f"
  ]);
  await expect(activeSession.getByRole("button", { name: "配置联网搜索服务", exact: true })).toHaveCount(0);
  await expect(activeSession.getByRole("button", { name: "思维链长度", exact: true })).toContainText("思维链 · 默认");

  const composer = activeSession.locator(".figma-composer");
  await expect(composer).toBeVisible();
  await expect(composer.getByRole("textbox", { name: "\u6d88\u606f\u5185\u5bb9", exact: true })).toHaveAttribute(
    "placeholder",
    "\u5728\u6b64\u8f93\u5165\u4f60\u60f3\u63a2\u8ba8\u7684\u60f3\u6cd5\u3001\u5206\u6790\u7684\u5185\u5bb9\uff0c\u6216\u8005\u5411 AI \u63d0\u95ee... (Shift + Enter \u6362\u884c\uff0cEnter \u53d1\u9001)"
  );
  await expect(composer.locator(".figma-composer-footer > span")).toHaveCount(0);
  if (isMobileProject(testInfo.project.name)) {
    const mobileActions = activeSession.locator(".figma-session-mobile-actions");
    await expect(mobileActions).toBeVisible();
    await expect(mobileActions.locator(".figma-session-action-mobile")).toHaveCount(2);
    await expect(mobileActions.getByRole("button", { name: "新对话", exact: true })).toBeVisible();
    await expect(mobileActions.getByRole("button", { name: "会话设置", exact: true })).toBeVisible();
  } else {
    await expect(activeSession.locator(".figma-session-mobile-actions")).toBeHidden();
  }
  await expect(activeSession.locator(".figma-generation-note")).toHaveText(
    "AI \u751f\u6210\u5185\u5bb9\u4ec5\u4f9b\u53c2\u8003\uff0c\u8bf7\u6838\u9a8c\u5173\u952e\u7ed3\u8bba\u3002"
  );
});

test("Chat workspace responds to the mouse wheel over message content", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo.project.name), "Desktop wheel contract");

  const workspace = page.locator(".figma-workspace");
  const messageHistory = page.locator(".figma-message-history");
  const messageBox = await messageHistory.boundingBox();
  expect(messageBox).not.toBeNull();

  await workspace.evaluate((element) => {
    element.scrollTop = 0;
  });
  const before = await workspace.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight
  }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

  await page.mouse.move(
    (messageBox?.x || 0) + Math.min(160, (messageBox?.width || 0) / 2),
    (messageBox?.y || 0) + Math.min(160, (messageBox?.height || 0) / 2)
  );
  await page.mouse.wheel(0, 320);

  await expect.poll(() => workspace.evaluate((element) => element.scrollTop)).toBeGreaterThan(before.scrollTop);
});

test("Chat message history reveals its scrollbar only during scrolling", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo.project.name), "Desktop scrollbar visibility contract");

  const session = page.locator(".figma-chat-session:not(.collapsed)");
  const history = session.locator(".figma-message-history");
  const scrollbarVisual = () => history.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    contentWidth: element.querySelector<HTMLElement>(".figma-message-track")?.getBoundingClientRect().width || 0,
    color: getComputedStyle(element).scrollbarColor
  }));

  await session.getByLabel("消息内容", { exact: true }).fill("scroll overflow ".repeat(220));
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(history).toContainText("Deterministic assistant response.");
  await expect.poll(() => history.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
  await expect(history).toHaveAttribute("data-scroll-active", "false", { timeout: 2_000 });
  const idle = await scrollbarVisual();
  expect(idle.color).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);

  await history.hover();
  expect(await scrollbarVisual()).toEqual(idle);

  const previousScrollTop = await history.evaluate((element) => element.scrollTop);
  expect(previousScrollTop).toBeGreaterThan(0);
  await history.evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollTop - 80);
  });
  await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeLessThan(previousScrollTop);
  await expect(history).toHaveAttribute("data-scroll-active", "true");
  const active = await scrollbarVisual();
  expect(Math.abs(active.width - idle.width)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(active.contentWidth - idle.contentWidth)).toBeLessThanOrEqual(0.5);
  expect(active.color).not.toBe(idle.color);
  await expect(history).toHaveAttribute("data-scroll-active", "false", { timeout: 2_000 });
  expect(await scrollbarVisual()).toEqual(idle);
});

test("Chat follows delayed streaming tokens at the message-history bottom", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One deterministic delayed-stream pass is sufficient");

  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (!requestUrl.endsWith("/api/chat/stream")) return originalFetch(input, init);

      const payload = JSON.parse(String(init?.body || "{}")) as {
        content?: string;
        displayContent?: string;
        modelId?: string;
        conversation?: {
          id: string;
          title: string;
          assistantId?: string;
          pinned?: boolean;
          messageCount: number;
          preview: string;
          createdAt: string;
          updatedAt: string;
        };
      };
      const createdAt = "2026-08-02T00:00:00.000Z";
      const conversation = payload.conversation || {
        id: "stream-follow-chat",
        title: "Stream follow chat",
        pinned: false,
        messageCount: 0,
        preview: "",
        createdAt,
        updatedAt: createdAt
      };
      const displayContent = payload.displayContent || payload.content || "stream follow";
      const chunks = Array.from({ length: 14 }, (_, index) => (
        `\n\n${index + 1}. ${"progressive streaming content ".repeat(12)}[STREAM-TOKEN-${index + 1}]`
      ));
      const responseContent = chunks.join("");
      const encoder = new TextEncoder();
      const eventChunk = (event: string, data: unknown) => encoder.encode(
        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      );
      const streamWindow = window as Window & { __emitNextChatStreamEvent?: () => void };

      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(eventChunk("meta", {
            conversation: {
              ...conversation,
              messageCount: conversation.messageCount + 2,
              preview: displayContent,
              updatedAt: createdAt
            },
            userMessage: {
              id: "stream-follow-user",
              role: "user",
              content: displayContent,
              createdAt
            },
            assistantMessageId: "stream-follow-assistant"
          }));
          let chunkIndex = 0;
          const emitNext = () => {
            if (chunkIndex < chunks.length) {
              const token = chunks[chunkIndex];
              controller.enqueue(eventChunk("token", { token }));
              chunkIndex += 1;
              return;
            }
            controller.enqueue(eventChunk("done", {
              conversation: {
                ...conversation,
                messageCount: conversation.messageCount + 2,
                preview: displayContent,
                updatedAt: createdAt
              },
              message: {
                id: "stream-follow-assistant",
                role: "assistant",
                content: responseContent,
                model: payload.modelId,
                providerId: payload.modelId,
                status: "done",
                createdAt
              }
            }));
            controller.close();
            delete streamWindow.__emitNextChatStreamEvent;
          };
          streamWindow.__emitNextChatStreamEvent = emitNext;
        },
        cancel() {
          delete streamWindow.__emitNextChatStreamEvent;
        }
      }), {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" }
      });
    }) as typeof window.fetch;
  });

  const session = page.locator(".figma-chat-session:not(.collapsed)");
  const history = session.locator(".figma-message-history");
  const workspace = page.locator(".figma-workspace");
  const workspaceScrollTop = await workspace.evaluate((element) => element.scrollTop);
  await session.getByLabel("消息内容", { exact: true }).fill("验证逐字输出滚动");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(history).toContainText("验证逐字输出滚动");
  await expect(history.locator(".figma-typing")).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as Window & {
    __emitNextChatStreamEvent?: () => void;
  }).__emitNextChatStreamEvent)).toBe("function");

  const emitNextStreamEvent = () => page.evaluate(() => {
    const emitNext = (window as Window & { __emitNextChatStreamEvent?: () => void }).__emitNextChatStreamEvent;
    if (!emitNext) throw new Error("Delayed Chat stream is not ready");
    emitNext();
  });
  let observedOverflow = false;
  for (let index = 0; index < 14; index += 1) {
    await emitNextStreamEvent();
    await expect(history).toContainText(`[STREAM-TOKEN-${index + 1}]`);
    const streamingGeometry = await history.evaluate((element) => ({
      bottomDistance: element.scrollHeight - element.scrollTop - element.clientHeight,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
    observedOverflow ||= streamingGeometry.scrollHeight > streamingGeometry.clientHeight;
    expect(streamingGeometry.bottomDistance, `token batch ${index + 1} should remain bottom-followed`).toBeLessThanOrEqual(2);
    expect(
      await workspace.evaluate((element) => element.scrollTop),
      `token batch ${index + 1} should not move the outer workspace`
    ).toBe(workspaceScrollTop);
  }
  expect(observedOverflow).toBeTruthy();

  await emitNextStreamEvent();
  await expect(session.getByRole("button", { name: "发送", exact: true })).toBeVisible();
});

test("expanded Chat composer stays inside desktop viewport bounds", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo.project.name), "Desktop viewport containment contract");

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 2048, height: 1030 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/chat");
    await waitForPublicModule(page, publicDestinations[0]);

    const geometry = await page.locator(".figma-chat-session:not(.collapsed)").evaluate((session) => {
      const box = (selector: string) => {
        const element = session.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      };
      const history = session.querySelector<HTMLElement>(".figma-message-history");
      const sessionRect = session.getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        session: { top: sessionRect.top, bottom: sessionRect.bottom, height: sessionRect.height },
        history: box(".figma-message-history"),
        composer: box(".figma-composer"),
        note: box(".figma-generation-note"),
        historyOverflowY: history ? getComputedStyle(history).overflowY : ""
      };
    });

    expect(geometry.session).not.toBeNull();
    expect(geometry.history).not.toBeNull();
    expect(geometry.composer).not.toBeNull();
    expect(geometry.note).not.toBeNull();
    expect(geometry.composer!.bottom).toBeLessThanOrEqual(geometry.viewportHeight - 12);
    expect(geometry.note!.bottom).toBeLessThanOrEqual(geometry.viewportHeight - 12);
    expect(geometry.history!.height).toBeGreaterThanOrEqual(240);
    expect(geometry.historyOverflowY).toBe("auto");
  }
});

test("mobile Chat composer remains reachable without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile safe-area contract");

  const workspace = page.locator(".figma-workspace");
  const composer = page.locator(".figma-chat-session:not(.collapsed) .figma-composer");
  await composer.scrollIntoViewIfNeeded();
  const geometry = await composer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const controls = element.closest<HTMLElement>(".figma-session-controls");
    return {
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      controlsPaddingBottom: controls ? Number.parseFloat(getComputedStyle(controls).paddingBottom) : 0,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.controlsPaddingBottom).toBeGreaterThanOrEqual(12);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  await expect(workspace).toHaveAttribute("data-scroll-owner", "public-workspace");
});

test("Chat widens messages while keeping the authored 896px composer track", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo.project.name), "Desktop Figma track contract");

  const session = page.locator(".figma-chat-session").first();
  await session.getByLabel("消息内容", { exact: true }).fill("验证消息轨道左右布局");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(session.getByText("Deterministic assistant response.", { exact: true })).toBeVisible();
  const metrics = await session.evaluate((element) => {
    const rect = (selector: string) => {
      const target = element.querySelector<HTMLElement>(selector);
      if (!target) return null;
      const box = target.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const messageTrack = element.querySelector<HTMLElement>(".figma-message-track");
    return {
      viewportHeight: window.innerHeight,
      history: rect(".figma-message-history"),
      messageTrack: rect(".figma-message-track"),
      controlsTrack: rect(".figma-session-controls-track"),
      composer: rect(".figma-composer"),
      send: rect(".figma-send-button"),
      assistantAvatar: rect(".figma-message.assistant .figma-message-avatar"),
      assistantBubble: rect(".figma-message.assistant .figma-message-bubble"),
      userAvatar: rect(".figma-message.user .figma-user-avatar"),
      userBubble: rect(".figma-message.user .figma-message-bubble"),
      messageTrackClientWidth: messageTrack?.clientWidth || 0,
      messageTrackScrollWidth: messageTrack?.scrollWidth || 0,
      messageTrackPaddingLeft: messageTrack ? Number.parseFloat(getComputedStyle(messageTrack).paddingLeft) : 0,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  expect(metrics.history).not.toBeNull();
  expect(metrics.messageTrack).not.toBeNull();
  expect(metrics.controlsTrack).not.toBeNull();
  expect(metrics.composer).not.toBeNull();
  expect(metrics.send).not.toBeNull();
  expect(metrics.assistantAvatar).not.toBeNull();
  expect(metrics.assistantBubble).not.toBeNull();
  expect(metrics.userAvatar).not.toBeNull();
  expect(metrics.userBubble).not.toBeNull();
  expect(metrics.history!.height).toBeGreaterThanOrEqual(240);
  expect(metrics.composer!.y + metrics.composer!.height).toBeLessThanOrEqual(metrics.viewportHeight - 12);
  expect(Math.abs(metrics.messageTrack!.width - Math.min(metrics.history!.width, 1024))).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.controlsTrack!.width - 896)).toBeLessThanOrEqual(1);
  expect(metrics.messageTrack!.width).toBeGreaterThan(metrics.controlsTrack!.width);
  expect(Math.abs((metrics.messageTrack!.x + metrics.messageTrack!.width / 2) - (metrics.history!.x + metrics.history!.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.composer!.x - metrics.controlsTrack!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.composer!.width - metrics.controlsTrack!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.messageTrackPaddingLeft - 24)).toBeLessThanOrEqual(1);
  expect(metrics.messageTrackScrollWidth).toBeLessThanOrEqual(metrics.messageTrackClientWidth + 1);
  expect(Math.abs(metrics.assistantAvatar!.x - metrics.messageTrack!.x - 24)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.assistantBubble!.x - metrics.assistantAvatar!.x - metrics.assistantAvatar!.width - 12)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.userAvatar!.x - metrics.userBubble!.x - metrics.userBubble!.width - 12)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.messageTrack!.x + metrics.messageTrack!.width - metrics.userAvatar!.x - metrics.userAvatar!.width - 24)).toBeLessThanOrEqual(1);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.composer!.height).toBeGreaterThanOrEqual(88);
  expect(metrics.composer!.height).toBeLessThanOrEqual(91);
  expect(Math.abs(metrics.send!.width - 32)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.send!.height - 32)).toBeLessThanOrEqual(1);
});

test("Chat model picker groups catalog models and closes after selection or Escape", async ({ page }, testInfo) => {
  const activeSession = page.locator(".figma-session-stack > .figma-chat-session").first();
  const trigger = activeSession.getByRole("button", { name: "\u9009\u62e9\u5bf9\u8bdd\u6a21\u578b", exact: true });

  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("Test Chat");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  const modelDescriptionId = await trigger.getAttribute("aria-describedby");
  expect(modelDescriptionId).toBeTruthy();
  await expect(activeSession.locator(`[id="${modelDescriptionId}"]`)).toHaveText("\u5f53\u524d\u6a21\u578b\uff1aTest Chat");
  await expect(activeSession.locator(".figma-session-model select:visible")).toHaveCount(0);

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const popover = activeSession.locator(".figma-model-popover");
  const vendorTabs = popover.getByRole("tablist", { name: "\u6a21\u578b\u5382\u5546", exact: true });
  await expect(vendorTabs.getByRole("tab")).toHaveText([
    "OpenAI",
    "Claude",
    "Gemini",
    "Kimi",
    "DeepSeek",
    "\u901a\u4e49\u5343\u95ee"
  ]);
  const openAiVendorTab = vendorTabs.getByRole("tab", { name: "OpenAI", exact: true });
  await expect(openAiVendorTab).toHaveClass(/active/);
  const selectedVendorStyle = await openAiVendorTab.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      fontWeight: style.fontWeight
    };
  });
  expect(selectedVendorStyle.backgroundColor).not.toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
  expect(parseFloat(selectedVendorStyle.borderRadius)).toBeGreaterThanOrEqual(8);
  expect(Number(selectedVendorStyle.fontWeight)).toBeGreaterThanOrEqual(700);
  const vendorScrollContract = await vendorTabs.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollbarGutter: style.scrollbarGutter,
      scrollbarColor: style.scrollbarColor,
      thumbColor: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor,
      width: element.getBoundingClientRect().width,
      firstTabWidth: element.querySelector<HTMLElement>("[role='tab']")?.getBoundingClientRect().width || 0
    };
  });
  expect(["auto", "scroll"]).toContain(vendorScrollContract.overflowY);
  expect(vendorScrollContract.scrollHeight).toBeGreaterThan(vendorScrollContract.clientHeight);
  expect(vendorScrollContract.scrollbarGutter).toContain("stable");
  expect(vendorScrollContract.scrollbarColor).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
  expect(vendorScrollContract.thumbColor).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
  await expect(vendorTabs).toHaveAttribute("data-scroll-active", "false");
  if (isMobileProject(testInfo.project.name)) {
    await vendorTabs.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
  } else {
    await vendorTabs.hover();
    await page.mouse.wheel(0, 240);
  }
  await expect(vendorTabs).toHaveAttribute("data-scroll-active", "true");
  const activeVendorScrollContract = await vendorTabs.evaluate((element) => ({
    scrollbarColor: getComputedStyle(element).scrollbarColor,
    thumbColor: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor,
    width: element.getBoundingClientRect().width,
    firstTabWidth: element.querySelector<HTMLElement>("[role='tab']")?.getBoundingClientRect().width || 0
  }));
  expect(Math.abs(activeVendorScrollContract.width - vendorScrollContract.width)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(activeVendorScrollContract.firstTabWidth - vendorScrollContract.firstTabWidth)).toBeLessThanOrEqual(0.5);
  expect(activeVendorScrollContract.scrollbarColor).not.toBe(vendorScrollContract.scrollbarColor);
  expect(activeVendorScrollContract.thumbColor).not.toBe(vendorScrollContract.thumbColor);
  expect(activeVendorScrollContract.thumbColor).toMatch(/0\.(?:42|46)\)/);
  await expect(vendorTabs).toHaveAttribute("data-scroll-active", "false", { timeout: 2_000 });
  await expect(popover.getByText("OpenAI \u00b7 \u6a21\u578b", { exact: true })).toBeVisible();
  await expect(popover.getByText("\u663e\u793a 3 \u4e2a", { exact: true })).toBeVisible();

  const openAiList = popover.getByRole("listbox", { name: "OpenAI \u6a21\u578b", exact: true });
  await expect(openAiList.getByRole("option")).toHaveCount(5);
  await expect(openAiList.locator('[role="option"][aria-selected="true"] svg')).toHaveCount(1);
  await expect(openAiList.locator('[role="option"][aria-selected="false"] svg')).toHaveCount(0);
  const scrollContract = await openAiList.evaluate((element) => {
    const style = getComputedStyle(element);
    const popover = element.closest<HTMLElement>(".figma-model-popover");
    const firstOption = element.querySelector<HTMLElement>("[role='option']");
    const popoverBox = popover?.getBoundingClientRect();
    const optionBox = firstOption?.getBoundingClientRect();
    const optionStyle = firstOption ? getComputedStyle(firstOption) : null;
    return {
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      popoverWidth: popoverBox?.width || 0,
      popoverHeight: popoverBox?.height || 0,
      optionHeight: optionBox?.height || 0,
      optionBorderBottomWidth: optionStyle?.borderBottomWidth || "",
      optionBorderRadius: optionStyle?.borderRadius || "",
      rowGap: style.rowGap,
      paddingTop: style.paddingTop
    };
  });
  expect(["auto", "scroll"]).toContain(scrollContract.overflowY);
  expect(Math.abs(scrollContract.popoverWidth - 350)).toBeLessThanOrEqual(1);
  expect(Math.abs(scrollContract.popoverHeight - 195)).toBeLessThanOrEqual(1);
  expect(Math.abs(scrollContract.clientHeight - 156)).toBeLessThanOrEqual(1);
  expect(Math.abs(scrollContract.optionHeight - 46)).toBeLessThanOrEqual(1);
  expect(scrollContract.optionBorderBottomWidth).toBe("0px");
  expect(parseFloat(scrollContract.optionBorderRadius)).toBeGreaterThanOrEqual(8);
  expect(parseFloat(scrollContract.rowGap)).toBeGreaterThanOrEqual(3);
  expect(parseFloat(scrollContract.paddingTop)).toBeGreaterThanOrEqual(3);
  expect(scrollContract.scrollHeight).toBeGreaterThan(scrollContract.clientHeight);
  await expect(openAiList).toHaveAttribute("data-scroll-active", "false");
  const idleWidths = await openAiList.evaluate((element) => ({
    list: element.getBoundingClientRect().width,
    firstOption: element.querySelector<HTMLElement>("[role='option']")?.getBoundingClientRect().width || 0,
    scrollbarColor: getComputedStyle(element).scrollbarColor,
    thumbColor: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor
  }));
  expect(idleWidths.scrollbarColor).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
  expect(idleWidths.thumbColor).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
  if (isMobileProject(testInfo.project.name)) {
    await openAiList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
  } else {
    await openAiList.hover();
    await page.mouse.wheel(0, 320);
  }
  await expect(openAiList).toHaveAttribute("data-scroll-active", "true");
  const activeWidths = await openAiList.evaluate((element) => ({
    list: element.getBoundingClientRect().width,
    firstOption: element.querySelector<HTMLElement>("[role='option']")?.getBoundingClientRect().width || 0,
    scrollbarColor: getComputedStyle(element).scrollbarColor,
    thumbColor: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor
  }));
  expect(Math.abs(activeWidths.list - idleWidths.list)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(activeWidths.firstOption - idleWidths.firstOption)).toBeLessThanOrEqual(0.5);
  expect(activeWidths.scrollbarColor).not.toBe(idleWidths.scrollbarColor);
  expect(activeWidths.thumbColor).not.toBe(idleWidths.thumbColor);
  expect(activeWidths.thumbColor).toMatch(/0\.(?:42|46)\)/);
  await expect(openAiList).toHaveAttribute("data-scroll-active", "false", { timeout: 2_000 });

  const claudeVendorTab = vendorTabs.getByRole("tab", { name: "Claude", exact: true });
  await claudeVendorTab.click();
  await expect(claudeVendorTab).toHaveClass(/active/);
  await expect(openAiVendorTab).not.toHaveClass(/active/);
  const switchedVendorStyles = await vendorTabs.evaluate((element) => {
    const selected = element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const inactive = element.querySelector<HTMLElement>('[role="tab"][aria-selected="false"]');
    return {
      selectedBackground: selected ? getComputedStyle(selected).backgroundColor : "",
      inactiveBackground: inactive ? getComputedStyle(inactive).backgroundColor : ""
    };
  });
  expect(switchedVendorStyles.selectedBackground).not.toBe(switchedVendorStyles.inactiveBackground);
  await expect(popover.getByText("Claude \u00b7 \u6a21\u578b", { exact: true })).toBeVisible();
  const claudeList = popover.getByRole("listbox", { name: "Claude \u6a21\u578b", exact: true });
  await expect(claudeList.getByRole("option")).toHaveCount(4);

  await vendorTabs.getByRole("tab", { name: "Gemini", exact: true }).click();
  await expect(popover.getByText("Gemini \u00b7 \u6a21\u578b", { exact: true })).toBeVisible();
  await expect(popover.getByRole("listbox", { name: "Gemini \u6a21\u578b", exact: true }).getByRole("option")).toHaveCount(3);
  for (const vendor of ["Kimi", "DeepSeek", "\u901a\u4e49\u5343\u95ee"]) {
    await vendorTabs.getByRole("tab", { name: vendor, exact: true }).click();
    await expect(popover.getByRole("listbox", { name: `${vendor} \u6a21\u578b`, exact: true }).getByRole("option")).toHaveCount(1);
  }

  await vendorTabs.getByRole("tab", { name: "Claude", exact: true }).click();
  await claudeList.getByRole("option", { name: /Claude Reason/ }).click();
  await expect(popover).toHaveCount(0);
  await expect(trigger).toContainText("Claude Reason");
  await expect(activeSession.locator(`[id="${modelDescriptionId}"]`)).toHaveText("\u5f53\u524d\u6a21\u578b\uff1aClaude Reason");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(activeSession.locator(".figma-model-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(activeSession.locator(".figma-model-popover")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("the complete Chat session header folds and unfolds the session", async ({ page }, testInfo) => {
  const activeSession = page.locator(".figma-session-stack > .figma-chat-session").first();
  const header = activeSession.getByTestId("session-header-toggle-area");
  const bounds = await header.boundingBox();
  expect(bounds).not.toBeNull();
  await expect(header).toHaveAttribute("aria-label", "点击折叠对话");

  if (isMobileProject(testInfo.project.name)) {
    await activeSession.locator(".figma-session-toggle").click();
  } else {
    await header.click({
      position: {
        x: Math.min(bounds!.width - 110, Math.max(150, Math.round(bounds!.width * 0.6))),
        y: Math.round(bounds!.height / 2)
      }
    });
  }
  await expect(activeSession).toHaveClass(/collapsed/);
  await expect(header).toHaveAttribute("aria-label", "点击展开对话");
  await expect(activeSession.locator(".figma-session-preview")).toBeVisible();

  await header.press("Enter");
  await expect(activeSession).not.toHaveClass(/collapsed/);
  await expect(header).toHaveAttribute("aria-label", "点击折叠对话");
  await expect(activeSession.locator(".figma-message-history")).toBeVisible();
});

test("new Chat sessions open at the top and fold older sessions", async ({ page }) => {
  const stack = page.locator(".figma-session-stack");
  const sessions = stack.locator(":scope > .figma-chat-session");
  await expect(sessions).toHaveCount(1);

  await page.getByRole("button", { name: "\u65b0\u5bf9\u8bdd", exact: true }).first().click();

  await expect(sessions).toHaveCount(2);
  const newestSession = sessions.nth(0);
  const olderSession = sessions.nth(1);

  await expect(newestSession).not.toHaveClass(/collapsed/);
  await expect(newestSession.locator(".figma-session-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(newestSession.locator(".figma-message-history")).toBeVisible();
  await expect(newestSession.locator(".figma-message")).toHaveCount(1);
  await expect(newestSession.locator(".figma-message.assistant .figma-message-bubble")).toHaveText(
    "你好，今天想从哪里开始？可以直接提问、整理资料，或一起完成一项具体任务。"
  );
  await expect(newestSession.getByText("帮我梳理一份关于生成式 AI 在企业落地的简短介绍。", { exact: true })).toHaveCount(0);

  await expect(olderSession).toHaveClass(/collapsed/);
  await expect(olderSession.locator(".figma-session-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(olderSession.locator(".figma-message-history")).toHaveCount(0);
  await expect(olderSession.locator(".figma-session-preview")).toContainText("\u5df2\u6709\u5bf9\u8bdd");
});
