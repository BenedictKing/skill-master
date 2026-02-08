import { listRegistry } from '../core/registry.js';
import * as logger from '../utils/logger.js';

export async function list(): Promise<void> {
  const skills = await listRegistry();
  const entries = Object.entries(skills);

  if (entries.length === 0) {
    logger.info('No skills installed');
    return;
  }

  logger.blank();
  logger.tableHeader('Skill', 'Version', 'Platform', 'Installed');

  for (const [name, entry] of entries) {
    const date = new Date(entry.installed_at).toLocaleDateString();
    logger.tableRow(name, entry.version, entry.agent, date);
  }
  logger.blank();
}
