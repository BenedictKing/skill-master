import { existsSync } from 'node:fs';
import { listRegistry } from '../core/registry.js';
import { getEnvStatus } from '../core/env-manager.js';
import { isSymlink } from '../utils/fs-helpers.js';
import { AGENTS_HOME, CONFIG_DIR, SKILLS_DIR, REGISTRY_PATH } from '../utils/paths.js';
import * as logger from '../utils/logger.js';

export async function doctor(): Promise<void> {
  logger.blank();
  logger.info('Running diagnostics...');
  logger.blank();

  let issues = 0;

  // Check directory structure
  logger.info('Checking directory structure...');
  const dirs = [AGENTS_HOME, CONFIG_DIR, SKILLS_DIR];
  for (const dir of dirs) {
    if (existsSync(dir)) {
      logger.success(`✓ ${dir}`);
    } else {
      logger.warn(`✗ ${dir} (missing)`);
      issues++;
    }
  }
  logger.blank();

  // Check registry
  logger.info('Checking registry...');
  if (existsSync(REGISTRY_PATH)) {
    logger.success(`✓ ${REGISTRY_PATH}`);
    try {
      const skills = await listRegistry();
      logger.info(`  Found ${Object.keys(skills).length} skill(s)`);
    } catch (err) {
      logger.error(`✗ Registry corrupted: ${(err as Error).message}`);
      issues++;
    }
  } else {
    logger.info(`  No registry found (will be created on first install)`);
  }
  logger.blank();

  // Check each skill
  logger.info('Checking installed skills...');
  try {
    const skills = await listRegistry();
    for (const [name, entry] of Object.entries(skills)) {
      logger.info(`Skill: ${name}`);

      // Check canonical path
      if (existsSync(entry.canonical_path)) {
        logger.success(`  ✓ Canonical path exists`);
      } else {
        logger.error(`  ✗ Canonical path missing: ${entry.canonical_path}`);
        issues++;
      }

      // Check each agent path
      for (const agentRecord of entry.agents) {
        if (existsSync(agentRecord.agent_path)) {
          const isLink = await isSymlink(agentRecord.agent_path);
          logger.success(`  ✓ ${agentRecord.agent} path exists (${isLink ? 'symlink' : 'copy'}${agentRecord.global ? ', global' : ''})`);
        } else {
          logger.error(`  ✗ ${agentRecord.agent} path missing: ${agentRecord.agent_path}`);
          issues++;
        }
      }

      // Check env status
      const envStatus = await getEnvStatus(name, entry.env_keys);
      if (envStatus === 'configured') {
        logger.success(`  ✓ Environment configured`);
      } else if (envStatus === 'partial') {
        logger.warn(`  ⚠ Environment partially configured`);
      } else if (entry.env_keys.length > 0) {
        logger.warn(`  ⚠ Environment not configured`);
      }
    }
  } catch (err) {
    logger.error(`Failed to check skills: ${(err as Error).message}`);
    issues++;
  }

  logger.blank();
  if (issues === 0) {
    logger.success('All checks passed!');
  } else {
    logger.warn(`Found ${issues} issue(s)`);
  }
  logger.blank();
}
