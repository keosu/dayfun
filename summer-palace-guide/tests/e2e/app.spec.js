import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

mkdirSync("test-results/shots", { recursive: true });

// 假的语音合成：记录读过的句子；默认不自动读完，测试里手动结束
const SPEECH_STUB = () => {
  const spoken = [];
  let current = null;
  const synth = {
    speaking: false,
    getVoices: () => [{ name: "测试中文声音", lang: "zh-CN", localService: true, default: true }],
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      if (u.text.trim()) spoken.push(u.text); // 解锁用的空白朗读不算
      current = u;
      synth.speaking = true;
      setTimeout(() => u.onstart?.({}), 0);
      if (window.__autoEnd) setTimeout(() => synth.__end(u), 20);
    },
    cancel() {
      current = null;
      synth.speaking = false;
    },
    __end(u) {
      if (current === u) {
        current = null;
        u.onend?.({});
      }
    },
  };
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.__spoken = spoken;
  window.__endCurrent = () => current && synth.__end(current);
};

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(SPEECH_STUB);
  await page.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  page._errors = [];
  page.on("pageerror", (e) => page._errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/tile\.openstreetmap|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) page._errors.push(m.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(page._errors, "页面不应有脚本错误").toEqual([]);
});

async function open(page, path = "/") {
  await page.goto(path);
  await page.waitForSelector("body.ready");
}

const spotName = (page) => page.locator("#card .card-title .name");

test("启动：地图、顶栏、欢迎卡片都在一屏内，页面不滚动", async ({ page }, info) => {
  await open(page);
  const m = await page.evaluate(() => ({
    sh: document.scrollingElement.scrollHeight,
    sw: document.scrollingElement.scrollWidth,
    ih: innerHeight,
    iw: innerWidth,
    pins: document.querySelectorAll(".pin").length,
    boxes: ["#top-stack", "#card", ".map-tools"].map((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return [s, r.left, r.top, r.right, r.bottom];
    }),
  }));
  expect(m.sh).toBeLessThanOrEqual(m.ih);
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  expect(m.pins).toBeGreaterThanOrEqual(30);
  for (const [s, l, t, r, b] of m.boxes) {
    expect(l, s).toBeGreaterThanOrEqual(0);
    expect(t, s).toBeGreaterThanOrEqual(0);
    expect(r, s).toBeLessThanOrEqual(m.iw + 0.5);
    expect(b, s).toBeLessThanOrEqual(m.ih + 0.5);
  }
  await expect(page.locator("#card")).toContainText("欢迎来颐和园");
  await page.screenshot({ path: `test-results/shots/${info.project.name}-welcome.png` });
});

test("手动：点景点 → 卡片 → 听讲解 → 暂停/继续 → 详情里逐句高亮", async ({ page }, info) => {
  await open(page);
  await page.evaluate(() => window.__app.selectSpot("foxiang-ge"));
  await expect(spotName(page)).toHaveText("佛香阁");
  await page.locator(".play-btn").click();
  await expect(page.locator(".play-btn")).toContainText("暂停");
  expect(await page.evaluate(() => window.__spoken.length)).toBe(1);
  await page.locator(".play-btn").click();
  await expect(page.locator(".play-btn")).toContainText("继续听");
  await page.locator(".play-btn").click();
  await expect(page.locator(".play-btn")).toContainText("暂停");

  await page.locator('[data-act="open-detail"]').click();
  const sheet = page.locator(".sheet.detail");
  await expect(sheet.locator("h3")).toHaveText("佛香阁");
  await expect(sheet.locator(".hero img")).toBeVisible();
  await expect(sheet.locator(".credit")).toContainText("CC");
  await expect(sheet.locator(".sent")).not.toHaveCount(0);
  await expect(sheet.locator(".sent.now")).toHaveCount(1);
  await page.screenshot({ path: `test-results/shots/${info.project.name}-detail.png` });
  // 语速
  await sheet.locator('[data-rate="1.5"]').click();
  expect(await page.evaluate(() => window.__app.narrator.rate)).toBe(1.5);
  // 停止
  await sheet.locator('[data-act="stop"]').click();
  await expect(sheet.locator(".play-btn")).toContainText("听讲解");
  // Esc 关闭
  await page.keyboard.press("Escape");
  await expect(page.locator(".sheet")).toHaveCount(0);
});

test("点地图上的景点图标会切换景点", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__app.gmap.focus([39.99651, 116.274], 17.5, false));
  await page.waitForTimeout(400);
  await page.locator('.pin[data-id="renshou-dian"]').click({ force: true });
  await expect(spotName(page)).toHaveText("仁寿殿");
});

test("线路：按入口浏览、开始、上一站/下一站、结束；返回键先关弹层", async ({ page }, info) => {
  await open(page);
  await page.locator('.top-btn[data-act="open-routes"]').click();
  await expect(page.locator(".route-card")).toHaveCount(3); // 东宫门 3 条
  await page.locator('[data-ent="北宫门"]').click();
  await expect(page.locator(".route-card").first()).toContainText("后湖");
  await expect(page.locator(".route-card")).toHaveCount(3);
  await page.screenshot({ path: `test-results/shots/${info.project.name}-routes.png` });
  // 安卓返回键 → 关闭弹层，应用仍在
  await page.goBack();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.locator("body.ready")).toBeVisible();

  await page.locator('.top-btn[data-act="open-routes"]').click();
  await page.locator('[data-ent="北宫门"]').click();
  await page.locator("[data-route]").first().click();
  await expect(page.locator(".route-strip")).toContainText("1/");
  await expect(spotName(page)).toHaveText("北宫门");
  await page.locator('[data-act="route-next"]').click();
  await expect(page.locator(".route-strip")).toContainText("2/");
  await expect(spotName(page)).not.toHaveText("北宫门");
  expect(await page.locator(".pin.in-route").count()).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: `test-results/shots/${info.project.name}-route.png` });
  await page.locator('[data-act="route-prev"]').click();
  await expect(spotName(page)).toHaveText("北宫门");
  await page.locator('[data-act="route-end"]').click();
  await expect(page.locator(".route-strip")).toHaveCount(0);
  expect(await page.locator(".pin.in-route").count()).toBe(0);
});

test.describe("自动定位", () => {
  test.use({ permissions: ["geolocation"], geolocation: { latitude: 39.99783, longitude: 116.26798, accuracy: 10 } });

  test("走到佛香阁 → 自动切换并开口讲；移动到仁寿殿 → 换景点；走出园 → 提示未进园", async ({ page, context }, info) => {
    await open(page);
    await page.locator('[data-mode="auto"]').click();
    await expect(spotName(page)).toHaveText("佛香阁");
    await expect(page.locator("#status")).toContainText("佛香阁");
    await expect(page.locator(".play-btn")).toContainText("暂停"); // 自动开始讲
    expect(await page.evaluate(() => window.__spoken[0])).toContain("佛香阁");
    await page.screenshot({ path: `test-results/shots/${info.project.name}-auto.png` });

    await context.setGeolocation({ latitude: 39.99651, longitude: 116.274, accuracy: 10 });
    await expect(spotName(page)).toHaveText("仁寿殿");
    expect(await page.evaluate(() => window.__spoken.at(-1))).toContain("仁寿殿");

    await context.setGeolocation({ latitude: 39.9087, longitude: 116.3975, accuracy: 15 });
    await expect(page.locator("#status")).toContainText("你还没进园");
    // 到入口附近会显示入口卡片，但不自动讲
    const before = await page.evaluate(() => window.__spoken.length);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__spoken.length)).toBe(before);
  });

  test("自动模式下手动点别的景点 → 回到手动；关闭自动讲解后不开口", async ({ page, context }) => {
    await open(page);
    await page.locator('[data-act="open-settings"]').click();
    await page.locator("#set-autospeak").uncheck();
    await page.locator(".sheet-close").click();
    await page.locator('[data-mode="auto"]').click();
    await expect(spotName(page)).toHaveText("佛香阁");
    expect(await page.evaluate(() => window.__spoken.length)).toBe(0);
    await page.evaluate(() => window.__app.selectSpot("tong-niu"));
    await expect(page.locator('[data-mode="manual"]')).toHaveAttribute("aria-pressed", "true");
    await expect(spotName(page)).toHaveText("铜牛");
    void context;
  });

  test("定位不准（误差大）时不乱切景点", async ({ page, context }) => {
    await open(page);
    await context.setGeolocation({ latitude: 39.99651, longitude: 116.274, accuracy: 500 });
    await page.locator('[data-mode="auto"]').click();
    await expect(page.locator("#status")).toContainText("定位不太准");
    await expect(page.locator("#card")).toContainText("欢迎来颐和园");
  });
});

test.describe("定位被拒绝", () => {
  test.use({ permissions: [] });
  test("提示并回到手动模式", async ({ page }) => {
    await open(page);
    await page.locator('[data-mode="auto"]').click();
    await expect(page.locator("#toast")).toContainText(/定位权限|没有定位/);
    await expect(page.locator('[data-mode="manual"]')).toHaveAttribute("aria-pressed", "true");
  });
});

test("模拟位置：点地图 → 当作你在那里 → 自动识别景点；可退出", async ({ page }) => {
  await open(page);
  await page.locator('[data-act="open-settings"]').click();
  await page.locator('[data-act="sim-start"]').click();
  await expect(page.locator("body.sim-picking")).toHaveCount(1);
  await page.evaluate(() => window.__app.simulateAt([39.99783, 116.26798]));
  await expect(page.locator("#status")).toContainText("模拟位置中");
  await expect(spotName(page)).toHaveText("佛香阁");
  await page.locator("#sim-exit").click();
  await expect(page.locator("#status")).not.toContainText("模拟位置中");
  await expect(page.locator('[data-mode="manual"]')).toHaveAttribute("aria-pressed", "true");
});

test("景点列表：每个景点都有一行，点击后切换", async ({ page }) => {
  await open(page);
  await page.locator('[data-act="open-spots"]').click();
  const n = await page.evaluate(() => window.__app.D.spots.length);
  await expect(page.locator(".row")).toHaveCount(n);
  await page.locator('.row[data-spot="shi-fang"]').scrollIntoViewIfNeeded();
  await page.locator('.row[data-spot="shi-fang"]').click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(spotName(page)).toHaveText("石舫（清晏舫）");
});

test("每个景点的详情都能打开，且弹层不超出屏幕", async ({ page }) => {
  await open(page);
  const ids = await page.evaluate(() => window.__app.D.spots.map((s) => s.id));
  for (const id of ids) {
    await page.evaluate((i) => window.__app.selectSpot(i), id);
    await page.locator('[data-act="open-detail"]').click();
    await expect(page.locator(".sheet.detail.in")).toHaveCount(1);
    await page.waitForTimeout(320); // 等滑入动画结束
    const box = await page.locator(".sheet.detail").boundingBox();
    const vp = page.viewportSize();
    expect(box.y, id).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height, id).toBeLessThanOrEqual(vp.height + 1);
    expect(box.width, id).toBeLessThanOrEqual(vp.width + 1);
    await expect(page.locator(".sheet.detail .narration .sent").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet")).toHaveCount(0);
  }
});

test("设置：地图切换到在线街道图并记住；刷新后保持", async ({ page }) => {
  await open(page);
  await page.locator('[data-act="open-settings"]').click();
  await page.locator('[data-basemap="tiles"]').click();
  await expect(page.locator("#map.tiles-on")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForSelector("body.ready");
  await expect(page.locator("#map.tiles-on")).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("spg:v1")).basemap)).toBe("tiles");
});

test.describe("暗色", () => {
  test.use({ colorScheme: "dark" });
  test("跟随系统：背景变深，截图留档", async ({ page }, info) => {
    await open(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r + g + b).toBeLessThan(120);
    await page.evaluate(() => window.__app.startRoute("east-1"));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/shots/${info.project.name}-dark.png` });
  });
});

test("离线：安装后断网刷新，仍能打开地图、景点和照片", async ({ page, context }) => {
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector("body.ready");
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // 等预缓存完成
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        const pre = keys.find((k) => k.startsWith("spg-pre-"));
        return pre ? (await (await caches.open(pre)).keys()).length : 0;
      }),
    )
    .toBeGreaterThan(60);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector("body.ready");
  await page.evaluate(() => window.__app.selectSpot("dong-gong-men"));
  await expect(spotName(page)).toHaveText("东宫门");
  await expect.poll(() => page.locator("#card img").evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.querySelectorAll(".pin").length)).toBeGreaterThanOrEqual(30);
  await context.setOffline(false);
});

test("manifest 与图标可访问", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.ok()).toBe(true);
  const json = await m.json();
  for (const i of json.icons) expect((await request.get("/" + i.src)).ok(), i.src).toBe(true);
  expect((await request.get("/tools/raw/pois.txt")).status()).toBe(404); // 构建目录不对外
});
