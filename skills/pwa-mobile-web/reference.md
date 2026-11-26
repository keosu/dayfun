# PWA 与移动网页参考

## 代码片段

### 外壳：占满屏幕，内部滚动

```css
body { position: fixed; inset: 0; overflow: hidden; }
#app {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
    env(safe-area-inset-bottom) env(safe-area-inset-left);
}
:root, :root * { scrollbar-width: none; }
:root *::-webkit-scrollbar { display: none; }
```

```html
<meta name="viewport"
  content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

### 弹层：自己滚动，标题吸顶

```css
dialog.modal {
  position: fixed;
  width: min(560px, calc(100% - 24px));
  max-height: 88vh;
  max-height: min(88dvh, 780px);
  margin: auto; padding: 0; border: 0; border-radius: 26px;
  overflow-x: hidden; overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
dialog.modal .modal-heading { position: sticky; top: 0; z-index: 2; background: var(--panel); }
dialog.modal .modal-content { padding: 6px 22px calc(20px + env(safe-area-inset-bottom)); }
@media (max-width: 640px) {
  dialog.modal { width: 100%; margin: auto 0 0; border-radius: 26px 26px 0 0; max-height: 90dvh; }
}
```

### 通知

```js
// 在点击事件里请求权限
async function ask() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

async function show(title, options) {
  if (Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker?.ready;
  if (reg?.showNotification) await reg.showNotification(title, options);
  else new Notification(title, options);
  return true;
}
```

```js
// sw.js
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = all[0];
    if (open) { await open.focus(); open.postMessage({ type: "OPEN", url }); }
    else await clients.openWindow(url);
  })());
});
```

### 提醒调度与去重

- 去重键：`eventId|startTs|minutesBefore`，已触发的键存 localStorage，超过 3 天清理。
- 检查区间 `(上次检查, 现在]`，左开右闭，避免相邻检查重复触发。
- 页面被挂起后恢复时，补发 15 分钟内错过的提醒。

### .ics 导出（交给系统日历）

```text
BEGIN:VEVENT
UID:...
DTSTART:20261126T080000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
BEGIN:VALARM
TRIGGER:-PT30M
ACTION:DISPLAY
DESCRIPTION:...
END:VALARM
END:VEVENT
```

### 构建期缓存版本（Vite）

`closeBundle` 时对 `dist` 里的所有文件做 SHA-256，把结果写进 `sw.js` 的 `VERSION`，并把文件列表写进 `PRECACHE`。任何静态文件变化都会改变版本号，旧缓存在 `activate` 时删除。

## 测试辅助

### 让无头浏览器的通知可用

```js
await page.addInitScript(() => {
  Object.defineProperty(Notification, "permission", { get: () => "granted" });
  window.shown = [];
  ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
    window.shown.push({ title, body: options.body, url: options.data?.url });
    return Promise.resolve();
  };
});
```

### 假时钟

```js
await page.clock.install({ time: new Date(2026, 10, 26, 7, 50) });
await page.clock.runFor(41 * 60_000);
```

### 等动画结束再测位置

弹层进入动画还没结束时读 `boundingBox()` 会拿到中间状态，用 `expect.poll` 轮询到稳定。

### 稳定的视图切换

路由开始时先更新状态属性，视图稍后才可见。辅助函数应先等路由状态，再等视图可见，不要用 `isVisible()` 立即判断。

### 用 WebKit 模拟 iOS Safari

```js
import { webkit, devices } from "@playwright/test";
const browser = await webkit.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
await page.goto("http://localhost:4173/#/timer");
const size = await page.evaluate(() => {
  const d = document.querySelector("dialog[open]");
  return { sheet: d.getBoundingClientRect().height, scrollable: d.scrollHeight - d.clientHeight };
});
```

首次使用前运行 `npx playwright install webkit`。WebKit 无头环境只能证明布局，不能证明真机上的通知、语音、全屏。

## 排错记录

- 改版删除旧选择器后，旧测试要同步更新选择器。
- 隐藏的 checkbox 如果绝对定位，可能被遮挡，需要显式定位。
- 同时跑多个 worker 时偶发的时序失败，单独重跑通过也要找出根因，不要忽略。
- 格式化工具会重排代码，改文件前先格式化，避免精确替换因缩进不同而失败。
- 新增的源文件要登记到格式化脚本的文件列表里（如果项目用列表）。
- 旧版 CSS 分层很多时，新样式放在最后加载的文件里，必要时用更高特异性的选择器。
