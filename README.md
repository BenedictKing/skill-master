# skill-master

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
npm install -g skill-master
```

Or use directly:

```bash
npx skill-master add <source>
```

## Quick Start

### Install Skills

```bash
# From GitHub
skill-master add owner/repo
skill-master add https://github.com/user/skill

# From local path
skill-master add ./local-skill

# Specify target agent
skill-master add owner/repo -a claude-code cursor

# Copy mode (recommended for Windows)
skill-master add owner/repo --copy
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

### Other Commands

```bash
# List installed skills
skill-master list

# Search for skills
skill-master find "code review"

# Check for updates
skill-master check

# Create new skill template
skill-master init my-new-skill

# Show skill details
skill-master info my-skill

# Run diagnostics
skill-master doctor
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
git clone https://github.com/yourusername/skill-master.git
cd skill-master

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

| Feature | npx skills | skill-master |
|---------|-----------|---------------|
| .env Protection | ❌ Deleted on update | ✅ Auto backup/restore |
| Multi-Platform | ❌ Claude Code only | ✅ 5 platforms |
| Config Management | ❌ None | ✅ env commands |
| Diagnostics | ❌ None | ✅ doctor command |
| Symlinks | ✅ | ✅ + copy mode |
| Git Install | ✅ | ✅ |
| Local Install | ✅ | ✅ |

## FAQ

### Why skill-master?

`npx skills add` executes `rm -rf` during install/update, deleting `.env` files. Users must reconfigure API keys after every update. skill-master solves this with intelligent backup.

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
