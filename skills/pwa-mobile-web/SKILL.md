---
name: pwa-mobile-web
description: Practical knowledge for building installable, full-screen, offline-capable, notification-enabled PWAs and mobile web apps that behave well on iOS Safari, Android Chrome and desktop. Covers capability support matrix, full-screen and safe-area layout, bottom-sheet dialogs, service worker caching, system notifications and their limits, calendar (.ics) fallback, known iOS/Android pitfalls, and verification with Playwright/WebKit. Use when building or debugging a PWA, mobile layout, install prompt, service worker, web notification, safe-area, keyboard, dialog height, or when the user mentions PWA, iOS, Android, 全屏, 主屏幕, 安装, 离线, 通知, 提醒, 安全区.
---

# PWA 与移动网页实战指南

通用知识，不绑定具体项目。代码片段、测试写法和排错记录见 [reference.md](reference.md)。做界面风格取舍时同时参考 `my-design-preferences`。

## 一、能力与平台支持

| 能力 | Android Chrome | iOS Safari / 主屏幕 Web App | 桌面浏览器 |
| --- | --- | --- | --- |
| 安装 | `beforeinstallprompt` 可自定义按钮 | 没有安装弹窗，只能“分享 → 添加到主屏幕”，需要文字指引 | 浏览器菜单或地址栏图标 |
| 全屏 | manifest `display: fullscreen` 生效 | 忽略 `fullscreen`，用 `apple-mobile-web-app-capable` 与 `black-translucent` 加安全区 | `requestFullscreen` |
| Service Worker / 离线 | 支持 | 支持（需 HTTPS，存储可能被系统清理） | 支持 |
| 系统通知 | 支持，需用户授权 | 仅从主屏幕图标打开的 Web App 可用（约 iOS 16.4 起，以真机为准） | 支持 |
| 后台推送 | Web Push 需后端 | Web Push 需后端且需已安装 | 同左 |
| Wake Lock | 支持 | 支持有限，需可选链与降级 | 支持 |
| 语音合成 | 支持 | 可用但受限，需用户手势后再播放 | 支持 |
| Web Audio | 支持 | 用 `webkitAudioContext` 回退，需用户手势解锁 | 支持 |
| 分享文件 | Web Share 带文件（仅部分设备） | 部分支持 | 多数不支持，需回退为下载 |

原则：**每项能力都做特性检测，失败时给出明确指引或静默降级，不要抛错，也不要让用户猜。**

## 二、全屏与布局

- 外壳占满屏幕，页面本身不滚动：`body { position: fixed; inset: 0; overflow: hidden }`，应用根节点用 flex 列布局。
- 使用 `env(safe-area-inset-*)` 处理刘海与底部横条；viewport 加 `viewport-fit=cover`。
- 高度单位用 `dvh`，并保留 `vh` 作为回退。
- 键盘弹出时视口应收缩：viewport 加 `interactive-widget=resizes-content`。
- 长内容只在自己的区域里滚动，隐藏滚动条：`scrollbar-width: none` 加 `::-webkit-scrollbar { display: none }`；注意旧样式里更具体的选择器会盖掉通配规则。
- 需要同时适配所有页面，不要只修一个。

## 三、弹层（底部抽屉）

- 手机用底部弹层，电脑用居中卡片；最大高度 `min(88dvh, 780px)`。
- **让弹层自己做滚动容器**，标题栏 `position: sticky; top: 0`；不要在自适应高度的列式 flex 容器里给内容区 `flex: 1`（basis 为 0%）。旧版 iOS WebKit 会把它压成一行，表现为“弹层只有一行高度”。
- 弹层有进入动画，测试位置时要等动画结束。

## 四、Service Worker 与离线

- 构建时生成预缓存清单，并把缓存名绑定到内容哈希，部署新版本就会自动淘汰旧缓存。
- 导航请求先返回缓存的外壳，同时在后台刷新（stale-while-revalidate）。
- 路径使用相对基址（如 Vite `base: "./"`），同一份产物可在域名根或子路径（GitHub Pages）运行。
- 旧页面引用已删除的懒加载分块会报错：监听 `vite:preloadError`（或等价事件）并刷新一次。
- 新版本不生效时：确认版本号被构建替换，刷新两次，必要时清站点数据。

## 五、系统通知与提醒

- 通过 `registration.showNotification` 发送（Service Worker 里），不可用时回退 `new Notification`。
- **权限必须在用户点击的同步调用栈里请求**，不要在页面加载时弹出。
- iOS 未安装时先显示“添加到主屏幕”的指引，而不是直接报错。
- `notificationclick`：聚焦已打开的窗口并 `postMessage` 要打开的路径，否则 `clients.openWindow`。
- 应用内提醒调度：短周期轮询（例如 15 秒），用 `事件ID|时间戳|提前分钟` 做去重键并持久化，错过较短时间（例如 15 分钟）内的提醒要补发，区间用“左开右闭”避免重复。
- **诚实说明限制**：没有 Web Push 后端时，关闭应用后网页无法准时提醒。替代办法是导出 `.ics`（带 `RRULE` 与 `VALARM`），交给系统日历负责提醒；真正的推送需要后端，要先征得用户同意再做。

## 六、常见问题速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| iOS 弹层只有一行高 | 内容区 `flex: 1` 塌陷 | 弹层自身滚动，标题吸顶 |
| 全屏后顶部有空白，需要滚动 | 整页滚动，`100vh` 与安全区不准 | 固定外壳，`dvh`，`env(safe-area-inset-*)` |
| 键盘遮挡输入框 | 视口没随键盘收缩 | `interactive-widget=resizes-content` |
| 通知不弹 | 未授权，或 iOS 未从主屏幕打开 | 根据状态给出具体指引 |
| 关掉应用后提醒不响 | 没有后台推送 | 导出 `.ics`，说明限制 |
| 部署后白屏或分块 404 | 旧页面引用旧分块 | 预加载失败时刷新一次，缓存名带哈希 |
| 无头浏览器通知权限为 denied | 无头环境默认拒绝 | 测试里覆盖 `Notification.permission` 并桩 `showNotification` |
| 3D/WebGL 测试很慢 | 无头浏览器软件渲染 | 放宽超时，不要删断言 |

## 七、验证流程

1. 构建并本地预览（例如 `vite build` 加 `vite preview`）。
2. 用 Playwright 在桌面与手机视口各跑一遍；通知、时间相关逻辑用桩和假时钟。
3. 需要检查 iOS 效果时换成 WebKit 引擎和 iPhone 设备配置，量弹层和内容区的真实高度。
4. 截图检查：没有页面级滚动、没有溢出、没有重叠、安全区没被遮挡。
5. 部署后到线上页面再测一遍（静态托管有缓存延迟，等 1 到 2 分钟）。
6. 汇报时明确区分“无头环境已验证”和“需要真机确认”，真机上的通知、语音、全屏、Wake Lock 无法在无头环境里证明。
