import { listRegistry } from '../core/registry.js';
import * as logger from '../utils/logger.js';

export interface ListFlags {
  global: boolean;
  agent: string[];
}

/** Parse flags for the list command */
export function parseListFlags(args: string[]): ListFlags {
  const flags: ListFlags = {
    global: false,
    agent: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      const key = arg.slice(2, eqIdx);
      const val = arg.slice(eqIdx + 1);
      if (key === 'agent') flags.agent.push(val);
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
      default:
        i++;
        break;
    }
  }

  return flags;
}

/** list command — list installed skills */
export async function list(args: string[] = []): Promise<void> {
  const flags = parseListFlags(args);
  const skills = await listRegistry();
  let entries = Object.entries(skills);

  // Filter by agent if specified
  if (flags.agent.length > 0) {
    entries = entries.filter(([, entry]) => flags.agent.includes(entry.agent));
  }

  if (entries.length === 0) {
    logger.info('No skills installed');
    return;
  }

  logger.blank();
  logger.tableHeader('Skill', 'Version', 'Platform', 'Installed');

  for (const [name, entry] of entries) {
    const date = new Date(entry.installed_at).toLocaleDateString();
    logger.tableRow(name, entry.version, entry.agent, date);
  }
  logger.blank();
}
