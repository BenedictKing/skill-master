import { installSkill } from '../core/installer.js';
import { isGitUrl } from '../core/git-source.js';
import * as logger from '../utils/logger.js';
import type { SkillSource, AgentPlatform } from '../types/index.js';

export async function install(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: skill-manager install <github-url|local-path> [--agent=xxx] [--copy] [--force] [--yes]');
    process.exit(1);
  }

  const sourceArg = args[0];
  const flags = parseFlags(args.slice(1));

  const source: SkillSource = isGitUrl(sourceArg)
    ? { type: 'git', url: sourceArg }
    : { type: 'local', path: sourceArg };

  const cwd = process.cwd();

  try {
    await installSkill({
      source,
      agent: flags.agent as AgentPlatform | undefined,
      cwd,
      copy: flags.copy === true,
      force: flags.force === true,
      yes: flags.yes === true,
    });
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value ?? true;
    }
  }
  return flags;
}
