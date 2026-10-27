import { existsSync } from 'node:fs';
import { listRegistry } from '../core/registry.js';
import { getEnvStatus } from '../core/env-manager.js';
import { findOrphanedSkillLinks } from '../core/orphan-links.js';
import { resolveProjectCwd } from '../core/project-root.js';
import { isSymlink, removePath } from '../utils/fs-helpers.js';
import { AGENTS_HOME, CONFIG_DIR, SKILLS_DIR, REGISTRY_PATH } from '../utils/paths.js';
import { confirm } from '../utils/prompt.js';
import * as logger from '../utils/logger.js';

export async function doctor(args: string[] = []): Promise<void> {
  const fix = args.includes('--fix');
  const yes = args.includes('-y') || args.includes('--yes');
  for (const arg of args) {
    if (arg !== '--fix' && arg !== '-y' && arg !== '--yes') {
      logger.error(`Unknown option: ${arg}`);
      console.log('Usage: skill-master doctor [--fix] [-y]');
      process.exit(1);
    }
  }

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

  // Check for orphaned (dangling) skill links across agent directories
  logger.info('Checking for orphaned skill links...');
  const orphaned = findOrphanedSkillLinks(resolveProjectCwd(process.cwd()));
  if (orphaned.length === 0) {
    logger.success(`  ✓ No orphaned links`);
  } else {
    for (const orphan of orphaned) {
      logger.warn(`  ⚠ ${orphan.agent}: ${orphan.linkPath} -> ${orphan.target} (dangling)`);
    }
    if (fix) {
      if (!yes) {
        const ok = await confirm(`Remove ${orphaned.length} orphaned link(s)? [y/N] `);
        if (!ok) {
          logger.info('Skipped orphaned link cleanup.');
        } else {
          await cleanupOrphanedLinks(orphaned);
        }
      } else {
        await cleanupOrphanedLinks(orphaned);
      }
    } else {
      issues += orphaned.length;
      logger.info(`  Run "skill-master doctor --fix" to remove them.`);
    }
  }
  logger.blank();

  if (issues === 0) {
    logger.success('All checks passed!');
  } else {
    logger.warn(`Found ${issues} issue(s)`);
  }
  logger.blank();
}

async function cleanupOrphanedLinks(orphaned: ReturnType<typeof findOrphanedSkillLinks>): Promise<void> {
  for (const orphan of orphaned) {
    await removePath(orphan.linkPath);
    logger.success(`  ✓ Removed ${orphan.linkPath}`);
  }
  logger.info(`Removed ${orphaned.length} orphaned link(s).`);
}
