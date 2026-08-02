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
  apiHarness.setKnowledgeSession(true);
  await seedKnowledgeEmbeddingConnections(page);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const session = page.locator(".figma-chat-session").first();
  await session.getByRole("button", { name: "选择云知识库", exact: true }).click();
  const selector = page.getByRole("dialog", { name: "云知识库选择", exact: true });
  await expect(selector).toBeVisible();

  for (const base of readyKnowledgeBases.slice(0, 3)) {
    await selector.getByRole("checkbox", { name: new RegExp(base.name) }).check();
  }
  await expect(selector.getByRole("checkbox", { name: new RegExp(readyKnowledgeBases[3].name) })).toBeDisabled();
  await page.keyboard.press("Escape");

  const storedSelection = await page.evaluate((key) => window.sessionStorage.getItem(key), chatKnowledgeSelectionStorageKey);
  expect(storedSelection).toContain(readyKnowledgeBases[0].id);
  expect(storedSelection).toContain(readyKnowledgeBases[1].id);
  expect(storedSelection).not.toContain(readyKnowledgeBases[0].name);
  expect(storedSelection).not.toContain("e2e-openai-embedding-key");

  await session.getByLabel("消息内容", { exact: true }).fill("根据已选知识库总结上线流程");
  await session.getByRole("button", { name: "发送", exact: true }).click();
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
});

test("public Chat remains usable without a knowledge account", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const session = page.locator(".figma-chat-session").first();
  await expect(session.getByRole("button", { name: "选择云知识库", exact: true })).toHaveCount(0);

  await session.getByLabel("消息内容", { exact: true }).fill("普通免登录对话");
  await session.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(1);
  expect(apiHarness.chatRequests[0].knowledgeBaseIds).toBeUndefined();
  expect(apiHarness.chatRequests[0].embeddingConnections).toBeUndefined();
  expect(apiHarness.chatKnowledgeCsrfHeaders).toEqual([""]);
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
