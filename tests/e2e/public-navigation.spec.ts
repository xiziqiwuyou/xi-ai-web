import {
  expect,
  isMobileProject,
  navigationAction,
  openMobileNavigation,
  publicBootstrapFixture,
  publicDestinations,
  seedReadyProvider,
  test,
  visibleModuleNavigation,
  waitForPublicModule
} from "./support/app-fixture";

test.beforeEach(async ({ page }) => {
  await seedReadyProvider(page);
});

test("public routes are canonical, titled, and selected", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const mobile = isMobileProject(testInfo.project.name);

  for (const destination of publicDestinations) {
    await page.goto(destination.path);
    await waitForPublicModule(page, destination);

    if (mobile) await openMobileNavigation(page);

    await expect(visibleModuleNavigation(page)).toHaveClass(/figma-navigation/);
    await expect(navigationAction(page, destination.label)).toHaveClass(/figma-nav-item/);
    await expect(navigationAction(page, destination.label)).toHaveAttribute("aria-current", "page");
  }
});

test("public root resolves to the Chat workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page).toHaveTitle("AI \u5bf9\u8bdd - xi-ai-web");
});

test("admin-managed menu labels appear in public navigation and document titles", async ({ page, apiHarness }, testInfo) => {
  const customPptLabel = "一键ppt";
  apiHarness.setBootstrap({
    ...publicBootstrapFixture,
    menuItems: publicBootstrapFixture.menuItems.map((item) => (
      item.id === "ppt" ? { ...item, label: customPptLabel } : item
    ))
  });

  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  if (isMobileProject(testInfo.project.name)) await openMobileNavigation(page);

  const customPptAction = navigationAction(page, customPptLabel);
  await expect(customPptAction).toBeVisible();
  await expect(navigationAction(page, "AI 一键 PPT")).toHaveCount(0);
  await customPptAction.click();

  await expect(page).toHaveURL(/\/ppt$/);
  await expect(page).toHaveTitle(`${customPptLabel} - xi-ai-web`);
  await expect(page.locator("[data-active-module='ppt']")).toBeVisible();
});

test("selected public navigation stays flat without a drop shadow", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  if (isMobileProject(testInfo.project.name)) await openMobileNavigation(page);

  const activeNavigation = navigationAction(page, publicDestinations[0].label);
  await expect(activeNavigation).toHaveAttribute("aria-current", "page");
  expect(await activeNavigation.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
});

test("public shell scrollbars reveal only for the active scroll event", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo.project.name), "Desktop shell owns both navigation and workspace scrollers");
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/image");
  await waitForPublicModule(page, publicDestinations[1]);

  const navigation = page.locator(".figma-navigation");
  const workspace = page.locator(".figma-workspace");
  const scrollbarVisual = (selector: ".figma-navigation" | ".figma-workspace") => page.locator(selector).evaluate((element) => ({
    color: getComputedStyle(element).scrollbarColor,
    thumb: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor
  }));

  expect(await navigation.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
  expect(await workspace.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();

  const workspaceIdle = await scrollbarVisual(".figma-workspace");
  await workspace.hover();
  expect(await scrollbarVisual(".figma-workspace")).toEqual(workspaceIdle);
  await expect(workspace).toHaveAttribute("data-scroll-active", "false");

  await navigation.hover();
  await page.mouse.wheel(0, 180);
  await expect(navigation).toHaveAttribute("data-scroll-active", "true");
  await expect(workspace).toHaveAttribute("data-scroll-active", "false");
  const navigationActive = await scrollbarVisual(".figma-navigation");

  await workspace.hover();
  await page.mouse.wheel(0, 220);
  await expect(workspace).toHaveAttribute("data-scroll-active", "true");
  await expect(navigation).toHaveAttribute("data-scroll-active", "false");
  expect(await scrollbarVisual(".figma-workspace")).not.toEqual(workspaceIdle);
  expect(navigationActive).not.toEqual(await scrollbarVisual(".figma-navigation"));

  await expect(workspace).toHaveAttribute("data-scroll-active", "false", { timeout: 1_200 });
  expect(await scrollbarVisual(".figma-workspace")).toEqual(workspaceIdle);
});

test("entering Image Generation resets the public workspace to the top", async ({ page }, testInfo) => {
  const mobile = isMobileProject(testInfo.project.name);
  const source = publicDestinations.find((destination) => destination.id === "ppt")!;
  const image = publicDestinations.find((destination) => destination.id === "image")!;
  await page.setViewportSize({ width: mobile ? 390 : 1280, height: 600 });
  await page.goto(source.path);
  await waitForPublicModule(page, source);

  const workspace = page.locator(".figma-workspace");
  await expect.poll(() => workspace.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await workspace.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => workspace.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  if (mobile) await openMobileNavigation(page);
  await navigationAction(page, image.label).click();
  await waitForPublicModule(page, image);

  await expect.poll(() => workspace.evaluate((element) => element.scrollTop)).toBe(0);
});

test("invalid public paths resolve to the configured default", async ({ page }) => {
  await page.goto("/not-a-public-module");

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page).toHaveTitle("AI \u5bf9\u8bdd - xi-ai-web");
  await openMobileNavigation(page);
  await expect(navigationAction(page, publicDestinations[0].label)).toHaveAttribute("aria-current", "page");
});

test("legacy Skill route resolves to Chat and never appears in navigation", async ({ page }) => {
  await page.goto("/skills");
  await expect(page).toHaveURL(/\/chat$/);
  await waitForPublicModule(page, publicDestinations[0]);
  await expect(visibleModuleNavigation(page).getByRole("button", { name: "Skill", exact: true })).toHaveCount(0);
});

test("menu navigation participates in browser back and forward history", async ({ page }, testInfo) => {
  const mobile = isMobileProject(testInfo.project.name);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  if (mobile) await openMobileNavigation(page);

  await navigationAction(page, publicDestinations[1].label).click();
  await expect(page).toHaveURL(/\/image$/);
  await expect(page).toHaveTitle("\u56fe\u50cf\u751f\u6210 - xi-ai-web");

  if (mobile) await openMobileNavigation(page);
  const mindmap = publicDestinations.find((destination) => destination.id === "mindmap")!;
  await navigationAction(page, mindmap.label).click();
  await expect(page).toHaveURL(/\/mindmap$/);
  await expect(page).toHaveTitle("\u601d\u7ef4\u5bfc\u56fe - xi-ai-web");

  await page.goBack();
  await expect(page).toHaveURL(/\/image$/);
  if (mobile) await openMobileNavigation(page);
  await expect(navigationAction(page, publicDestinations[1].label)).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/\/chat$/);
  if (mobile) await openMobileNavigation(page);
  await expect(navigationAction(page, publicDestinations[0].label)).toHaveAttribute("aria-current", "page");

  await page.goForward();
  await expect(page).toHaveURL(/\/image$/);
  if (mobile) await openMobileNavigation(page);
  await expect(navigationAction(page, publicDestinations[1].label)).toHaveAttribute("aria-current", "page");

  await page.goForward();
  await expect(page).toHaveURL(/\/mindmap$/);
  if (mobile) await openMobileNavigation(page);
  await expect(navigationAction(page, mindmap.label)).toHaveAttribute("aria-current", "page");
});

test("navigation intent preloads cold module code without changing the active route", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "4g", saveData: true }
    });
  });

  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  if (isMobileProject(testInfo.project.name)) await openMobileNavigation(page);

  const agents = publicDestinations.find((destination) => destination.id === "agents")!;
  const image = publicDestinations.find((destination) => destination.id === "image")!;
  const automationRequestPromise = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/src/features/automation/AutomationModule.tsx")
  );

  if (isMobileProject(testInfo.project.name)) {
    await navigationAction(page, agents.label).dispatchEvent("pointerdown", {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      pointerType: "touch"
    });
  } else {
    await navigationAction(page, agents.label).hover();
  }

  const automationRequest = await automationRequestPromise;
  expect(automationRequest.method()).toBe("GET");
  expect(automationRequest.resourceType()).toBe("script");

  const studioRequestPromise = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/src/features/studio/StudioModule.tsx")
  );
  await navigationAction(page, image.label).focus();
  await expect(navigationAction(page, image.label)).toBeFocused();
  const studioRequest = await studioRequestPromise;
  expect(studioRequest.method()).toBe("GET");
  expect(studioRequest.resourceType()).toBe("script");

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.locator("[data-active-module]")).toHaveAttribute("data-active-module", "chat");
  await expect(page.locator("[data-module-transition]")).toHaveAttribute("data-module-transition", "idle");
  await expect(navigationAction(page, agents.label)).not.toHaveAttribute("aria-current", "page");
  await expect(navigationAction(page, image.label)).not.toHaveAttribute("aria-current", "page");
});

test("ready menu destinations switch through brief canvas fade phases", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "4g", saveData: true }
    });
  });
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  if (isMobileProject(testInfo.project.name)) await openMobileNavigation(page);

  await page.evaluate(() => {
    type TransitionSample = { moduleId: string; phase: string; durationMs: number };
    const trackedWindow = window as typeof window & { __moduleCanvasTransitions?: TransitionSample[] };
    trackedWindow.__moduleCanvasTransitions = [];
    const record = () => {
      const canvas = document.querySelector<HTMLElement>("[data-module-canvas]");
      if (!canvas) return;
      const duration = getComputedStyle(canvas).animationDuration.trim();
      const durationMs = duration.endsWith("ms")
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1000;
      trackedWindow.__moduleCanvasTransitions?.push({
        moduleId: canvas.dataset.moduleCanvas || "",
        phase: canvas.dataset.transitionPhase || "",
        durationMs: Number.isFinite(durationMs) ? durationMs : 0
      });
    };
    record();
    new MutationObserver(record).observe(document.querySelector("#workspace-main")!, {
      attributes: true,
      attributeFilter: ["data-module-canvas", "data-transition-phase"],
      childList: true,
      subtree: true
    });
  });

  const image = publicDestinations.find((destination) => destination.id === "image")!;
  await navigationAction(page, image.label).dispatchEvent("click");
  await waitForPublicModule(page, image);
  await expect(page.locator("[data-module-canvas='image']")).toHaveAttribute("data-transition-phase", "idle");

  const samples = await page.evaluate(() => (
    window as typeof window & {
      __moduleCanvasTransitions?: Array<{ moduleId: string; phase: string; durationMs: number }>;
    }
  ).__moduleCanvasTransitions || []);
  const exitingIndex = samples.findIndex((sample) => sample.moduleId === "chat" && sample.phase === "exiting");
  const enteringIndex = samples.findIndex((sample) => sample.moduleId === "image" && sample.phase === "entering");
  const settledIndex = samples.findIndex((sample, index) => (
    index > enteringIndex && sample.moduleId === "image" && sample.phase === "idle"
  ));

  expect(exitingIndex).toBeGreaterThanOrEqual(0);
  expect(enteringIndex).toBeGreaterThan(exitingIndex);
  expect(settledIndex).toBeGreaterThan(enteringIndex);
  expect(samples[exitingIndex].durationMs).toBeGreaterThan(0);
  expect(samples[enteringIndex].durationMs).toBeGreaterThan(0);
  expect(samples[exitingIndex].durationMs + samples[enteringIndex].durationMs).toBeLessThanOrEqual(220);
});

test("pending module transitions preserve the shell and complete with reduced motion and focus", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const mobile = isMobileProject(testInfo.project.name);
  const target = publicDestinations.find((destination) => destination.id === "mindmap")!;
  let releaseStudioModule!: () => void;
  let markStudioRequested!: () => void;
  const studioModuleGate = new Promise<void>((resolve) => {
    releaseStudioModule = resolve;
  });
  const studioModuleRequested = new Promise<void>((resolve) => {
    markStudioRequested = resolve;
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "4g", saveData: true }
    });
  });
  await page.route(/\/src\/features\/studio\/StudioModule\.tsx(?:\?.*)?$/, async (route) => {
    markStudioRequested();
    await studioModuleGate;
    await route.continue();
  });

  try {
    await page.goto("/chat");
    await waitForPublicModule(page, publicDestinations[0]);
    if (mobile) await openMobileNavigation(page);

    const geometryBefore = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".figma-studio-shell")!.getBoundingClientRect();
      const workspace = document.querySelector<HTMLElement>("#workspace-main")!.getBoundingClientRect();
      const canvas = document.querySelector<HTMLElement>("[data-module-canvas='chat']")!.getBoundingClientRect();
      return {
        shell: { x: shell.x, y: shell.y, width: shell.width, height: shell.height },
        workspace: { x: workspace.x, y: workspace.y, width: workspace.width, height: workspace.height },
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height }
      };
    });

    await navigationAction(page, target.label).dispatchEvent("click");
    await studioModuleRequested;

    const shell = page.locator(".figma-studio-shell");
    const workspace = page.locator("#workspace-main");
    const status = page.getByRole("status").filter({ hasText: `正在打开 ${target.label}` });
    await expect(shell).toHaveAttribute("data-module-transition", "pending");
    await expect(page.locator("[data-module-canvas='chat']")).toHaveAttribute("aria-busy", "true");
    await expect(status).toBeVisible();
    await expect(status).toContainText(target.label);
    await expect(status.locator(".figma-module-transition-rail > i")).toBeVisible();
    await expect(page.getByTestId("chat-module")).toBeVisible();
    await expect(page.locator("[data-module-canvas='chat']")).toBeVisible();
    await expect(page).toHaveURL(/\/mindmap$/);

    const geometryPending = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".figma-studio-shell")!.getBoundingClientRect();
      const workspace = document.querySelector<HTMLElement>("#workspace-main")!.getBoundingClientRect();
      const canvas = document.querySelector<HTMLElement>(".figma-workspace-canvas")!.getBoundingClientRect();
      const status = document.querySelector<HTMLElement>(".figma-module-transition")!.getBoundingClientRect();
      return {
        shell: { x: shell.x, y: shell.y, width: shell.width, height: shell.height },
        workspace: { x: workspace.x, y: workspace.y, width: workspace.width, height: workspace.height },
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
        status: { width: status.width, height: status.height }
      };
    });

    for (const region of ["shell", "workspace", "canvas"] as const) {
      expect(geometryPending[region].x).toBeCloseTo(geometryBefore[region].x, 0);
      expect(geometryPending[region].y).toBeCloseTo(geometryBefore[region].y, 0);
      expect(geometryPending[region].width).toBeCloseTo(geometryBefore[region].width, 0);
      expect(geometryPending[region].height).toBeCloseTo(geometryBefore[region].height, 0);
    }
    expect(geometryPending.status.height).toBeLessThan(64);
    expect(geometryPending.status.width).toBeLessThanOrEqual(geometryPending.workspace.width);

    const reducedMotion = await status.evaluate((element) => {
      const durationMs = (value: string) => Math.max(...value.split(",").map((duration) => {
        const normalized = duration.trim();
        return normalized.endsWith("ms") ? Number.parseFloat(normalized) : Number.parseFloat(normalized) * 1000;
      }));
      return {
        matches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        indicators: [
          element.querySelector<HTMLElement>(".figma-module-transition-rail > i")!,
          element.querySelector<SVGElement>(".figma-module-transition-spinner svg")!
        ].map((indicator) => {
          const style = getComputedStyle(indicator);
          return {
            animationDurationMs: durationMs(style.animationDuration),
            animationIterationCount: style.animationIterationCount,
            transitionDurationMs: durationMs(style.transitionDuration)
          };
        })
      };
    });
    expect(reducedMotion.matches).toBe(true);
    for (const indicator of reducedMotion.indicators) {
      expect(indicator.animationDurationMs).toBeLessThanOrEqual(1);
      expect(indicator.animationIterationCount).not.toBe("infinite");
      expect(indicator.transitionDurationMs).toBeLessThanOrEqual(1);
    }

    releaseStudioModule();
    await waitForPublicModule(page, target);
    await expect(page).toHaveTitle(`${target.label} - xi-ai-web`);
    await expect(page.getByTestId("mindmap-module")).toBeVisible();
    await expect(status).toHaveCount(0);
    await expect(shell).toHaveAttribute("data-module-transition", "idle");
    await expect(page.locator("[data-module-canvas='mindmap']")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByTestId("chat-module")).toHaveCount(0);
    if (mobile) {
      await expect(workspace).toBeFocused();
    } else {
      await expect(navigationAction(page, target.label)).toHaveAttribute("aria-current", "page");
    }
  } finally {
    releaseStudioModule();
  }
});

test("failed module loads preserve the current page and retry cleanly", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "4g", saveData: true }
    });
  });
  let failStudioRequest = true;
  await page.route(/\/src\/features\/studio\/StudioModule\.tsx(?:\?.*)?$/, async (route) => {
    if (failStudioRequest) {
      failStudioRequest = false;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  if (isMobileProject(testInfo.project.name)) await openMobileNavigation(page);
  const image = publicDestinations.find((destination) => destination.id === "image")!;
  await navigationAction(page, image.label).dispatchEvent("click");

  const error = page.getByRole("alert").filter({ hasText: `无法打开 ${image.label}` });
  await expect(error).toBeVisible();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByTestId("chat-module")).toBeVisible();
  await expect(page.locator("[data-module-transition]")).toHaveAttribute("data-module-transition", "idle");

  await error.getByRole("button", { name: "重试", exact: true }).click();
  await waitForPublicModule(page, image);
  await expect(page.getByTestId("image-module")).toBeVisible();
  await expect(error).toHaveCount(0);
});

test("rapid navigation keeps the last requested module", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "4g", saveData: true }
    });
  });
  let releaseStudio!: () => void;
  let markStudioRequested!: () => void;
  const studioGate = new Promise<void>((resolve) => { releaseStudio = resolve; });
  const studioRequested = new Promise<void>((resolve) => { markStudioRequested = resolve; });
  await page.route(/\/src\/features\/studio\/StudioModule\.tsx(?:\?.*)?$/, async (route) => {
    markStudioRequested();
    await studioGate;
    await route.continue();
  });

  try {
    await page.goto("/chat");
    await waitForPublicModule(page, publicDestinations[0]);
    const mobile = isMobileProject(testInfo.project.name);
    if (mobile) await openMobileNavigation(page);
    const mindmap = publicDestinations.find((destination) => destination.id === "mindmap")!;
    const agents = publicDestinations.find((destination) => destination.id === "agents")!;

    await navigationAction(page, mindmap.label).dispatchEvent("click");
    await studioRequested;
    await expect(page.locator("[data-module-transition]")).toHaveAttribute("data-module-transition", "pending");
    if (mobile) await openMobileNavigation(page);
    await navigationAction(page, agents.label).dispatchEvent("click");
    await waitForPublicModule(page, agents);
    await expect(page.getByTestId("agents-module")).toBeVisible();

    releaseStudio();
    await page.waitForTimeout(100);
    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.locator("[data-active-module]")).toHaveAttribute("data-active-module", "agents");
    await expect(page.getByTestId("mindmap-module")).toHaveCount(0);
  } finally {
    releaseStudio();
  }
});

test("automation destinations are reachable from the public menu", async ({ page }, testInfo) => {
  const mobile = isMobileProject(testInfo.project.name);
  const automationDestinations = publicDestinations.filter((destination) =>
    destination.id === "agents" || destination.id === "workflows"
  );

  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  for (const destination of automationDestinations) {
    if (mobile) await openMobileNavigation(page);
    await navigationAction(page, destination.label).click();
    await waitForPublicModule(page, destination);
    await expect(page.getByTestId(`${destination.id}-module`)).toBeVisible();
  }
});

test("public menu keeps the approved order and has no admin entry", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
  if (isMobileProject(testInfo.project.name)) await openMobileNavigation(page);
  const navigation = visibleModuleNavigation(page);
  const actions = navigation.locator(".figma-nav-item");
  const names = await actions.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label"))
  );

  const expectedNames = publicDestinations.map((destination) => destination.label);

  await expect(actions).toHaveCount(publicDestinations.length);
  expect(names).toEqual(expectedNames);
  for (const retiredLabel of ["\u5bf9\u8bdd", "\u7ed8\u753b", "\u5e94\u7528", "\u753b\u5eca"]) {
    await expect(navigation.getByRole("button", { name: retiredLabel, exact: true })).toHaveCount(0);
  }
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  await expect(page.locator('a[href="/xizi2333"]')).toHaveCount(0);
});

test("mobile menu closes on Escape and restores its trigger", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile navigation contract");
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  const trigger = page.getByRole("button", { name: "\u6253\u5f00\u529f\u80fd\u83dc\u5355", exact: true });
  await trigger.click();
  await expect(page.locator(".figma-sidebar.mobile-open")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".figma-sidebar")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("mobile menu closes on route selection, moves focus, and resets across the desktop breakpoint", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), "Mobile navigation contract");
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);

  await openMobileNavigation(page);
  await navigationAction(page, publicDestinations[1].label).click();
  await expect(page).toHaveURL(/\/image$/);
  await waitForPublicModule(page, publicDestinations[1]);
  await expect(page.locator(".figma-sidebar.mobile-open")).toHaveCount(0);
  await expect(page.locator("#workspace-main")).toBeFocused();

  await openMobileNavigation(page);
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.locator(".figma-sidebar.mobile-open")).toHaveCount(0);
  await expect(page.locator(".figma-mobile-header")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".figma-mobile-header")).toBeVisible();
  await expect(page.locator(".figma-sidebar")).toBeHidden();
});
