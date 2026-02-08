import { getRegistryEntry, removeFromRegistry } from '../core/registry.js';
import { removePath } from '../utils/fs-helpers.js';
import { getSkillCanonicalPath, getSkillConfigPath } from '../utils/paths.js';
import * as logger from '../utils/logger.js';
import { SkillNotFoundError } from '../utils/errors.js';

export async function remove(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: skill-manager remove <skill-name> [--purge]');
    process.exit(1);
  }

  const skillName = args[0];
  const purge = args.includes('--purge');

  try {
    const entry = await getRegistryEntry(skillName);
    if (!entry) {
      throw new SkillNotFoundError(skillName);
    }

    logger.info(`Removing skill: ${skillName}`);

    // Remove agent directory link/copy
    await removePath(entry.agent_path);
    logger.success(`Removed from ${entry.agent_path}`);

    // Remove canonical directory
    await removePath(entry.canonical_path);
    logger.success(`Removed from ${entry.canonical_path}`);

    // Optionally purge config
    if (purge) {
      await removePath(getSkillConfigPath(skillName));
      logger.success('Purged config directory');
    }

    // Update registry
    await removeFromRegistry(skillName);
    logger.success(`Skill "${skillName}" removed successfully!`);
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
