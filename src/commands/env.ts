import { listRegistry } from '../core/registry.js';
import { getEnvStatus, setEnvValue, getEnvEditPath } from '../core/env-manager.js';
import { getSkillCanonicalPath } from '../utils/paths.js';
import * as logger from '../utils/logger.js';
import { spawn } from 'node:child_process';

export async function env(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'list') {
    await envList();
  } else if (subcommand === 'set') {
    await envSet(args.slice(1));
  } else if (subcommand === 'edit') {
    await envEdit(args.slice(1));
  } else {
    logger.error('Usage: skill-master env <list|set|edit>');
    process.exit(1);
  }
}

async function envList(): Promise<void> {
  const skills = await listRegistry();
  const entries = Object.entries(skills);

  if (entries.length === 0) {
    logger.info('No skills installed');
    return;
  }

  logger.blank();
  logger.tableHeader('Skill', 'Status', 'Keys');

  for (const [name, entry] of entries) {
    const status = await getEnvStatus(name, entry.env_keys);
    const statusIcon = status === 'configured' ? '✓' : status === 'partial' ? '⚠' : '✗';
    logger.tableRow(name, `${statusIcon} ${status}`, entry.env_keys.join(', '));
  }
  logger.blank();
}

async function envSet(args: string[]): Promise<void> {
  if (args.length < 2) {
    logger.error('Usage: skill-master env set <skill> KEY=VALUE');
    process.exit(1);
  }

  const skillName = args[0];
  const [key, value] = args[1].split('=');

  if (!key || !value) {
    logger.error('Invalid format. Use: KEY=VALUE');
    process.exit(1);
  }

  try {
    const skillDir = getSkillCanonicalPath(skillName);
    await setEnvValue(skillName, key, value, skillDir);
    logger.success(`Set ${key} for ${skillName}`);
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}

async function envEdit(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: skill-master env edit <skill>');
    process.exit(1);
  }

  const skillName = args[0];
  const envPath = getEnvEditPath(skillName);
  const editor = process.env.EDITOR || 'vi';

  logger.info(`Opening ${envPath} with ${editor}...`);

  const child = spawn(editor, [envPath], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    if (code === 0) {
      logger.success('Saved');
    } else {
      logger.error('Editor exited with error');
      process.exit(1);
    }
  });
}
