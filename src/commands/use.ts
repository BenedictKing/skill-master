import { runUse, getLaunchableAgents, type UseOptions } from '../core/use-engine.js';
import { isSupportedPlatform } from '../platform/agents.js';
import type { AgentPlatform } from '../types/index.js';
import * as logger from '../utils/logger.js';

export interface UseFlags {
  skill?: string;
  agent?: string;
  fullDepth: boolean;
  help: boolean;
}

/** Parse POSIX-style flags for the use command. */
export function parseUseFlags(args: string[]): { source: string | null; flags: UseFlags } {
  const flags: UseFlags = { fullDepth: false, help: false };
  let source: string | null = null;
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      const key = arg.slice(2, eqIdx);
      const val = arg.slice(eqIdx + 1);
      if (!val) throw new Error(`Missing value for --${key}`);
      switch (key) {
        case 'skill': flags.skill = val; break;
        case 'agent': flags.agent = val; break;
        default: throw new Error(`Unknown option: --${key}`);
      }
      i++;
      continue;
    }

    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true;
        i++;
        break;
      case '-s':
      case '--skill': {
        const val = args[++i];
        if (!val || val.startsWith('-')) throw new Error(`Missing value for ${arg}`);
        flags.skill = val;
        i++;
        break;
      }
      case '-a':
      case '--agent': {
        const val = args[++i];
        if (!val || val.startsWith('-')) throw new Error(`Missing value for ${arg}`);
        flags.agent = val;
        i++;
        break;
      }
      case '--full-depth':
        flags.fullDepth = true;
        i++;
        break;
      default:
        if (!arg.startsWith('-')) {
          if (source === null) source = arg;
          else throw new Error(`Unexpected argument: ${arg}`);
        } else {
          throw new Error(`Unknown option: ${arg}`);
        }
        i++;
    }
  }

  return { source, flags };
}

function printUseHelp(): void {
  console.log('Usage: skill-master use <source> [options]');
  console.log('');
  console.log('Use a skill without installing it. Prints the skill prompt to stdout,');
  console.log('or launches an agent with the skill loaded.');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help          Show this help message');
  console.log('  -s, --skill <name>  Select a skill when the source has multiple');
  console.log(`  -a, --agent <agent> Launch an agent with the skill (${getLaunchableAgents().join(', ')})`);
  console.log('  --full-depth        Search all subdirectories');
  console.log('');
  console.log('Examples:');
  console.log('  skill-master use owner/repo@my-skill');
  console.log('  skill-master use ./local-skill');
  console.log('  skill-master use owner/repo --skill my-skill --agent claude-code');
}

/** use command — run a skill without installing it */
export async function use(args: string[]): Promise<void> {
  const { source, flags } = parseUseFlags(args);

  if (flags.help) {
    printUseHelp();
    process.exit(0);
  }

  if (!source) {
    printUseHelp();
    process.exit(1);
  }

  let agent: AgentPlatform | undefined;
  if (flags.agent) {
    if (!isSupportedPlatform(flags.agent)) {
      logger.error(`Unsupported agent platform: ${flags.agent}`);
      process.exit(1);
    }
    if (!getLaunchableAgents().includes(flags.agent)) {
      logger.error(
        `Agent "${flags.agent}" cannot be launched by use. Supported: ${getLaunchableAgents().join(', ')}`,
      );
      process.exit(1);
    }
    agent = flags.agent;
  }

  const options: UseOptions = {
    skill: flags.skill,
    agent,
    fullDepth: flags.fullDepth,
  };

  try {
    const code = await runUse(source, options);
    process.exit(code);
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
