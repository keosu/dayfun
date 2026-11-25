import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1050 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "npm run preview -- --port 4173",
      url: "http://localhost:4173",
      reuseExistingServer: true,
    },
    {
      command: "node server/sync-server.mjs",
      url: "http://localhost:8788/health",
      reuseExistingServer: false,
      env: {
        PORT: "8788",
        SYNC_TOKEN: "playwright-local-test-token",
        SYNC_DATA_FILE: "test-results/sync-data.json",
      },
    },
  ],
});
