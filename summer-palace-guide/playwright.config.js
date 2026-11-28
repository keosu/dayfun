import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:4317",
    trace: "off",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  webServer: {
    command: "node server.mjs 4317",
    url: "http://localhost:4317/index.html",
    reuseExistingServer: false,
    timeout: 20_000,
  },
  projects: [
    { name: "mobile-390", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "mobile-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 640 } } },
    { name: "iphone-webkit", use: { ...devices["iPhone 14"] } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
