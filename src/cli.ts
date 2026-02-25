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
import { sync } from './commands/sync.js';
import { restore } from './commands/restore.js';
import * as logger from './utils/logger.js';

const VERSION = '0.1.0';

const HELP = `
skill-master v${VERSION}

Usage:
  skill-master add <source> [options]     Install skills (aliases: install, a, i)
  skill-master remove [skills...] [opts]  Remove skills (aliases: rm, r)
  skill-master list [options]             List installed skills (alias: ls)
  skill-master find [query]               Search for skills (aliases: search, f, s)
  skill-master update [skill]             Update skills (alias: upgrade)
  skill-master sync [options]             Sync skills from node_modules
  skill-master restore                    Restore skills from skills-lock.json (alias: install-lock)
  skill-master init [name]                Create a new skill template
  skill-master check                      Check for skill updates
  skill-master env <list|set|edit>        Manage environment variables
  skill-master info <skill-name>          Show skill details
  skill-master doctor                     Run diagnostics

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

Sync Options:
  -a, --agent <agents>  Target agents (space-separated)
  -y, --yes             Skip confirmations
  -f, --force           Force reinstall even if unchanged

Examples:
  skill-master add owner/repo
  skill-master add https://github.com/user/skill -a claude-code cursor -y
  skill-master add ./local-skill --agent=cursor --copy
  skill-master remove my-skill --purge
  skill-master find "code review"
  skill-master sync -y
  skill-master restore
  skill-master init my-new-skill
  skill-master check
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

      // sync — discover and install skills from node_modules
      case 'sync':
        await sync(commandArgs);
        break;

      // restore with alias: install-lock
      case 'restore':
      case 'install-lock':
        await restore(commandArgs);
        break;

      // env, info, doctor — skill-master extensions
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
