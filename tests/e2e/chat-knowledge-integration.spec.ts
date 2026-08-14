import {
  chatKnowledgeSelectionStorageKey,
  expect,
  knowledgeCsrfToken,
  knowledgeEmbeddingStorageKey,
  providerStorageKey,
  publicDestinations,
  readWorkspaceRecords,
  readyKnowledgeBases,
  seedChatConversations,
  seedKnowledgeEmbeddingConnections,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedChatConversations(page);
});

test("Chat sends stable cloud knowledge IDs and renders authorized sources", async ({ page, apiHarness }) => {
  const knowledgeBases = [
    { ...readyKnowledgeBases[0], documentCount: 3, readyDocumentCount: 1 },
    ...readyKnowledgeBases.slice(1)
  ];
  apiHarness.setKnowledgeSession(true, knowledgeBases);
  await seedKnowledgeEmbeddingConnections(page);
  await page.route("**/api/chat/stream", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fallback();
  });
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const session = page.locator(".figma-chat-session").first();
  await session.getByRole("button", { name: "选择云知识库", exact: true }).click();
  const selector = page.getByRole("dialog", { name: "云知识库选择", exact: true });
  await expect(selector).toBeVisible();
  await expect(selector).toContainText("部分知识库仍在处理新文档");
  await expect(selector.getByRole("checkbox", { name: new RegExp(knowledgeBases[0].name) })).toBeFocused();

  for (const base of knowledgeBases.slice(0, 3)) {
    await selector.getByRole("checkbox", { name: new RegExp(base.name) }).check();
  }
  await expect(selector.getByRole("checkbox", { name: new RegExp(knowledgeBases[3].name) })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(session.getByRole("button", { name: "选择云知识库", exact: true })).toBeFocused();

  const storedSelection = await page.evaluate((key) => window.sessionStorage.getItem(key), chatKnowledgeSelectionStorageKey);
  expect(storedSelection).toContain(readyKnowledgeBases[0].id);
  expect(storedSelection).toContain(readyKnowledgeBases[1].id);
  expect(storedSelection).not.toContain(readyKnowledgeBases[0].name);
  expect(storedSelection).not.toContain("e2e-openai-embedding-key");

  await session.getByLabel("消息内容", { exact: true }).fill("根据已选知识库总结上线流程");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(session.getByRole("button", { name: "选择云知识库", exact: true })).toContainText("检索知识");
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);

  expect(apiHarness.chatRequests[0].knowledgeBaseIds).toEqual(
    readyKnowledgeBases.slice(0, 3).map((base) => base.id)
  );
  expect(apiHarness.chatRequests[0].embeddingConnections).toEqual({
    openai: {
      apiKey: "e2e-openai-embedding-key"
    },
    qwen: {
      apiKey: "e2e-qwen-embedding-key"
    }
  });
  expect(apiHarness.chatKnowledgeCsrfHeaders).toEqual([knowledgeCsrfToken]);

  const sources = session.getByRole("region", { name: "知识来源", exact: true });
  await expect(sources).toBeVisible();
  await expect(sources).toContainText("产品手册.md");
  await expect(sources.getByRole("button", { name: "打开来源 产品手册.md", exact: true })).toBeVisible();
  await expect(sources.getByRole("button", { name: "下载来源 产品手册.md", exact: true })).toBeVisible();

  await page.route("**/api/kb/documents/*/source-url?*", (route) => route.fulfill({
    status: 404,
    json: { error: { code: "KB_DOCUMENT_NOT_FOUND", message: "Source expired" } }
  }));
  await sources.getByRole("button", { name: "打开来源 产品手册.md", exact: true }).click();
  await expect(sources.getByRole("alert")).toContainText("无法打开此知识来源");
});

test("public Chat remains usable without a knowledge account", async ({ page, apiHarness }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const session = page.locator(".figma-chat-session").first();
  const trigger = session.getByRole("button", { name: "选择云知识库", exact: true });
  await expect(trigger).toBeVisible();
  await expect.poll(async () => (await trigger.boundingBox())?.height || 0).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const selector = page.getByRole("dialog", { name: "云知识库选择", exact: true });
  await expect(selector).toContainText("登录后可引用云知识库");
  const box = await selector.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");

  await session.getByLabel("消息内容", { exact: true }).fill("普通免登录对话");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].knowledgeBaseIds).toBeUndefined();
  expect(apiHarness.chatRequests[0].embeddingConnections).toBeUndefined();
  expect(apiHarness.chatKnowledgeCsrfHeaders).toEqual([""]);
});

test("Chat exposes unavailable, missing-key, no-match, and expired-session knowledge states", async ({ page, apiHarness }) => {
  await page.route("**/api/kb/auth/session", (route) => route.fulfill({
    status: 503,
    json: { error: { code: "KB_UNAVAILABLE", message: "知识库检索服务暂时不可用" } }
  }));
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  let session = page.locator(".figma-chat-session").first();
  await session.getByRole("button", { name: "选择云知识库", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "云知识库选择", exact: true })).toContainText("云知识库当前不可用");

  await page.unroute("**/api/kb/auth/session");
  apiHarness.setKnowledgeSession(true, [readyKnowledgeBases[0]]);
  await page.reload();
  await waitForPublicModule(page, publicDestinations[0]);
  session = page.locator(".figma-chat-session").first();
  await session.getByRole("button", { name: "选择云知识库", exact: true }).click();
  const selector = page.getByRole("dialog", { name: "云知识库选择", exact: true });
  await selector.getByRole("checkbox", { name: new RegExp(readyKnowledgeBases[0].name) }).check();
  await expect(selector).toContainText("缺少 OpenAI Key");
  await page.keyboard.press("Escape");
  await session.getByLabel("消息内容", { exact: true }).fill("缺少 Key");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(session.getByRole("alert")).toContainText("Embedding");
  expect(apiHarness.chatRequests).toHaveLength(0);

  await page.evaluate((key) => {
    window.sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      connections: {
        openai: { vendor: "openai", apiKey: "e2e-openai-embedding-key" }
      }
    }));
  }, knowledgeEmbeddingStorageKey);
  apiHarness.setKnowledgeSession(true, []);
  await session.getByLabel("消息内容", { exact: true }).fill("没有匹配");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  await expect(session.getByRole("alert")).toContainText("未检索到可靠匹配");

  await page.route("**/api/chat/stream", (route) => route.fulfill({
    status: 401,
    json: { error: { code: "KB_SESSION_EXPIRED", message: "Expired" } }
  }));
  apiHarness.setKnowledgeSession(true, [readyKnowledgeBases[0]]);
  await session.getByLabel("消息内容", { exact: true }).fill("会话过期");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect(session.getByRole("alert")).toContainText("知识库会话已过期");
  await expect(session.getByRole("button", { name: "选择云知识库", exact: true })).toContainText("会话过期");
});

test("knowledge logout clears live cloud state but preserves conversations and main BYOK", async ({ page, apiHarness }) => {
  apiHarness.setKnowledgeSession(true, []);
  await seedKnowledgeEmbeddingConnections(page);
  await page.addInitScript(
    ({ key, conversationId, baseId }) => {
      window.sessionStorage.setItem(key, JSON.stringify({
        version: 1,
        conversations: { [conversationId]: [baseId] }
      }));
    },
    {
      key: chatKnowledgeSelectionStorageKey,
      conversationId: "chat-e2e-existing",
      baseId: readyKnowledgeBases[0].id
    }
  );

  await page.goto("/knowledge");
  await page.getByRole("button", { name: "退出知识库账号", exact: true }).click();
  await expect(page.getByRole("heading", { name: "登录知识库", exact: true })).toBeVisible();

  const storage = await page.evaluate(({ selections, embeddings, provider }) => ({
    selections: window.sessionStorage.getItem(selections),
    embeddings: window.sessionStorage.getItem(embeddings),
    provider: window.sessionStorage.getItem(provider)
  }), {
    selections: chatKnowledgeSelectionStorageKey,
    embeddings: knowledgeEmbeddingStorageKey,
    provider: providerStorageKey
  });
  expect(storage.selections).toBeNull();
  expect(storage.embeddings).toBeNull();
  expect(storage.provider).toContain("e2e-session-key");

  const conversations = await readWorkspaceRecords<{ id: string }>(page, "conversations");
  expect(conversations.some((conversation) => conversation.id === "chat-e2e-existing")).toBe(true);
});
