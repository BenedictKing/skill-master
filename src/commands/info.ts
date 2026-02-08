import { getRegistryEntry } from '../core/registry.js';
import { getEnvStatus } from '../core/env-manager.js';
import * as logger from '../utils/logger.js';
import { SkillNotFoundError } from '../utils/errors.js';

export async function info(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: skill-manager info <skill-name>');
    process.exit(1);
  }

  const skillName = args[0];

  try {
    const entry = await getRegistryEntry(skillName);
    if (!entry) {
      throw new SkillNotFoundError(skillName);
    }

    const envStatus = await getEnvStatus(skillName, entry.env_keys);

    logger.blank();
    logger.info(`Skill: ${skillName}`);
    logger.kv('Version', entry.version);
    logger.kv('Platform', entry.agent);
    logger.kv('Source', entry.source);
    logger.kv('Installed', new Date(entry.installed_at).toLocaleString());
    logger.kv('Updated', new Date(entry.updated_at).toLocaleString());
    logger.kv('Canonical Path', entry.canonical_path);
    logger.kv('Agent Path', entry.agent_path);
    logger.kv('Capabilities', entry.capabilities.join(', '));
    logger.kv('Env Keys', entry.env_keys.join(', ') || 'none');
    logger.kv('Env Status', envStatus);
    logger.blank();
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
