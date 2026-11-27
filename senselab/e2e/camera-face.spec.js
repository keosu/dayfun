import { test, expect } from "@playwright/test";
import fs from "node:fs";

// 真人脸检测：需要一张包含人脸的图片，通过环境变量指定路径，例如
//   $env:SENSELAB_FACE_IMAGE = "C:\path\to\face.jpg"; npx playwright test e2e/camera-face.spec.js
// 图片不会进入仓库。没有设置时整组跳过。
//
// 做法：用 canvas.captureStream() 代替摄像头，把图片持续画到画布上，
// 页面看到的就是一个“摄像头”里有这张脸。

const faceFile = process.env.SENSELAB_FACE_IMAGE;
test.skip(!faceFile, "设置 SENSELAB_FACE_IMAGE=图片路径 才会跑真人脸检测");
test.setTimeout(150000);

const FAKE_CAMERA = (b64) => {
  const img = new Image();
  img.src = `data:image/jpeg;base64,${b64}`;
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  const paint = () => {
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (img.complete && img.naturalWidth) {
      const s = Math.min(
        canvas.width / img.naturalWidth,
        canvas.height / img.naturalHeight,
      );
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    requestAnimationFrame(paint);
  };
  paint();
  navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
};

test("人脸：能检测到脸，并在画面上画出关键点", async ({ page }) => {
  const b64 = fs.readFileSync(faceFile).toString("base64");
  await page.addInitScript(FAKE_CAMERA, b64);
  await page.goto("/#/camera");
  await page.locator("#camGo").click();

  await expect(page.locator("#camStatus")).toHaveAttribute(
    "data-state",
    "running",
    { timeout: 90000 },
  );
  // 人脸模式是默认模式
  await expect(page.locator("#camBig")).toContainText(
    /正对镜头|头向左转|头向右转/,
    { timeout: 60000 },
  );
  await expect(page.locator("#camDetail")).toContainText("眨眼");
  // 前置摄像头预览要镜像（照镜子），关键点画在同一个画布上，所以一起镜像就能对齐
  await expect(page.locator("#cam")).toHaveClass(/mirror/);

  // 画布上应该有绿色以外的线条（关键点轮廓），不只是空白
  const drawn = await page.evaluate(() => {
    const c = document.querySelector("#camCanvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  expect(drawn).toBeGreaterThan(200);

  await page.screenshot({ path: "screenshots/camera-face-real.png" });
});
