import { installSkill } from '../core/installer.js';
import { cloneRepo, parseSource } from '../core/git-source.js';
import { confirmProjectRoot, formatProjectRelativeSource, resolveProjectRoot } from '../core/project-root.js';
import { findAllSkillDirectoriesWithPlugins, readSkillMd, type DiscoveredSkill } from '../core/skill-parser.js';
import { addSkillToLocalLock, computeSkillFolderHash } from '../core/local-lock.js';
import { detectGlobalPlatforms, detectPlatform, getAgentSkillsRoot, getInstallablePlatforms, isSupportedPlatform } from '../platform/agents.js';
import { SkillNotFoundError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';
import { parseSourceAndSkill } from '../utils/parse-positional.js';
import type { SkillSource, AgentPlatform } from '../types/index.js';
import { existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

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
  allowHiddenDirs: boolean;
  upstream: boolean;
  help: boolean;
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
    allowHiddenDirs: false,
    upstream: false,
    help: false,
  };

  let source: string | null = null;
  const positional: string[] = [];
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
        default:
          throw new Error(`Unknown option: --${key}`);
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

      case '--allow-hidden-dirs':
        flags.allowHiddenDirs = true;
        i++;
        break;

      case '--upstream':
        flags.upstream = true;
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
        if (!arg.startsWith('-')) {
          positional.push(arg);
          if (source === null) {
            source = arg;
          }
        } else {
          throw new Error(`Unknown option: ${arg}`);
        }
        i++;
        break;
    }
  }

  // Extract positional skill from gh-style <repo> <skill> syntax
  const { skill: positionalSkill } = parseSourceAndSkill(positional);
  if (positionalSkill && !flags.skill.includes(positionalSkill)) {
    flags.skill.push(positionalSkill);
  }

  // --all implies --skill '*' --agent '*' -y
  if (flags.all) {
    if (flags.skill.length === 0) flags.skill.push('*');
    if (flags.agent.length === 0) flags.agent.push('*');
    flags.yes = true;
  }

  return { source, flags };
}

function printAddHelp(): void {
  console.log('Usage: skill-master add <source> [options]');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help            Show this help message');
  console.log('  -g, --global          Install globally for detected agents');
  console.log('  -a, --agent <agents>  Target agents (space-separated)');
  console.log('  -s, --skill <skills>  Select skills (space-separated)');
  console.log('  -y, --yes             Skip confirmations');
  console.log('  -l, --list            List available skills without installing');
  console.log('  --all                 Install all skills to all agents');
  console.log('  --full-depth          Search all subdirectories');
  console.log('  --allow-hidden-dirs   Include skills in hidden directories');
  console.log('  --upstream            Prefer upstream source for forked repositories');
  console.log('  --copy                Copy instead of symlink');
  console.log('  --force               Force reinstall');
}

async function resolveUpstreamSource(source: string, enabled: boolean): Promise<string> {
  if (!enabled) return source;

  const parsed = parseSource(source);
  if (parsed.type !== 'git' || !parsed.url || !parsed.url.includes('github.com')) {
    return source;
  }

  const match = parsed.url.match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (!match) return source;

  const repo = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('gh', ['repo', 'view', repo, '--json', 'isFork,parent'], {
      timeout: 15_000,
      env: {
        ...process.env,
        GH_PAGER: 'cat',
        PAGER: 'cat',
        NO_COLOR: '1',
      },
    });
    const info = JSON.parse(stdout) as { isFork?: boolean; parent?: { nameWithOwner?: string } | null };
    if (!info.isFork || !info.parent?.nameWithOwner) return source;

    const upstream = info.parent.nameWithOwner;
    let rewritten = upstream;
    if (parsed.ref && parsed.subpath) {
      rewritten = `https://github.com/${upstream}/tree/${parsed.ref}/${parsed.subpath}`;
    } else if (parsed.ref) {
      rewritten = `https://github.com/${upstream}/tree/${parsed.ref}`;
    } else if (parsed.subpath) {
      rewritten = `${upstream}/${parsed.subpath}`;
    }

    if (parsed.skillFilter) {
      rewritten += `@${parsed.skillFilter}`;
    }

    return rewritten;
  } catch {
    return source;
  }
}

function resolveRequestedAgents(requested: string[]): AgentPlatform[] {
  if (requested.includes('*')) {
    return getInstallablePlatforms();
  }

  return requested.map((agent) => {
    if (!isSupportedPlatform(agent)) {
      throw new Error(`Unsupported agent platform: ${agent}`);
    }
    return agent;
  });
}

function resolveAgentTargets(flags: AddFlags, cwd: string): Array<AgentPlatform | undefined> {
  const requested = flags.agent.length > 0 ? flags.agent : [];
  if (requested.includes('*')) {
    return getInstallablePlatforms();
  }

  if (requested.length > 0) {
    return resolveRequestedAgents(requested);
  }

  if (!flags.global) {
    return [undefined];
  }

  const detected = detectGlobalPlatforms();
  if (detected.length > 0) {
    logger.info(`Global install targets: ${detected.join(', ')}`);
    return detected;
  }

  const fallback = detectPlatform(cwd);
  logger.info(`Global install target: ${fallback}`);
  return [fallback];
}

function buildProjectRootPreview(flags: AddFlags, cwd: string): Array<{ label: string; value: string }> {
  const requested = flags.agent.length > 0 ? flags.agent : [];
  const agents = requested.length > 0
    ? resolveRequestedAgents(requested)
    : [detectPlatform(cwd)];

  return [
    { label: 'project-root', value: cwd },
    { label: 'skills-lock', value: join(cwd, 'skills-lock.json') },
    ...agents.map((agent) => ({
      label: `skills-dir (${agent})`,
      value: getAgentSkillsRoot(cwd, agent),
    })),
  ];
}

/** add command — install skills (compatible with `npx skills add`) */
export async function add(args: string[]): Promise<void> {
  if (args.length === 0) {
    printAddHelp();
    process.exit(1);
  }

  const { source, flags } = parseAddFlags(args);

  if (flags.help) {
    printAddHelp();
    process.exit(0);
  }

  if (!source) {
    logger.error('No source specified. Provide a GitHub URL, owner/repo, or local path.');
    process.exit(1);
  }

  const commandCwd = process.cwd();
  const effectiveSource = await resolveUpstreamSource(source, flags.upstream);

  // Parse source string into structured form
  const parsed = parseSource(effectiveSource);

  // Merge skillFilter from source (e.g. owner/repo@skill) into flags.skill
  if (parsed.skillFilter && !flags.skill.includes(parsed.skillFilter)) {
    flags.skill.push(parsed.skillFilter);
  }

  // Resolve source directory
  let sourceDir: string;

  if (parsed.type === 'git') {
    logger.step(1, 9, 'Fetching skill source...');
    sourceDir = await cloneRepo(parsed.url!, parsed.ref);
    // Narrow to subpath if specified
    if (parsed.subpath) {
      const sub = join(sourceDir, parsed.subpath);
      if (existsSync(sub)) {
        sourceDir = sub;
      }
    }
  } else {
    sourceDir = resolve(commandCwd, parsed.path!);
    if (!existsSync(sourceDir)) {
      throw new SkillNotFoundError(sourceDir);
    }
  }

  // Discover all skill directories in the source (with plugin info)
  const discoveredSkillDirs = await findAllSkillDirectoriesWithPlugins(sourceDir, flags.fullDepth, flags.allowHiddenDirs);
  const allSkillDirs = discoveredSkillDirs;
  if (allSkillDirs.length === 0) {
    throw new SkillNotFoundError(`No SKILL.md found in ${sourceDir}`);
  }

  // --list mode: print discovered skills and exit
  if (flags.list) {
    logger.blank();
    logger.tableHeader('Skill', 'Version', 'Description');
    for (const { path: dir } of allSkillDirs) {
      const sk = await readSkillMd(dir);
      if (sk) {
        logger.tableRow(
          sk.frontmatter.name,
          sk.frontmatter.version ?? '-',
          sk.frontmatter.description ?? '-',
        );
      }
    }
    logger.blank();
    return;
  }

  // Filter by --skill if specified
  let targetDirs: DiscoveredSkill[] = allSkillDirs;
  if (flags.skill.length > 0 && !flags.skill.includes('*')) {
    const requested = new Set(flags.skill.map(s => s.toLowerCase()));
    const filtered: DiscoveredSkill[] = [];

    for (const item of allSkillDirs) {
      const sk = await readSkillMd(item.path);
      if (!sk) continue;
      const name = sk.frontmatter.name.toLowerCase();
      const dirName = basename(item.path).toLowerCase();
      if (requested.has(name) || requested.has(dirName)) {
        filtered.push(item);
      }
    }

    if (filtered.length === 0) {
      const available = [];
      for (const { path: dir } of allSkillDirs) {
        const sk = await readSkillMd(dir);
        if (sk) available.push(sk.frontmatter.name);
      }
      logger.error(
        `No matching skills found for: ${flags.skill.join(', ')}\n` +
        `  Available skills: ${available.join(', ')}`
      );
      process.exit(1);
    }

    targetDirs = filtered;
  }

  const rootResolution = flags.global
    ? { root: commandCwd, source: 'cwd' as const }
    : resolveProjectRoot(commandCwd);
  const cwd = flags.global
    ? commandCwd
    : await confirmProjectRoot(rootResolution, flags.yes, {
      details: buildProjectRootPreview(flags, rootResolution.root),
    });
  if (!flags.global && cwd !== commandCwd) {
    logger.info(`Project root: ${cwd}`);
  }

  // If multiple agents specified, install for each
  const agents = resolveAgentTargets(flags, cwd);
  const totalInstallations = targetDirs.length * agents.length;
  let completedInstallations = 0;

  try {
    for (const { path: dir, pluginName } of targetDirs) {
      for (const agent of agents) {
        // Build the original source reference for registry
        // For git sources, preserve the URL; for local, use the actual path
        const installSource: SkillSource = parsed.type === 'git'
          ? { type: 'git', url: parsed.url!, branch: parsed.ref, localPath: dir }
          : { type: 'local', path: dir };

        const result = await installSkill({
          source: installSource,
          agent: agent as AgentPlatform | undefined,
          cwd,
          global: flags.global,
          copy: flags.copy,
          force: flags.force,
          yes: flags.yes,
        });

        // Update local lock for non-global installs
        if (!flags.global) {
          // Record relative skill dir path for multi-skill source repos
          const skillDir = relative(sourceDir, dir);
          await addSkillToLocalLock(result.skillName, {
            source: parsed.type === 'git' ? effectiveSource : formatProjectRelativeSource(cwd, sourceDir),
            sourceType: parsed.type === 'git' ? 'github' : 'local',
            computedHash: await computeSkillFolderHash(result.canonicalPath),
            ...(skillDir && skillDir !== '.' ? { skillDir } : {}),
            ...(pluginName ? { pluginName } : {}),
          }, cwd);
        }

        completedInstallations++;
        if (completedInstallations < totalInstallations) {
          logger.blank();
        }
      }
    }
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
