# 趣日常 · DayFun

一组优先使用本地数据的日用小工具。前端为原生 HTML、CSS 和 JavaScript ES Modules 构成的单页应用（SPA）；3D 场景使用本地打包的 Three.js，Vite 负责开发预览与构建。界面采用紧凑的 App 布局。

在线体验：<https://keosu.github.io/dayfun/>

## 启动

需要 Node.js 20.19+ 或 22.12+。

```powershell
npm install
npm run dev
```

开发地址默认是 `http://localhost:5173`，支持热更新。开发模式不注册 Service Worker，方便修改源码。

测试 PWA、安装和离线访问时使用正式构建：

```powershell
npm run build
npm run preview
```

打开 `http://localhost:4173`。应用使用 hash 路由，四个视图分别是：

| 视图 | 路径 | 功能 |
| --- | --- | --- |
| 工具首页 | `#/` | 应用入口、最近记录 |
| 随心选 | `#/picker` | 幸运转盘、惊喜扭蛋、像素顶骰子、自定义选项、历史记录 |
| 今天吃什么 | `#/kitchen` | 公共菜谱、自己的菜、收藏、点菜与份数、用餐记录、烹饪评分 |
| 搞笑倒计时 | `#/timer` | 场景预设、自定义时长、搞笑语音、超时后越喊越急的提醒 |

`#/picker?topic=去哪玩`、`#/kitchen?tab=records`、`#/kitchen?tab=own&recipe=<id>` 等深链接可直接打开对应状态。

### 为什么是单页应用

切换工具不再整页刷新：外壳（顶栏、导航、设置）只渲染一次；每个工具的代码按需加载，首屏空闲后自动预取其余工具（包括 Three.js 引擎）；视图首次打开后保持挂载，再次切换是即时的，并保留筛选条件、滚动位置和 3D 场景。3D 场景在页面先绘制后再创建，离开随心选时暂停渲染。

## 手机上的 PWA 与全屏

整个工具集合是一个 PWA，manifest 中带有「随心选」「今天吃什么」「搞笑倒计时」三个快捷方式（长按桌面图标可直接进入）。

- **Android / Chromium**：浏览器菜单或应用设置中的「安装当前应用」。manifest 优先使用 `fullscreen`，不支持时回退至独立窗口；设置里也有网页全屏按钮。
- **iPhone / iPad**：在 Safari 中选择「分享 → 添加到主屏幕」，再从桌面打开。已配置 `black-translucent` 状态栏与刘海、底部安全区。iOS 不允许网页强制完全隐藏系统状态栏。
- **手机访问**：PWA、拍照相关能力和 Service Worker 需要 HTTPS，电脑的 `localhost` 是例外。手机通过局域网 IP 访问普通 HTTP 时可以浏览页面，但完整安装与离线功能需要配置 HTTPS。

生产构建自动生成离线资源清单，包含应用外壳、全部脚本、样式、图标和菜品图片。第一次联网访问完成缓存后，所有工具都能直接离线打开；之后启动直接使用缓存外壳，并在后台检查更新。

## 已实现的工具

搞笑倒计时提供泡面、煮鸡蛋、刷牙、写作业、看电视、午睡等场景预设，也可以自定义时长。开始时会用中文语音（浏览器自带的 Web Speech）说一句开场白；时间到后先说这个场景专属的搞笑台词，如果没人关掉，每隔约 9 秒换一句，语气、语速和音调一级比一级急，配合不同的合成音效、震动和越来越夸张的动画，十分钟后自动放弃。计时按结束时间戳计算，切到其他工具或刷新页面都不会丢；时间到时会自动跳回倒计时页，计时期间尽量保持屏幕常亮。手机锁屏后浏览器可能暂停脚本，这时提醒会在解锁后响起。

随心选提供「吃什么、玩什么、去哪玩、轮到谁、自定义」五类候选清单，「轮到谁」默认是宝宝、爸爸、妈妈；候选项放在场景上方，支持 2–16 个选项、逐项修改、批量录入、音效开关和历史删除。随机数使用 Web Crypto，并通过拒绝采样保证选项概率相同。

三个场景使用 Three.js / WebGL 建立立体模型，带 PBR 材质、环境反射与阴影；支持拖动查看视角。动画由物理模拟驱动，而不是固定的缓动曲线；结果先用 Web Crypto 抽出，再求解或采样物理过程，让自然的运动恰好停在这个结果上：

- **幸运转盘**：先回拉蓄力再甩出，转盘受摩擦与空气阻力减速；边缘的拨钉会顶起弹簧指针，低速时可能被指针「顶回」半格。用二分法求出恰好停在目标格（格内随机位置）的初速度，指针摆动和「哒哒」声由同一条轨迹计算。高速时叠加旋转模糊，灯泡追逐闪烁，停下后高亮中奖格。
- **惊喜扭蛋**：把手分两次拧一圈并有棘轮声；球仓内的扭蛋做真实的碰撞、重力与搅拌盘推动；最靠近出口的一颗从底部掉落，从出货口滑出、两次跌落、弹跳并滚动停下，摇晃几下后顶盖弹开，结果卡片从扭蛋中升起。
- **像素顶骰子**：角色下蹲蓄力、起跳（抛物线与挤压拉伸）、头顶撞到问号砖块并落地；骰子从砖块中弹出，以刚体物理在草地上翻滚弹跳。骰子的六个面写着候选项，模拟落定后把结果放到朝上的那一面，并旋转文字方向使其正对镜头。
- 镜头会平滑跟随动作，所有声音（齿轮、碰撞、弹出、跳跃等）均为实时合成，无需音频文件。

答案先在 3D 场景中显露，再高亮对应候选项；停稳约 650 毫秒后才出现透明结果框，约 2.3 秒后自动收起，不阻挡操作。动画完成后停止逐帧绘制，限制像素比与阴影尺寸以适应手机；不支持 WebGL 时回退到 CSS 场景；开启系统「减少动态效果」时直接显示结果。

首页仅保留工具入口与有数据时的最近使用记录，去掉页脚和额外灵感区。页面不显示常驻滚动条，内容较长的内层区域只在滚动时显示透明轨道上的细滑块，约 850 毫秒后自动隐藏。设置分为「偏好、同步、数据」三个短面板；在「偏好」中可切换浅色、暗色或跟随系统。主题保存在本机，在首屏绘制前生效；3D 场景背景与灯光也会随主题更新。

小厨房内置 24 道公共菜谱，覆盖八大菜系、家常菜和地方风味。每道包含图片、材料数量、做法、用时、难度和小窍门；部分复杂经典菜使用明确标注的家庭简化版本。支持按菜系、菜名、食材和地方筛选，并按用时或自己的评分排序。

自建菜谱可拍照或上传图片，填写材料、步骤与自己的小故事，后续可以编辑或删除。图片自动缩放至最长边 1200 像素并压缩成 JPEG，与菜谱一起保存。点菜清单支持份数，用餐后保存成历史；做过的菜可以记录 1–5 星评分、日期和心得。

## 本地数据与备份

数据保存于 IndexedDB 的 `little-day / records`，包含自建菜谱、照片、收藏、烹饪记录、点菜记录、随机结果与候选清单。无需登录，也不依赖同步服务器。

在设置中可以导出 / 导入 JSON 备份、申请浏览器持久存储。备份包含照片及记录，不包含服务器访问令牌。导入按记录 ID 与更新时间合并，不会重复增加同一条记录。清除站点数据、浏览器卸载或设备丢失会影响本地数据，建议定期导出备份。

## 可选同步服务器

附带一个使用 Node.js 标准库的单集合示例同步服务，可以供自己的多个设备共用。它将数据保存成 JSON 文件，支持访问令牌、明确的跨域白名单、输入校验、写入排队和原子文件替换。

```powershell
$env:SYNC_TOKEN = "your-long-random-access-token"
$env:SYNC_ORIGINS = "http://localhost:4173,https://your-app.example.com"
npm run sync-server
```

然后在应用设置中填写：

- 服务地址：本机演示为 `http://localhost:8787`；远程部署填写你的 HTTPS 地址。
- 访问令牌：与 `SYNC_TOKEN` 一致。
- 按需开启「联网后自动同步」，或点击「立即同步」。

未设置 `SYNC_TOKEN` 时，示例服务器会生成并输出临时令牌；重启后令牌会改变。`PORT` 默认 `8787`，`SYNC_DATA_FILE` 默认 `server/data/records.json`。该目录不进入版本控制。示例按令牌保护一个共享集合；需要多用户时应在自己的服务中增加账户及数据隔离。

前端先完成本地保存，自动同步失败时数据仍留在本机。手动同步先拉取、合并，再推送完整记录。不同记录按 ID 合并，同一记录使用更新时间较新的版本；同时发生的删除优先。删除通过 tombstone 同步，避免其他设备将旧数据重新带回。连续本地修改使用递增时间戳，设备间仍建议保持系统时间准确。

兼容其他服务器时，实现以下接口即可：

```text
GET /api/sync
PUT /api/sync
Authorization: Bearer <token>
Content-Type: application/json
```

GET 返回、PUT 请求与响应采用相同结构：

```json
{
  "version": 1,
  "records": [
    {
      "id": "favorite:tomato-egg",
      "type": "favorite",
      "payload": { "recipeId": "tomato-egg" },
      "updatedAt": 1795560000000,
      "deletedAt": null
    }
  ]
}
```

PUT 应合并记录并返回合并后的全集，而不是覆盖服务端文件。删除记录的 `payload` 为 `null`，`deletedAt` 为删除时间。各类型校验见 `assets/js/records.js`。服务器需处理 `OPTIONS` 并允许应用的来源、`Authorization` 与 `Content-Type`；HTTPS 页面必须连接 HTTPS 同步服务。

## 源码结构

```text
index.html                    唯一的 HTML 入口，内联首屏主题脚本
assets/js/main.js             hash 路由、视图懒加载 / 保活、空闲预取
assets/styles.css             样式，按页面与手机适配分区
assets/compact.css            紧凑 App 布局、设置密度与上方候选编辑区
assets/app.css                简洁应用界面、暗色主题与自动隐藏滚动条
assets/js/home.js             首页与最近动态
assets/js/picker.js            随机工具状态与交互
assets/js/picker-presets.js    主题候选项与场景配置
assets/js/picker-3d.js         3D 渲染器、灯光、跟随镜头、帧循环与资源释放
assets/js/picker/physics.js    转盘与骰子的确定性物理求解（无依赖，可在 Node 中运行）
assets/js/picker/wheel.js      转盘模型：拨钉、弹簧指针、旋转模糊、灯泡
assets/js/picker/capsule.js    扭蛋机模型：球体碰撞、搅拌、出货、开盖
assets/js/picker/pixel.js      像素场景：角色骨骼动画、问号砖、骰子
assets/js/picker/kit.js        材质、文字贴图、结果卡片、纸屑等共享工具
assets/js/picker/audio.js      实时合成的音效
assets/js/picker-scenes.js     不支持 WebGL 时的场景、随机数与音效
assets/js/result-popover.js    模型显露答案后的延迟透明结果框
assets/js/kitchen.js           菜谱、点菜、评分与记录
assets/js/recipes.js           公共菜谱数据
assets/js/photos.js            照片读取与压缩
assets/js/storage.js           IndexedDB 数据层
assets/js/records.js           共享数据校验与冲突规则
assets/js/sync.js              远程接口与自动同步
assets/js/ui.js                导航、弹窗、设置、提示
assets/js/settings-view.js     紧凑设置面板与主题选择
assets/js/theme.js             本地主题偏好、系统主题与场景通知
assets/js/scrollbars.js        滚动滑块显示与自动隐藏
assets/js/pwa.js               安装、全屏与离线状态
public/                       manifest、Service Worker、图片与图标
server/sync-server.mjs         可选示例同步服务
tests/                        桌面 / 手机端浏览器流程测试
```

修改菜谱直接编辑 `recipes.js`，修改默认候选项编辑 `picker-presets.js`，调整紧凑布局编辑 `compact.css`，调整暗色及最终应用样式编辑 `app.css`。添加工具时新建一个导出 `mount(element)` 的模块（可返回 `show(params)` / `hide()`），在 `main.js` 的路由表和 `ui.js` 的导航中各加一项即可。构建会自动收集新增静态资源用于离线缓存，包括 Three.js 引擎，不依赖 CDN。调整物理参数后可运行 `node scripts/tune-physics.mjs` 检查转盘时长与骰子落点。

## 检查与部署

```powershell
npm run format
npm run build
npx playwright install chromium
npm test
```

测试包含手机 / 桌面布局、单页切换不刷新且保留各视图状态、三种随机动画与转盘结果对应、完整 3D 动画过程、场景拖动、上方候选位置、内联结果、照片录入、收藏评分、点菜份数、备份、跨设备同步、删除冲突、接口校验和离线访问。

构建使用相对路径（Vite `base: "./"`），`dist/` 可以部署到任意 HTTPS 静态站点的根路径或子目录，无需改配置。推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动构建并发布到 GitHub Pages（仓库设置中 Pages 的来源选择 GitHub Actions）。若启用远程同步，单独部署同步服务并配置 HTTPS 与来源白名单（例如 `https://keosu.github.io`）。

公共菜谱图片来自 Wikimedia Commons，24 张图片的原作者、原始来源和许可记录在 `public/images/credits.json`，应用内也可查看。图片经过缩放与 JPEG 压缩，保留原有图片许可。应用图标与装饰图形由 SVG / CSS 构建，Three.js 的 MIT 许可保留于 `public/licenses/three.txt`。素材已随项目保存，运行与离线访问无需连接图片站点。
