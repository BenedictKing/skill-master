# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
