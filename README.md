# skill-manager

[中文文档](./README.zh-CN.md)

Cross-platform skill package manager for AI coding agents, fully compatible with `npx skills` CLI.

## Features

- ✅ **Smart .env Management** — Auto backup/restore environment variables during updates
- ✅ **Multi-Platform Support** — Claude Code, Cursor, Cline, Windsurf, OpenCode
- ✅ **npx skills Compatible** — Drop-in replacement with same command interface
- ✅ **Unified Directory** — Centralized management in `~/.agents/`
- ✅ **Atomic Operations** — Auto rollback on failure
- ✅ **Diagnostic Tools** — Built-in `doctor` command

## Installation

```bash
npm install -g skill-manager
```

Or use directly:

```bash
npx skill-manager add <source>
```

## Quick Start

### Install Skills

```bash
# From GitHub
skill-manager add owner/repo
skill-manager add https://github.com/user/skill

# From local path
skill-manager add ./local-skill

# Specify target agent
skill-manager add owner/repo -a claude-code cursor

# Copy mode (recommended for Windows)
skill-manager add owner/repo --copy
```

### Manage Environment Variables

```bash
# List all skills with env status
skill-manager env list

# Set environment variable
skill-manager env set my-skill API_KEY=your_key

# Edit .env file
skill-manager env edit my-skill
```

### Update and Remove

```bash
# Update skill (auto preserves .env)
skill-manager update my-skill

# Remove skill
skill-manager remove my-skill

# Remove with config purge
skill-manager remove my-skill --purge
```

### Other Commands

```bash
# List installed skills
skill-manager list

# Search for skills
skill-manager find "code review"

# Check for updates
skill-manager check

# Create new skill template
skill-manager init my-new-skill

# Show skill details
skill-manager info my-skill

# Run diagnostics
skill-manager doctor
```

## Command Aliases

All `npx skills` commands work:

```bash
skill-manager add       # or: a, install, i
skill-manager remove    # or: rm, r
skill-manager list      # or: ls
skill-manager find      # or: search, f, s
skill-manager update    # or: upgrade
```

## Directory Structure

```
~/.agents/
├── config/              # Persistent configs (.env files)
│   ├── my-skill/.env
│   └── other-skill/.env
├── skills/              # Skill code (canonical storage)
│   ├── my-skill/
│   └── other-skill/
└── registry.json        # Installed skills index

<project>/
└── .claude/skills/      # Agent directory (symlinks)
    ├── my-skill -> ~/.agents/skills/my-skill
    └── other-skill -> ~/.agents/skills/other-skill
```

## .env Protection

### Backup Priority

During install/update, searches for existing config in order:

1. `~/.agents/config/<skill>/.env` (persistent, highest priority)
2. `.claude/skills/<skill>/.env` (current project)
3. `~/.agents/skills/<skill>/.env` (canonical location)

### Restore Strategy

- Existing `KEY=VALUE` pairs are **never overwritten**
- New keys from `.env.example` are appended with empty values
- User comments are preserved

## Supported Platforms

| Platform | Detection | Skills Directory |
|----------|-----------|------------------|
| Claude Code | `.claude/` | `.claude/skills/` |
| Cursor | `.cursor/` | `.cursor/skills/` |
| Cline | `.cline/` | `.cline/skills/` |
| Windsurf | `.windsurf/` | `.windsurf/skills/` |
| OpenCode | `~/.config/opencode/` | `.opencode/skills/` |

## Development

```bash
# Clone repository
git clone https://github.com/yourusername/skill-manager.git
cd skill-manager

# Install dependencies
npm install

# Development mode
npm run dev

# Build
npm run build

# Type check
npm run lint

# Test
npm test
```

## vs npx skills

| Feature | npx skills | skill-manager |
|---------|-----------|---------------|
| .env Protection | ❌ Deleted on update | ✅ Auto backup/restore |
| Multi-Platform | ❌ Claude Code only | ✅ 5 platforms |
| Config Management | ❌ None | ✅ env commands |
| Diagnostics | ❌ None | ✅ doctor command |
| Symlinks | ✅ | ✅ + copy mode |
| Git Install | ✅ | ✅ |
| Local Install | ✅ | ✅ |

## FAQ

### Why skill-manager?

`npx skills add` executes `rm -rf` during install/update, deleting `.env` files. Users must reconfigure API keys after every update. skill-manager solves this with intelligent backup.

### Can it coexist with npx skills?

Yes. skill-manager uses separate `~/.agents/` directory and won't affect existing installations.

### Symlink fails on Windows?

Use `--copy` flag: `skill-manager add <source> --copy`

### How to migrate existing skills?

Simply reinstall with skill-manager. It will auto-detect and preserve existing `.env` configs.

## License

MIT

## Author

BenedictKing

## Contributing

Issues and Pull Requests are welcome!
