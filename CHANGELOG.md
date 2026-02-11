# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
