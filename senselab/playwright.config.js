import { defineConfig, devices } from "@playwright/test";

const PORT = 4180;

export default defineConfig({
  testDir: "e2e",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // localhost 是安全上下文，传感器和定位接口可用
    permissions: ["geolocation", "accelerometer", "gyroscope", "magnetometer"],
    geolocation: { latitude: 31.2304, longitude: 121.4737, accuracy: 12 },
    trace: "off",
    // 摄像头用假设备：自动允许权限，画面是一段测试图案（不含真人脸）
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
  },
  webServer: {
    command: `node server/server.mjs --port 4543 --http-port ${PORT}`,
    url: `http://localhost:${PORT}/api/info`,
    reuseExistingServer: true,
    timeout: 20000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "small",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 640 } },
    },
  ],
});
