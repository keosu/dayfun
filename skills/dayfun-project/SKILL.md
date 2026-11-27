---
name: dayfun-project
description: Project guide and agent status for 趣日常 (DAYFUN), the Vite + vanilla ES modules + Three.js PWA in this repo (keosu/dayfun, deployed to GitHub Pages). Covers architecture, file map, dev/test/release flow, current limits and the latest handoff state. Use when working inside this repository, or when the user mentions 趣日常, dayfun, 随心选, 小厨房, 倒计时, 日程提醒, or deploying this site.
---

# 趣日常（DAYFUN）项目指南

这是**项目专用**技能。通用的设计偏好、协作习惯和 PWA 知识在同目录下的另外三个技能里：

- `my-design-preferences`：设计准则与偏好
- `my-working-style`：协作与验证习惯
- `pwa-mobile-web`：PWA 与移动网页实战

仓库：`keosu/dayfun`，分支 `main`，推送后由 GitHub Actions 部署到 https://keosu.github.io/dayfun/ 。

## 架构速览

- Vite 7 + 原生 ES 模块 + Three.js 0.187，无前端框架。
- 单页应用，hash 路由：`#/`、`#/picker`、`#/kitchen`、`#/timer`、`#/calendar`。视图懒加载，首次打开后一直保持挂载。路由在 `assets/js/main.js`，首页磁贴在 `assets/js/home.js`。
- 数据：IndexedDB（`storage.js`），`records.js` 是前端与同步服务共用的校验；可选同步服务 `server/sync-server.mjs`（需要 token，部署时要 HTTPS 与来源白名单）。
- 构建：`base: "./"`；`vite.config.js` 生成离线清单、把内容哈希写进 `public/sw.js`、把 three.js 拆成独立分块。
- 样式层：旧的 `styles.css`、`compact.css`、`app.css` 之后，最后加载 `assets/shell.css`。新样式写进 `shell.css`，覆盖旧规则要用更高特异性。
- **子应用 senselab（体感实验室）**：前端在 `public/senselab/`，随站点发布到 `/dayfun/senselab/`；局域网手柄服务、测试和 README 在仓库根目录的 `senselab/`（独立 `package.json`，`npm install` 后 `npm start`，不发布）。它没有自己的 Service Worker；`public/sw.js` 对 `/senselab/` 直接放行，`vite.config.js` 的离线清单排除它。手柄服务只放行 `https://keosu.github.io` 的 Origin。

更完整的文件地图见 [reference.md](reference.md)。

## 五个视图

- **首页**：2×2 磁贴，运行中的倒计时显示角标，显示下一个日程。
- **随心选**：类别下拉、动画切换、3D 区域（转盘、扭蛋、像素骰子）、“转一下”；类别和选项的编辑在弹层里，改动即时保存。默认“轮到谁”：宝宝 👶 / 爸爸 👨 / 妈妈 👩。
- **小厨房**：添加只需照片和名称，其余在“更多信息（选填）”。
- **倒计时**：搞笑风格；主界面只有大钟和开始按钮，设置在顶部弹层；超时后语音与台词逐步升级；接入系统通知。
- **日程提醒**：每周固定、一次性、每月；可勾选准点或提前 30/5 分钟等；通过系统通知提醒，并可导出 `.ics`。

## 开发与发布流程

1. `npm run format`。**新增的 CSS/JS/测试文件要登记到 `scripts/format.mjs`。**
2. `npx vite build`，确认无错误。
3. `npx vite preview --port 4173`，再 `npx playwright test`（桌面与手机各一遍，共 54 次）。
4. 检查 iOS 弹层时用 WebKit（参见 `pwa-mobile-web` 的 reference）。
5. 截图检查可用 `scripts/screenshots.mjs`。
6. 提交并推送 `main`（用户已明确授权推送到该仓库），然后 `gh run list --limit 1` 看部署，再到线上复测。
7. 临时脚本（如 `scripts/_*.mjs`）用完即删。

## 重要限制

- 没有 Web Push 后端，关闭应用后只能靠 `.ics` 与系统日历提醒。要做真正推送，先征得用户同意。
- iOS 与 Android 真机的通知、语音、Wake Lock、全屏表现还没有在真机上验证，只在 WebKit 与 Chromium 无头环境验证过布局。
- 本仓库是公开的，不要提交密钥、令牌和个人数据。

## Agent 状态（更新于 2026-11-26）

- **最近部署**：`21ee13c`（日历提醒、全屏外壳、倒计时/随心选/厨房精简、系统通知、去掉底部导航）和 `1288b5d`（修复 iOS 弹层塌陷、稳定测试）。两次部署都成功，线上用 WebKit 复测弹层高度正常。
- **测试**：完整套件 54 次（27 个用例 × 桌面和手机）全部通过。
- **已完成**：见“五个视图”，加上 PWA 图标与四个快捷方式、README 更新、通用技能整理。
- **待用户确认**：真机上的 iOS 与 Android 体验。
- **尚未做**：Web Push 后端。
- **下一步建议**：先在真机上走一遍通知授权、倒计时语音、弹层高度；有问题再按 `pwa-mobile-web` 的速查表排查。
