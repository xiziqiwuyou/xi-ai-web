import { expect, test as base, type Page } from "@playwright/test";
import type {
  AdminStatus,
  PublicBootstrapPayload,
  UserProviderConfig
} from "../../../src/types";

export const providerStorageKey = "cherry-web-user-provider";

export const readyProvider: UserProviderConfig = {
  baseUrl: "https://api.example.test/v1",
  apiKey: "e2e-session-key",
  lastModelId: "test-chat"
};

export const publicDestinations = [
  { id: "chat", path: "/chat", label: "\u5bf9\u8bdd", mobileLabel: "\u5bf9\u8bdd" },
  { id: "image", path: "/image", label: "\u7ed8\u753b", mobileLabel: "\u7ed8\u753b" },
  { id: "mindmap", path: "/mindmap", label: "\u601d\u7ef4\u5bfc\u56fe", mobileLabel: "\u601d\u7ef4\u5bfc\u56fe" },
  { id: "agents", path: "/agents", label: "\u667a\u80fd\u4f53", mobileLabel: "\u667a\u80fd\u4f53" },
  { id: "apps", path: "/apps", label: "\u5e94\u7528", mobileLabel: "\u66f4\u591a\u529f\u80fd" },
  { id: "gallery", path: "/gallery", label: "\u753b\u5eca", mobileLabel: "\u66f4\u591a\u529f\u80fd" }
] as const;

export const publicBootstrapFixture: PublicBootstrapPayload = {
  settings: {
    siteName: "xi-ai-web",
    theme: "rednote",
    allowGuestChat: true,
    defaultModule: "chat"
  },
  menuItems: publicDestinations.map((destination, index) => ({
    id: destination.id,
    label: destination.label,
    enabled: true,
    visible: true,
    order: (index + 1) * 10
  })),
  modelCatalog: [
    {
      id: "test-chat",
      vendor: "openai-compatible",
      model: "test-chat",
      label: "Test Chat",
      capabilities: ["chat", "vision", "toolCalling", "streaming"],
      defaultFor: ["chat"],
      enabled: true
    },
    {
      id: "test-image",
      vendor: "openai-compatible",
      model: "test-image",
      label: "Test Image",
      capabilities: ["image"],
      defaultFor: ["image"],
      enabled: true
    }
  ],
  assistants: [
    {
      id: "test-assistant",
      name: "Test Assistant",
      description: "Deterministic browser fixture",
      color: "#ff2442",
      systemPrompt: "Answer briefly.",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  appPresets: [
    {
      id: "test-app",
      name: "Test App",
      description: "Deterministic browser fixture",
      category: "Test",
      prompt: "Return a deterministic result.",
      enabled: true
    }
  ],
  promptPresets: [],
  conversations: [],
  toolSettings: [
    {
      name: "calculator",
      label: "Calculator",
      description: "Deterministic tool fixture",
      enabled: true,
      riskLevel: "low"
    }
  ]
};

type ApiHarness = {
  requests: string[];
  unexpectedRequests: string[];
  setBootstrap: (payload: PublicBootstrapPayload) => void;
  setAdminStatus: (status: AdminStatus) => void;
};

type BrowserFixtures = {
  apiHarness: ApiHarness;
};

function cloneBootstrap(payload: PublicBootstrapPayload): PublicBootstrapPayload {
  return structuredClone(payload);
}

export const test = base.extend<BrowserFixtures>({
  apiHarness: [
    async ({ page }, use) => {
      let bootstrap = cloneBootstrap(publicBootstrapFixture);
      let adminStatus: AdminStatus = {
        authRequired: true,
        authenticated: false,
        adminConfigured: true
      };
      const requests: string[] = [];
      const unexpectedRequests: string[] = [];

      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const requestLabel = `${request.method()} ${pathname}`;
        requests.push(requestLabel);

        if (request.method() === "GET" && pathname === "/api/public/bootstrap") {
          await route.fulfill({ json: bootstrap });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/status") {
          await route.fulfill({ json: adminStatus });
          return;
        }

        unexpectedRequests.push(requestLabel);
        await route.fulfill({
          status: 501,
          contentType: "application/json",
          body: JSON.stringify({ error: `Unexpected browser-test API request: ${requestLabel}` })
        });
      });

      await use({
        requests,
        unexpectedRequests,
        setBootstrap(nextPayload) {
          bootstrap = cloneBootstrap(nextPayload);
        },
        setAdminStatus(nextStatus) {
          adminStatus = { ...nextStatus };
        }
      });

      expect.soft(
        unexpectedRequests,
        "Shell tests must not call provider or unmocked application APIs"
      ).toEqual([]);
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";

export async function seedReadyProvider(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: providerStorageKey, value: readyProvider }
  );
}

export function isMobileProject(projectName: string) {
  return projectName.startsWith("mobile-");
}

export function visibleModuleNavigation(page: Page) {
  return page.locator("nav:visible").filter({
    has: page.getByText("\u5bf9\u8bdd", { exact: true })
  }).first();
}

export function navigationAction(page: Page, accessibleName: string) {
  const navigation = visibleModuleNavigation(page);
  return navigation
    .getByRole("button", { name: accessibleName, exact: true })
    .or(navigation.getByRole("link", { name: accessibleName, exact: true }))
    .first();
}

export async function waitForPublicModule(
  page: Page,
  destination: (typeof publicDestinations)[number]
) {
  await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
  await expect(page).toHaveTitle(`${destination.label} - xi-ai-web`);
  await expect(page.locator("[data-active-module]")).toHaveAttribute(
    "data-active-module",
    destination.id
  );
  await expect(
    page
      .getByRole("main")
      .getByText("\u6b63\u5728\u52a0\u8f7d\u5de5\u4f5c\u53f0", { exact: true })
  ).toHaveCount(0, { timeout: 20_000 });
}

export async function visibleScrollOwners(page: Page) {
  return page.locator("[data-scroll-owner]").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          overflowY: style.overflowY,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          top: rect.top,
          bottom: rect.bottom
        };
      })
  );
}

export async function documentOverflow(page: Page) {
  return page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
}
