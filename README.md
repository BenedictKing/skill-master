# skill-master

English | [简体中文](./README.zh-CN.md)

Cross-platform skill lifecycle manager for AI coding agents. It still installs and manages skills reliably, and now also helps with **discovery, inspection, recommendation, verification, composition, and orchestration**.

## What’s New

- ✅ **Task-to-skill recommendation** — Recommend skills from a user task with explainable scoring
- ✅ **Static inspection** — Inspect candidate skills before installation
- ✅ **Post-install verification** — Verify env, structure, conflicts, and smoke checks
- ✅ **Skill composition** — Adapt, merge, or generate skill outputs
- ✅ **Structured JSON interfaces** — `find`, `inspect`, `recommend`, `verify`, `compose`, and `solve` can now serve as machine-consumable interfaces
- ✅ **Solve workflow** — `solve` orchestrates discovery, recommendation, optional install, and optional verify
- ✅ **Design doc included** — See [docs/skill-lifecycle-platform.md](./docs/skill-lifecycle-platform.md)

## Features

- ✅ **Smart .env Management** — Auto backup/restore environment variables during updates
- ✅ **Multi-Platform Support** — 80 AI coding agents including Claude Code, Cursor, Cline, Windsurf, OpenCode and more
- ✅ **npx skills Compatible** — Drop-in replacement with same command interface
- ✅ **Unified Directory** — Centralized management in `~/.agents/`
- ✅ **Atomic Operations** — Auto rollback on failure
- ✅ **Diagnostic Tools** — Built-in `doctor` command

## Installation

```bash
npm install -g skill-master
```

Or use directly:

```bash
npx skill-master add <source>
```

## Quick Start

### Discover, Inspect, and Recommend

```bash
# Discover candidates
skill-master find "code review"
skill-master find cli --owner vercel-labs
skill-master find "code review" --json

# Inspect a source or installed skill
skill-master inspect owner/repo
skill-master inspect my-skill --json

# Recommend skills from a task
skill-master recommend "monitor deploy status"
skill-master recommend "monitor deploy status" --safe --local-first
skill-master recommend "monitor deploy status" --json

# Recommend and install best match
skill-master recommend "fetch latest library docs" --install
```

### Solve a Task End-to-End

```bash
# Discovery + recommendation
skill-master solve "search web docs"

# Structured orchestration output
skill-master solve "search web docs" --json

# Orchestrate recommendation, install, and verify
skill-master solve "search web docs" --install --verify --json
```

### Install Skills

```bash
# From GitHub
skill-master add owner/repo
skill-master add https://github.com/user/skill

# From local path
skill-master add ./local-skill
skill-master add ../skills/my-skill
skill-master add /absolute/path/to/my-skill

# Discover or select from a local multi-skill directory
skill-master add ./skills --list
skill-master add ./skills --skill my-skill
skill-master add ./skills --full-depth

# Specify target agent
skill-master add owner/repo -a claude-code cursor

# Copy mode (recommended for Windows)
skill-master add owner/repo --copy

# Pin to an exact commit (tree URL or skills-field ref)
skill-master add https://github.com/user/skill/tree/<40-hex-sha>

# Direct download URL: single SKILL.md or .zip/.tgz/.tar.gz archive
skill-master add https://example.com/skill.tgz
skill-master add https://example.com/SKILL.md

# Machine-readable result (implies --yes; errors are JSON too)
skill-master add owner/repo --json
skill-master add https://github.com/user/repo/releases/download/v1/skill.zip
```

For local skill development and testing:

- `add` accepts local directories, so you can install a skill directly from a working folder.
- If a directory contains multiple skills, use `--list`, `--skill`, or `--full-depth` to discover or narrow the install set.
- Local installs are copied into the canonical skill store before being linked into the target agent/project.
- After editing the original local skill directory, run `skill-master add <path>` again to reinstall the updated version.

Large GitHub skill collections (hundreds of megabytes) used to fail at step 1 because `git clone --depth 1` was hard-capped at 60 seconds. `add` now downloads a GitHub tarball first, then falls back to git clone with a 5-minute budget. Override with `SKILL_MASTER_CLONE_TIMEOUT_MS`, or clone the repo yourself and pass the local path.

When `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY` is set, the tarball download runs through `curl` (Node's built-in fetch ignores these variables) and shows a progress bar on TTY. If the tarball download times out, skill-master retries via git clone before giving up.

Direct download URLs (`.md`, `.zip`, `.tgz`, `.tar.gz`, including `codeload.github.com` tarballs and GitHub release assets) are fetched without git, honored through the same proxy handling. Downloads are capped at 10 MiB by default — override with `SKILL_MASTER_DOWNLOAD_MAX_BYTES`; extraction reuses the hardened well-known extractor (path-traversal, symlink, and decompression-bomb protections).

### Private Repositories

GitHub API access (the blob fast path) uses an auth ladder: anonymous → explicit env token (`GITHUB_TOKEN`/`GH_TOKEN`) → `gh api` subprocess (execFile, no shell). The Node process never reads credentials stored by the `gh` CLI — the gh subprocess injects its own auth. After a 401/404/rate-limit, anonymous attempts are skipped for the rest of the process. Whatever the API ladder cannot see falls back to an authenticated `git clone` (via your configured git credential helper). Set `SKILL_MASTER_GH_API=0` to disable the gh subprocess rung.

### Verify and Compose

```bash
# Verify installed skill
skill-master verify my-skill
skill-master verify my-skill --json

# Compose a new skill output from multiple sources
skill-master compose path/to/skill-a path/to/skill-b -o ./generated-skill
skill-master compose path/to/skill-a path/to/skill-b -o ./generated-skill --json
```

### Manage Environment Variables

```bash
# List all skills with env status
skill-master env list

# Set environment variable
skill-master env set my-skill API_KEY=your_key

# Edit .env file
skill-master env edit my-skill
```

### Update and Remove

```bash
# Update skill (auto preserves .env)
skill-master update my-skill

# Remove skill
skill-master remove my-skill

# Remove with config purge
skill-master remove my-skill --purge
```

### Sync npm Skills

`sync` installs skills shipped inside `node_modules` and skills declared in the package.json `skills` field, keeping them in sync with your dependencies. Skills whose source disappears (dependency removed) are cleaned up automatically.

```bash
# Scan node_modules + the skills field and sync
skill-master sync

# Declare skill dependencies in package.json
{
  "skills": {
    "my-skill": "npm:some-pkg",              // package with a root SKILL.md
    "inner": "npm:@scope/pkg/inner-skill",   // select one skill of a multi-skill package
    "from-git": "owner/repo",                 // git source, installs all skills in the repo
    "pinned": "owner/repo#v1.2.0"             // git source pinned to a ref
  }
}

# Only sync specific skills / skip some
skill-master sync --include my-skill --exclude other-skill

# Also read the skills field of workspace packages
skill-master sync --recursive
```

Packages can ship a single skill (`<pkg>/SKILL.md`) or multiple skills (`<pkg>/skills/*/SKILL.md`, `<pkg>/dist/skills/*/SKILL.md`). `npm:` entries require the package to be installed first (`npm install`); `sync` re-runs cleanly — unchanged skills are skipped by content hash, and git sources refresh via `skill-master update`.

### Other Commands

```bash
# List installed skills
skill-master list

# Check for updates
skill-master check

# Create new skill template
skill-master init my-new-skill

# Show skill details
skill-master info my-skill

# Run diagnostics
skill-master doctor
```

## JSON Interfaces

These commands now support structured output for scripting and higher-level products:

```bash
skill-master find <query> --json
skill-master inspect <source|skill> --json
skill-master recommend "<task>" --json
skill-master verify <skill-name> --json
skill-master compose <source...> --json
skill-master solve "<task>" --json
```

Field-level contracts and stable schema entry points:

- [CLI JSON contract](./docs/contracts/cli-json.en.md)
- [recommend v1 schema](./schemas/recommend.v1.schema.json)
- [solve v1 schema](./schemas/solve.v1.schema.json)
- [verify v1 schema](./schemas/verify.v1.schema.json)

`find`, `inspect`, and `compose` are documented in the contract doc, but do not ship a dedicated schema in this round.

## Recommendation Preferences

`recommend` and `solve` support preference tuning:

```bash
--safe              prefer lower-risk candidates
--local-first       boost local and project candidates
--no-remote         filter out remote-only candidates
--prefer-installed  boost already installed skills
```

## Command Aliases

All `npx skills` commands work:

```bash
skill-master add       # or: a, install, i
skill-master remove    # or: rm, r
skill-master list      # or: ls
skill-master find      # or: search, f, s
skill-master update    # or: upgrade
```

## Supported Platforms

80 AI coding agents are supported. Auto-detection works for agents with a project directory marker:

| Platform | Detection | Skills Directory |
|----------|-----------|------------------|
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
| Kimi Code | `.kimi-code/` | `.kimi-code/skills/` |
| MiniMax Code | `.minimax/` | `.minimax/skills/` |

<details>
<summary>All 80 supported agents</summary>

Amp, Antigravity, Augment, Claude Code, OpenClaw, Cline, CodeBuddy, Codex, Command Code, Continue, Crush, Cursor, Droid, Gemini CLI, GitHub Copilot, Goose, Junie, iFlow CLI, Kilo Code, Kimi Code, Kimi Code CLI, Kiro CLI, Kode, Kukuai, MCPJam, MiniMax Code, Mirasim, Mistral Vibe, Mux, OpenCode, OpenHands, Pi, Qoder, Qwen Code, Replit, Roo Code, Trae, Trae CN, Windsurf, WorkBuddy, Zencoder, Neovate, Pochi, AdaL, AiderDesk, Antigravity CLI, AstrBot, Autohand Code CLI, CodeArts Agent, Codemaker, Code Studio, Devin for Terminal, Dexto, ForgeCode, fx, Grok Build, Hermes Agent, inference.sh, Jazz, Kimchi, Lingma, Loaf, Moxby, Ona, Posit Assistant, Qoder CN, Reasonix, Rovo Dev, Sarvam Code, Tabnine CLI, Terramind, Tinycloud, Zed, ZCode

</details>

## Development

See [CLAUDE.md](./CLAUDE.md) for architecture, development commands, and release workflow.

## Design

See [docs/skill-lifecycle-platform.md](./docs/skill-lifecycle-platform.md) for the full platform design.

## vs npx skills

| Feature | npx skills | skill-master |
|---------|-----------|---------------|
| .env Protection | ❌ Deleted on update | ✅ Auto backup/restore |
| Multi-Platform | ❌ Claude Code only | ✅ 80 platforms |
| Config Management | ❌ None | ✅ env commands |
| Diagnostics | ❌ None | ✅ doctor command |
| Discovery & Recommendation | ❌ Minimal | ✅ Multi-source + recommend |
| Verification | ❌ None | ✅ verify command |
| Composition | ❌ None | ✅ compose command |
| Orchestration | ❌ None | ✅ solve command |
| Structured JSON API | ❌ None | ✅ Core lifecycle commands support `--json` |
| Symlinks | ✅ | ✅ + copy mode |
| Git Install | ✅ | ✅ |
| Local Install | ✅ | ✅ |

## FAQ

### Why skill-master?

`npx skills add` executes `rm -rf` during install/update, deleting `.env` files. Users must reconfigure API keys after every update. skill-master solves this with intelligent backup and now also helps users choose, verify, and orchestrate skills.

### Can it coexist with npx skills?

Yes. skill-master uses separate `~/.agents/` directory and won't affect existing installations.

### Symlink fails on Windows?

Use `--copy` flag: `skill-master add <source> --copy`

### How to migrate existing skills?

Simply reinstall with skill-master. It will auto-detect and preserve existing `.env` configs.

## License

MIT

## Author

BenedictKing

## Contributing

Issues and Pull Requests are welcome!
