# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[0.1.0]: https://github.com/user/skill-master/releases/tag/v0.1.0
