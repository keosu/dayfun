# 体感实验室

一个 PWA，用来**验证 iOS / Android 手机的系统能力**，并把手机变成**局域网里的体感游戏手柄**。

它是趣日常（dayfun）站点的一部分：

- 页面：<https://keosu.github.io/dayfun/senselab/>（传感器、动作识别、系统能力都能直接用；手柄需要电脑上的局域网服务，见下文）
- 前端源码：[`public/senselab/`](../public/senselab/)，随 dayfun 一起构建和部署
- 局域网服务、测试和示例：本目录（不发布到 GitHub Pages）

界面风格沿用趣日常：暖纸色、珊瑚色主色、大圆角、一屏不滚动、没有底部导航、浅色深色跟随系统。

## 四个页面

| 页面 | 做什么 |
| --- | --- |
| 🧭 传感器体检 | 定位、加速度计、陀螺仪、方向与指南针、磁力计、环境光、电池、网络、震动、屏幕与触控；每项显示“正常 / 等待 / 不支持 / 出错”和实时数值，顶部有一个跟着手机转的 3D 手机 |
| 🥋 动作识别 | 识别 21 种动作，大字显示最近一次；有水平仪、历史记录和**动作图鉴**（做对一次点亮一次） |
| 🎮 体感手柄 | 摇杆 + A/B/X/Y + 倾斜 + 动作，通过 WebSocket 发给电脑；游戏可以回传震动 |
| 🔧 系统能力 | 震动、通知、屏幕常亮、全屏、锁定横屏、分享、剪贴板、声音、语音、安装到主屏幕 |

电脑上还有一个**监视器**（`pc.html`，需要本地服务）：显示每个手柄的状态和动作记录。

## 两种用法

### 1. 只看传感器和动作（不需要电脑）

用手机打开 <https://keosu.github.io/dayfun/senselab/> 即可。GitHub Pages 有 HTTPS，传感器和定位接口可用。

### 2. 当手柄（需要电脑运行局域网服务）

```powershell
cd senselab
npm install
npm start                  # 可选：npm start -- --pin 1234
```

终端会列出手机要打开的地址和一个二维码。手机和电脑要在**同一个 Wi-Fi**。

- 手柄页面可以用 `https://<电脑IP>:8443/`（本服务自带，需要信任自签名证书），也可以用上面的 GitHub Pages 地址；后者的手柄地址填 `<电脑IP>:8443`。
- 游戏和电脑监视器用 HTTP：`http://localhost:8080/pc.html`、`ws://<电脑IP>:8080/ws?role=game`。
- Windows 防火墙第一次会询问是否允许 Node.js 访问网络，选“专用网络”。

## 为什么手柄要信任证书

- 传感器只在 HTTPS（安全上下文）下开放，iOS 还要求在点击中申请“运动与方向”权限。
- GitHub Pages 页面是 HTTPS，所以只能连 `wss://` 的局域网地址。服务的证书是自签名的，手机需要先信任一次：
  - **iPhone**：Safari 打开 `https://<电脑IP>:8443/`，点“显示详细信息 → 访问此网站”。之后 GitHub Pages 上的手柄才能连上（这一步在真机上还没验证）。
  - **安卓 Chrome**：打开 `https://<电脑IP>:8443/`，点“高级 → 继续前往”。
- 想省掉这一步，可以用 [mkcert](https://github.com/FiloSottile/mkcert) 生成证书，放进 `certs/`（`cert.pem` 和 `key.pem`），并在手机上安装 mkcert 的根证书。服务会优先使用 `certs/` 里的证书。
- 自签名证书会生成在 `.certs/`（已被 git 忽略）。

## 和 dayfun 的关系

- **发布**：`public/senselab/` 会被 Vite 原样复制到 `dist/senselab/`，随 dayfun 的 GitHub Actions 部署。
- **Service Worker**：dayfun 的 `public/sw.js` 管着整个 `/dayfun/` 范围，所以它在 fetch 里放行了 `/senselab/`；离线清单也排除了 senselab 的文件。senselab 自己**没有** Service Worker，因此没有离线能力。
- **手柄连接来源**：中继只放行 `https://keosu.github.io`（`server/hub.mjs` 里的 `PAGES_ORIGINS`）。别人的 `*.github.io` 连不上。想加别的来源，启动时用 `--allow-origin https://example.com`。
- **通知**：系统能力里的通知走 `navigator.serviceWorker` 的注册，在 GitHub Pages 上拿到的是 dayfun 的注册，所以点通知会打开趣日常首页，而不是体感实验室。
- **地址**：手柄只在带端口的页面（即本地服务）上自动填写服务器地址；GitHub Pages 没有端口，需要手填。

## 动作识别

识别引擎在 [`public/senselab/js/gestures.js`](../public/senselab/js/gestures.js)，纯计算、不碰 DOM，浏览器和 Node 测试共用。

方向都按**世界里的方向**定义（以你的视角为准，和手机怎么拿无关）：

| 类别 | 事件 | 怎么做 |
| --- | --- | --- |
| 升降 | `lift` 上升 · `drop` 下降 | 手机向上托一下 / 向下快速一沉 |
| 轻挥 | `swing-left` · `swing-right` | 向左、向右轻轻挥一下 |
| 推拉 | `push` 向前推 · `pull` 向后拉 | 远离自己 / 朝向自己 |
| 重甩 | `flick-left` · `flick-right` · `flick-forward` · `flick-back` | 用力甩出去（力度超过阈值） |
| 摇晃 | `shake-lr` 左右 · `shake-ud` 上下 · `shake-fb` 前后 | 来回快速晃几下 |
| 翻转 | `flip-forward` · `flip-back` · `flip-left` · `flip-right` | 翻个跟头，转过约 150° |
| 拧转 | `twist-cw` · `twist-ccw` | 像拧瓶盖，绕屏幕法线转约 120° |
| 翻面 | `face-up` · `face-down` | 屏幕朝上 / 朝下 |
| 连续量 | 倾斜角 `roll`、`pitch`，归一化 `tx`、`ty` | 当方向盘、摇杆用 |

识别思路：

1. **线性加速度**：优先用系统给的 `acceleration`，没有就用慢速低通估计重力后相减。
2. **世界坐标分解**：用重力得到“上”，再由屏幕法线或屏幕顶边得到“前”，叉乘得到“右”。挥动被分解成 左右 / 前后 / 竖直 三路。
3. **脉冲检测**：越过阈值记录峰值，回落到 55% 或反向时结束；用峰值区分“轻挥”和“重甩”，并要求明显强于同时间窗里的其他方向。
4. **摇晃**：同一路在 1 秒内出现 4 次以上交替方向的大峰；隔了一小段静止再动，重新计数。
5. **翻转 / 拧转**：对陀螺仪角速度做 700 ms 滑动窗口积分，转过的角度够大且集中在一个轴上才报。
6. **抗误触**：转得太快时的线性加速度多半是旋转造成的假象，会被屏蔽；翻转后有冷却；静止噪声测试里一个事件都不会误报。
7. **iOS / Android 差异**：iOS 的 `accelerationIncludingGravity` 符号与 Android 相反。引擎在手机静止时拿它和 `deviceorientation` 推出的“向上”对比，自动判断符号。
8. **握持方式**：翻转、拧转、倾斜用手机自身的轴，横握时按屏幕方向（或手动选择）换算。

灵敏度（灵敏 / 标准 / 迟钝）按比例缩放阈值，基础阈值在 `DEFAULTS` 里。

### 现成的库

没有联网核实最新状态，以下凭记忆列出，决定用之前请先确认：

- **Shake.js** 一类：只识别“摇一摇”，覆盖不了翻动、升降、甩。
- **gyronorm.js**：归一化 iOS / Android 的方向数据，不做动作识别。
- **$1、$3 等模板识别器、DTW**：给一批录制样本做匹配，适合“画圈”“写 S”这类复杂动作。
- **机器学习**（TensorFlow.js、Edge Impulse 等）：需要采集训练数据。

简单、低延迟的动作（对游戏最重要）已用规则实现。以后要加复杂动作，建议在引擎里加“录制模板 + DTW”，输出同样的事件。

## 手柄协议

WebSocket 路径：`/ws?role=pad|game&room=default&name=昵称&pin=口令`。文本帧，JSON。

- 手机（`pad`）：本地服务的 `wss://<IP>:8443`，或 GitHub Pages 页面连同一地址。
- 游戏（`game`）：建议 `ws://<IP>:8080`，不用处理证书。
- 每个房间最多 8 个手柄，按加入顺序编号 P1、P2…，离开后编号可复用。

### 手柄 → 游戏

服务端会加上 `p`（玩家编号）和 `at`（服务器时间戳 ms），只转发已知字段。

```jsonc
{ "t": "state", "p": 1, "seq": 123,
  "tx": 0.42, "ty": -0.1,        // 倾斜：-1…1，右、前为正
  "roll": 15, "pitch": -3,       // 倾斜角度（相对“正中”）
  "sx": 0, "sy": 0.8,            // 虚拟摇杆：-1…1，右、上为正
  "gx": 0, "gy": 0, "gz": 0 }    // 陀螺仪，度/秒（已按握持方式换算）
{ "t": "btn", "p": 1, "id": "A", "down": true }            // A B X Y
{ "t": "gesture", "p": 1, "name": "flick-right", "power": 21.3, "hard": true }
{ "t": "left", "p": 1 }          // 手柄离开：把它按着的状态清掉
{ "t": "players", "list": [{ "p": 1, "name": "宝宝" }] }
```

`state` 默认每秒 30 次（20 / 30 / 60 可选），没有变化时只发 4 次/秒的心跳。

### 游戏 → 手柄

```jsonc
{ "t": "rumble", "pattern": [60, 40, 60], "p": 1 }   // p 省略则震动所有手柄；pattern 单位 ms
{ "t": "ping", "ts": 1234 }                          // 回 { "t": "pong", "ts": 1234 }
```

iPhone 的 Safari 网页没有震动接口，`rumble` 在 iPhone 上没有反应；安卓可以。

试一下：`node examples/game-client.mjs localhost:8080`。

### 安全

- 局域网内任何人都能连，建议加 `--pin 1234`。
- 浏览器发起的连接检查 `Origin`：必须是访问的主机本身，或在白名单（`PAGES_ORIGINS` 和 `--allow-origin`）里。游戏、脚本没有 `Origin`，不受影响。
- 消息大小限制 2KB，每个手柄每秒最多处理 150 条，未知字段一律丢弃。
- 服务不保存任何数据。证书和口令只在本机。

## 目录

```
../public/senselab/   前端（静态文件，随 dayfun 发布到 GitHub Pages）
  index.html          外壳
  pc.html             电脑端监视器（需要本地服务）
  js/gestures.js      动作识别引擎（纯计算）
  js/motion.js        传感器中心：权限、监听、分发
  js/link.js          手柄连接（WebSocket，自动重连）
  js/views/           四个视图
  icons/              图标（scripts/make-icons.mjs 生成）
server/               HTTPS + WebSocket 中继（hub.mjs 是转发逻辑，cert.mjs 管证书）
test/                 Node 单元测试：识别引擎、中继
e2e/                  Playwright 端到端与截图
examples/             游戏端示例
scripts/make-icons.mjs  生成图标（纯 Node）
```

## 测试

```powershell
npm test            # 识别引擎 17 个、中继 8 个
npm run test:ui     # Playwright：桌面 / 手机 / 小屏，共 25 次（监视器用例只在桌面跑）
```

端到端测试用合成的 `devicemotion` 数据驱动真实页面，并用一个 WebSocket“游戏”验证按键、摇杆、动作、倾斜和震动回传的全链路。截图保存在 `screenshots/`（已被忽略）。

dayfun 的测试（在仓库根目录 `npx playwright test`）包含一条 `tests/senselab.spec.js`，确认 `/senselab/` 不会被趣日常的 Service Worker 接管。

## 限制与待真机确认

- **没有在真机上验证。** 所有结论来自单元测试、合成数据和 Chromium / WebKit 无头环境。真机要重点确认：iOS 权限弹窗、两个平台的加速度符号与陀螺仪方向、翻转和拧转的方向名、阈值是否合手，以及 GitHub Pages 页面连接局域网 `wss://` 的整个流程（尤其是 iPhone 上的证书信任）。
- iPhone Safari 没有网页震动、电池、网络质量、磁力计、环境光接口，对应卡片会显示“不支持”，这是系统限制。
- 网页不能在后台继续读取传感器，**手柄页面需要保持在前台**，并会请求屏幕常亮。
- 当前版本没有离线能力（senselab 没有自己的 Service Worker）。
- 很新的 Chrome 对公网页面访问局域网可能会弹出“本地网络访问”权限提示，需要点允许。

## Agent 状态（2026-11-27）

- **已完成**：四个页面、监视器、识别引擎（21 种动作）、手柄中继与协议、自签名证书、图标与清单；迁入 dayfun 的 `/senselab/`；dayfun 的 Service Worker 放行与离线清单排除。
- **已验证**：senselab 单元测试 25 个、端到端 25 次；dayfun 完整测试 56 次（含新增的子页面用例，一次偶发的 WebGL 超时，单独重跑通过）；`vite build` 产物里有 `dist/senselab/`，预缓存不含 senselab。
- **待用户确认**：真机上的传感器权限、方向符号、识别手感、震动、全屏，以及 Pages 页面连接局域网手柄的整个流程。
- **尚未做**：把手柄事件映射成键盘 / 鼠标 / 虚拟手柄的桥接程序；复杂动作（模板匹配）；阈值自适应校准；senselab 的离线能力。
