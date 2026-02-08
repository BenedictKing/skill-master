import { getRegistryEntry, removeFromRegistry, listRegistry } from '../core/registry.js';
import { removePath } from '../utils/fs-helpers.js';
import { getSkillCanonicalPath, getSkillConfigPath } from '../utils/paths.js';
import * as logger from '../utils/logger.js';
import { SkillNotFoundError } from '../utils/errors.js';

export interface RemoveFlags {
  global: boolean;
  agent: string[];
  skill: string[];
  yes: boolean;
  all: boolean;
  purge: boolean;
}

/** Parse POSIX-style flags for the remove command */
export function parseRemoveFlags(args: string[]): { names: string[]; flags: RemoveFlags } {
  const flags: RemoveFlags = {
    global: false,
    agent: [],
    skill: [],
    yes: false,
    all: false,
    purge: false,
  };

  const names: string[] = [];
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
        i++;
        while (i < args.length && !args[i].startsWith('-')) {
          flags.agent.push(args[i]);
          i++;
        }
        break;

      case '-s':
      case '--skill':
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

      case '--all':
        flags.all = true;
        i++;
        break;

      case '--purge':
        flags.purge = true;
        i++;
        break;

      default:
        // Non-flag arguments are skill names (positional)
        if (!arg.startsWith('-')) {
          names.push(arg);
        }
        i++;
        break;
    }
  }

  // --all implies removing all skills with -y
  if (flags.all) {
    flags.yes = true;
  }

  return { names, flags };
}

/** remove command — remove installed skills */
export async function remove(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: skill-manager remove [skills...] [options]');
    console.log('');
    console.log('Options:');
    console.log('  -g, --global          Remove from global (~/.agents/)');
    console.log('  -a, --agent <agents>  Target agents (space-separated)');
    console.log('  -s, --skill <skills>  Select skills (space-separated)');
    console.log('  -y, --yes             Skip confirmations');
    console.log('  --all                 Remove all skills');
    console.log('  --purge               Also remove config data');
    process.exit(1);
  }

  const { names, flags } = parseRemoveFlags(args);

  // Determine which skills to remove
  let skillNames: string[];
  if (flags.all) {
    const registry = await listRegistry();
    skillNames = Object.keys(registry);
  } else if (flags.skill.length > 0) {
    skillNames = flags.skill;
  } else {
    skillNames = names;
  }

  if (skillNames.length === 0) {
    logger.error('No skills specified. Provide skill names or use --all.');
    process.exit(1);
  }

  try {
    for (const skillName of skillNames) {
      const entry = await getRegistryEntry(skillName);
      if (!entry) {
        throw new SkillNotFoundError(skillName);
      }

      logger.info(`Removing skill: ${skillName}`);

      // Remove agent directory link/copy
      await removePath(entry.agent_path);
      logger.success(`Removed from ${entry.agent_path}`);

      // Remove canonical directory
      await removePath(entry.canonical_path);
      logger.success(`Removed from ${entry.canonical_path}`);

      // Optionally purge config
      if (flags.purge) {
        await removePath(getSkillConfigPath(skillName));
        logger.success('Purged config directory');
      }

      // Update registry
      await removeFromRegistry(skillName);
      logger.success(`Skill "${skillName}" removed successfully!`);
    }
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
