# skill-master

跨平台 Skill 包管理器，解决 `npx skills` 的两大核心问题：

1. **保护 .env 配置** — 安装/更新时自动备份和恢复环境变量，不再丢失 API Key
2. **跨平台兼容** — 支持 Claude Code、Cursor、Cline、Windsurf、OpenCode 五大 AI 编程平台

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
npx skill-master install <skill-source>
```

## 快速开始

### 安装 Skill

```bash
# 从 GitHub 安装
skill-master install https://github.com/user/skill-name

# 从本地路径安装
skill-master install ./local-skill

# 指定目标平台
skill-master install https://github.com/user/skill --agent=cursor

# 使用复制而非符号链接（Windows 推荐）
skill-master install https://github.com/user/skill --copy
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

# 运行诊断
skill-master doctor
```

## 目录结构

```
~/.agents/
├── config/                    # 持久化配置（.env 文件）
│   ├── tavily-web/.env
│   └── exa-search/.env
├── skills/                    # Skill 代码（canonical 存储）
│   ├── tavily-web/
│   └── exa-search/
└── registry.json              # 已安装 skill 索引

<project>/
└── .claude/skills/            # Agent 目录（符号链接）
    ├── tavily-web -> ~/.agents/skills/tavily-web
    └── exa-search -> ~/.agents/skills/exa-search
```

## .env 保护机制

### 备份优先级

安装/更新时按以下顺序查找现有配置：

1. `~/.agents/config/<skill>/.env` （持久化位置，最高优先级）
2. `.claude/skills/<skill>/.env` （当前项目）
3. `~/.agents/skills/<skill>/.env` （canonical 位置）

### 恢复策略

- 用户已有的 `KEY=VALUE` **绝不覆盖**
- `.env.example` 中新增的 key 追加到末尾，值留空并加注释
- 保留用户的注释行

### 双写机制

为兼容现有 API 脚本（使用 `path.join(__dirname, '.env')` 加载），.env 同时写入：

- `~/.agents/config/<skill>/.env` （持久化）
- `<skill-dir>/.env` （兼容现有脚本）

## 支持的平台

| 平台 | 检测标识 | Skills 目录 |
|------|---------|------------|
| Claude Code | `.claude/` | `.claude/skills/` |
| Cursor | `.cursor/` | `.cursor/skills/` |
| Cline | `.cline/` | `.cline/skills/` |
| Windsurf | `.windsurf/` | `.windsurf/skills/` |
| OpenCode | `~/.config/opencode/` | `.opencode/skills/` |

## 开发

```bash
# 克隆仓库
git clone https://github.com/user/skill-master.git
cd skill-master

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npm run lint

# 测试
npm test
```

## 与 `npx skills` 的对比

| 特性 | npx skills | skill-master |
|------|-----------|---------------|
| .env 保护 | ❌ 每次更新被删除 | ✅ 自动备份恢复 |
| 跨平台支持 | ❌ 仅 Claude Code | ✅ 5 个平台 |
| 配置管理 | ❌ 无 | ✅ env 子命令 |
| 诊断工具 | ❌ 无 | ✅ doctor 命令 |
| 符号链接 | ✅ | ✅ + 复制模式 |
| Git 安装 | ✅ | ✅ |
| 本地安装 | ✅ | ✅ |

## 常见问题

### Q: 为什么需要 skill-master？

A: `npx skills add` 在安装/更新时会执行 `rm -rf`，导致 `.env` 文件被删除，用户每次更新后需要重新配置 API Key。skill-master 通过智能备份机制彻底解决这个问题。

### Q: 可以和 `npx skills` 共存吗？

A: 可以。skill-master 使用独立的 `~/.agents/` 目录，不会影响现有的 skill 安装。

### Q: Windows 上符号链接失败怎么办？

A: 使用 `--copy` 参数：`skill-master install <source> --copy`

### Q: 如何迁移现有的 skill？

A: 直接用 skill-master 重新安装即可，它会自动检测并保留现有的 .env 配置。

## 许可证

MIT

## 作者

BenedictKing

## 贡献

欢迎提交 Issue 和 Pull Request！
