import { join, resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { cloneRepo } from './git-source.js';
import { findSkillDirectory, readSkillMd, inferCapabilities, extractEnvKeys } from './skill-parser.js';
import { backupEnvFromLocations, restoreEnv } from './env-manager.js';
import { updateRegistry } from './registry.js';
import { detectPlatform, isUniversalAgent } from '../platform/detector.js';
import { copyDir, removePath, symlinkOrCopy, readTextSafe } from '../utils/fs-helpers.js';
import { getSkillCanonicalPath, getSkillConfigPath, getAgentSkillPath, getAgentGlobalSkillPath, SKILLS_DIR } from '../utils/paths.js';
import * as logger from '../utils/logger.js';
import { SkillNotFoundError, SkillParseError } from '../utils/errors.js';
import type { AgentPlatform, InstallOptions, RegistryEntry, AgentInstall, InstallResult, InstallMode, ParsedSkill, SkillSource } from '../types/index.js';

const TOTAL_STEPS = 9;

interface InstallTargetOptions {
  agent: AgentPlatform;
  cwd: string;
  global: boolean;
  copy: boolean;
}

interface PreparedInstallContext {
  source: SkillSource;
  skillName: string;
  version?: string;
  canonicalPath: string;
  capabilities: RegistryEntry['capabilities'];
  envKeys: string[];
}

/** Sanitize a skill name — strip path traversal and only allow [a-zA-Z0-9_.-] */
export function sanitizeName(name: string): string {
  // Remove path traversal sequences first, then filter characters
  let sanitized = name.replace(/\.\./g, '').replace(/[^a-zA-Z0-9_.-]/g, '');
  // Strip leading dots to prevent '.' or '.hidden' directory issues
  sanitized = sanitized.replace(/^\.+/, '');
  return sanitized;
}

/** Verify that a resolved path stays within the expected base directory */
export function isPathSafe(targetPath: string, baseDir: string): boolean {
  const rel = relative(resolve(baseDir), resolve(targetPath));
  // Unsafe if: empty (same as base), starts with '..', or is absolute (Windows drive letter)
  if (!rel || rel === '.') return false;
  return !rel.startsWith('..') && !resolve(rel).includes('..');
}

async function resolveSourceDir(source: SkillSource): Promise<string> {
  if (source.type === 'git') {
    return source.localPath ?? await cloneRepo(source.url!, source.branch);
  }

  if (source.type === 'local') {
    const sourceDir = source.path!;
    if (!existsSync(sourceDir)) {
      throw new SkillNotFoundError(sourceDir);
    }
    return sourceDir;
  }

  throw new SkillParseError('Invalid source type');
}

async function resolveSkillMetadata(sourceDir: string): Promise<{ skillDir: string; parsed: ParsedSkill; skillName: string }> {
  const skillDir = await findSkillDirectory(sourceDir);
  if (!skillDir) {
    throw new SkillNotFoundError(`No SKILL.md found in ${sourceDir}`);
  }

  const parsed = await readSkillMd(skillDir);
  if (!parsed) {
    throw new SkillParseError('Failed to read SKILL.md');
  }

  const skillName = sanitizeName(parsed.frontmatter.name);
  if (!skillName) {
    throw new SkillParseError('Skill name is empty after sanitization');
  }

  return { skillDir, parsed, skillName };
}

function getTargetAgentPath(skillName: string, target: InstallTargetOptions): string {
  return target.global
    ? getAgentGlobalSkillPath(target.agent, skillName)
    : getAgentSkillPath(target.cwd, target.agent, skillName);
}

async function resolveEnvBackupForTargets(
  skillName: string,
  agentSkillDirs: string[],
){
  return backupEnvFromLocations([
    join(getSkillConfigPath(skillName), '.env'),
    ...(agentSkillDirs.length > 0 ? [join(agentSkillDirs[0], '.env')] : []),
    join(getSkillCanonicalPath(skillName), '.env'),
    ...agentSkillDirs.slice(1).map(dir => join(dir, '.env')),
  ]);
}

async function prepareInstallContext(
  source: SkillSource,
  targets: InstallTargetOptions[],
  force: boolean,
): Promise<PreparedInstallContext> {
  logger.step(1, TOTAL_STEPS, 'Fetching skill source...');
  const sourceDir = await resolveSourceDir(source);

  logger.step(2, TOTAL_STEPS, 'Locating SKILL.md...');
  const { skillDir, parsed, skillName } = await resolveSkillMetadata(sourceDir);

  logger.step(3, TOTAL_STEPS, 'Parsing SKILL.md...');
  logger.info(`Found skill: ${skillName}${parsed.frontmatter.version ? ` v${parsed.frontmatter.version}` : ''}`);

  if (targets.length === 1) {
    logger.step(4, TOTAL_STEPS, 'Detecting agent platform...');
    logger.info(`Target platform: ${targets[0].agent}`);
  } else {
    logger.step(4, TOTAL_STEPS, 'Preparing install targets...');
    logger.info(`Target platforms: ${targets.map(target => target.agent).join(', ')}`);
  }

  logger.step(5, TOTAL_STEPS, 'Backing up .env...');
  const envBackup = await resolveEnvBackupForTargets(
    skillName,
    targets.map(target => getTargetAgentPath(skillName, target)),
  );
  if (envBackup) {
    logger.success(`Backed up ${Object.keys(envBackup).length} env key(s)`);
  } else {
    logger.info('No existing .env found');
  }

  logger.step(6, TOTAL_STEPS, 'Installing to canonical path...');
  const canonicalPath = getSkillCanonicalPath(skillName);
  if (!isPathSafe(canonicalPath, SKILLS_DIR)) {
    throw new SkillParseError(`Unsafe canonical path: ${canonicalPath}`);
  }

  if (existsSync(canonicalPath) && !force) {
    logger.info('Replacing existing installation');
  }
  await removePath(canonicalPath);
  await copyDir(skillDir, canonicalPath);
  logger.success(`Installed to ${canonicalPath}`);

  logger.step(7, TOTAL_STEPS, 'Restoring .env...');
  if (envBackup) {
    await restoreEnv(skillName, envBackup, canonicalPath);
    logger.success('.env restored successfully');
  } else {
    const examplePath = join(canonicalPath, '.env.example');
    if (existsSync(examplePath)) {
      logger.warn('Found .env.example — run `skill-master env edit ' + skillName + '` to configure');
    }
  }

  const capabilities = parsed.frontmatter.capabilities ?? inferCapabilities(parsed.frontmatter['allowed-tools'] ?? []);
  const envExampleContent = await readTextSafe(join(canonicalPath, '.env.example'));
  const envKeys = envExampleContent ? extractEnvKeys(envExampleContent) : [];

  return {
    source,
    skillName,
    version: parsed.frontmatter.version,
    canonicalPath,
    capabilities,
    envKeys,
  };
}

async function installPreparedTarget(
  context: PreparedInstallContext,
  target: InstallTargetOptions,
  multiTarget: boolean,
): Promise<InstallResult> {
  logger.step(8, TOTAL_STEPS, `Linking to ${target.agent} skills directory...`);
  const agentPath = getTargetAgentPath(context.skillName, target);

  let installMode: InstallMode;
  if (target.global && isUniversalAgent(target.agent) && context.canonicalPath === agentPath) {
    installMode = 'copy';
    logger.success(`Canonical path is agent path (universal agent): ${agentPath}`);
  } else {
    const linkType = await symlinkOrCopy(context.canonicalPath, agentPath, target.copy);
    installMode = linkType;
    logger.success(`${linkType === 'symlink' ? 'Symlinked' : 'Copied'} to ${agentPath}`);
  }

  logger.step(9, TOTAL_STEPS, `Updating ${target.agent} registry...`);
  const now = new Date().toISOString();
  const agentInstall: AgentInstall = {
    agent: target.agent,
    agent_path: agentPath,
    global: target.global,
  };
  const entry: RegistryEntry = {
    source: context.source.type === 'git' ? context.source.url! : context.source.path!,
    version: context.version,
    installed_at: now,
    updated_at: now,
    agents: [agentInstall],
    env_keys: context.envKeys,
    capabilities: context.capabilities,
    canonical_path: context.canonicalPath,
  };

  await updateRegistry(context.skillName, entry);
  if (multiTarget) {
    logger.success(`Installed "${context.skillName}" for ${target.agent}`);
  } else {
    logger.success(`Skill "${context.skillName}" installed successfully!`);
  }

  return {
    skillName: context.skillName,
    version: context.version,
    canonicalPath: context.canonicalPath,
    agentPath,
    installMode,
  };
}

export async function installSkillToAgents(
  options: Omit<InstallOptions, 'agent'> & { agents: AgentPlatform[] },
): Promise<InstallResult[]> {
  if (options.agents.length === 0) {
    throw new SkillParseError('No agent targets provided');
  }

  const targets = options.agents.map((agent) => ({
    agent,
    cwd: options.cwd,
    global: options.global ?? false,
    copy: options.copy ?? false,
  }));
  const context = await prepareInstallContext(options.source, targets, options.force ?? false);
  const results: InstallResult[] = [];

  for (let index = 0; index < targets.length; index++) {
    results.push(await installPreparedTarget(context, targets[index], targets.length > 1));
    if (index < targets.length - 1) {
      logger.blank();
    }
  }

  return results;
}

/**
 * Main installation engine — 9-step process:
 * 1. fetchSource      → clone/copy to temp
 * 2. findSkillDir     → locate SKILL.md
 * 3. parseSkillMd     → parse frontmatter
 * 4. detectAgent      → determine target platform
 * 5. backupEnv        → preserve existing .env
 * 6. cleanAndInstall  → rm old → copy new to canonical
 * 7. restoreEnv       → restore .env to both locations
 * 8. linkOrCopy       → symlink/copy to agent dir
 * 9. updateRegistry   → update registry.json
 */
export async function installSkill(options: InstallOptions): Promise<InstallResult> {
  const agent = options.agent ?? detectPlatform(options.cwd);
  const [result] = await installSkillToAgents({
    source: options.source,
    cwd: options.cwd,
    global: options.global,
    copy: options.copy,
    force: options.force,
    yes: options.yes,
    agents: [agent],
  });
  return result;
}
