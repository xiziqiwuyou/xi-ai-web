import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT || 4174);
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "reports/playwright-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 7_500
  },
  reporter: [
    ["line"],
    ["html", { outputFolder: "reports/playwright", open: "never" }]
  ],
  use: {
    baseURL,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off"
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run dev",
        url: `${baseURL}/api/health`,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
          PORT: String(port),
          DATA_DIR: join(tmpdir(), "xi-ai-web-playwright"),
          ADMIN_PASSWORD: "playwright-admin",
          NODE_ENV: "test"
        }
      },
  projects: [
    {
      name: "desktop-1440",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "desktop-1280",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 }
      }
    },
    {
      name: "mobile-390",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true
      }
    },
    {
      name: "mobile-375",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true
      }
    }
  ]
});
