# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.19] - 2026-10-21

### Added
- `use` 命令支持直接下载 URL（`.md`/`.zip`/`.tgz`/`.tar.gz`，含 codeload tarball 与 Release 资产），下载失败回退原有 blob/well-known/clone 链路（`src/core/use-engine.ts`）

### Changed
- blob 快路径白名单对齐上游补入 remotion-dev
- CI `publish.yml` 升级 `actions/checkout@v5`、`actions/setup-node@v5`（@v4 依赖的 Node 20 已被 GitHub 强制跑在 Node 24 并警告弃用）

## [0.1.18] - 2026-10-21

### Added
- 新增 5 个 agent 支持：Kimi Code（`~/.kimi-code/skills`，支持 `KIMI_CODE_HOME` 覆盖）、MiniMax Code / mcode（`~/.minimax/skills`，支持 `MINIMAX_DATA_DIR` 覆盖；`~/.mavis` 为其内部代号兼容软链）、Mirasim、Kukuai、WorkBuddy（`src/platform/agents.ts`）
- **npm skills 同步生态**（对标 vercel-labs/skills `experimental_sync`）：`sync` 命令支持 package.json `skills` 字段声明式安装（`npm:pkg`、`npm:@scope/pkg/sub`、`owner/repo`、`owner/repo#ref` 四种条目），node_modules 扫描支持多 skill 包（`skills/`、`dist/skills/`），新增 `--include`/`--exclude` 过滤与 `--recursive` workspace 递归，依赖消失的 skill 自动清理（git 来源不自动清理）（`src/core/skills-field.ts`、`src/commands/sync.ts`）
- **直接 URL 安装**（对标上游 v1.5.21）：`add https://example.com/skill.tgz` 无需 git/well-known 直接装单个 SKILL.md 或 zip/tar.gz 归档，识别 codeload tarball 与 GitHub Release 资产 URL，代理环境走 curl，下载上限默认 10 MiB（`SKILL_MASTER_DOWNLOAD_MAX_BYTES` 覆盖），解压复用 well-known 加固解压器（`src/core/download-source.ts`）
- **私有仓库认证阶梯**（对标上游 PR #1857）：GitHub API（blob 快路径）匿名 → 环境变量 token（`GITHUB_TOKEN`/`GH_TOKEN`）→ `gh api` 子进程（execFile 无 shell，Node 不接触 gh 存储的凭证），401/404/限流后进程内跳过匿名档，全部失败回退认证 git clone；`SKILL_MASTER_GH_API=0` 可关闭 gh 档（`src/core/github-auth.ts`）
- **批量新增 30 个 agent**（对齐 vercel-labs/skills 2026-10 清单，总数 50 → 80）：AiderDesk、Antigravity CLI、AstrBot、Autohand Code CLI（`AUTOHAND_HOME`）、CodeArts Agent、Codemaker、Code Studio、Devin for Terminal、Dexto、ForgeCode、fx、Grok Build（`GROK_HOME`）、Hermes Agent（`HERMES_HOME`）、inference.sh、Jazz、Kimchi、Lingma、Loaf、Moxby、Ona、Posit Assistant、Qoder CN、Reasonix、Rovo Dev、Sarvam Code（`SARVAM_HOME`）、Tabnine CLI、Terramind、Tinycloud、Zed、ZCode；读取共享 `~/.agents/skills` 的 agent（Dexto/fx/Loaf/Sarvam Code/Zed）通过 `globalDetectDir` 检测。未收录：`minimax-code`（与现有 `minimax` 重复）、`zenflow`（与 `zencoder` 目录完全相同）、`eve`/`promptscript`（仅项目级特殊语义）（`src/platform/agents.ts`）
- **终端转义注入防御（CWE-150）**（对标上游 `src/sanitize.ts`）：所有人类可读输出在 logger 边界（info/warn/error/step/kv/section/表格单元格）与 find 表格统一剥离 ANSI CSI、OSC（终端标题/超链接）、其他 ESC 序列及 C0/C1 控制字符，保留 \n/\t；恶意 SKILL.md 的 name/description 或注册表 API 返回值无法再伪造输出、清屏或劫持终端标题（`src/utils/sanitize.ts`）
- **`add --json` 机器可读输出**（对标上游 v1.5.26/#1686）：隐含 `--yes`，静默全部人类日志，stdout 只输出一份 JSON（source/sourceType/global/installed/skills[name,version,canonicalPath,agents[agent,agentPath,installMode]]）；来源解析或安装失败时同样输出带 `error` 字段的 JSON 并以非零退出；`runSilenced` 抽到 `src/utils/silence.ts` 供 solve/add 共用（`src/commands/add.ts`）
- **`find --owner` 跨组织搜索**（对标上游）：`skill-master find <query> --owner <owner>` 将 owner 参数传给 skills.sh 搜索 API，并对其他来源按 source 前缀客户端过滤；`--json` 输出包含 owner 字段；`SKILL_MASTER_SKILLS_API_URL` 可覆盖 API 基址（`src/discovery/providers/skills-sh.ts`、`src/commands/find.ts`）
- **commit SHA 固定安装**（对标上游 v1.5.24/#1439）：`add owner/repo/tree/<40位SHA>` 与 `skills` 字段 `owner/repo#<SHA>` 支持；clone 回退路径对 SHA 改用 `git init + fetch --depth 1 origin <sha> + checkout FETCH_HEAD`（`git clone --branch` 不接受裸 SHA），GitHub codeload tarball 原生支持 SHA（`src/core/git-source.ts`）
- **well-known 作用域语义**（对标上游 #1990）：URL 带路径但作用域 index 不可用、回落到源站根 index 时，路径末段必须匹配某个 skill 名——匹配则只装该 skill，未命中抛 `WellKnownScopeNotFoundError`，绝不静默安装整个根目录；作用域命中但下载或 sha256 摘要校验失败时硬报错，不再静默回退 git clone（`src/core/wellknown-source.ts`）

### Changed
- **Codex / Kilo 路径对齐上游**：Codex 全局技能目录改为跨 agent 共享的 `~/.agents/skills`（Codex 官方同时读取该目录与 `~/.codex/skills`；共享目录即 skill-master 的 canonical 存储，不再另建 `~/.codex/skills` 软链），检测改用 `~/.codex`（`CODEX_HOME`）存在性；Kilo Code 项目目录改为 `.agents/skills`、全局改为 `~/.kilo/skills`（上游 #2011）。**迁移说明**：历史安装留下的 `~/.codex/skills/*` 软链仍有效但已冗余，可手动删除；新增 `AgentConfig.globalDetectDir` 支持共享目录 agent 的安装检测（`src/platform/agents.ts`）

### Fixed
- `remove -a <agent>` 对共享目录 agent（agent 路径即 canonical 本身）只解除登记、不删文件，避免把其他 agent 软链指向的 canonical 一并删掉；整体移除时先删软链再删 canonical；`removePath` 改为无条件 `rm --force`，修复悬空软链因 `existsSync` 跟随软链被误判不存在而漏删（`src/commands/remove.ts`、`src/utils/fs-helpers.ts`）
- `symlinkOrCopy` 增加同址保护：当 agent 链接路径与 canonical 存储解析到同一物理目录时（如 canonical `~/.agents/skills` 本身是指向某 agent skills 目录的软链），不再先删后链导致 canonical 内容被清空并产生自引用软链环（`src/utils/fs-helpers.ts`）
- 测试基础设施：`runCli` 子进程默认隔离 HOME 到临时目录，修复并行测试文件并发读写真实 `~/.agents/registry.json` 导致的 `add` 间歇性失败，并消除测试夹具污染开发者真实 skill 库的问题（`tests/test-utils.ts`）

## [0.1.17] - 2026-10-20

### Fixed
- 开启代理（`HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`）后 GitHub 安装仍然走直连慢速链路：Node 内置 fetch 不读取代理环境变量。检测到代理变量时 tarball 下载改用 `curl`（原生支持代理，TTY 下显示进度条），curl 不可用时回退内置 fetch
- GitHub tarball 下载超时后直接报错终止：现在会打 warning 并自动回退 `git clone` 重试（git 同样原生支持代理），两者都超时才报错并提示 `SKILL_MASTER_CLONE_TIMEOUT_MS`（`src/core/git-source.ts`）

## [0.1.16] - 2026-09-05

### Fixed
- GitHub installs of large skill collections no longer fail at step 1: `cloneRepo()` now prefers a GitHub tarball, then falls back to `git clone --depth 1` with a 5-minute budget (was 60s). Override with `SKILL_MASTER_CLONE_TIMEOUT_MS` (`src/core/git-source.ts`)

## [0.1.15] - 2026-07-23

### Added
- 移植 Vercel skills 的 5 项核心能力，补齐轻量安装与生态兼容短板：
  - **`use` 命令**：不安装直接使用 skill，输出注入 prompt 或启动 agent（`src/core/use-engine.ts`、`src/commands/use.ts`）。复用 blob/well-known/clone/本地来源物化到临时目录，绝不触碰 registry/lock/canonical path；agent 启动映射仅 claude-code/codex，其余明确报错
  - **Blob 快照快路径**：通过 GitHub Trees API + skills.sh 下载 API 物化 skill 快照，避免 git clone 整仓库下载；白名单 owner（vercel/vercel-labs 等）+ `SKILL_MASTER_BLOB` 开关，root skill 只保留 SKILL.md 避免污染 hash（`src/core/blob-source.ts`）。任一文件下载失败整体回退 clone
  - **Well-known discovery v0.1/v0.2**：实现 RFC 8615 `.well-known/agent-skills` 发现，支持 v0.2.0 artifact/url/digest + zip/tar.gz 安全解压（50MB/1000 文件上限、路径穿越/symlink/hardlink 拒绝），v0.1.0 files[] 目录模型；物化到临时目录复用磁盘发现（`src/core/wellknown-source.ts`）
  - **Agent 环境检测**：自研轻量检测（环境变量信号表，零外部依赖），agent/CI 内自动非交互；Cursor 强信号校验（`CURSOR_AGENT` 或 `agent-exec`），避免集成终端误判（`src/platform/agent-env.ts`）
- `SkillSource`/`ParsedSource` 增加 `well-known` 类型与 `displaySource` 字段

### Changed
- `confirmProjectRoot` 在 agent/CI 环境自动采用猜测的 project root（等价 `--yes`）；仅非 TTY（管道）仍需显式 `--yes` 确认，保留显式确认安全语义（`src/core/project-root.ts`）
- `parseSource` 对非 GitHub/GitLab 的 https URL 标记为 well-known，失败回退 git clone（保护自建 git 服务用户）（`src/core/git-source.ts`）
- `add`/`update`/`restore` 全链路支持 well-known sourceType；installer 解析 well-known 已物化的 localPath
- 测试 `runCli` 默认剥离 agent/CI 环境变量，使测试在「干净终端」语义下可预期

### Fixed
- **SSH URL 锁文件保留**：registry 与 lock 保留 `git@`/`ssh://` 原始 URL，避免归一化为 HTTPS 后破坏私钥认证；`update` 用 `isSameGitRepo` 判定 SSH↔HTTPS 等价，修复来源不兼容误判（`src/core/git-source.ts`、`src/commands/add.ts`、`src/commands/update.ts`）
- `parseSource` 支持 `ssh://` URL，修复被错误拼接 `https://` 前缀的 bug

## [0.1.14] - 2026-04-27

### Added
- Added `AGENTS.md` with Codex-specific repository guidance for contributors using agent workflows
- Added a `version-bump` skill under `.agents/skills` for release-oriented version automation

### Changed
- Clarified the local skill testing workflow in both `README.md` and `README.zh-CN.md`

### Fixed
- Preserved existing `.env` values during skill updates instead of overwriting configured entries
- Confirmed guessed project roots more safely across install-related commands to reduce accidental writes in the wrong directory

## [0.1.13] - 2026-04-27

### Added
- Added support for additional gh-compatible agent hosts including IBM Bob, Deep Agents, Firebender, and Warp (`src/platform/agents.ts`)
- Added fallback discovery coverage for hidden directories and a regression test for hidden nested skills (`src/core/skill-parser.ts`, `tests/core/skill-discovery.test.ts`)

### Changed
- Updated `gh skill` discovery to use `gh skill search --json`, enrich candidates with fork/upstream metadata, and infer supported agent hosts from skill paths (`src/discovery/providers/gh-skill.ts`)
- Extended `find`, `recommend`, and `solve` to filter gh skill candidates by target agent (`src/commands/find.ts`, `src/commands/recommend.ts`, `src/commands/solve.ts`, `src/discovery/search.ts`, `src/recommend/ranking.ts`)
- Added `add` command support for `--allow-hidden-dirs` and `--upstream`, including upstream source redirection for forked GitHub repositories (`src/commands/add.ts`)
- Expanded candidate/provider metadata typing and updated tests for the new gh JSON search flow and CLI flags (`src/types/index.ts`, `src/discovery/normalize.ts`, `tests/commands/add.test.ts`, `tests/commands/find.test.ts`, `tests/core/external-providers.test.ts`)

## [0.1.12] - 2026-04-22

### Changed
- `update` now restores original project install sources from `skills-lock.json`, preserving nested `skillDir` selection and skipping ambiguous sources with manual reinstall hints (`src/commands/update.ts`)
- `cloneRepo()` now sets `GIT_LFS_SKIP_SMUDGE=1` to avoid pulling unnecessary LFS payloads during install/update (`src/core/git-source.ts`)
- Added dedicated update tests covering lock-driven source recovery and safe skip behavior (`tests/commands/update.test.ts`)

## [0.1.11] - 2026-04-21

### Added
- Design document for the skill lifecycle platform in `docs/skill-lifecycle-platform.md`
- New commands: `inspect`, `recommend`, `verify`, `compose`, `solve`
- Multi-source discovery foundation in `src/discovery/search.ts`
- Discovery provider split in `src/discovery/providers/*`
- Evaluation modules for matching, quality, safety, and maintainability scoring
- Recommendation pipeline with explainable output and preference controls
- Verification pipeline with lock-file verification snapshot support
- Composition/generation foundation for adapted or merged skill outputs
- Expanded types for candidates, task requirements, evaluation, verification, composition, and recommendation preferences
- Structured JSON output for `find`, `inspect`, `recommend`, `verify`, `compose`, and `solve`
- `solve` orchestrator for discovery → recommendation → optional install → optional verify
- Optional external provider adapters for `gh skill` and Vercel provider stubs

### Changed
- `find` now uses multi-source candidate discovery instead of only `skills.sh`
- `compose` now supports resolving installed skill names to canonical paths
- `src/cli.ts` now reads version from `package.json`
- README and README.zh-CN now describe the lifecycle-platform positioning, JSON interfaces, and solve workflow

## [0.1.10] - 2026-03-01

### Added
- Plugin manifest support for Claude  Code plugin ecosystem (`src/core/plugin-manifest.ts`)
  - `getPluginSkillPaths()` - Extract skill search paths from `.claude-plugin/marketplace.json` and `plugin.json`
  - `getPluginGroupings()` - Map skill directories to plugin names for grouping
- `findAllSkillDirectoriesWithPlugins()` in skill-parser returns `DiscoveredSkill` with optional `pluginName`
- `LocalLockEntry.pluginName` field to store plugin association in lock file
- `logger.section()` function for printing grouped section headers
- `tests/core/plugin-manifest.test.ts` with 6 test cases for plugin manifest parsing

### Changed
- `cline` agent now uses universal `.agents/skills` directory (aligned with vercel-skills v1.4.3)
- `list` command groups skills by plugin name when available (falls back to flat list)
- `add` command saves `pluginName` to local lock file when installing from plugin sources
- Skill discovery now searches paths declared in plugin manifests first

### Security
- Plugin manifest paths validated to start with `./` per Claude  Code convention
- `isContainedIn()` prevents path traversal attacks via `..` segments in manifest paths

## [0.1.9] - 2026-02-25

### Added
- Project-level lock file (`skills-lock.json`) for tracking installed skills per project (`src/core/local-lock.ts`)
- `sync` command to discover and install skills from `node_modules`
- `restore` command (alias `install-lock`) to reinstall skills from `skills-lock.json`
- `discoverNodeModulesSkills()` in skill-parser for scanning `node_modules` packages with SKILL.md
- `cortex` and `universal` virtual agent platforms
- `getUniversalAgents()`, `getNonUniversalAgents()`, `isUniversalAgent()` helper functions in agents.ts
- `sanitizeName()` and `isPathSafe()` security functions in installer to prevent path traversal
- `installSkill()` now returns `InstallResult` with skillName, canonicalPath, agentPath, installMode
- New types: `InstallMode`, `LocalLockEntry`, `LocalLock`, `InstallResult`
- `LocalLockEntry.skillDir` field to record per-skill relative path within multi-skill sources

### Changed
- `cursor` and `opencode` agents now use universal `.agents/skills` directory (aligned with vercel-skills v1.4.1)
- `add` command writes to `skills-lock.json` on non-global installs
- `remove` command cleans up `skills-lock.json` entries when skills are removed
- Universal agents skip redundant symlink when canonical path equals agent path in global mode
- `restore` uses `skillDir` from lock entry to locate correct skill in multi-skill repos

### Security
- Skill names are sanitized to `[a-zA-Z0-9_.-]` with `..` path traversal sequences and leading dots stripped
- `sanitizeName` rejects names that collapse to `.` or empty string (prevents directory deletion)
- `isPathSafe()` validates resolved paths stay within expected base directories
- `readLocalLock` validates `skills` field is non-null plain object (rejects null/array corruption)
- `restore` and `sync` consistently use `sanitizeName` for node_modules skill name matching

## [0.1.5] - 2026-02-15

### Fixed
- `--skill` filter in `add` command was parsed but never applied — always installed the first skill found regardless of filter
- Unknown CLI flags (e.g. `--skills`, `--skil`) were silently ignored instead of reporting an error

### Added
- `findAllSkillDirectories()` in skill-parser to discover all SKILL.md entries in a source repo
- Skill name matching now supports both frontmatter `name` and directory name (consistent with refs/skills `filterSkills`)
- Clear error message when `--skill` filter matches no available skills, listing all discoverable skill names
- Unknown flag validation in `add` and `remove` command parsers

### Changed
- `add` command now clones git source once and iterates over discovered skills, instead of re-cloning per skill
- `findSkillDirectory()` refactored to delegate to `findAllSkillDirectories()` for code reuse

## [0.1.4] - 2026-02-11

### Changed
- Relax SKILL.md frontmatter validation to support Claude Code native skill format — only `name` is required, `version` and `allowed-tools` are now optional
- `SkillFrontmatter` type: `version`, `author`, `description`, `allowed-tools`, `user-invocable` all become optional
- `RegistryEntry.version` becomes optional to accommodate skills without version info
- `validateFrontmatter` now only type-checks fields when present instead of requiring them
- `parseSkillMd` infers skill name from directory name when `name` field is missing

### Added
- Support for Claude Code native optional frontmatter fields: `disable-model-invocation`, `argument-hint`, `model`, `agent`, `hooks`
- `findSkillDirectory` now searches one-level subdirectories for SKILL.md (enables repos with nested skill layouts)
- Null-safe handling across `installer.ts`, `list.ts`, `info.ts`, `check.ts` for optional `version` field

## [0.1.3] - 2026-02-08

### Changed
- Expand agent support from 5 to 39 platforms by centralizing agent config in `src/platform/agents.ts`
- Refactor `detector.ts` and `paths.ts` to re-export from `agents.ts`, eliminating 3 duplicate skillsDir mappings
- Convert `capability-map.ts` from full matrix to sparse mapping, gracefully handling agents without known tool names
- Derive `AgentPlatform` type from `AGENTS` constant instead of hardcoded union type

### Added
- New agents: amp, antigravity, augment, openclaw, codebuddy, codex, command-code, continue, crush, droid, gemini-cli, github-copilot, goose, junie, iflow-cli, kilo, kimi-cli, kiro-cli, kode, mcpjam, mistral-vibe, mux, openhands, pi, qoder, qwen-code, replit, roo, trae, trae-cn, zencoder, neovate, pochi, adal

## [0.1.1] - 2026-02-08

### Fixed
- Fix `owner/repo` GitHub shorthand not recognized as git source, incorrectly treated as local path
- Add bilingual language switch navigation to READMEs

## [0.1.0] - 2026-02-08

### Added
- Initial release
- Core installation engine with 9-step process
- Smart .env backup and restore mechanism
- Multi-platform support (Claude Code, Cursor, Cline, Windsurf, OpenCode)
- Platform auto-detection
- Registry management
- Environment variable management commands (`env list`, `env set`, `env edit`)
- Skill management commands (`install`, `update`, `remove`, `list`, `info`)
- Diagnostic tool (`doctor` command)
- Symlink and copy modes for cross-platform compatibility
- Atomic operations with automatic rollback
- Comprehensive error handling

### Features
- **install** - Install skills from GitHub or local paths
- **update** - Update installed skills while preserving .env
- **remove** - Remove skills with optional config purge
- **env** - Manage environment variables
- **list** - List all installed skills
- **info** - Show detailed skill information
- **doctor** - Run diagnostics and health checks

[0.1.15]: https://github.com/user/skill-master/releases/tag/v0.1.15
[0.1.0]: https://github.com/user/skill-master/releases/tag/v0.1.0
