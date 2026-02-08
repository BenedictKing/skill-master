import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { listRegistry } from '../core/registry.js';
import { isGitUrl, parseGitUrl } from '../core/git-source.js';
import * as logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/** check command — check for skill updates */
export async function check(_args: string[]): Promise<void> {
  const skills = await listRegistry();
  const entries = Object.entries(skills);

  if (entries.length === 0) {
    logger.info('No skills installed');
    return;
  }

  logger.info('Checking for updates...');
  logger.blank();

  let updatable = 0;

  for (const [name, entry] of entries) {
    if (!isGitUrl(entry.source)) {
      logger.info(`${name}: local source — skipped`);
      continue;
    }

    try {
      const remoteHead = await getRemoteHead(entry.source);
      if (!remoteHead) {
        logger.warn(`${name}: unable to query remote`);
        continue;
      }

      // Compare with installed version (stored as git short hash or semver)
      // If version differs from remote HEAD, an update is available
      const isUpToDate = entry.version === remoteHead.slice(0, entry.version.length);
      if (isUpToDate) {
        logger.success(`${name}: up to date (${entry.version})`);
      } else {
        logger.warn(`${name}: update available (${entry.version} → ${remoteHead.slice(0, 7)})`);
        updatable++;
      }
    } catch {
      logger.warn(`${name}: failed to check remote`);
    }
  }

  logger.blank();
  if (updatable === 0) {
    logger.success('All skills are up to date!');
  } else {
    logger.info(`${updatable} skill(s) can be updated. Run "skill-master update <name>" to update.`);
  }
}

/** Get the latest commit hash from a remote git repo */
async function getRemoteHead(source: string): Promise<string | null> {
  try {
    const { owner, repo } = parseGitUrl(source);
    const url = `https://github.com/${owner}/${repo}.git`;
    const { stdout } = await execFileAsync('git', ['ls-remote', url, 'HEAD'], {
      timeout: 15_000,
    });
    const match = stdout.trim().split(/\s+/)[0];
    return match || null;
  } catch {
    return null;
  }
}
