import { test, expect } from "@playwright/test";
import fs from "node:fs";

// 摄像头识别：用假摄像头跑通流程。模型和库从 CDN 下载，需要能联网。
// 假画面里没有真人脸，所以这里只验证“能开、能切、能停、布局不滚动”，不验证识别准确率。

fs.mkdirSync("screenshots", { recursive: true });

// 模型第一次下载可能要几十秒，单个用例放宽到 2 分钟
test.setTimeout(120000);

async function noPageScroll(page) {
  const m = await page.evaluate(() => ({
    sh: document.scrollingElement.scrollHeight,
    ih: window.innerHeight,
    sw: document.scrollingElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(m.sh, "页面不应该出现纵向滚动").toBeLessThanOrEqual(m.ih + 1);
  expect(m.sw, "页面不应该出现横向滚动").toBeLessThanOrEqual(m.iw + 1);
}

test("传感器页的入口卡片能打开摄像头识别", async ({ page }) => {
  await page.goto("/#/sensors");
  await page.locator("a.cam-entry").click();
  await expect(page).toHaveURL(/#\/camera$/);
  await expect(page.locator("#title")).toHaveText("摄像头识别");
  await expect(page.locator("#camBig")).toHaveText("准备好了");
});

test("开始、切换识别类型、停止", async ({ page }, testInfo) => {
  await page.goto("/#/camera");
  await expect(page.locator("#camGo")).toHaveText("开始识别");

  await page.locator("#camGo").click();
  // 第一次要下载 MediaPipe 和模型，给足时间
  await expect(page.locator("#camStatus")).toHaveAttribute(
    "data-state",
    "running",
    { timeout: 90000 },
  );
  await expect(page.locator("#camGo")).toHaveText("停止识别");
  await expect(page.locator("#camIdle")).toBeHidden();

  // 假画面里没有人脸，应该提示“没有检测到人脸”
  await expect(page.locator("#camBig")).toContainText("没有检测到人脸", {
    timeout: 30000,
  });
  await noPageScroll(page);
  await page.screenshot({
    path: `screenshots/camera-face-${testInfo.project.name}.png`,
  });

  // 切到姿态
  await page.getByRole("button", { name: "🧍 姿态" }).click();
  await expect(page.locator("#camBig")).toContainText("没看到全身", {
    timeout: 60000,
  });

  // 切到手势
  await page.getByRole("button", { name: "✋ 手势" }).click();
  await expect(page.locator("#camBig")).toContainText("把手举到镜头前", {
    timeout: 60000,
  });
  await noPageScroll(page);
  await page.screenshot({
    path: `screenshots/camera-gesture-${testInfo.project.name}.png`,
  });

  // 停止：按钮回到“开始识别”，画面回到占位
  await page.locator("#camGo").click();
  await expect(page.locator("#camGo")).toHaveText("开始识别");
  await expect(page.locator("#camIdle")).toBeVisible();
  await expect(page.locator("#camStatus")).toContainText("已停止");
});

test("没有开启摄像头时切换模式，只显示待机提示", async ({ page }) => {
  await page.goto("/#/camera");
  await page.getByRole("button", { name: "🧍 姿态" }).click();
  await expect(page.locator("#camBig")).toHaveText("准备好了");
  await expect(page.locator("#camDetail")).toContainText("已选：🧍 姿态");
  await expect(page.locator("#camIdle")).toBeVisible();
});
test("离开页面会关闭摄像头", async ({ page }) => {
  await page.goto("/#/camera");
  await page.locator("#camGo").click();
  await expect(page.locator("#camStatus")).toHaveAttribute(
    "data-state",
    "running",
    { timeout: 90000 },
  );

  const live = await page.evaluate(() => {
    const v = document.querySelector("#camVideo");
    return (
      v.srcObject?.getVideoTracks().some((t) => t.readyState === "live") ??
      false
    );
  });
  expect(live).toBe(true);

  await page.goto("/#/sensors");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v = document.querySelector("#camVideo");
        return v ? v.srcObject === null : true;
      }),
    )
    .toBe(true);
});

test("没有摄像头权限时给出中文提示", async ({ page }) => {
  // 模拟用户拒绝摄像头权限
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(
        Object.assign(new Error("denied"), { name: "NotAllowedError" }),
      );
  });
  await page.goto("/#/camera");
  await page.locator("#camGo").click();
  await expect(page.locator("#camStatus")).toHaveAttribute(
    "data-state",
    "error",
  );
  await expect(page.locator("#camStatus")).toContainText("没有摄像头权限");
  await expect(page.locator("#camGo")).toHaveText("开始识别");
});

test.describe("横屏手机", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });

  test("横屏时画面在左、读数在右，整页不滚动", async ({ page }, testInfo) => {
    await page.goto("/#/camera");
    await page.locator("#camGo").click();
    await expect(page.locator("#camStatus")).toHaveAttribute(
      "data-state",
      "running",
      { timeout: 90000 },
    );
    await expect(page.locator("#camBig")).toContainText("没有检测到人脸", {
      timeout: 30000,
    });
    await noPageScroll(page);

    const box = await page.locator("#cam").boundingBox();
    expect(box.height).toBeGreaterThan(200);
    expect(box.x + box.width).toBeLessThanOrEqual(844);
    const readX = (await page.locator("#camBig").boundingBox()).x;
    expect(readX).toBeGreaterThan(box.x + box.width);
    await page.screenshot({
      path: `screenshots/camera-landscape-${testInfo.project.name}.png`,
    });
  });
});
