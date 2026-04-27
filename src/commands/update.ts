import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { installSkill, isPathSafe, sanitizeName } from '../core/installer.js';
import { cloneRepo, parseSource } from '../core/git-source.js';
import { readLocalLock } from '../core/local-lock.js';
import { resolveProjectCwd } from '../core/project-root.js';
import { getRegistryEntry } from '../core/registry.js';
import { findAllSkillDirectories, readSkillMd } from '../core/skill-parser.js';
import * as logger from '../utils/logger.js';
import { SkillNotFoundError } from '../utils/errors.js';
import type { LocalLockEntry, ParsedSource, RegistryEntry, SkillSource } from '../types/index.js';

interface SkillDirResolutionSuccess {
  ok: true;
  path: string;
}

interface SkillDirResolutionFailure {
  ok: false;
  reason: string;
}

interface ResolveUpdateSourceOptions {
  preferProjectLock?: boolean;
  fallbackCwd?: string;
}

interface UpdateSourceResolutionSuccess {
  ok: true;
  source: SkillSource;
  sourceLabel: string;
  usedLock: boolean;
}

interface UpdateSourceResolutionFailure {
  ok: false;
  reason: string;
  hint: string;
}

export type SkillDirResolution = SkillDirResolutionSuccess | SkillDirResolutionFailure;
export type UpdateSourceResolution = UpdateSourceResolutionSuccess | UpdateSourceResolutionFailure;

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function buildReinstallHint(source: string): string {
  return `可尝试重新安装以恢复更新元数据：skill-master add ${shellQuote(source)}`;
}

export async function resolveSkillDirForUpdate(
  skillName: string,
  sourceDir: string,
  lockedSkillDir?: string,
): Promise<SkillDirResolution> {
  if (lockedSkillDir) {
    if (isAbsolute(lockedSkillDir)) {
      lockedSkillDir = undefined;
    } else {
      const lockedPath = join(sourceDir, lockedSkillDir);
      if (!isPathSafe(lockedPath, sourceDir)) {
        return { ok: false, reason: `锁文件记录的技能目录越界：${lockedSkillDir}` };
      }
      if (!existsSync(lockedPath)) {
        return { ok: false, reason: `锁文件记录的技能目录不存在：${lockedSkillDir}` };
      }

      const lockedSkill = await readSkillMd(lockedPath);
      if (!lockedSkill) {
        return { ok: false, reason: `锁文件记录的技能目录缺少有效的 SKILL.md：${lockedSkillDir}` };
      }

      if (sanitizeName(lockedSkill.frontmatter.name) !== skillName) {
        return {
          ok: false,
          reason: `锁文件记录的技能目录解析为 "${lockedSkill.frontmatter.name}"，与已安装技能 "${skillName}" 不一致`,
        };
      }

      return { ok: true, path: lockedPath };
    }
  }

  const discovered = await findAllSkillDirectories(sourceDir);
  if (discovered.length === 0) {
    return { ok: false, reason: `在来源目录中没有找到任何 SKILL.md：${sourceDir}` };
  }

  const normalizedSkillName = sanitizeName(skillName);
  const matches: string[] = [];
  const foundNames: string[] = [];
  let invalidCount = 0;

  for (const dir of discovered) {
    let parsed;
    try {
      parsed = await readSkillMd(dir);
    } catch {
      invalidCount++;
      continue;
    }

    const foundName = parsed?.frontmatter.name;
    if (!foundName) continue;
    foundNames.push(foundName);
    if (sanitizeName(foundName) === normalizedSkillName) {
      matches.push(dir);
    }
  }

  if (matches.length === 1) {
    return { ok: true, path: matches[0] };
  }

  if (matches.length > 1) {
    return { ok: false, reason: `来源中存在多个同名技能目录，无法安全更新 "${skillName}"` };
  }

  if (discovered.length === 1) {
    if (invalidCount === 1) {
      return { ok: false, reason: `来源中唯一找到的技能目录包含无法解析的 SKILL.md：${discovered[0]}` };
    }
    const parsed = await readSkillMd(discovered[0]);
    const foundName = parsed?.frontmatter.name ?? 'unknown';
    return {
      ok: false,
      reason: `来源中唯一找到的技能是 "${foundName}"，与已安装技能 "${skillName}" 不一致`,
    };
  }

  const summaryParts: string[] = [];
  if (foundNames.length > 0) {
    summaryParts.push(foundNames.join(', '));
  }
  if (invalidCount > 0) {
    summaryParts.push(`${invalidCount} 个无法解析的技能目录`);
  }
  const summary = summaryParts.length > 0 ? summaryParts.join('；') : `${discovered.length} 个技能目录`;
  return {
    ok: false,
    reason: `来源中找到多个技能，但没有唯一匹配 "${skillName}" 的目录（发现：${summary}）`,
  };
}

function resolveLocalSourcePath(cwd: string, sourcePath: string): string {
  return resolve(cwd, sourcePath);
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const rel = relative(resolve(basePath), resolve(targetPath));
  return rel === '' || rel === '.' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function parseLockSource(lockEntry: LocalLockEntry): ParsedSource {
  if (lockEntry.sourceType !== 'github') {
    return { type: 'local', path: lockEntry.source };
  }

  return parseSource(lockEntry.source);
}

function parseRegistrySourceForUpdate(source: string, cwd: string, fallbackCwd?: string): ParsedSource {
  if (!isAbsolute(source)) {
    const fallbackPath = fallbackCwd ? resolve(fallbackCwd, source) : undefined;
    const projectPath = resolve(cwd, source);
    if ((fallbackPath && existsSync(fallbackPath)) || existsSync(projectPath)) {
      return { type: 'local', path: source };
    }
  }

  return parseSource(source);
}

function isLockSourceCompatible(lockEntry: LocalLockEntry, entrySource: string, cwd: string, fallbackCwd?: string): boolean {
  try {
    const parsedLock = parseLockSource(lockEntry);
    const parsedEntry = parseRegistrySourceForUpdate(entrySource, cwd, fallbackCwd);

    if (parsedLock.type !== parsedEntry.type) {
      return false;
    }

    if (parsedLock.type === 'git' && parsedEntry.type === 'git') {
      return parsedLock.url === parsedEntry.url;
    }

    const lockPath = resolveLocalSourcePath(cwd, parsedLock.path!);
    const entryPaths = [resolveLocalSourcePath(cwd, parsedEntry.path!)];
    if (fallbackCwd && !isAbsolute(parsedEntry.path!)) {
      entryPaths.push(resolveLocalSourcePath(fallbackCwd, parsedEntry.path!));
    }
    return entryPaths.some(entryPath => lockPath === entryPath || isPathWithin(lockPath, entryPath));
  } catch {
    return false;
  }
}

export async function resolveUpdateSource(
  skillName: string,
  entry: RegistryEntry,
  cwd: string,
  options: ResolveUpdateSourceOptions = {},
): Promise<UpdateSourceResolution> {
  const lockEntry = options.preferProjectLock
    ? (await readLocalLock(cwd)).skills[skillName]
    : undefined;

  const useLock = Boolean(lockEntry) && isLockSourceCompatible(lockEntry!, entry.source, cwd, options.fallbackCwd);
  const sourceLabel = useLock ? lockEntry!.source : entry.source;
  const hint = buildReinstallHint(sourceLabel);

  let parsed;
  try {
    parsed = useLock
      ? parseLockSource(lockEntry!)
      : parseRegistrySourceForUpdate(sourceLabel, cwd, options.fallbackCwd);
  } catch (err) {
    return {
      ok: false,
      reason: `无法解析更新来源：${(err as Error).message}`,
      hint,
    };
  }

  let sourceDir: string;
  if (parsed.subpath && !isPathSafe(join('/source', parsed.subpath), '/source')) {
    return {
      ok: false,
      reason: `来源子路径越界：${parsed.subpath}`,
      hint,
    };
  }

  if (parsed.type === 'git') {
    try {
      sourceDir = await cloneRepo(parsed.url!, parsed.ref);
    } catch (err) {
      return {
        ok: false,
        reason: `无法获取远程来源：${(err as Error).message}`,
        hint,
      };
    }
  } else {
    if (!useLock && options.fallbackCwd && !isAbsolute(parsed.path!)) {
      const fallbackSourceDir = resolve(options.fallbackCwd, parsed.path!);
      if (existsSync(fallbackSourceDir)) {
        sourceDir = fallbackSourceDir;
      } else {
        sourceDir = resolve(cwd, parsed.path!);
      }
    } else {
      sourceDir = resolve(cwd, parsed.path!);
    }
    if (!existsSync(sourceDir)) {
      return {
        ok: false,
        reason: `本地来源不存在：${parsed.path!}`,
        hint,
      };
    }
  }

  if (parsed.subpath) {
    const subpathDir = join(sourceDir, parsed.subpath);
    if (!isPathSafe(subpathDir, sourceDir)) {
      return {
        ok: false,
        reason: `来源子路径越界：${parsed.subpath}`,
        hint,
      };
    }
    if (!existsSync(subpathDir)) {
      return {
        ok: false,
        reason: `来源子路径不存在：${parsed.subpath}`,
        hint,
      };
    }
    sourceDir = subpathDir;
  }

  const resolvedDir = await resolveSkillDirForUpdate(skillName, sourceDir, useLock ? lockEntry?.skillDir : undefined);
  if (!resolvedDir.ok) {
    return { ok: false, reason: resolvedDir.reason, hint };
  }

  return {
    ok: true,
    source: parsed.type === 'git'
      ? { type: 'git', url: parsed.url!, branch: parsed.ref, localPath: resolvedDir.path }
      : { type: 'local', path: resolvedDir.path },
    sourceLabel,
    usedLock: useLock,
  };
}

export async function update(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: skill-master update <skill-name> [--force]');
    process.exit(1);
  }

  const skillName = args[0];
  const commandCwd = process.cwd();
  const projectCwd = resolveProjectCwd(commandCwd);

  try {
    const entry = await getRegistryEntry(skillName);
    if (!entry) {
      throw new SkillNotFoundError(skillName);
    }

    logger.info(`Updating skill: ${skillName}`);

    let successCount = 0;
    const failures: string[] = [];

    for (const agentRecord of entry.agents) {
      const targetLabel = `${agentRecord.agent}${agentRecord.global ? ' (global)' : ' (project)'}`;
      const installCwd = agentRecord.global ? commandCwd : projectCwd;
      const resolved = await resolveUpdateSource(skillName, entry, installCwd, {
        preferProjectLock: !agentRecord.global,
        fallbackCwd: agentRecord.global ? undefined : commandCwd,
      });
      if (!resolved.ok) {
        failures.push(`${targetLabel}: ${resolved.reason}`);
        logger.warn(`已跳过目标：${targetLabel}: ${resolved.reason}`);
        logger.info(resolved.hint);
        continue;
      }

      logger.info(`Source for ${targetLabel}: ${resolved.sourceLabel}`);
      if (resolved.usedLock) {
        logger.info(`Using project lock metadata for ${targetLabel}`);
      }

      try {
        await installSkill({
          source: resolved.source,
          agent: agentRecord.agent,
          cwd: installCwd,
          global: agentRecord.global,
          force: true,
        });
        logger.success(`Updated ${targetLabel}`);
        successCount++;
      } catch (err) {
        const message = `${targetLabel}: ${(err as Error).message}`;
        failures.push(message);
        logger.warn(`已跳过目标：${message}`);
      }
    }

    logger.blank();

    if (successCount > 0) {
      logger.success(`Skill "${skillName}" updated successfully for ${successCount} target(s)!`);
    }

    if (failures.length > 0) {
      logger.section('Skipped targets');
      for (const failure of failures) {
        logger.kv('target', failure);
      }
    }

    if (successCount === 0 || failures.length > 0) {
      process.exit(1);
    }
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
