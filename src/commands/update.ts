import { getRegistryEntry } from '../core/registry.js';
import { installSkill } from '../core/installer.js';
import { isGitUrl } from '../core/git-source.js';
import * as logger from '../utils/logger.js';
import { SkillNotFoundError } from '../utils/errors.js';
import type { SkillSource } from '../types/index.js';

export async function update(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: skill-manager update <skill-name> [--force]');
    process.exit(1);
  }

  const skillName = args[0];
  const force = args.includes('--force');

  try {
    const entry = await getRegistryEntry(skillName);
    if (!entry) {
      throw new SkillNotFoundError(skillName);
    }

    logger.info(`Updating skill: ${skillName}`);
    logger.info(`Source: ${entry.source}`);

    const source: SkillSource = isGitUrl(entry.source)
      ? { type: 'git', url: entry.source }
      : { type: 'local', path: entry.source };

    await installSkill({
      source,
      agent: entry.agent,
      cwd: process.cwd(),
      force: true,
    });

    logger.success(`Skill "${skillName}" updated successfully!`);
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
