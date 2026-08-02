import fs from "node:fs/promises";
import {
  documentOverflow,
  expect,
  isMobileProject,
  knowledgeCsrfToken,
  publicDestinations,
  readWorkspaceRecords,
  readyKnowledgeBases,
  seedReadyProvider,
  seedReadySearchService,
  seedKnowledgeEmbeddingConnections,
  test,
  waitForPublicModule
} from "./support/app-fixture";
import type {
  AgentSkillDefinition,
  AgentWorkflowDefinition,
  KnowledgeDocument,
  UserAgentDefinition
} from "../../src/types";

function destination(id: "agents" | "workflows") {
  const value = publicDestinations.find((item) => item.id === id);
  if (!value) throw new Error(`Missing public destination: ${id}`);
  return value;
}

async function openWorkspaceDialog(page: Parameters<typeof readWorkspaceRecords>[0]) {
  await page.locator('button[aria-label="管理工作区数据"]:visible').click();
  const dialog = page.getByRole("dialog", { name: "工作区数据", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openFirstWorkflow(page: Parameters<typeof readWorkspaceRecords>[0]) {
  const module = page.getByTestId("workflows-module");
  await expect(module.getByLabel("工作流目录", { exact: true })).toBeVisible();
  await expect(module.getByTestId("workflow-canvas")).toHaveCount(0);
  await module.locator(".workflow-catalog-card").first().click();
  await expect(module.getByTestId("workflow-canvas")).toBeVisible();
  return module;
}

async function seedKnowledgeDocument(page: Parameters<typeof readWorkspaceRecords>[0]) {
  const document: KnowledgeDocument = {
    id: "knowledge-workflow-release",
    name: "发布手册.txt",
    type: "text/plain",
    size: 58,
    text: "发布前必须完成回滚演练、监控检查和负责人确认。",
    chunks: [{
      id: "knowledge-workflow-release-0",
      documentId: "knowledge-workflow-release",
      documentName: "发布手册.txt",
      index: 0,
      text: "发布前必须完成回滚演练、监控检查和负责人确认。"
    }],
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z"
  };
  await page.evaluate(async (nextDocument) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("xi-ai-web-workspace");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("knowledgeDocuments", "readwrite");
        transaction.objectStore("knowledgeDocuments").put(nextDocument);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, document);
}

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
  await seedReadySearchService(page);
});

test("local agents persist and run as bounded inline definitions", async ({ page, apiHarness }) => {
  await page.goto("/agents");
  await waitForPublicModule(page, destination("agents"));
  const module = page.getByTestId("agents-module");

  await expect.poll(async () => (await readWorkspaceRecords<UserAgentDefinition>(page, "userAgents")).length).toBeGreaterThan(0);
  await expect(module.getByLabel("智能体目录", { exact: true })).toBeVisible();
  await expect(module.getByLabel("智能体任务", { exact: true })).toHaveCount(0);
  await module.locator(".agent-catalog-toolbar").getByRole("button", { name: "新建智能体", exact: true }).click();
  await expect(module.getByRole("button", { name: "返回智能体", exact: true })).toBeVisible();
  await module.getByLabel("名称", { exact: true }).fill("浏览器研究员");
  await module.getByLabel("描述", { exact: true }).fill("整理输入并给出执行建议");
  await module.getByLabel("分类", { exact: true }).fill("学习研究");
  await module.getByLabel("标签", { exact: true }).fill("研究, 复核");
  await module.getByLabel("系统指令", { exact: true }).fill("先核对输入，再输出结论、风险和下一步。");
  await module.getByRole("button", { name: "保存智能体", exact: true }).click();
  await expect(module.getByText("智能体已保存到当前浏览器。", { exact: true })).toBeVisible();

  await module.getByRole("textbox", { name: "智能体任务", exact: true }).fill("分析这个项目的上线准备情况");
  await module.getByRole("button", { name: "运行智能体", exact: true }).click();
  await expect(module.getByText("Deterministic agent response.", { exact: true })).toBeVisible();

  expect(apiHarness.agentRequests.at(-1)).toMatchObject({
    moduleId: "agents",
    agent: {
      name: "浏览器研究员",
      systemPrompt: "先核对输入，再输出结论、风险和下一步。"
    },
    prompt: "分析这个项目的上线准备情况"
  });
  const stored = await readWorkspaceRecords<UserAgentDefinition>(page, "userAgents");
  expect(stored.some((agent) =>
    agent.name === "浏览器研究员" &&
    agent.category === "学习研究" &&
    agent.tags?.join(",") === "研究,复核"
  )).toBe(true);

  await module.getByRole("button", { name: "返回智能体", exact: true }).click();
  await expect(module.getByLabel("智能体目录", { exact: true })).toBeVisible();
  await expect(module.getByRole("button", { name: "打开智能体 浏览器研究员", exact: true })).toBeVisible();
});

test("saved agents carry selected local knowledge into their bounded request", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  await seedKnowledgeDocument(page);
  await page.goto("/agents");
  await waitForPublicModule(page, destination("agents"));
  const module = page.getByTestId("agents-module");

  await module.getByRole("button", { name: "打开智能体 执行搭档", exact: true }).click();
  await module.getByRole("checkbox", { name: /发布手册\.txt/ }).check();
  await module.getByRole("button", { name: "保存智能体", exact: true }).click();
  await expect(module.getByText("智能体已保存到当前浏览器。", { exact: true })).toBeVisible();
  await module.getByLabel("智能体任务", { exact: true }).fill("发布前需要检查什么？");
  await module.getByRole("button", { name: "运行智能体", exact: true }).click();
  await expect(module.getByText("Deterministic agent response.", { exact: true })).toBeVisible();

  const request = apiHarness.agentRequests.at(-1);
  expect(request?.allowedTools).toContain("knowledge_search");
  expect(request?.contextChunks?.[0]).toMatchObject({
    documentId: "knowledge-workflow-release",
    documentName: "发布手册.txt"
  });
  const stored = (await readWorkspaceRecords<UserAgentDefinition>(page, "userAgents"))
    .find((agent) => agent.id === "agent-execution-partner");
  expect(stored?.knowledgeDocumentIds).toEqual(["knowledge-workflow-release"]);
});

test("agents persist stable cloud IDs, send request-only connections, and render citations", async ({ page, apiHarness }) => {
  apiHarness.setKnowledgeSession(true);
  await seedKnowledgeEmbeddingConnections(page);
  await page.goto("/agents");
  await waitForPublicModule(page, destination("agents"));
  const module = page.getByTestId("agents-module");

  await module.getByRole("button", { name: "打开智能体 执行搭档", exact: true }).click();
  await module.getByRole("button", { name: "选择云知识库", exact: true }).click();
  const selector = page.getByRole("dialog", { name: "云知识库选择", exact: true });
  await expect(selector).toBeVisible();
  for (const base of readyKnowledgeBases.slice(0, 2)) {
    await selector.getByRole("checkbox", { name: new RegExp(base.name) }).check();
  }
  await page.keyboard.press("Escape");
  await module.getByRole("button", { name: "保存智能体", exact: true }).click();
  await expect(module.getByText("智能体已保存到当前浏览器。", { exact: true })).toBeVisible();

  const stored = (await readWorkspaceRecords<UserAgentDefinition>(page, "userAgents"))
    .find((agent) => agent.id === "agent-execution-partner");
  expect(stored?.knowledgeBaseIds).toEqual(readyKnowledgeBases.slice(0, 2).map((base) => base.id));

  await module.getByLabel("智能体任务", { exact: true }).fill("根据云知识库总结上线流程");
  await module.getByRole("button", { name: "运行智能体", exact: true }).click();
  await expect(module.getByText("Deterministic agent response.", { exact: true })).toBeVisible();

  expect(apiHarness.agentRequests.at(-1)).toMatchObject({
    moduleId: "agents",
    knowledgeBaseIds: readyKnowledgeBases.slice(0, 2).map((base) => base.id),
    embeddingConnections: {
      openai: { apiKey: "e2e-openai-embedding-key" },
      qwen: { apiKey: "e2e-qwen-embedding-key" }
    }
  });
  expect(apiHarness.agentRequests.at(-1)?.contextChunks).toEqual([]);
  expect(apiHarness.agentKnowledgeCsrfHeaders.at(-1)).toBe(knowledgeCsrfToken);
  await expect(module.getByRole("region", { name: "知识来源", exact: true })).toBeVisible();
});

test("workflow cloud references preflight globally before provider calls", async ({ page, apiHarness }) => {
  apiHarness.setKnowledgeSession(true);
  await seedKnowledgeEmbeddingConnections(page);
  await page.goto("/agents");
  await waitForPublicModule(page, destination("agents"));
  const agentsModule = page.getByTestId("agents-module");
  await agentsModule.getByRole("button", { name: "打开智能体 执行搭档", exact: true }).click();
  await agentsModule.getByRole("button", { name: "选择云知识库", exact: true }).click();
  const agentSelector = page.getByRole("dialog", { name: "云知识库选择", exact: true });
  await agentSelector.getByRole("checkbox", { name: new RegExp(readyKnowledgeBases[2].name) }).check();
  await page.keyboard.press("Escape");
  await agentsModule.getByRole("button", { name: "保存智能体", exact: true }).click();
  await expect(agentsModule.getByText("智能体已保存到当前浏览器。", { exact: true })).toBeVisible();

  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const module = page.getByTestId("workflows-module");

  await module.locator(".workflow-create-card").click();
  const addKnowledge = module.getByRole("button", { name: "添加知识检索节点", exact: true });
  await expect(addKnowledge).toBeEnabled();
  await addKnowledge.click();
  await module.getByRole("button", { name: "选择云知识库", exact: true }).click();
  const workflowSelector = page.getByRole("dialog", { name: "云知识库选择", exact: true });
  await workflowSelector.getByRole("checkbox", { name: new RegExp(readyKnowledgeBases[1].name) }).check();
  await page.keyboard.press("Escape");
  await module.getByRole("button", { name: "添加智能体节点", exact: true }).click();
  await module.getByRole("button", { name: "节点智能体", exact: true }).click();
  await module.getByRole("listbox", { name: "节点智能体", exact: true }).getByRole("option", { name: "执行搭档", exact: true }).click();
  await module.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(module.getByText("工作流已保存到当前浏览器。", { exact: true })).toBeVisible();
  const storedWorkflow = (await readWorkspaceRecords<AgentWorkflowDefinition>(page, "workflows"))
    .find((workflow) => workflow.name === "新工作流");
  expect(storedWorkflow?.graph?.nodes.find((node) => node.kind === "knowledge")?.knowledgeBaseIds)
    .toEqual(readyKnowledgeBases.slice(0, 2).map((base) => base.id));

  await module.getByLabel("工作流初始任务", { exact: true }).fill("检查云端发布规范");
  await module.getByRole("button", { name: "运行工作流", exact: true }).click();
  await expect(module.getByText("工作流执行完成。", { exact: true })).toBeVisible();

  expect(apiHarness.knowledgeRetrievalRequests.length).toBeGreaterThanOrEqual(2);
  expect(apiHarness.knowledgeRetrievalRequests[0]).toMatchObject({
    query: "检查云端发布规范",
    knowledgeBaseIds: readyKnowledgeBases.slice(0, 3).map((base) => base.id),
    embeddingConnections: {
      openai: { apiKey: "e2e-openai-embedding-key" },
      qwen: { apiKey: "e2e-qwen-embedding-key" }
    }
  });
  const workflowRequests = apiHarness.agentRequests.filter((request) => request.moduleId === "workflows");
  expect(workflowRequests).toHaveLength(1);
  expect(workflowRequests[0]).toMatchObject({
    knowledgeBaseIds: [readyKnowledgeBases[2].id],
    embeddingConnections: {
      openai: { apiKey: "e2e-openai-embedding-key" }
    }
  });
  expect(apiHarness.agentKnowledgeCsrfHeaders.at(-1)).toBe(knowledgeCsrfToken);
  await expect(module.getByRole("region", { name: "知识来源", exact: true })).toBeVisible();
});

test("workflow aborts before provider calls when a referenced cloud base is no longer visible", async ({ page, apiHarness }) => {
  apiHarness.setKnowledgeSession(true);
  await seedKnowledgeEmbeddingConnections(page);
  await page.goto("/agents");
  await waitForPublicModule(page, destination("agents"));
  const agentsModule = page.getByTestId("agents-module");
  await agentsModule.getByRole("button", { name: "打开智能体 执行搭档", exact: true }).click();
  await agentsModule.getByRole("button", { name: "选择云知识库", exact: true }).click();
  const selector = page.getByRole("dialog", { name: "云知识库选择", exact: true });
  await selector.getByRole("checkbox", { name: new RegExp(readyKnowledgeBases[1].name) }).check();
  await page.keyboard.press("Escape");
  await agentsModule.getByRole("button", { name: "保存智能体", exact: true }).click();
  await expect(agentsModule.getByText("智能体已保存到当前浏览器。", { exact: true })).toBeVisible();

  apiHarness.setKnowledgeSession(true, [readyKnowledgeBases[0]]);
  const refresh = page.waitForResponse((response) => (
    response.request().method() === "GET" && new URL(response.url()).pathname === "/api/kb/bases"
  ));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("xi-ai-web:knowledge-session-changed", {
    detail: { authenticated: true }
  })));
  await refresh;

  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const workflowsModule = await openFirstWorkflow(page);
  await workflowsModule.getByLabel("工作流初始任务", { exact: true }).fill("验证全局云知识预检");
  await workflowsModule.getByRole("button", { name: "运行工作流", exact: true }).click();

  await expect(workflowsModule).toContainText("不存在或无权访问");
  expect(apiHarness.knowledgeRetrievalRequests).toHaveLength(0);
  expect(apiHarness.agentRequests.filter((request) => request.moduleId === "workflows")).toHaveLength(0);
});

test("workflow makes no partial agent calls when the global cloud preflight fails", async ({ page, apiHarness }) => {
  apiHarness.setKnowledgeSession(true);
  await seedKnowledgeEmbeddingConnections(page);
  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const module = page.getByTestId("workflows-module");

  await module.locator(".workflow-create-card").click();
  const addKnowledge = module.getByRole("button", { name: "添加知识检索节点", exact: true });
  await expect(addKnowledge).toBeEnabled();
  await addKnowledge.click();
  await module.getByRole("button", { name: "添加智能体节点", exact: true }).click();
  await module.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(module.getByText("工作流已保存到当前浏览器。", { exact: true })).toBeVisible();

  apiHarness.setKnowledgeRetrievalError({
    code: "KB_INDEX_NOT_READY",
    message: "全局云知识预检失败",
    status: 409
  });
  await module.getByLabel("工作流初始任务", { exact: true }).fill("验证失败预检不会产生部分调用");
  await module.getByRole("button", { name: "运行工作流", exact: true }).click();

  await expect(module).toContainText("全局云知识预检失败");
  expect(apiHarness.knowledgeRetrievalRequests).toHaveLength(1);
  expect(apiHarness.agentRequests.filter((request) => request.moduleId === "workflows")).toHaveLength(0);
});

test("Chat manages a local Skill and triggers it only for the selected conversation", async ({ page, apiHarness }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const module = page.getByTestId("chat-module");
  await expect(module.getByLabel("消息内容", { exact: true })).toBeVisible();

  await module.locator('button[aria-label="会话设置"]:visible').first().click();
  const settings = page.getByRole("dialog", { name: "会话设置", exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "对话 Skill", exact: true }).click();
  const manageSkills = settings.getByRole("button", { name: "管理本地 Skill", exact: true });
  const manageSkillsBox = await manageSkills.boundingBox();
  expect(manageSkillsBox?.height).toBeGreaterThanOrEqual(isMobileProject(testInfo.project.name) ? 44 : 34);
  await manageSkills.click();
  const manager = page.getByRole("dialog", { name: "对话 Skill", exact: true });
  await expect(manager).toBeVisible();
  await expect(settings).toHaveCount(0);
  await expect(page.locator('[data-scroll-owner="dialog"]:visible')).toHaveCount(1);
  const managerBox = await manager.boundingBox();
  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 981) {
    expect(managerBox?.width).toBeGreaterThanOrEqual(880);
  }
  const skillList = manager.locator(".figma-chat-skill-library > div");
  await expect.poll(async () => skillList.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await manager.getByRole("button", { name: "新建 Skill", exact: true }).click();
  const skillName = manager.getByLabel("名称", { exact: true });
  const skillInstructions = manager.getByLabel("Skill 指令", { exact: true });
  await skillName.fill("发布检查");
  await skillInstructions.fill("检查版本、回滚、监控和负责人，并输出缺口列表。");
  await expect.poll(() => skillName.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
  const idleSkillControlStyles = await skillName.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      borders: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor]
    };
  });
  const focusedSkillControlStyles = await skillInstructions.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      borders: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor]
    };
  });
  expect(idleSkillControlStyles.backgroundImage).toBe("none");
  expect(idleSkillControlStyles.boxShadow).toBe("none");
  expect(new Set(idleSkillControlStyles.borders).size).toBe(1);
  expect(focusedSkillControlStyles.backgroundImage).toBe("none");
  expect(focusedSkillControlStyles.boxShadow).not.toBe("none");
  expect(focusedSkillControlStyles.boxShadow).not.toContain("inset");
  expect(focusedSkillControlStyles.outlineStyle).toBe("none");
  expect(new Set(focusedSkillControlStyles.borders).size).toBe(1);
  await manager.getByRole("checkbox", { name: /联网搜索/ }).check();
  await manager.getByRole("button", { name: "保存 Skill", exact: true }).click();
  await expect(manager.getByText("Skill 已保存到当前浏览器。", { exact: true })).toBeVisible();
  await manager.getByRole("button", { name: "关闭对话 Skill", exact: true }).click();
  await expect(settings).toBeVisible();
  await expect(manageSkills).toBeFocused();
  await settings.getByRole("button", { name: "取消", exact: true }).click();

  const composer = module.getByLabel("消息内容", { exact: true });
  await composer.fill("$");
  await expect(module.getByRole("listbox", { name: "Skill命令", exact: true })).toBeVisible();
  await composer.press("Escape");
  await expect(module.getByRole("listbox", { name: "Skill命令", exact: true })).toHaveCount(0);
  await expect(composer).toHaveValue("$");
  await composer.fill("$发布");
  const skillCommands = module.getByRole("listbox", { name: "Skill命令", exact: true });
  await expect(skillCommands).toBeVisible();
  await expect(skillCommands.getByRole("option", { name: /发布检查/ })).toBeVisible();
  await composer.press("Enter");
  await expect(module.getByLabel("已选择的对话能力").getByText("$发布检查", { exact: true })).toBeVisible();
  const removeSkill = module.getByRole("button", { name: "移除 Skill 发布检查", exact: true });
  const removeSkillBox = await removeSkill.boundingBox();
  expect(removeSkillBox?.width).toBeGreaterThanOrEqual(isMobileProject(testInfo.project.name) ? 44 : 36);
  expect(removeSkillBox?.height).toBeGreaterThanOrEqual(isMobileProject(testInfo.project.name) ? 44 : 36);

  await composer.fill("为这次发布做最后检查");
  await module.getByRole("button", { name: "发送", exact: true }).click();
  await expect(module.getByText("Deterministic assistant response.", { exact: true })).toBeVisible();

  expect(apiHarness.chatRequests.at(-1)?.skillInstructions).toEqual([
    "发布检查: 检查版本、回滚、监控和负责人，并输出缺口列表。"
  ]);
  expect(apiHarness.chatRequests.at(-1)?.allowedTools).toEqual(["web_search"]);
  expect(apiHarness.chatRequests.at(-1)?.searchService).toMatchObject({
    provider: "glm",
    apiKey: "e2e-session-key"
  });

  await module.locator('button[aria-label="新对话"]:visible').first().click();
  const sessions = module.locator(".figma-chat-session");
  await expect(sessions).toHaveCount(2);
  const newSession = sessions.first();
  await newSession.getByLabel("消息内容", { exact: true }).fill("这是另一个不使用发布 Skill 的会话");
  await newSession.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(2);
  expect(apiHarness.chatRequests.at(-1)?.skillInstructions).toEqual([]);
  expect(apiHarness.chatRequests.at(-1)?.allowedTools).toEqual([]);

  await newSession.getByRole("button", { name: "选择对话模型", exact: true }).click();
  await newSession.getByRole("option", { name: /OpenAI Fast/ }).click();
  await expect(newSession.getByRole("button", { name: "网络搜索", exact: true })).toBeEnabled();
  await newSession.getByLabel("消息内容", { exact: true }).fill("$发布");
  await expect(newSession.getByRole("option", { name: /发布检查/ })).toBeEnabled();

  const stored = await readWorkspaceRecords<AgentSkillDefinition>(page, "agentSkills");
  expect(stored.some((skill) => skill.name === "发布检查" && skill.instructions.includes("回滚") && skill.allowedTools.includes("web_search"))).toBe(true);
});

test("Chat invokes an enabled application with slash for one request", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  const module = page.getByTestId("chat-module");
  const composer = module.getByLabel("消息内容", { exact: true });

  await composer.fill("/Test");
  const appCommands = module.getByRole("listbox", { name: "应用命令", exact: true });
  await expect(appCommands.getByRole("option", { name: /Test App/ })).toBeVisible();
  await appCommands.getByRole("option", { name: /Test App/ }).click();
  await expect(module.getByLabel("已选择的对话能力").getByText("/Test App", { exact: true })).toBeVisible();

  await composer.fill("介绍浏览器本地工作流");
  await module.getByRole("button", { name: "发送", exact: true }).click();
  await expect(module.getByText("Deterministic assistant response.", { exact: true })).toBeVisible();
  expect(apiHarness.chatRequests.at(-1)?.displayContent).toBe("介绍浏览器本地工作流");
  expect(apiHarness.chatRequests.at(-1)?.content).toContain("Return a deterministic result.");
  await expect(module.getByLabel("已选择的对话能力")).toHaveCount(0);

  await composer.fill("第二次普通提问");
  await module.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => apiHarness.chatRequests.length).toBe(2);
  expect(apiHarness.chatRequests.at(-1)?.content).toBe("第二次普通提问");
});

test("workflows execute steps in order and pass previous output forward", async ({ page, apiHarness }) => {
  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const module = await openFirstWorkflow(page);

  await expect.poll(async () => (await readWorkspaceRecords<AgentWorkflowDefinition>(page, "workflows")).length).toBeGreaterThan(0);
  await module.getByRole("textbox", { name: "工作流初始任务", exact: true }).fill("制定一次功能发布计划");
  await module.getByRole("button", { name: "运行工作流", exact: true }).click();
  await expect(module.getByText("工作流执行完成。", { exact: true })).toBeVisible();

  const requests = apiHarness.agentRequests.filter((request) => request.moduleId === "workflows");
  expect(requests).toHaveLength(2);
  expect(requests[0].prompt).toContain("生成执行方案");
  expect(requests[1].prompt).toContain("前一步输出");
  expect(requests[1].prompt).toContain("Workflow step completed");
});

test("workflow canvas blocks invalid links, persists its graph, and remains usable on mobile", async ({ page, apiHarness }, testInfo) => {
  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const module = await openFirstWorkflow(page);
  const canvas = module.getByTestId("workflow-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas.locator('[data-testid^="workflow-node-"]')).toHaveCount(4);
  await expect(canvas.locator(".react-flow__minimap")).toBeVisible();
  await expect(canvas.locator(".react-flow__minimap-node")).toHaveCount(4);
  if (!isMobileProject(testInfo.project.name)) {
    const canvasBox = await canvas.boundingBox();
    const startBox = await canvas.locator(".workflow-canvas-node.start").boundingBox();
    expect(canvasBox).toBeTruthy();
    expect(startBox).toBeTruthy();
    expect(startBox!.x).toBeGreaterThanOrEqual(canvasBox!.x - 2);
    expect(startBox!.x + startBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width + 2);

    await canvas.getByRole("button", { name: "适配工作流画布", exact: true }).click();
    await expect.poll(async () => {
      const currentCanvasBox = await canvas.boundingBox();
      const nodeBoxes = await canvas.locator('[data-testid^="workflow-node-"]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        })
      );
      if (!currentCanvasBox) return false;
      return nodeBoxes.every((box) =>
        box.left >= currentCanvasBox.x - 2 &&
        box.right <= currentCanvasBox.x + currentCanvasBox.width + 2 &&
        box.top >= currentCanvasBox.y - 2 &&
        box.bottom <= currentCanvasBox.y + currentCanvasBox.height + 2
      );
    }).toBe(true);
  }

  const firstEdge = canvas.locator(".react-flow__edge").first();
  await firstEdge.dispatchEvent("click");
  await module.getByRole("button", { name: "删除连线", exact: true }).click();
  await expect(module.locator(".workflow-graph-validation")).toBeVisible();
  await module.getByLabel("工作流初始任务", { exact: true }).fill("验证无效图不会调用模型");
  await module.getByRole("button", { name: "运行工作流", exact: true }).click();
  expect(apiHarness.agentRequests.filter((request) => request.moduleId === "workflows")).toHaveLength(0);

  await page.reload();
  await waitForPublicModule(page, destination("workflows"));
  const restoredModule = await openFirstWorkflow(page);
  const restoredCanvas = restoredModule.getByTestId("workflow-canvas");
  await expect(restoredCanvas.locator('[data-testid^="workflow-node-"]')).toHaveCount(4);
  await restoredModule.getByRole("button", { name: "添加智能体节点", exact: true }).click();
  await expect(restoredCanvas.locator('[data-testid^="workflow-node-"]')).toHaveCount(5);
  await restoredModule.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(restoredModule.getByText("工作流已保存到当前浏览器。", { exact: true })).toBeVisible();

  const saved = (await readWorkspaceRecords<AgentWorkflowDefinition>(page, "workflows"))
    .find((workflow) => workflow.id === "workflow-plan-and-review");
  expect(saved?.graph).toMatchObject({ version: 1 });
  expect(saved?.graph?.nodes).toHaveLength(5);
  expect(saved?.graph?.edges).toHaveLength(4);

  await page.reload();
  await waitForPublicModule(page, destination("workflows"));
  const reloadedModule = await openFirstWorkflow(page);
  await expect(reloadedModule.getByTestId("workflow-canvas").locator('[data-testid^="workflow-node-"]')).toHaveCount(5);

  if (isMobileProject(testInfo.project.name)) {
    const overflow = await documentOverflow(page);
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  }
});

test("automation workspace survives a full export and replace import round trip", async ({ page }) => {
  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const workflowsModule = await openFirstWorkflow(page);
  await workflowsModule.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(workflowsModule.getByText("工作流已保存到当前浏览器。", { exact: true })).toBeVisible();

  await page.goto("/agents");
  await waitForPublicModule(page, destination("agents"));
  await expect.poll(async () => ({
    agents: (await readWorkspaceRecords<UserAgentDefinition>(page, "userAgents")).length,
    skills: (await readWorkspaceRecords<AgentSkillDefinition>(page, "agentSkills")).length,
    workflows: (await readWorkspaceRecords<AgentWorkflowDefinition>(page, "workflows")).length
  })).toMatchObject({ agents: 5, skills: 2, workflows: 1 });

  const dialog = await openWorkspaceDialog(page);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出工作区", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const serialized = await fs.readFile(downloadPath!, "utf8");
  const archive = JSON.parse(serialized);
  expect(archive.counts).toMatchObject({ userAgents: 5, agentSkills: 2, workflows: 1 });
  expect(archive.workspace.workflows[0].graph).toMatchObject({ version: 1 });

  await dialog.getByLabel("选择工作区文件", { exact: true }).setInputFiles({
    name: "automation-roundtrip.xiworkspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(serialized)
  });
  await expect(dialog.getByText("导入预览", { exact: true })).toBeVisible();
  await dialog.getByRole("radio", { name: /替换/ }).check();
  await dialog.getByRole("button", { name: "替换工作区", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "替换完整工作区？", exact: true });
  await confirmation.getByRole("button", { name: "确认替换", exact: true }).click();
  await page.waitForLoadState("domcontentloaded");
  await waitForPublicModule(page, destination("agents"));

  await expect.poll(async () => ({
    agents: (await readWorkspaceRecords<UserAgentDefinition>(page, "userAgents")).length,
    skills: (await readWorkspaceRecords<AgentSkillDefinition>(page, "agentSkills")).length,
    workflows: (await readWorkspaceRecords<AgentWorkflowDefinition>(page, "workflows")).length
  })).toEqual({ agents: 5, skills: 2, workflows: 1 });
  const restored = (await readWorkspaceRecords<AgentWorkflowDefinition>(page, "workflows"))[0];
  expect(restored.graph).toMatchObject({ version: 1 });
});

test("workflow reports a failed step when its referenced agent was deleted", async ({ page, apiHarness }) => {
  await page.goto("/agents");
  await waitForPublicModule(page, destination("agents"));
  const agentsModule = page.getByTestId("agents-module");
  await agentsModule.getByRole("button", { name: "打开智能体 执行搭档", exact: true }).click();
  await agentsModule.getByRole("button", { name: "删除", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "删除智能体“执行搭档”？", exact: true });
  await confirmation.getByRole("button", { name: "删除智能体", exact: true }).click();
  await expect(agentsModule.getByText("智能体已删除。", { exact: true })).toBeVisible();
  await expect.poll(async () => (await readWorkspaceRecords<UserAgentDefinition>(page, "userAgents")).length).toBe(4);

  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const workflowsModule = await openFirstWorkflow(page);
  await workflowsModule.getByRole("textbox", { name: "工作流初始任务", exact: true }).fill("验证失效引用");
  await workflowsModule.getByRole("button", { name: "运行工作流", exact: true }).click();

  await expect(workflowsModule.locator(".workflow-graph-validation")).toContainText("引用的智能体已不存在");
  await expect(workflowsModule.locator(".workflow-run-timeline")).toContainText("失败");
  expect(apiHarness.agentRequests.filter((request) => request.moduleId === "workflows")).toHaveLength(0);
});

test("workflow preset nodes render templates and retrieve selected local knowledge", async ({ page, apiHarness }) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  await seedKnowledgeDocument(page);
  await page.goto("/workflows");
  await waitForPublicModule(page, destination("workflows"));
  const module = page.getByTestId("workflows-module");

  await module.locator(".workflow-create-card").click();
  await expect(module.getByTestId("workflow-canvas")).toBeVisible();
  await module.getByLabel("名称", { exact: true }).fill("知识发布检查");
  await module.getByRole("button", { name: "添加文本模板节点", exact: true }).click();
  await module.getByRole("button", { name: "添加知识检索节点", exact: true }).click();
  await module.getByRole("button", { name: "添加智能体节点", exact: true }).click();
  await module.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(module.getByText("工作流已保存到当前浏览器。", { exact: true })).toBeVisible();

  await module.getByLabel("工作流初始任务", { exact: true }).fill("发布前需要检查什么？");
  await module.getByRole("button", { name: "运行工作流", exact: true }).click();
  await expect(module.getByText("工作流执行完成。", { exact: true })).toBeVisible();
  const workflowRequest = apiHarness.agentRequests.find((request) => request.moduleId === "workflows" && request.prompt.includes("发布手册.txt"));
  expect(workflowRequest?.prompt).toContain("回滚演练");

  const stored = (await readWorkspaceRecords<AgentWorkflowDefinition>(page, "workflows"))
    .find((workflow) => workflow.name === "知识发布检查");
  expect(stored?.graph?.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining(["start", "template", "knowledge", "agent", "reply"]));
});
