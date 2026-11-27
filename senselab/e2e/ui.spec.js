import { test, expect } from "@playwright/test";
import WebSocket from "ws";
import fs from "node:fs";

fs.mkdirSync("screenshots", { recursive: true });

/** 在页面里造传感器数据：60Hz 的 devicemotion + deviceorientation。 */
const INIT = () => {
  const G = 9.81;
  const bell = (l, t0, dur, amp) =>
    l >= t0 && l < t0 + dur ? amp * Math.sin((Math.PI * (l - t0)) / dur) : 0;
  const fire = ({ lin = [0, 0, 0], rot = [0, 0, 0], u = [0, 1, 0] }) => {
    const ag = u.map((v, i) => v * G + lin[i]);
    window.dispatchEvent(
      new DeviceMotionEvent("devicemotion", {
        accelerationIncludingGravity: { x: ag[0], y: ag[1], z: ag[2] },
        acceleration: { x: lin[0], y: lin[1], z: lin[2] },
        rotationRate: { alpha: rot[2], beta: rot[0], gamma: rot[1] },
        interval: 16,
      }),
    );
    const beta = (Math.asin(u[1]) * 180) / Math.PI;
    const gamma = (Math.atan2(-u[0], u[2]) * 180) / Math.PI;
    window.dispatchEvent(
      new DeviceOrientationEvent("deviceorientation", {
        alpha: 10,
        beta,
        gamma,
        absolute: false,
      }),
    );
  };
  window.__run = async (ms, f = () => ({})) => {
    const t0 = performance.now();
    for (;;) {
      const l = performance.now() - t0;
      if (l > ms) break;
      fire(f(l));
      await new Promise((r) => setTimeout(r, 16));
    }
  };
  window.__swingRight = (l) => ({
    lin: [bell(l, 100, 150, 9) + bell(l, 250, 150, -7.2), 0, 0],
  });
  window.__flick = (l) => ({
    lin: [bell(l, 100, 120, 24) + bell(l, 220, 120, -19), 0, 0],
  });
  window.__tilt = (deg) => () => {
    const r = (deg * Math.PI) / 180;
    return { u: [-Math.sin(r), Math.cos(r), 0] };
  };
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(INIT);
});

async function noPageScroll(page) {
  const m = await page.evaluate(() => ({
    sh: document.scrollingElement.scrollHeight,
    ih: innerHeight,
    sw: document.scrollingElement.scrollWidth,
    iw: innerWidth,
  }));
  expect(m.sh).toBeLessThanOrEqual(m.ih + 1);
  expect(m.sw).toBeLessThanOrEqual(m.iw + 1);
}

test("首页：四个磁贴、不滚动、没有底部导航", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.locator(".tile")).toHaveCount(4);
  await expect(page.locator("nav")).toHaveCount(0);
  await expect(page.locator("#home-btn")).toBeHidden();
  await noPageScroll(page);
  await page.screenshot({ path: `screenshots/${info.project.name}-home.png` });
});

test("传感器体检：开始后各项变为正常", async ({ page }, info) => {
  await page.goto("/#/sensors");
  // 传感器卡片 10 张（data-id），另有一张摄像头入口卡片不计入体检\n  await expect(page.locator(".card[data-id]")).toHaveCount(10);
  await page.click("#start");
  await page.evaluate(() =>
    window.__run(500, () => ({ u: [0, 0.8, 0.6], rot: [10, -5, 3] })),
  );
  await expect(page.locator('.card[data-id="accel"]')).toHaveAttribute(
    "data-status",
    "ok",
  );
  await expect(page.locator('.card[data-id="gyro"]')).toHaveAttribute(
    "data-status",
    "ok",
  );
  await expect(page.locator('.card[data-id="orient"]')).toHaveAttribute(
    "data-status",
    "ok",
  );
  await expect(page.locator('.card[data-id="geo"]')).toHaveAttribute(
    "data-status",
    "ok",
  );
  await expect(page.locator('.card[data-id="geo"] .val')).toContainText(
    "31.23040",
  );
  const n = Number(await page.locator("#okCount").textContent());
  expect(n).toBeGreaterThanOrEqual(5);
  await noPageScroll(page);
  await page.screenshot({
    path: `screenshots/${info.project.name}-sensors.png`,
  });
});

test("3D 手机模型：平放和竖立的矩阵不同", async ({ page }) => {
  await page.goto("/#/sensors");
  await page.click("#start");
  await page.evaluate(() => window.__run(400, () => ({ u: [0, 0, 1] })));
  const flat = await page
    .locator("#phone")
    .evaluate((el) => el.style.transform);
  await page.evaluate(() => window.__run(400, () => ({ u: [0, 1, 0] })));
  const upright = await page
    .locator("#phone")
    .evaluate((el) => el.style.transform);
  expect(flat).toMatch(/^matrix3d/);
  expect(upright).not.toEqual(flat);
});

test("动作识别：挥、甩、倾斜都能认出来", async ({ page }, info) => {
  await page.goto("/#/gestures");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#gStart")).toBeVisible();
  await page.click("#gStart");
  await page.evaluate(() => window.__run(2200));
  await expect(page.locator("#gStatus")).toContainText("感应中");

  await page.evaluate(() => window.__run(900, window.__swingRight));
  await expect(page.locator(".g-text")).toHaveText("向右挥");

  await page.evaluate(() => window.__run(900, window.__flick));
  await expect(page.locator(".g-text")).toHaveText("向右甩");

  await page.evaluate(() => window.__run(1500, window.__tilt(20)));
  await expect(page.locator("#bRead")).toContainText("左右 20°");
  await noPageScroll(page);
  await page.screenshot({
    path: `screenshots/${info.project.name}-gestures.png`,
  });

  // 图鉴点亮
  await page.click('[aria-label="动作图鉴"]');
  await expect(page.locator(".codex-item.lit")).toHaveCount(2);
  await page.waitForTimeout(350); // 等弹层动画结束再截图
  await page.screenshot({ path: `screenshots/${info.project.name}-codex.png` });
});

test("系统能力：页面可用，震动调用被触发", async ({ page }, info) => {
  await page.addInitScript(() => {
    window.__vib = [];
    navigator.vibrate = (p) => (window.__vib.push(p), true);
  });
  await page.goto("/#/system");
  await expect(page.locator(".cap")).toHaveCount(11);
  await page.click(".pill >> text=心跳");
  expect(await page.evaluate(() => window.__vib.length)).toBe(1);
  await page.click("text=播放声音");
  await expect(page.locator(".cap", { hasText: "播放声音" })).toHaveAttribute(
    "data-state",
    "ok",
  );
  await noPageScroll(page);
  await page.screenshot({
    path: `screenshots/${info.project.name}-system.png`,
  });
});

test("手柄：连接中继，按键、动作、倾斜、摇杆都能到达游戏端，震动能回传", async ({
  page,
  baseURL,
}, info) => {
  await page.addInitScript(() => {
    window.__vib = [];
    navigator.vibrate = (p) => (window.__vib.push(p), true);
  });
  // 电脑上的“游戏”
  const host = new URL(baseURL).host;
  const game = new WebSocket(
    `ws://${host}/ws?role=game&room=ui-${info.project.name}`,
  );
  const inbox = [];
  game.on("message", (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => game.on("open", r));
  const waitFor = async (pred) => {
    await expect.poll(() => inbox.find(pred), { timeout: 5000 }).toBeTruthy();
    return inbox.find(pred);
  };

  await page.goto("/#/pad");
  await page.evaluate(
    (room) =>
      localStorage.setItem(
        "senselab.link",
        JSON.stringify({ room, name: "测试员" }),
      ),
    `ui-${info.project.name}`,
  );
  await page.reload();
  await expect(page.locator("#pStart")).toBeVisible();
  await page.screenshot({
    path: `screenshots/${info.project.name}-pad-start.png`,
  });
  await page.click("#pGo");
  await expect(page.locator("#pStatus")).toContainText("P1 已连接");
  await expect(page.locator("#pStart")).toBeHidden();
  await page.evaluate(() => window.__run(2200));
  await noPageScroll(page);
  await page.screenshot({ path: `screenshots/${info.project.name}-pad.png` });

  await waitFor(
    (m) =>
      m.t === "players" && m.list.length === 1 && m.list[0].name === "测试员",
  );

  // 按键
  const a = page.locator('.pad-btn[data-b="A"]');
  const box = await a.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await waitFor((m) => m.t === "btn" && m.id === "A" && m.down === true);
  await page.mouse.up();
  await waitFor((m) => m.t === "btn" && m.id === "A" && m.down === false);

  // 摇杆：向右上推
  const base = await page.locator("#stick").boundingBox();
  await page.mouse.move(base.x + base.width / 2, base.y + base.height / 2);
  await page.mouse.down();
  await page.mouse.move(base.x + base.width, base.y, { steps: 4 });
  const st = await waitFor((m) => m.t === "state" && m.sx > 0.5 && m.sy > 0.5);
  expect(st.p).toBe(1);
  await page.mouse.up();
  await waitFor(
    (m) => m.t === "state" && m.sx === 0 && m.sy === 0 && m.seq > st.seq,
  );

  // 动作
  await page.evaluate(() => window.__run(900, window.__flick));
  const g = await waitFor((m) => m.t === "gesture" && m.name === "flick-right");
  expect(g.hard).toBe(true);

  // 倾斜：开始时已经把当时的姿势设为正中，再倾斜 30° 应接近满量程
  await page.evaluate(() => window.__run(1500, window.__tilt(30)));
  const tilt = await waitFor((m) => m.t === "state" && m.tx > 0.6);
  expect(tilt.roll).toBeGreaterThan(20);

  // 游戏回传震动
  game.send(JSON.stringify({ t: "rumble", pattern: [40, 30, 40] }));
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__vib.some(
          (p) => Array.isArray(p) && p.length === 3 && p[0] === 40,
        ),
      ),
    )
    .toBe(true);
  game.close();
});

test("手柄：竖屏和横屏下各部件不重叠、不出屏", async ({ page }) => {
  await page.goto("/#/pad");
  await page.click("#pGo");
  await expect(page.locator("#pStart")).toBeHidden();
  const parts = [
    ".pad-status",
    ".pad .g-banner",
    ".pad .bubble",
    ".pad .b-read",
    ".stick-base",
    ".btn-zone",
  ];
  const check = async (label) => {
    const vp = page.viewportSize();
    const boxes = [];
    for (const sel of parts) {
      const b = await page.locator(sel).boundingBox();
      expect(b, `${label} ${sel} 应可见`).toBeTruthy();
      expect(b.x, `${label} ${sel} 左边界`).toBeGreaterThanOrEqual(-1);
      expect(b.y, `${label} ${sel} 上边界`).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${label} ${sel} 右边界`).toBeLessThanOrEqual(
        vp.width + 1,
      );
      expect(b.y + b.height, `${label} ${sel} 下边界`).toBeLessThanOrEqual(
        vp.height + 1,
      );
      boxes.push([sel, b]);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [na, a] = boxes[i];
        const [nb, b] = boxes[j];
        const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(w > 1 && h > 1, `${label}：${na} 与 ${nb} 重叠`).toBe(false);
      }
    }
  };
  await check("竖屏");
  await page.setViewportSize({ width: 740, height: 360 });
  await page.waitForTimeout(200);
  await check("横屏");
  await noPageScroll(page);
});
test("手柄：设置弹层能打开和关闭，地址默认是当前主机", async ({
  page,
  baseURL,
}) => {
  await page.goto("/#/pad");
  await page.click('[aria-label="手柄设置"]');
  await expect(page.locator(".sheet.open")).toBeVisible();
  await expect(page.locator(".sheet .input").first()).toHaveValue(
    new URL(baseURL).host,
  );
  await page.screenshot({ path: "screenshots/pad-settings.png" });
  await page.click('.sheet [aria-label="关闭"]');
  await expect(page.locator(".sheet")).toHaveCount(0);
});

test("电脑端监视器能收到手柄数据", async ({ page, browser, baseURL }, info) => {
  if (info.project.name !== "desktop") test.skip();
  const room = "pc-room";
  await page.goto(`/pc.html?room=${room}`);
  await expect(page.locator("#conn")).toContainText("已连接");
  const host = new URL(baseURL).host;
  const pad = new WebSocket(`ws://${host}/ws?role=pad&room=${room}&name=Tom`);
  await new Promise((r) => pad.on("open", r));
  await expect(page.locator(".player")).toHaveCount(1);
  pad.send(
    JSON.stringify({
      t: "gesture",
      name: "flick-right",
      power: 20,
      hard: true,
    }),
  );
  pad.send(JSON.stringify({ t: "btn", id: "A", down: true }));
  pad.send(JSON.stringify({ t: "state", tx: 0.8, ty: 0, sx: 0, sy: 0 }));
  await expect(page.locator("#log li").first()).toContainText("向右甩");
  await expect(page.locator(".keys i.on")).toHaveText("A");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshots/desktop-pc.png" });
  pad.close();
});
