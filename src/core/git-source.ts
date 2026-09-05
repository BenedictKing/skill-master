import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream, existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { ensureDir, createTempDir, removePath } from '../utils/fs-helpers.js';
import { GitCloneError, SourceParseError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';
import type { ParsedSource } from '../types/index.js';

const execFileAsync = promisify(execFile);

/** Default fetch budget. Large skill collections exceed the old 60s git clone cap. */
const DEFAULT_CLONE_TIMEOUT_MS = 300_000;

function getCloneTimeoutMs(): number {
  const raw = process.env.SKILL_MASTER_CLONE_TIMEOUT_MS;
  if (!raw) return DEFAULT_CLONE_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLONE_TIMEOUT_MS;
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    killed?: boolean;
    signal?: NodeJS.Signals | string | null;
    code?: string | number | null;
    name?: string;
  };
  return (
    e.killed === true ||
    e.signal === 'SIGTERM' ||
    e.code === 'ETIMEDOUT' ||
    e.code === 'ABORT_ERR' ||
    e.name === 'TimeoutError' ||
    e.name === 'AbortError'
  );
}

function splitTrailingSkillFilter(source: string): { source: string; skillFilter?: string } {
  const lastAt = source.lastIndexOf('@');
  const lastSlash = source.lastIndexOf('/');
  if (lastAt <= lastSlash) {
    return { source };
  }

  const skillFilter = source.slice(lastAt + 1);
  if (!skillFilter || skillFilter.includes('/')) {
    return { source };
  }

  return {
    source: source.slice(0, lastAt),
    skillFilter,
  };
}

/**
 * Parse a source string into a structured ParsedSource.
 * Supports:
 * - owner/repo → git
 * - owner/repo@skill → git + skillFilter
 * - owner/repo/sub/path → git + subpath
 * - github.com/o/r/tree/<ref>/<subpath> → git + ref + subpath
 * - github.com/o/r/blob/<ref>/<path> → git + ref + subpath (parent dir)
 * - gitlab.com/o/r/-/tree/<ref>/<subpath> → git + ref + subpath
 * - Full URLs (https/git@/git://) → git
 * - Local paths → local
 */
export function parseSource(source: string): ParsedSource {
  if (source.startsWith('/') || source.startsWith('./') || source.startsWith('../') || existsSync(source)) {
    return { type: 'local', path: source };
  }

  if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_.-]+(?:@[^/]+)?$/.test(source)) {
    const { source: shorthandSource, skillFilter } = splitTrailingSkillFilter(source);
    return {
      type: 'git',
      url: `https://github.com/${shorthandSource}.git`,
      skillFilter,
    };
  }

  const { source: normalizedSource, skillFilter: urlSkillFilter } = splitTrailingSkillFilter(source);

  if (
    normalizedSource.startsWith('git@') ||
    normalizedSource.startsWith('git://') ||
    normalizedSource.startsWith('ssh://')
  ) {
    return { type: 'git', url: normalizedSource, skillFilter: urlSkillFilter };
  }

  if (normalizedSource.startsWith('https://') || normalizedSource.startsWith('http://')) {
    // GitHub tree URL: github.com/o/r/tree/<ref>/<subpath>
    const ghTree = normalizedSource.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?/);
    if (ghTree) {
      const url = `https://github.com/${ghTree[1]}/${ghTree[2]}.git`;
      return { type: 'git', url, ref: ghTree[3], subpath: ghTree[4], skillFilter: urlSkillFilter };
    }

    // GitHub blob URL: github.com/o/r/blob/<ref>/<path> → parent dir as subpath
    const ghBlob = normalizedSource.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/);
    if (ghBlob) {
      const url = `https://github.com/${ghBlob[1]}/${ghBlob[2]}.git`;
      const filePath = ghBlob[4];
      const subpath = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : undefined;
      return { type: 'git', url, ref: ghBlob[3], subpath, skillFilter: urlSkillFilter };
    }

    // GitLab tree URL: gitlab.com/o/r/-/tree/<ref>/<subpath>
    const glTree = normalizedSource.match(/gitlab\.com\/([^/]+)\/([^/]+)\/-\/tree\/([^/]+)(?:\/(.+))?/);
    if (glTree) {
      const url = `https://gitlab.com/${glTree[1]}/${glTree[2]}.git`;
      return { type: 'git', url, ref: glTree[3], subpath: glTree[4], skillFilter: urlSkillFilter };
    }

    // Plain github.com or gitlab.com URL
    if (normalizedSource.includes('github.com/') || normalizedSource.includes('gitlab.com/')) {
      return { type: 'git', url: normalizedSource, skillFilter: urlSkillFilter };
    }

    // 其他 http(s) URL：可能是 well-known skills 端点，也可能是自建 git 服务。
    // 标记为 well-known，由调用方先尝试 well-known 发现、失败回退 git clone。
    return { type: 'well-known', url: normalizedSource, skillFilter: urlSkillFilter };
  }

  // Contains github.com or gitlab.com without protocol
  if (normalizedSource.includes('github.com/') || normalizedSource.includes('gitlab.com/')) {
    return parseSource('https://' + normalizedSource + (urlSkillFilter ? `@${urlSkillFilter}` : ''));
  }

  // Shorthand: extract @skill filter first
  let skillFilter: string | undefined = urlSkillFilter;
  let shorthand = normalizedSource;
  const atIdx = shorthand.indexOf('@');
  if (atIdx > 0 && !shorthand.includes('/') === false) {
    // Could be owner/repo@skill or owner/repo/path@skill
    // Only treat as skillFilter if @ is after the repo part
    const lastAt = shorthand.lastIndexOf('@');
    if (lastAt > 0) {
      const afterAt = shorthand.slice(lastAt + 1);
      const beforeAt = shorthand.slice(0, lastAt);
      // If afterAt has no slashes, it's a skill filter
      if (afterAt && !afterAt.includes('/')) {
        skillFilter = afterAt;
        shorthand = beforeAt;
      }
    }
  }

  // owner/repo (exactly 2 segments)
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(shorthand)) {
    return {
      type: 'git',
      url: `https://github.com/${shorthand}.git`,
      skillFilter,
    };
  }

  // owner/repo/sub/path (3+ segments, first two are owner/repo)
  const segments = shorthand.split('/');
  if (segments.length >= 3 && /^[a-zA-Z0-9_.-]+$/.test(segments[0]) && /^[a-zA-Z0-9_.-]+$/.test(segments[1])) {
    const owner = segments[0];
    const repo = segments[1];
    const subpath = segments.slice(2).join('/');
    return {
      type: 'git',
      url: `https://github.com/${owner}/${repo}.git`,
      subpath,
      skillFilter,
    };
  }

  throw new SourceParseError(source, 'Unable to determine source type');
}

/** Check if a string looks like a git URL or GitHub shorthand */
export function isGitUrl(source: string): boolean {
  try {
    return parseSource(source).type === 'git';
  } catch {
    return false;
  }
}

/** Normalize a source string to a full clone URL */
export function normalizeGitUrl(source: string): string {
  const parsed = parseSource(source);
  if (parsed.type !== 'git' || !parsed.url) return source;

  let url = parsed.url;
  // Ensure .git suffix for HTTPS URLs
  if (url.startsWith('https://') && !url.endsWith('.git')) {
    url += '.git';
  }
  return url;
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

/**
 * 归一化任意 git URL 为 {host, ownerRepo}，用于跨协议等价比较。
 * 支持：git@host:o/r、ssh://git@host/o/r、https://host/o/r、git://host/o/r、owner/repo shorthand。
 * 返回 null 表示无法识别为 git 仓库地址。
 */
export function parseGitIdentity(url: string): { host: string; ownerRepo: string } | null {
  const trimmed = url.trim().replace(/\.git$/, '').replace(/\/$/, '');

  // SCP-like SSH：git@host:owner/repo
  const scp = trimmed.match(/^git@([^:]+):(.+)$/);
  if (scp) {
    return { host: scp[1].toLowerCase(), ownerRepo: scp[2].toLowerCase() };
  }

  // URL 形式：ssh://git@host/owner/repo、https://host/owner/repo、git://host/owner/repo
  if (/^(https?|ssh|git):\/\//.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const path = u.pathname.replace(/^\//, '');
      if (!path) return null;
      return { host: u.hostname.toLowerCase(), ownerRepo: path.toLowerCase() };
    } catch {
      return null;
    }
  }

  // shorthand：owner/repo（无 host，默认 github.com）
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return { host: 'github.com', ownerRepo: trimmed.toLowerCase() };
  }

  return null;
}

/**
 * 判断两个 git 地址是否指向同一仓库。
 * SSH（git@/ssh://）与 HTTPS 视为等价，仅比较 host + owner/repo。
 */
export function isSameGitRepo(a: string, b: string): boolean {
  const ia = parseGitIdentity(a);
  const ib = parseGitIdentity(b);
  if (!ia || !ib) return false;
  return ia.host === ib.host && ia.ownerRepo === ib.ownerRepo;
}

/**
 * 决定写入 lock/registry 的 source 值。
 * SSH（git@/ssh://）或非 GitHub 的 HTTP(S) 保留原始 URL，避免归一化后破坏私钥认证；
 * GitHub HTTPS 使用归一化形式（owner/repo 或原始 shorthand），保持简洁可读。
 */
export function getLockSource(parsedUrl: string, rawInput: string): string {
  const isSSH = parsedUrl.startsWith('git@') || parsedUrl.startsWith('ssh://');
  if (isSSH) {
    return parsedUrl;
  }
  if (parsedUrl.startsWith('http://') || parsedUrl.startsWith('https://')) {
    try {
      if (new URL(parsedUrl).hostname !== 'github.com') {
        return parsedUrl;
      }
    } catch {
      return rawInput;
    }
  }
  return rawInput;
}

/** Clone a git repository to a temporary directory */
export async function cloneRepo(
  url: string,
  branch?: string,
): Promise<string> {
  const normalizedUrl = normalizeGitUrl(url);
  const tempDir = createTempDir();
  const timeout = getCloneTimeoutMs();
  const env = {
    ...process.env,
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_TERMINAL_PROMPT: '0',
  };

  logger.debug(`Fetching ${normalizedUrl} to ${tempDir}`);

  try {
    const identity = parseGitIdentity(normalizedUrl);
    if (identity?.host === 'github.com') {
      const archive = await tryGithubArchive(identity.ownerRepo, tempDir, branch, timeout);
      if (archive === 'ok') return tempDir;
      if (archive === 'timeout') {
        throw Object.assign(new Error('archive timed out'), { name: 'TimeoutError' });
      }
      await removePath(tempDir).catch(() => {});
    }

    const args = ['clone', '--depth', '1'];
    if (branch) args.push('--branch', branch);
    args.push(normalizedUrl, tempDir);
    await execFileAsync('git', args, { timeout, env });
  } catch (err) {
    await removePath(tempDir).catch(() => {});
    throw new GitCloneError(url, formatCloneFailure(err, timeout));
  }

  return tempDir;
}

type ArchiveResult = 'ok' | 'skip' | 'timeout';

async function tryGithubArchive(
  ownerRepo: string,
  tempDir: string,
  branch: string | undefined,
  timeout: number,
): Promise<ArchiveResult> {
  const ref = branch && /^[A-Za-z0-9._/\-]+$/.test(branch) ? branch : 'HEAD';
  const archiveUrl = `https://codeload.github.com/${ownerRepo}/tar.gz/${ref}`;
  const archivePath = join(tempDir, '.skill-master-archive.tgz');

  try {
    await ensureDir(tempDir);
    const res = await fetch(archiveUrl, {
      signal: AbortSignal.timeout(timeout),
      headers: { 'user-agent': 'skill-master' },
    });
    if (!res.ok || !res.body) {
      logger.debug(`GitHub archive HTTP ${res.status} for ${ownerRepo}@${ref}`);
      return 'skip';
    }

    await pipeline(Readable.fromWeb(res.body), createWriteStream(archivePath));
    await execFileAsync('tar', ['-xzf', archivePath, '-C', tempDir, '--strip-components', '1'], { timeout });
    await unlink(archivePath).catch(() => {});
    logger.debug(`GitHub archive materialized ${ownerRepo}@${ref}`);
    return 'ok';
  } catch (err) {
    logger.debug(`GitHub archive fallback to git clone: ${(err as Error).message}`);
    await unlink(archivePath).catch(() => {});
    return isTimeoutError(err) ? 'timeout' : 'skip';
  }
}

function formatCloneFailure(err: unknown, timeout: number): string {
  if (isTimeoutError(err)) {
    const seconds = Math.round(timeout / 1000);
    return (
      `timed out after ${seconds}s. Large skill repos often exceed the default budget; ` +
      `retry with SKILL_MASTER_CLONE_TIMEOUT_MS=${timeout * 2} or clone locally and install from the path`
    );
  }
  return err instanceof Error ? err.message : String(err);
}

/** Check if a local path exists and contains a skill */
export function isLocalPath(source: string): boolean {
  return existsSync(source);
}