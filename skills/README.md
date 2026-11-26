# Skills

这些技能使用通用的 Agent Skills 格式：每个目录一个 `SKILL.md`，顶部是 YAML 头（`name` 与 `description`），正文是 Markdown，不依赖某个具体工具。

| 技能 | 范围 | 内容 |
| --- | --- | --- |
| [`my-design-preferences`](my-design-preferences/SKILL.md) | 通用 | 我的设计准则与偏好、评审清单 |
| [`my-working-style`](my-working-style/SKILL.md) | 通用 | 与 AI 编程助手的协作习惯、验证与交付方式 |
| [`pwa-mobile-web`](pwa-mobile-web/SKILL.md) | 通用 | PWA、iOS/Android 支持、布局、通知、排错与验证 |
| [`dayfun-project`](dayfun-project/SKILL.md) | 仅本仓库 | 趣日常的架构、文件地图、流程与 agent 状态 |

## 怎么用

把需要的技能目录复制或链接到你所用工具的技能目录即可。常见位置：

| 工具 | 个人（全局） | 项目内 |
| --- | --- | --- |
| Cursor | `~/.cursor/skills/` | `.cursor/skills/` |
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| 其他支持 `SKILL.md` 的工具 | 参见各自文档 | 参见各自文档 |

PowerShell 示例（复制三个通用技能到 Cursor 的个人目录）：

```powershell
$dst = "$HOME\.cursor\skills"
foreach ($n in "my-design-preferences","my-working-style","pwa-mobile-web") {
  Copy-Item -Recurse -Force "skills\$n" "$dst\$n"
}
```

不支持技能的工具，可以让它读取仓库根目录的 [`AGENTS.md`](../AGENTS.md)，里面指向这些文件。

## 维护约定

- 通用技能里不要写某个项目的路径、仓库名和状态；项目细节放进项目自己的技能。
- 仓库是公开的，不要写入密钥、令牌和个人数据。
- 有新的稳定偏好时，更新 `my-design-preferences` 或 `my-working-style`，并区分“明确要求”和“默认做法”。
