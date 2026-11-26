# 趣日常文件地图

| 路径 | 作用 |
| --- | --- |
| `index.html` | 外壳入口，viewport、主题色、苹果主屏幕元信息，按顺序加载旧样式与 `shell.css` |
| `assets/js/main.js` | 路由表、懒加载、视图挂载、`restoreTimer()`、启动提醒调度器、预取其它视图 |
| `assets/js/ui.js` | 顶栏 `initShell()`、工具栏 `toolbar()`、弹层 `modal()`、提示 `toast()`、设置入口 |
| `assets/js/home.js` | 首页磁贴、最近使用、下一个日程提示 |
| `assets/js/picker.js` | 随心选：类别下拉、选项编辑弹层、动画模式、历史记录 |
| `assets/js/picker-presets.js` | 默认类别与选项、类别 emoji、动画模式列表 |
| `assets/js/picker-3d.js`、`assets/js/picker/*.js` | Three.js 场景（转盘、扭蛋、像素骰子）与音效 |
| `assets/js/timer.js`、`assets/timer.css` | 搞笑倒计时：台词、语音、音效、超时升级、设置弹层 |
| `assets/js/kitchen.js` | 小厨房：菜谱、我的菜、收藏、点菜、记录、添加/编辑 |
| `assets/js/schedule.js`、`assets/schedule.css` | 日程提醒视图与编辑弹层 |
| `assets/js/schedule-core.js` | 纯函数：重复规则、提醒时刻、文案、iCalendar 导出 |
| `assets/js/reminders.js` | 调度器：15 秒轮询，错过补发，已触发记录（localStorage） |
| `assets/js/notify.js` | 通知权限、iOS 安装判断、Service Worker 通知 |
| `assets/js/pwa.js` | 注册 SW、离线就绪状态、安装、全屏、`isInstalled()` |
| `assets/js/storage.js`、`records.js`、`sync.js` | IndexedDB、共享校验、远端同步 |
| `assets/shell.css` | 最终样式：外壳、顶栏、弹层、首页、随心选、厨房、日历、倒计时的覆盖 |
| `public/sw.js` | Service Worker；构建时注入缓存版本与预缓存清单 |
| `public/manifest.webmanifest` | 名称、fullscreen、图标、四个快捷方式 |
| `vite.config.js` | `base: "./"`、离线清单、缓存版本哈希、three.js 独立分块 |
| `scripts/format.mjs` | Prettier 格式化列表，新增文件要登记 |
| `scripts/generate-icons.mjs` | 生成 PWA 图标（微笑的太阳，各工具图标） |
| `scripts/screenshots.mjs` | 截图并检查页面是否溢出、是否有图片缺失 |
| `tests/*.spec.js` | Playwright：app、animation、calendar、timer、theme、sync |
| `.github/workflows/deploy.yml` | push 到 main 后构建并发布到 GitHub Pages |

## 项目内的测试小窍门

- `openTool` 辅助函数先读 `body[data-app]`，点 `.app-back:visible` 再点 `.hm-<view>`，等 `data-app` 和视图可见。
- 动画测试在软件 WebGL 下很慢，已把单个测试超时设为 120 秒，`#scene-result` 等待 60 秒。
- 旧用例依赖的 `.bottom-nav`、`.recipe-card` 选择器已删除，改版后要同步选择器。
- 通知相关用例用桩和假时钟，写法见 `skills/pwa-mobile-web/reference.md`。
