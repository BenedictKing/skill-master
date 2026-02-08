#!/usr/bin/env node

import { install } from './commands/install.js';
import { update } from './commands/update.js';
import { remove } from './commands/remove.js';
import { env } from './commands/env.js';
import { list } from './commands/list.js';
import { info } from './commands/info.js';
import { doctor } from './commands/doctor.js';
import * as logger from './utils/logger.js';

const VERSION = '0.1.0';

const HELP = `
skill-manager v${VERSION}

Usage:
  skill-manager install <source> [options]
  skill-manager update <skill-name> [--force]
  skill-manager remove <skill-name> [--purge]
  skill-manager env <list|set|edit> [args]
  skill-manager list
  skill-manager info <skill-name>
  skill-manager doctor
  skill-manager --help
  skill-manager --version

Commands:
  install   Install a skill from GitHub or local path
  update    Update an installed skill
  remove    Remove an installed skill
  env       Manage environment variables
  list      List all installed skills
  info      Show detailed info about a skill
  doctor    Run diagnostics

Install Options:
  --agent=<platform>   Target platform (claude-code, opencode, cursor, cline, windsurf)
  --copy               Copy instead of symlink
  --force              Force reinstall
  --yes                Skip confirmations

Examples:
  skill-manager install https://github.com/user/skill
  skill-manager install ./local-skill --agent=cursor
  skill-manager update my-skill
  skill-manager env list
  skill-manager env set my-skill API_KEY=xxx
  skill-manager env edit my-skill
  skill-manager remove my-skill --purge
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case 'install':
        await install(commandArgs);
        break;
      case 'update':
        await update(commandArgs);
        break;
      case 'remove':
        await remove(commandArgs);
        break;
      case 'env':
        await env(commandArgs);
        break;
      case 'list':
        await list();
        break;
      case 'info':
        await info(commandArgs);
        break;
      case 'doctor':
        await doctor();
        break;
      default:
        logger.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    logger.error((err as Error).message);
    if (process.env.DEBUG) {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
