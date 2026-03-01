import { listRegistry } from '../core/registry.js';
import { readLocalLock } from '../core/local-lock.js';
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

/** Convert kebab-case to Title Case for display */
function toTitleCase(str: string): string {
  return str
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** list command — list installed skills */
export async function list(args: string[] = []): Promise<void> {
  const flags = parseListFlags(args);
  const skills = await listRegistry();
  let entries = Object.entries(skills);

  // Filter by agent if specified
  if (flags.agent.length > 0) {
    entries = entries.filter(([, entry]) =>
      entry.agents.some(a => flags.agent.includes(a.agent))
    );
  }

  if (entries.length === 0) {
    logger.info('No skills installed');
    return;
  }

  // Read local lock to get plugin groupings
  const cwd = process.cwd();
  const localLock = await readLocalLock(cwd);

  // Group skills by plugin name
  const groupedSkills: Record<string, Array<[string, typeof entries[0][1]]>> = {};
  const ungroupedSkills: Array<[string, typeof entries[0][1]]> = [];

  for (const [name, entry] of entries) {
    const lockEntry = localLock.skills[name];
    if (lockEntry?.pluginName) {
      const group = lockEntry.pluginName;
      if (!groupedSkills[group]) {
        groupedSkills[group] = [];
      }
      groupedSkills[group].push([name, entry]);
    } else {
      ungroupedSkills.push([name, entry]);
    }
  }

  const hasGroups = Object.keys(groupedSkills).length > 0;

  logger.blank();

  if (hasGroups) {
    // Print groups sorted alphabetically
    const sortedGroups = Object.keys(groupedSkills).sort();
    for (const group of sortedGroups) {
      logger.section(toTitleCase(group));
      logger.tableHeader('Skill', 'Version', 'Platform(s)', 'Installed');

      for (const [name, entry] of groupedSkills[group]) {
        const date = new Date(entry.installed_at).toLocaleDateString();
        const platforms = entry.agents.map(a => a.agent).join(', ');
        logger.tableRow(name, entry.version ?? '-', platforms, date);
      }
      logger.blank();
    }

    // Print ungrouped skills if any exist
    if (ungroupedSkills.length > 0) {
      logger.section('General');
      logger.tableHeader('Skill', 'Version', 'Platform(s)', 'Installed');

      for (const [name, entry] of ungroupedSkills) {
        const date = new Date(entry.installed_at).toLocaleDateString();
        const platforms = entry.agents.map(a => a.agent).join(', ');
        logger.tableRow(name, entry.version ?? '-', platforms, date);
      }
      logger.blank();
    }
  } else {
    // No groups, print flat list as before
    logger.tableHeader('Skill', 'Version', 'Platform(s)', 'Installed');

    for (const [name, entry] of entries) {
      const date = new Date(entry.installed_at).toLocaleDateString();
      const platforms = entry.agents.map(a => a.agent).join(', ');
      logger.tableRow(name, entry.version ?? '-', platforms, date);
    }
    logger.blank();
  }
}
