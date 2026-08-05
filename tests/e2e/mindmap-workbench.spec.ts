import { readFile } from "node:fs/promises";

import {
  documentOverflow,
  expect,
  isMobileProject,
  publicDestinations,
  seedReadyProvider,
  test,
  waitForPublicModule
} from "./support/app-fixture";

const mindmapDestination = publicDestinations.find((destination) => destination.id === "mindmap");

async function openMindmap(page: Parameters<typeof waitForPublicModule>[0]) {
  if (!mindmapDestination) throw new Error("Mind Map destination is missing from the public fixture");
  await page.goto(mindmapDestination.path);
  await waitForPublicModule(page, mindmapDestination);
  return page.getByTestId("mindmap-module");
}

async function generateMindmap(
  page: Parameters<typeof waitForPublicModule>[0],
  topic = "制定新产品上线计划"
) {
  const module = await openMindmap(page);
  await module.getByRole("textbox", { name: "导图主题", exact: true }).fill(topic);
  await module.getByRole("button", { name: "AI 生成导图", exact: true }).click();
  await expect(module.getByRole("status")).toContainText("思维导图已生成");
  return module;
}

async function downloadedText(page: Parameters<typeof waitForPublicModule>[0], buttonName: string) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("mindmap-module").getByRole("button", { name: buttonName, exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  return {
    download,
    content: await readFile(path!, "utf8")
  };
}

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
});

test("local node edits update the map without another provider request", async ({ page, apiHarness }) => {
  const module = await generateMindmap(page);
  await expect.poll(() => apiHarness.generationRequests.length).toBe(1);

  await module.getByRole("button", { name: "选择节点 目标与价值", exact: true }).click();
  const inspector = module.getByRole("complementary", { name: "选中节点编辑", exact: true });
  const nodeName = inspector.getByRole("textbox", { name: "节点名称", exact: true });
  const note = inspector.getByRole("textbox", { name: "补充说明", exact: true });
  await nodeName.fill("用户目标");
  await note.fill("先验证目标用户是否认可核心价值");
  await expect(module.getByRole("button", { name: "选择节点 用户目标", exact: true })).toBeVisible();

  await inspector.getByRole("button", { name: "添加子节点", exact: true }).click();
  await expect(module.locator(".figma-map-tree-node")).toHaveCount(7);
  await expect(nodeName).toHaveValue("新节点");
  await nodeName.fill("验证指标");
  await inspector.getByRole("button", { name: "上移", exact: true }).click();

  await module.getByRole("button", { name: "源码", exact: true }).click();
  const sourceDialog = page.getByRole("dialog", { name: "Markdown 源码", exact: true });
  const source = await sourceDialog.locator("textarea").inputValue();
  expect(source.indexOf("### 验证指标")).toBeLessThan(source.indexOf("### 成功标准"));
  expect(source).toContain("> 先验证目标用户是否认可核心价值");
  await sourceDialog.getByRole("button", { name: "取消", exact: true }).click();

  await inspector.getByRole("button", { name: "删除节点", exact: true }).click();
  await expect(module.locator(".figma-map-tree-node")).toHaveCount(6);
  await expect(module.getByRole("button", { name: "选择节点 验证指标", exact: true })).toHaveCount(0);
  expect(apiHarness.generationRequests).toHaveLength(1);
});

test("AI expansion updates the selected branch and reorganization replaces the whole tree", async ({ page, apiHarness }) => {
  const module = await generateMindmap(page, "建设客户成功体系");
  await module.getByRole("button", { name: "选择节点 行动路径", exact: true }).click();
  await module.getByRole("button", { name: "AI 扩展此节点", exact: true }).click();

  await expect.poll(() => apiHarness.generationRequests.length).toBe(2);
  expect(apiHarness.generationRequests[1].payload.options?.mindmap).toMatchObject({
    operation: "expand",
    targetNodeId: "branch-two"
  });
  expect(apiHarness.generationRequests[1].payload.options?.mindmap?.currentDocument?.root.children)
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "branch-one", label: "目标与价值" }),
      expect.objectContaining({ id: "branch-two", label: "行动路径" })
    ]));
  await expect(module.getByRole("button", { name: "选择节点 AI 新增节点", exact: true })).toBeVisible();
  await expect(module.getByRole("button", { name: "选择节点 目标与价值", exact: true })).toBeVisible();
  await expect(module.locator(".figma-map-tree-node")).toHaveCount(7);

  await module.getByRole("button", { name: "AI 重组", exact: true }).click();
  await expect.poll(() => apiHarness.generationRequests.length).toBe(3);
  expect(apiHarness.generationRequests[2].payload.options?.mindmap).toMatchObject({ operation: "reorganize" });
  expect(apiHarness.generationRequests[2].payload.options?.mindmap?.currentDocument?.root.children[1])
    .toMatchObject({ id: "branch-two", children: expect.arrayContaining([expect.objectContaining({ id: "expanded-evidence" })]) });

  await module.getByRole("button", { name: "源码", exact: true }).click();
  const reorganizedSource = await page.getByRole("dialog", { name: "Markdown 源码", exact: true })
    .locator("textarea")
    .inputValue();
  expect(reorganizedSource.indexOf("## 风险与验证")).toBeLessThan(reorganizedSource.indexOf("## 行动路径"));
  expect(reorganizedSource.indexOf("## 行动路径")).toBeLessThan(reorganizedSource.indexOf("## 目标与价值"));
});

test("source editing, clipboard and every export use the current document", async ({ page, context, apiHarness }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const module = await openMindmap(page);
  await module.getByRole("button", { name: "源码", exact: true }).click();
  const sourceDialog = page.getByRole("dialog", { name: "Markdown 源码", exact: true });
  await sourceDialog.locator("textarea").fill([
    "# 发布计划",
    "> 面向正式上线的执行导图",
    "## 上线准备",
    "### 内容检查",
    "## 发布执行"
  ].join("\n"));
  await sourceDialog.getByRole("button", { name: "应用源码", exact: true }).click();

  await expect(module.locator(".figma-map-toolbar > div:first-child > strong")).toHaveText("发布计划");
  await expect(module.locator(".figma-map-tree-node")).toHaveCount(4);
  expect(apiHarness.generationRequests).toHaveLength(0);

  await module.getByRole("button", { name: "复制", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("# 发布计划");

  const markdown = await downloadedText(page, "Markdown");
  expect(markdown.download.suggestedFilename()).toBe("mindmap.md");
  expect(markdown.content).toContain("### 内容检查");

  const mermaid = await downloadedText(page, "Mermaid");
  expect(mermaid.download.suggestedFilename()).toBe("mindmap.mmd");
  expect(mermaid.content).toContain("root((发布计划 · 面向正式上线的执行导图))");

  const svg = await downloadedText(page, "SVG");
  expect(svg.download.suggestedFilename()).toBe("mindmap.svg");
  expect(svg.content).toContain("<svg");
  expect(svg.content).toContain("内容检查");

  const pngPromise = page.waitForEvent("download");
  await module.getByRole("button", { name: "PNG", exact: true }).click();
  const png = await pngPromise;
  const pngPath = await png.path();
  expect(png.suggestedFilename()).toBe("mindmap.png");
  expect(pngPath).toBeTruthy();
  const pngBytes = await readFile(pngPath!);
  expect(Array.from(pngBytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test("mobile workbench keeps overflow internal and primary controls touchable", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile geometry contract");
  const module = await openMindmap(page);
  const overflow = await documentOverflow(page);
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);

  const workspace = await module.locator(".figma-map-workspace").boundingBox();
  expect(workspace).not.toBeNull();
  expect(workspace!.x).toBeGreaterThanOrEqual(-0.5);
  expect(workspace!.x + workspace!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);

  const viewportMetrics = await module.locator(".figma-map-viewport").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX
  }));
  expect(viewportMetrics.scrollWidth).toBeGreaterThan(viewportMetrics.clientWidth);
  expect(viewportMetrics.overflowX).toMatch(/auto|scroll/);

  for (const controlName of ["AI 生成导图", "AI 重组", "添加子节点", "AI 扩展此节点"] as const) {
    const box = await module.getByRole("button", { name: controlName, exact: true }).boundingBox();
    expect(box, `${controlName} should stay touchable`).not.toBeNull();
    expect(box!.height, `${controlName} should be at least 44px high`).toBeGreaterThanOrEqual(44);
  }
});
