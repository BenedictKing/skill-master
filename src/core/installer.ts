import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { cloneRepo, isGitUrl, isLocalPath } from './git-source.js';
import { findSkillDirectory, readSkillMd, inferCapabilities, extractEnvKeys } from './skill-parser.js';
import { backupEnv, restoreEnv } from './env-manager.js';
import { updateRegistry } from './registry.js';
import { detectPlatform, getAgentSkillsDir } from '../platform/detector.js';
import { copyDir, removePath, symlinkOrCopy, ensureDir, readTextSafe } from '../utils/fs-helpers.js';
import { getSkillCanonicalPath, getAgentSkillPath } from '../utils/paths.js';
import * as logger from '../utils/logger.js';
import { SkillNotFoundError, SkillParseError } from '../utils/errors.js';
import type { InstallOptions, RegistryEntry } from '../types/index.js';

const TOTAL_STEPS = 9;

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
export async function installSkill(options: InstallOptions): Promise<void> {
  const { source, cwd, copy = false, force = false } = options;

  // Step 1: Fetch source
  logger.step(1, TOTAL_STEPS, 'Fetching skill source...');
  let sourceDir: string;

  if (source.type === 'git') {
    sourceDir = await cloneRepo(source.url!, source.branch);
  } else if (source.type === 'local') {
    sourceDir = source.path!;
    if (!existsSync(sourceDir)) {
      throw new SkillNotFoundError(sourceDir);
    }
  } else {
    throw new SkillParseError('Invalid source type');
  }

  // Step 2: Find skill directory
  logger.step(2, TOTAL_STEPS, 'Locating SKILL.md...');
  const skillDir = await findSkillDirectory(sourceDir);
  if (!skillDir) {
    throw new SkillNotFoundError(`No SKILL.md found in ${sourceDir}`);
  }

  // Step 3: Parse SKILL.md
  logger.step(3, TOTAL_STEPS, 'Parsing SKILL.md...');
  const parsed = await readSkillMd(skillDir);
  if (!parsed) {
    throw new SkillParseError('Failed to read SKILL.md');
  }
  const skillName = parsed.frontmatter.name;
  logger.info(`Found skill: ${skillName}${parsed.frontmatter.version ? ` v${parsed.frontmatter.version}` : ''}`);

  // Step 4: Detect agent platform
  logger.step(4, TOTAL_STEPS, 'Detecting agent platform...');
  const agent = options.agent ?? detectPlatform(cwd);
  logger.info(`Target platform: ${agent}`);

  // Step 5: Backup existing .env
  logger.step(5, TOTAL_STEPS, 'Backing up .env...');
  const agentSkillDir = getAgentSkillPath(cwd, agent, skillName);
  const envBackup = await backupEnv(skillName, agentSkillDir);
  if (envBackup) {
    logger.success(`Backed up ${Object.keys(envBackup).length} env key(s)`);
  } else {
    logger.info('No existing .env found');
  }

  // Step 6: Clean and install to canonical path
  logger.step(6, TOTAL_STEPS, 'Installing to canonical path...');
  const canonicalPath = getSkillCanonicalPath(skillName);

  if (existsSync(canonicalPath) && !force) {
    logger.info('Replacing existing installation');
  }
  await removePath(canonicalPath);
  await copyDir(skillDir, canonicalPath);
  logger.success(`Installed to ${canonicalPath}`);

  // Step 7: Restore .env
  logger.step(7, TOTAL_STEPS, 'Restoring .env...');
  if (envBackup) {
    await restoreEnv(skillName, envBackup, canonicalPath);
    logger.success('.env restored successfully');
  } else {
    // Check if there's a .env.example to hint about
    const examplePath = join(canonicalPath, '.env.example');
    if (existsSync(examplePath)) {
      logger.warn('Found .env.example — run `skill-master env edit ' + skillName + '` to configure');
    }
  }

  // Step 8: Link or copy to agent directory
  logger.step(8, TOTAL_STEPS, `Linking to ${agent} skills directory...`);
  const agentPath = getAgentSkillPath(cwd, agent, skillName);
  const linkType = await symlinkOrCopy(canonicalPath, agentPath, copy);
  logger.success(`${linkType === 'symlink' ? 'Symlinked' : 'Copied'} to ${agentPath}`);

  // Step 9: Update registry
  logger.step(9, TOTAL_STEPS, 'Updating registry...');
  const capabilities = parsed.frontmatter.capabilities ?? inferCapabilities(parsed.frontmatter['allowed-tools'] ?? []);

  // Extract env keys from .env.example
  const envExampleContent = await readTextSafe(join(canonicalPath, '.env.example'));
  const envKeys = envExampleContent ? extractEnvKeys(envExampleContent) : [];

  const now = new Date().toISOString();
  const entry: RegistryEntry = {
    source: source.type === 'git' ? source.url! : source.path!,
    version: parsed.frontmatter.version,
    installed_at: now,
    updated_at: now,
    agent,
    env_keys: envKeys,
    capabilities,
    canonical_path: canonicalPath,
    agent_path: agentPath,
  };

  await updateRegistry(skillName, entry);
  logger.blank();
  logger.success(`Skill "${skillName}" installed successfully!`);
}
