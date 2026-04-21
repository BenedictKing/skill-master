# skill-master

[English](./README.md) | 简体中文

跨平台 Skill 生命周期管理器。它不仅能可靠地安装和管理 skill，现在还支持**发现、审查、推荐、验证、组合与编排**。

## 新增能力

- ✅ **任务到 Skill 的推荐** —— 从用户任务出发给出可解释推荐
- ✅ **静态审查** —— 安装前审查候选 skill
- ✅ **安装后验证** —— 检查 env、结构、冲突和 smoke 状态
- ✅ **Skill 组合** —— 改造、融合或生成新的 skill 输出
- ✅ **结构化 JSON 接口** —— `find`、`inspect`、`recommend`、`verify`、`compose`、`solve` 均可作为机器接口使用
- ✅ **Solve 工作流** —— `solve` 将发现、推荐、可选安装、可选验证串成一次调用
- ✅ **内建设计文档** —— 见 [docs/skill-lifecycle-platform.md](./docs/skill-lifecycle-platform.md)

## 特性

- ✅ **智能 .env 管理** — 三级备份策略，更新时自动合并新配置
- ✅ **平台自动检测** — 根据项目目录自动识别目标平台
- ✅ **统一目录结构** — `~/.agents/` 集中管理所有 skill 和配置
- ✅ **原子化操作** — 安装失败自动回滚，保证数据完整性
- ✅ **诊断工具** — `doctor` 命令快速排查配置问题

## 安装

```bash
npm install -g skill-master
```

或直接使用：

```bash
npx skill-master add <skill-source>
```

## 快速开始

### 发现、审查与推荐

```bash
# 查找候选 skill
skill-master find "code review"
skill-master find "code review" --json

# 审查某个 source 或已安装 skill
skill-master inspect owner/repo
skill-master inspect my-skill --json

# 从任务出发推荐 skill
skill-master recommend "监控 deploy 状态"
skill-master recommend "监控 deploy 状态" --safe --local-first
skill-master recommend "监控 deploy 状态" --json

# 推荐并安装最佳匹配
skill-master recommend "获取最新库文档" --install
```

### 任务编排（solve）

```bash
# 发现 + 推荐
skill-master solve "search web docs"

# 输出结构化 orchestrator 结果
skill-master solve "search web docs" --json

# 一次调用完成推荐、安装和验证
skill-master solve "search web docs" --install --verify --json
```

### 安装 Skill

```bash
# 从 GitHub 安装
skill-master add https://github.com/user/skill-name

# 从本地路径安装
skill-master add ./local-skill

# 指定目标平台
skill-master add https://github.com/user/skill --agent=cursor

# 使用复制而非符号链接（Windows 推荐）
skill-master add https://github.com/user/skill --copy
```

### 验证与组合

```bash
# 验证已安装 skill
skill-master verify my-skill
skill-master verify my-skill --json

# 组合多个 source 输出一个新 skill 目录
skill-master compose path/to/skill-a path/to/skill-b -o ./generated-skill
skill-master compose path/to/skill-a path/to/skill-b -o ./generated-skill --json
```

### 管理环境变量

```bash
# 查看所有 skill 的配置状态
skill-master env list

# 设置环境变量
skill-master env set tavily-web TAVILY_API_KEY=your_key_here

# 用编辑器打开 .env 文件
skill-master env edit tavily-web
```

### 更新和删除

```bash
# 更新 skill（自动保护 .env）
skill-master update tavily-web

# 删除 skill
skill-master remove tavily-web

# 删除 skill 并清除配置
skill-master remove tavily-web --purge
```

### 查看信息

```bash
# 列出所有已安装的 skill
skill-master list

# 查看 skill 详细信息
skill-master info tavily-web

# 检查更新
skill-master check

# 运行诊断
skill-master doctor
```

## JSON 接口

以下命令已经支持结构化输出，适合作为上层产品或脚本的稳定接口：

```bash
skill-master find <query> --json
skill-master inspect <source|skill> --json
skill-master recommend "<task>" --json
skill-master verify <skill-name> --json
skill-master compose <source...> --json
skill-master solve "<task>" --json
```

字段级契约与 schema 入口：

- [CLI JSON 契约说明](./docs/contracts/cli-json.md)
- [recommend v1 schema](./schemas/recommend.v1.schema.json)
- [solve v1 schema](./schemas/solve.v1.schema.json)
- [verify v1 schema](./schemas/verify.v1.schema.json)

`find`、`inspect`、`compose` 已在契约文档中说明，但本轮未单独提供 schema。

## 推荐偏好参数

`recommend` 与 `solve` 支持偏好控制：

```bash
--safe              优先低风险候选
--local-first       提升本地和项目内候选优先级
--no-remote         过滤远程候选
--prefer-installed  优先已安装 skill
```

## 支持的平台

支持 39 个 AI 编程代理。具有项目目录标记的代理支持自动检测：

| 平台 | 检测标识 | Skills 目录 |
|------|---------|------------|
| Claude Code | `.claude/` | `.claude/skills/` |
| Cursor | `.cursor/` | `.cursor/skills/` |
| Cline | `.cline/` | `.cline/skills/` |
| Windsurf | `.windsurf/` | `.windsurf/skills/` |
| OpenCode | `~/.config/opencode/` | `.opencode/skills/` |
| Roo Code | `.roo/` | `.roo/skills/` |
| Augment | `.augment/` | `.augment/skills/` |
| Continue | `.continue/` | `.continue/skills/` |
| Goose | `.goose/` | `.goose/skills/` |
| Kode | `.kode/` | `.kode/skills/` |
| Trae | `.trae/` | `.trae/skills/` |

<details>
<summary>全部 39 个支持的代理</summary>

Amp, Antigravity, Augment, Claude Code, OpenClaw, Cline, CodeBuddy, Codex, Command Code, Continue, Crush, Cursor, Droid, Gemini CLI, GitHub Copilot, Goose, Junie, iFlow CLI, Kilo Code, Kimi Code CLI, Kiro CLI, Kode, MCPJam, Mistral Vibe, Mux, OpenCode, OpenHands, Pi, Qoder, Qwen Code, Replit, Roo Code, Trae, Trae CN, Windsurf, Zencoder, Neovate, Pochi, AdaL

</details>

## 命令别名

兼容 `npx skills` 命令：

```bash
skill-master add       # 或: a, install, i
skill-master remove    # 或: rm, r
skill-master list      # 或: ls
skill-master find      # 或: search, f, s
skill-master update    # 或: upgrade
```

## 开发

详见 [CLAUDE.md](./CLAUDE.md) 获取架构细节、开发命令和发布流程。

## 设计文档

完整平台设计见 [docs/skill-lifecycle-platform.md](./docs/skill-lifecycle-platform.md)。

## 与 `npx skills` 的对比

| 特性 | npx skills | skill-master |
|------|-----------|---------------|
| .env 保护 | ❌ 每次更新被删除 | ✅ 自动备份恢复 |
| 跨平台支持 | ❌ 仅 Claude Code | ✅ 39 个平台 |
| 配置管理 | ❌ 无 | ✅ env 子命令 |
| 诊断工具 | ❌ 无 | ✅ doctor 命令 |
| 发现与推荐 | ❌ 很弱 | ✅ 多源发现 + recommend |
| 安装后验证 | ❌ 无 | ✅ verify 命令 |
| 组合生成 | ❌ 无 | ✅ compose 命令 |
| 工作流编排 | ❌ 无 | ✅ solve 命令 |
| 结构化 JSON API | ❌ 无 | ✅ 核心生命周期命令支持 `--json` |
| 符号链接 | ✅ | ✅ + 复制模式 |
| Git 安装 | ✅ | ✅ |
| 本地安装 | ✅ | ✅ |

## 常见问题

### Q: 为什么需要 skill-master？

A: `npx skills add` 在安装/更新时会执行 `rm -rf`，导致 `.env` 文件被删除，用户每次更新后需要重新配置 API Key。skill-master 通过智能备份机制彻底解决这个问题，现在还能帮助用户做选择、验证和编排。

### Q: 可以和 `npx skills` 共存吗？

A: 可以。skill-master 使用独立的 `~/.agents/` 目录，不会影响现有的 skill 安装。

### Q: Windows 上符号链接失败怎么办？

A: 使用 `--copy` 参数：`skill-master add <source> --copy`

### Q: 如何迁移现有的 skill？

A: 直接用 skill-master 重新安装即可，它会自动检测并保留现有的 .env 配置。

## 许可证

MIT

## 作者

BenedictKing

## 贡献

欢迎提交 Issue 和 Pull Request！
