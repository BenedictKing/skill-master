# AGENTS.md

This file provides guidance to Codex  Code (Codex.ai/code) when working with code in this repository.

## Commands

```bash
# Build
npm run build          # Build with tsup → dist/cli.js

# Test
npm test               # Watch mode
npm run test:run       # Single run
npx vitest run tests/commands/add.test.ts  # Single file

# Type check
npm run lint           # tsc --noEmit

# Development
npm run dev            # Watch mode build
npm link               # Link globally for local testing
```

## Release

```bash
npm version patch      # Bump version
git push && git push --tags  # Triggers GitHub Actions → npm publish
```

## Architecture

### Source Layout

```
src/
├── cli.ts              # Entry point, command routing
├── commands/           # CLI commands (add, remove, update, list, etc.)
├── core/               # Core logic
│   ├── installer.ts    # 9-step installation engine
│   ├── registry.ts     # ~/.agents/registry.json management
│   ├── git-source.ts   # Git clone, URL parsing (owner/repo → https://...)
│   ├── skill-parser.ts # SKILL.md frontmatter parsing
│   ├── env-manager.ts  # .env backup/restore
│   └── local-lock.ts   # Project lock file (skills-lock.json)
├── platform/
│   ├── agents.ts       # 39 agent configs (skillsDir, globalSkillsDir, detectMarker)
│   ├── detector.ts     # Auto-detect agent from cwd
│   └── capability-map.ts # Tool name → capability mapping
├── types/index.ts      # TypeScript interfaces
└── utils/              # Helpers (fs, logger, paths, errors)
```

### Data Paths

```
~/.agents/
├── config/              # Persistent configs (.env files)
│   └── <skill>/.env
├── skills/              # Skill code (canonical storage)
│   └── <skill>/
└── registry.json        # Installed skills index (v2)

<project>/
├── .Codex/skills/      # Agent directory (symlinks, per-platform)
│   └── <skill> -> ~/.agents/skills/<skill>
└── skills-lock.json     # Project lock file
```

### Installation Flow (installer.ts)

9-step process: fetchSource → findSkillDir → parseSkillMd → detectAgent → backupEnv → cleanAndInstall → restoreEnv → linkOrCopy → updateRegistry

Key behaviors:
- Git sources: clone to temp, preserve original URL in registry (not temp path)
- .env protection: backup before install, merge on restore (never overwrite existing keys)
- Symlink by default, `--copy` for Windows compatibility

### .env Protection

**Backup priority** (searches in order):
1. `~/.agents/config/<skill>/.env` (persistent, highest)
2. `.Codex/skills/<skill>/.env` (current project)
3. `~/.agents/skills/<skill>/.env` (canonical)

**Restore strategy**:
- Existing KEY=VALUE pairs never overwritten
- New keys from .env.example appended with empty values
- User comments preserved

### Source Parsing (git-source.ts)

Supports multiple formats:
- `owner/repo` → `https://github.com/owner/repo.git`
- `owner/repo@skill` → skill filter
- `owner/repo/sub/path` → subpath
- Full URLs (github.com, gitlab.com, git@, git://)

### Registry Schema (v2)

```typescript
{
  version: 2,
  skills: {
    "skill-name": {
      source: string,         // Git URL or local path
      version?: string,
      agents: AgentInstall[], // Multi-agent support
      canonical_path: string,
      env_keys: string[],
      capabilities: Capability[]
    }
  }
}
```

### Agent Platform Detection

`platform/detector.ts` checks for marker directories (`.Codex/`, `.cursor/`, `.cline/`, etc.) in cwd to auto-detect target agent. Falls back to `Codex`. See `platform/agents.ts` for all 39 supported agents with their detectMarker, skillsDir, and globalSkillsDir.

## Command Aliases

```
add       → a, install, i
remove    → rm, r
list      → ls
find      → search, f, s
update    → upgrade
restore   → install-lock
```

## Testing

Tests use `npx tsx` to run TypeScript directly. Test utils in `tests/test-utils.ts` provide `runCli()` helper.
