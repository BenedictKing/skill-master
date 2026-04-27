import { installSkill, sanitizeName } from '../core/installer.js';
import { discoverNodeModulesSkills, readSkillMd } from '../core/skill-parser.js';
import { readLocalLock, addSkillToLocalLock, computeSkillFolderHash } from '../core/local-lock.js';
import { confirmProjectRoot, formatProjectRelativeSource, resolveProjectRoot } from '../core/project-root.js';
import { detectPlatform, getAgentSkillsRoot, isSupportedPlatform } from '../platform/agents.js';
import * as logger from '../utils/logger.js';
import type { AgentPlatform } from '../types/index.js';
import { join } from 'node:path';

export interface SyncFlags {
  agent: string[];
  yes: boolean;
  force: boolean;
  help: boolean;
}

/** Parse flags for the sync command */
export function parseSyncFlags(args: string[]): { flags: SyncFlags } {
  const flags: SyncFlags = {
    agent: [],
    yes: false,
    force: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true;
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
      case '-y':
      case '--yes':
        flags.yes = true;
        i++;
        break;
      case '-f':
      case '--force':
        flags.force = true;
        i++;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        i++;
        break;
    }
  }


  return { flags };
}

function printSyncHelp(): void {
  console.log('Usage: skill-master sync [options]');
  console.log('');
  console.log('Discover and sync skills from node_modules.');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help            Show this help message');
  console.log('  -a, --agent <agents>  Target agents (space-separated)');
  console.log('  -y, --yes             Skip confirmations');
  console.log('  -f, --force           Force reinstall even if unchanged');
}

function resolveSyncAgents(flags: SyncFlags): AgentPlatform[] {
  return flags.agent.map((agent) => {
    if (!isSupportedPlatform(agent)) {
      throw new Error(`Unsupported agent platform: ${agent}`);
    }
    return agent;
  });
}

function buildProjectRootPreview(cwd: string, flags: SyncFlags): Array<{ label: string; value: string }> {
  const agents = flags.agent.length > 0 ? resolveSyncAgents(flags) : [detectPlatform(cwd)];

  return [
    { label: 'project-root', value: cwd },
    { label: 'skills-lock', value: join(cwd, 'skills-lock.json') },
    ...agents.map((agent) => ({
      label: `skills-dir (${agent})`,
      value: getAgentSkillsRoot(cwd, agent),
    })),
  ];
}

interface SkillInfo {
  dir: string;
  name: string;
  version?: string;
  status: 'new' | 'updated' | 'unchanged';
}

/** sync command — discover and install skills from node_modules */
export async function sync(args: string[]): Promise<void> {
  const { flags } = parseSyncFlags(args);

  if (flags.help) {
    printSyncHelp();
    process.exit(0);
  }

  const rootResolution = resolveProjectRoot(process.cwd());
  const cwd = await confirmProjectRoot(rootResolution, flags.yes, {
    details: buildProjectRootPreview(rootResolution.root, flags),
  });
  if (cwd !== process.cwd()) {
    logger.info(`Project root: ${cwd}`);
  }

  // Step 1: Discover skills in node_modules
  logger.info('Scanning node_modules for skills...');
  const skillDirs = await discoverNodeModulesSkills(cwd);

  if (skillDirs.length === 0) {
    logger.info('No skills found in node_modules.');
    return;
  }

  // Step 2: Read lock and classify skills
  const lock = await readLocalLock(cwd);
  const skills: SkillInfo[] = [];


  for (const dir of skillDirs) {
    const parsed = await readSkillMd(dir);
    if (!parsed) continue;

    const name = sanitizeName(parsed.frontmatter.name);
    const currentHash = await computeSkillFolderHash(dir);
    const lockEntry = lock.skills[name];

    let status: SkillInfo['status'];
    if (!lockEntry) {
      status = 'new';
    } else if (lockEntry.computedHash !== currentHash || flags.force) {
      status = 'updated';
    } else {
      status = 'unchanged';
    }

    skills.push({ dir, name, version: parsed.frontmatter.version, status });
  }

  // Step 3: Show summary
  const actionable = skills.filter(s => s.status !== 'unchanged');
  if (actionable.length === 0) {
    logger.success('All node_modules skills are up to date.');
    return;
  }

  logger.blank();
  logger.tableHeader('Skill', 'Version', 'Status');
  for (const s of skills) {
    logger.tableRow(s.name, s.version ?? '-', s.status);
  }
  logger.blank();
  logger.info(`${actionable.length} skill(s) to install/update.`);

  // Step 4: Confirm
  if (!flags.yes) {
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question('Proceed? [y/N] ', resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      logger.info('Aborted.');
      return;
    }
  }

  // Step 5: Install
  const agents = flags.agent.length > 0 ? resolveSyncAgents(flags) : [undefined];

  for (const s of actionable) {
    for (const agent of agents) {
      try {
        const result = await installSkill({
          source: { type: 'local', path: s.dir },
          agent: agent as AgentPlatform | undefined,
          cwd,
          global: false,
          copy: false,
          force: flags.force,
          yes: true,
        });

        await addSkillToLocalLock(result.skillName, {
          source: formatProjectRelativeSource(cwd, s.dir),
          sourceType: 'node_modules',
          computedHash: await computeSkillFolderHash(result.canonicalPath),
        }, cwd);
      } catch (err) {
        logger.error(`Failed to install ${s.name}: ${(err as Error).message}`);
      }
    }
  }

  logger.blank();
  logger.success(`Synced ${actionable.length} skill(s) from node_modules.`);
}
