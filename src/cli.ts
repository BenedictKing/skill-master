#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { add } from './commands/add.js';
import { update } from './commands/update.js';
import { remove } from './commands/remove.js';
import { env } from './commands/env.js';
import { list } from './commands/list.js';
import { info } from './commands/info.js';
import { doctor } from './commands/doctor.js';
import { find } from './commands/find.js';
import { inspect } from './commands/inspect.js';
import { recommend } from './commands/recommend.js';
import { verify } from './commands/verify.js';
import { compose } from './commands/compose.js';
import { solve } from './commands/solve.js';
import { init } from './commands/init.js';
import { check } from './commands/check.js';
import { sync } from './commands/sync.js';
import { restore } from './commands/restore.js';
import { use } from './commands/use.js';
import * as logger from './utils/logger.js';

const CLI_DIR = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_JSON = JSON.parse(readFileSync(join(CLI_DIR, '..', 'package.json'), 'utf-8')) as { version: string };
const VERSION = PACKAGE_JSON.version;

const HELP = `
skill-master v${VERSION}

Usage:
  skill-master add <source> [options]     Install skills (aliases: install, a, i)
  skill-master remove [skills...] [opts]  Remove skills (aliases: rm, r)
  skill-master list [options]             List installed skills (alias: ls)
  skill-master find [query]               Search for skills (aliases: search, f, s)
  skill-master inspect <source|skill>     Inspect a candidate skill (alias: preview)
  skill-master recommend <task>           Recommend skills for a task
  skill-master verify <skill-name>        Verify an installed skill
  skill-master compose [sources...]       Compose or generate a skill
  skill-master use <source>               Use a skill without installing it
  skill-master solve <task>               Solve task via discovery + recommendation flow
  skill-master update [skill]             Update skills (alias: upgrade)
  skill-master sync [options]             Sync skills from node_modules
  skill-master restore                    Restore skills from skills-lock.json (alias: install-lock)
  skill-master init [name]                Create a new skill template
  skill-master check                      Check for skill updates
  skill-master env <list|set|edit>        Manage environment variables
  skill-master info <skill-name>          Show skill details
  skill-master doctor                     Run diagnostics

Add Options:
  -g, --global          Install globally for detected agents
  -a, --agent <agents>  Target agents (space-separated)
  -s, --skill <skills>  Select skills (space-separated)
  -y, --yes             Skip confirmations
  -l, --list            List available skills without installing
  --all                 Install all skills to all agents
  --full-depth          Search all subdirectories
  --copy                Copy instead of symlink
  --force               Force reinstall

Recommend Options:
  --install             Install the best recommendation
  -a, --agent <agent>   Target agent when using --install

Compose Options:
  -o, --output <dir>    Output directory for generated skill
  --task <task>         Task description when generating without sources

Sync Options:
  -a, --agent <agents>  Target agents (space-separated)
  -y, --yes             Skip confirmations
  -f, --force           Force reinstall even if unchanged

Examples:
  skill-master add owner/repo
  skill-master add owner/repo skill-name
  skill-master inspect owner/repo
  skill-master preview owner/repo skill-name
  skill-master recommend "code review skill for PRs"
  skill-master recommend "monitor deploy status" --install
  skill-master verify tavily-web
  skill-master compose skill-a skill-b -o ./generated-skill
  skill-master solve "search docs and recommend a skill" --json
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
      case 'add':
      case 'a':
      case 'install':
      case 'i':
        await add(commandArgs);
        break;

      case 'remove':
      case 'rm':
      case 'r':
        await remove(commandArgs);
        break;

      case 'list':
      case 'ls':
        await list(commandArgs);
        break;

      case 'find':
      case 'search':
      case 'f':
      case 's':
        await find(commandArgs);
        break;

      case 'inspect':
      case 'preview':
        await inspect(commandArgs);
        break;

      case 'recommend':
        await recommend(commandArgs);
        break;

      case 'verify':
        await verify(commandArgs);
        break;

      case 'compose':
        await compose(commandArgs);
        break;

      case 'solve':
        await solve(commandArgs);
        break;

      case 'update':
      case 'upgrade':
        await update(commandArgs);
        break;

      case 'init':
        await init(commandArgs);
        break;

      case 'check':
        await check(commandArgs);
        break;

      case 'sync':
        await sync(commandArgs);
        break;

      case 'restore':
      case 'install-lock':
        await restore(commandArgs);
        break;

      case 'use':
        await use(commandArgs);
        break;

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
