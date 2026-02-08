#!/usr/bin/env node

import { add } from './commands/add.js';
import { update } from './commands/update.js';
import { remove } from './commands/remove.js';
import { env } from './commands/env.js';
import { list } from './commands/list.js';
import { info } from './commands/info.js';
import { doctor } from './commands/doctor.js';
import { find } from './commands/find.js';
import { init } from './commands/init.js';
import { check } from './commands/check.js';
import * as logger from './utils/logger.js';

const VERSION = '0.1.0';

const HELP = `
skill-manager v${VERSION}

Usage:
  skill-manager add <source> [options]     Install skills (aliases: install, a, i)
  skill-manager remove [skills...] [opts]  Remove skills (aliases: rm, r)
  skill-manager list [options]             List installed skills (alias: ls)
  skill-manager find [query]               Search for skills (aliases: search, f, s)
  skill-manager update [skill]             Update skills (alias: upgrade)
  skill-manager init [name]                Create a new skill template
  skill-manager check                      Check for skill updates
  skill-manager env <list|set|edit>        Manage environment variables
  skill-manager info <skill-name>          Show skill details
  skill-manager doctor                     Run diagnostics

Add Options:
  -g, --global          Install globally (~/.agents/)
  -a, --agent <agents>  Target agents (space-separated)
  -s, --skill <skills>  Select skills (space-separated)
  -y, --yes             Skip confirmations
  -l, --list            List available skills without installing
  --all                 Install all skills to all agents
  --full-depth          Search all subdirectories
  --copy                Copy instead of symlink
  --force               Force reinstall

Examples:
  skill-manager add owner/repo
  skill-manager add https://github.com/user/skill -a claude-code cursor -y
  skill-manager add ./local-skill --agent=cursor --copy
  skill-manager remove my-skill --purge
  skill-manager find "code review"
  skill-manager init my-new-skill
  skill-manager check
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
      // add (primary) with aliases: install, a, i
      case 'add':
      case 'a':
      case 'install':
      case 'i':
        await add(commandArgs);
        break;

      // remove with aliases: rm, r
      case 'remove':
      case 'rm':
      case 'r':
        await remove(commandArgs);
        break;

      // list with alias: ls
      case 'list':
      case 'ls':
        await list(commandArgs);
        break;

      // find with aliases: search, f, s
      case 'find':
      case 'search':
      case 'f':
      case 's':
        await find(commandArgs);
        break;

      // update with alias: upgrade
      case 'update':
      case 'upgrade':
        await update(commandArgs);
        break;

      // init
      case 'init':
        await init(commandArgs);
        break;

      // check
      case 'check':
        await check(commandArgs);
        break;

      // env, info, doctor — skill-manager extensions
      case 'env':
        await env(commandArgs);
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
