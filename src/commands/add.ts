import { installSkill } from '../core/installer.js';
import { cloneRepo, parseSource } from '../core/git-source.js';
import { findAllSkillDirectoriesWithPlugins, readSkillMd, type DiscoveredSkill } from '../core/skill-parser.js';
import { addSkillToLocalLock, computeSkillFolderHash } from '../core/local-lock.js';
import { SkillNotFoundError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';
import type { SkillSource, AgentPlatform } from '../types/index.js';
import { existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

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
    help: false,
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
        } else if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
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

function printAddHelp(): void {
  console.log('Usage: skill-master add <source> [options]');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help            Show this help message');
  console.log('  -g, --global          Install globally (~/.agents/)');
  console.log('  -a, --agent <agents>  Target agents (space-separated)');
  console.log('  -s, --skill <skills>  Select skills (space-separated)');
  console.log('  -y, --yes             Skip confirmations');
  console.log('  -l, --list            List available skills without installing');
  console.log('  --all                 Install all skills to all agents');
  console.log('  --full-depth          Search all subdirectories');
  console.log('  --copy                Copy instead of symlink');
  console.log('  --force               Force reinstall');
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

  const cwd = process.cwd();

  // Parse source string into structured form
  const parsed = parseSource(source);

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
    sourceDir = parsed.path!;
    if (!existsSync(sourceDir)) {
      throw new SkillNotFoundError(sourceDir);
    }
  }

  // Discover all skill directories in the source (with plugin info)
  const allSkillDirs = await findAllSkillDirectoriesWithPlugins(sourceDir, flags.fullDepth);
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

  // If multiple agents specified, install for each
  const agents = flags.agent.length > 0 ? flags.agent : [undefined];

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
            source: source!,
            sourceType: parsed.type === 'git' ? 'github' : 'local',
            computedHash: await computeSkillFolderHash(result.canonicalPath),
            ...(skillDir && skillDir !== '.' ? { skillDir } : {}),
            ...(pluginName ? { pluginName } : {}),
          }, cwd);
        }
      }
    }
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
