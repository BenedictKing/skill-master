import { installSkill } from '../core/installer.js';
import { isGitUrl } from '../core/git-source.js';
import * as logger from '../utils/logger.js';
import type { SkillSource, AgentPlatform } from '../types/index.js';

export interface AddFlags {
  global: boolean;
  agent: string[];
  skill: string[];
  yes: boolean;
  list: boolean;
  all: boolean;
  fullDepth: boolean;
  copy: boolean;
  force: boolean;
}

/**
 * Parse POSIX-style flags for the add command.
 * Supports: -g/--global, -a/--agent, -s/--skill, -y/--yes,
 *           -l/--list, --all, --full-depth, --copy, --force
 */
export function parseAddFlags(args: string[]): { source: string | null; flags: AddFlags } {
  const flags: AddFlags = {
    global: false,
    agent: [],
    skill: [],
    yes: false,
    list: false,
    all: false,
    fullDepth: false,
    copy: false,
    force: false,
  };

  let source: string | null = null;
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    // Long flags with = syntax (backward compat: --agent=claude-code)
    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      const key = arg.slice(2, eqIdx);
      const val = arg.slice(eqIdx + 1);
      switch (key) {
        case 'agent': flags.agent.push(val); break;
        case 'skill': flags.skill.push(val); break;
        default: break;
      }
      i++;
      continue;
    }

    switch (arg) {
      case '-g':
      case '--global':
        flags.global = true;
        i++;
        break;

      case '-a':
      case '--agent':
        // Consume following non-flag args as agent names
        i++;
        while (i < args.length && !args[i].startsWith('-')) {
          flags.agent.push(args[i]);
          i++;
        }
        break;

      case '-s':
      case '--skill':
        // Consume following non-flag args as skill names
        i++;
        while (i < args.length && !args[i].startsWith('-')) {
          flags.skill.push(args[i]);
          i++;
        }
        break;

      case '-y':
      case '--yes':
        flags.yes = true;
        i++;
        break;

      case '-l':
      case '--list':
        flags.list = true;
        i++;
        break;

      case '--all':
        flags.all = true;
        i++;
        break;

      case '--full-depth':
        flags.fullDepth = true;
        i++;
        break;

      case '--copy':
        flags.copy = true;
        i++;
        break;

      case '--force':
        flags.force = true;
        i++;
        break;

      default:
        // First non-flag argument is the source
        if (!arg.startsWith('-') && source === null) {
          source = arg;
        }
        i++;
        break;
    }
  }

  // --all implies --skill '*' --agent '*' -y
  if (flags.all) {
    if (flags.skill.length === 0) flags.skill.push('*');
    if (flags.agent.length === 0) flags.agent.push('*');
    flags.yes = true;
  }

  return { source, flags };
}

/** add command — install skills (compatible with `npx skills add`) */
export async function add(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: skill-master add <source> [options]');
    console.log('');
    console.log('Options:');
    console.log('  -g, --global          Install globally (~/.agents/)');
    console.log('  -a, --agent <agents>  Target agents (space-separated)');
    console.log('  -s, --skill <skills>  Select skills (space-separated)');
    console.log('  -y, --yes             Skip confirmations');
    console.log('  -l, --list            List available skills without installing');
    console.log('  --all                 Install all skills to all agents');
    console.log('  --full-depth          Search all subdirectories');
    console.log('  --copy                Copy instead of symlink');
    console.log('  --force               Force reinstall');
    process.exit(1);
  }

  const { source, flags } = parseAddFlags(args);

  if (!source) {
    logger.error('No source specified. Provide a GitHub URL, owner/repo, or local path.');
    process.exit(1);
  }

  const skillSource: SkillSource = isGitUrl(source)
    ? { type: 'git', url: source }
    : { type: 'local', path: source };

  const cwd = process.cwd();

  // If multiple agents specified, install for each
  const agents = flags.agent.length > 0 ? flags.agent : [undefined];

  try {
    for (const agent of agents) {
      await installSkill({
        source: skillSource,
        agent: agent as AgentPlatform | undefined,
        cwd,
        copy: flags.copy,
        force: flags.force,
        yes: flags.yes,
      });
    }
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
