import { installSkill, installSkillToAgents, sanitizeName } from '../core/installer.js';
import { discoverNodeModulesSkills, readSkillMd } from '../core/skill-parser.js';
import { resolveSkillsField } from '../core/skills-field.js';
import { readLocalLock, addSkillToLocalLock, computeSkillFolderHash, removeSkillFromLocalLock } from '../core/local-lock.js';
import { getRegistryEntry, removeAgentFromRegistry } from '../core/registry.js';
import { confirmProjectRoot, formatProjectRelativeSource, resolveProjectRoot } from '../core/project-root.js';
import { detectPlatform, getAgentSkillsRoot, isSupportedPlatform } from '../platform/agents.js';
import { removePath } from '../utils/fs-helpers.js';
import * as logger from '../utils/logger.js';
import type { AgentPlatform, LocalLockEntry, SkillSource } from '../types/index.js';
import { join, resolve as resolvePath } from 'node:path';

export interface SyncFlags {
  agent: string[];
  yes: boolean;
  force: boolean;
  include: string[];
  exclude: string[];
  recursive: boolean;
  help: boolean;
}

/** Parse flags for the sync command */
export function parseSyncFlags(args: string[]): { flags: SyncFlags } {
  const flags: SyncFlags = {
    agent: [],
    yes: false,
    force: false,
    include: [],
    exclude: [],
    recursive: false,
    help: false,
  };

  const pushList = (target: string[], value: string) => {
    for (const part of value.split(',')) {
      const trimmed = part.trim();
      if (trimmed) target.push(trimmed);
    }
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
          pushList(flags.agent, args[i]);
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
      case '--include':
        i++;
        while (i < args.length && !args[i].startsWith('-')) {
          pushList(flags.include, args[i]);
          i++;
        }
        break;
      case '--exclude':
        i++;
        while (i < args.length && !args[i].startsWith('-')) {
          pushList(flags.exclude, args[i]);
          i++;
        }
        break;
      case '-r':
      case '--recursive':
        flags.recursive = true;
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
  console.log('Sync skills from node_modules and the package.json "skills" field,');
  console.log('and remove skills whose source is no longer available.');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help            Show this help message');
  console.log('  -a, --agent <agents>  Target agents (space-separated)');
  console.log('  -y, --yes             Skip confirmations');
  console.log('  -f, --force           Force reinstall even if unchanged');
  console.log('  --include <skills>    Only sync the named skills (comma/space separated)');
  console.log('  --exclude <skills>    Skip the named skills (comma/space separated)');
  console.log('  -r, --recursive       Also read the "skills" field of workspace packages');
  console.log('');
  console.log('The "skills" field declares skill dependencies in package.json:');
  console.log('  "skills": {');
  console.log('    "my-skill": "npm:some-pkg",');
  console.log('    "inner": "npm:@scope/pkg/inner-skill",');
  console.log('    "from-git": "owner/repo",');
  console.log('    "pinned": "owner/repo#v1.2.0"');
  console.log('  }');
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
  dir?: string;
  gitSource?: SkillSource;
  name: string;
  version?: string;
  lockSource: string;
  skillsField: boolean;
  status: 'new' | 'updated' | 'unchanged';
}

function passesFilters(name: string, flags: SyncFlags): boolean {
  if (flags.include.length > 0 && !flags.include.includes(name)) return false;
  if (flags.exclude.includes(name)) return false;
  return true;
}

/** Remove a skill's project-scoped installs (agent symlinks under cwd, canonical store, lock entry) */
async function pruneSkill(name: string, cwd: string): Promise<void> {
  const entry = await getRegistryEntry(name);
  if (entry) {
    const root = resolvePath(cwd);
    for (const agentRecord of entry.agents) {
      if (!resolvePath(agentRecord.agent_path).startsWith(root)) continue;
      await removePath(agentRecord.agent_path);
      await removeAgentFromRegistry(name, agentRecord.agent);
    }
    const updated = await getRegistryEntry(name);
    if (!updated) {
      await removePath(entry.canonical_path);
    }
  }
  await removeSkillFromLocalLock(name, cwd);
}

/** sync command — discover and install skills from node_modules and the skills field */
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

  // Step 1: Resolve the package.json "skills" field (root + workspaces with --recursive)
  const field = resolveSkillsField(cwd, flags.recursive);
  for (const err of field.errors) {
    logger.warn(`skills field entry "${err.name}": ${err.message}`);
  }
  const fieldByDir = new Map(field.entries.filter((e) => e.localDir).map((e) => [e.localDir as string, e]));

  // Step 2: Discover skills in node_modules
  logger.info('Scanning node_modules for skills...');
  const scannedDirs = await discoverNodeModulesSkills(cwd);

  // Step 3: Read lock and classify skills
  const lock = await readLocalLock(cwd);
  const skills: SkillInfo[] = [];

  const classifyLocal = async (dir: string, skillsField: boolean, lockSource: string) => {
    const parsed = await readSkillMd(dir);
    if (!parsed) return;

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

    skills.push({ dir, name, version: parsed.frontmatter.version, lockSource, skillsField, status });
  };

  // Skills-field entries win over plain node_modules discovery for the same directory
  for (const entry of field.entries) {
    if (entry.localDir) {
      await classifyLocal(entry.localDir, true, entry.lockSource);
    }
  }
  for (const dir of scannedDirs) {
    if (fieldByDir.has(dir)) continue; // already handled as a skills-field entry
    await classifyLocal(dir, false, formatProjectRelativeSource(cwd, dir));
  }

  // Git entries from the skills field: no local dir to hash — unchanged when the
  // same pinned source is already in the lock (use `skill-master update` to refresh)
  for (const entry of field.entries) {
    if (entry.localDir || !entry.source) continue;
    const managedNames = Object.entries(lock.skills)
      .filter(([, le]) => le.skillsField && le.source === entry.lockSource)
      .map(([name]) => name);
    if (managedNames.length > 0 && !flags.force) {
      for (const name of managedNames) {
        skills.push({
          gitSource: entry.source,
          name,
          lockSource: entry.lockSource,
          skillsField: true,
          status: 'unchanged',
        });
      }
      continue;
    }
    skills.push({
      gitSource: entry.source,
      name: entry.declaredName,
      lockSource: entry.lockSource,
      skillsField: true,
      status: 'new',
    });
  }

  // Step 4: Detect skills to prune — managed entries whose source disappeared.
  // Git skills installed from the skills field are never auto-pruned (explicit remove only).
  const discoveredNames = new Set(skills.map((s) => s.name));
  const prunable: string[] = [];

  for (const [name, lockEntry] of Object.entries(lock.skills)) {
    const managed = lockEntry.skillsField === true || lockEntry.sourceType === 'node_modules';
    if (!managed || discoveredNames.has(name)) continue;
    if (lockEntry.skillsField === true && lockEntry.sourceType === 'github') continue;
    prunable.push(name);
  }

  // Step 5: Show summary
  const visible = skills.filter((s) => passesFilters(s.name, flags));
  const actionable = visible.filter((s) => s.status !== 'unchanged');

  if (actionable.length === 0 && prunable.length === 0) {
    logger.success('All skills are up to date.');
    return;
  }

  logger.blank();
  logger.tableHeader('Skill', 'Version', 'Status');
  for (const s of visible) {
    logger.tableRow(s.name, s.version ?? '-', s.status);
  }
  for (const name of prunable) {
    logger.tableRow(name, '-', 'removed');
  }
  logger.blank();
  const parts = [`${actionable.length} skill(s) to install/update`];
  if (prunable.length > 0) parts.push(`${prunable.length} to remove`);
  logger.info(`${parts.join(', ')}.`);

  // Step 6: Confirm
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

  // Step 7: Install
  const agents = flags.agent.length > 0 ? resolveSyncAgents(flags) : [undefined];

  for (const s of actionable) {
    try {
      const source: SkillSource = s.gitSource ?? { type: 'local', path: s.dir as string };
      const concreteAgents = agents.filter((agent): agent is AgentPlatform => agent !== undefined);
      const results = concreteAgents.length === agents.length
        ? await installSkillToAgents({
          source,
          agents: concreteAgents,
          cwd,
          global: false,
          copy: false,
          force: flags.force,
          yes: true,
        })
        : [await installSkill({
          source,
          agent: agents[0] as AgentPlatform | undefined,
          cwd,
          global: false,
          copy: false,
          force: flags.force,
          yes: true,
        })];

      const lockEntry: LocalLockEntry = {
        source: s.lockSource,
        sourceType: s.gitSource ? 'github' : 'node_modules',
        computedHash: await computeSkillFolderHash(results[0].canonicalPath),
      };
      if (s.skillsField) lockEntry.skillsField = true;
      await addSkillToLocalLock(results[0].skillName, lockEntry, cwd);
    } catch (err) {
      logger.error(`Failed to install ${s.name}: ${(err as Error).message}`);
    }
  }

  // Step 8: Prune stale skills
  for (const name of prunable) {
    try {
      await pruneSkill(name, cwd);
      logger.success(`Removed ${name} (source no longer available)`);
    } catch (err) {
      logger.error(`Failed to remove ${name}: ${(err as Error).message}`);
    }
  }

  logger.blank();
  logger.success(
    `Synced ${actionable.length} skill(s)` +
    (prunable.length > 0 ? `, removed ${prunable.length}` : '') +
    '.',
  );
}
