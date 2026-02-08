import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { ensureDir, createTempDir } from '../utils/fs-helpers.js';
import { GitCloneError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/** Check if a string looks like a git URL or GitHub shorthand (owner/repo) */
export function isGitUrl(source: string): boolean {
  return (
    source.startsWith('https://') ||
    source.startsWith('http://') ||
    source.startsWith('git@') ||
    source.startsWith('git://') ||
    source.includes('github.com/') ||
    source.includes('gitlab.com/') ||
    /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source)
  );
}

/** Normalize a GitHub shorthand or URL to a full clone URL */
export function normalizeGitUrl(source: string): string {
  // Already a full URL
  if (source.startsWith('https://') || source.startsWith('http://') ||
      source.startsWith('git@') || source.startsWith('git://')) {
    // Ensure .git suffix for HTTPS URLs
    if (source.startsWith('https://') && !source.endsWith('.git')) {
      return source + '.git';
    }
    return source;
  }

  // GitHub shorthand: owner/repo
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source)) {
    return `https://github.com/${source}.git`;
  }

  return source;
}

/** Parse a GitHub URL into owner and repo */
export function parseGitUrl(url: string): { owner: string; repo: string; branch?: string } {
  // Handle tree/branch in URL: github.com/owner/repo/tree/branch
  const treeMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/(.+)/);
  if (treeMatch) {
    return {
      owner: treeMatch[1],
      repo: treeMatch[2].replace(/\.git$/, ''),
      branch: treeMatch[3],
    };
  }

  // Standard URL: github.com/owner/repo
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }

  throw new GitCloneError(url, 'Unable to parse GitHub URL');
}

/** Clone a git repository to a temporary directory */
export async function cloneRepo(
  url: string,
  branch?: string,
): Promise<string> {
  const normalizedUrl = normalizeGitUrl(url);
  const tempDir = createTempDir();
  await ensureDir(tempDir);

  const args = ['clone', '--depth', '1'];
  if (branch) {
    args.push('--branch', branch);
  }
  args.push(normalizedUrl, tempDir);

  logger.debug(`Cloning ${normalizedUrl} to ${tempDir}`);

  try {
    await execFileAsync('git', args, { timeout: 60_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitCloneError(url, msg);
  }

  return tempDir;
}

/** Check if a local path exists and contains a skill */
export function isLocalPath(source: string): boolean {
  return existsSync(source);
}