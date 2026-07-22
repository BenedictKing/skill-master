/**
 * Blob 快照安装（快路径）。
 *
 * 通过 GitHub Trees API 定位 SKILL.md，再从 skills.sh 下载 API 拉取完整 skill 快照，
 * 避免 git clone 带来的整仓库下载开销。产物物化到临时目录，
 * 让 add/installer 完全无感知地走统一的磁盘发现逻辑。
 *
 * 仅对白名单 owner 启用（可用环境变量开关），任一文件下载失败则整体回退 clone。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { createTempDir } from '../utils/fs-helpers.js';
import * as logger from '../utils/logger.js';

// ─── 类型 ───

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface RepoTree {
  sha: string;
  branch: string;
  tree: TreeEntry[];
}

interface SkillSnapshotFile {
  path: string;
  contents: string;
}

interface SkillDownloadResponse {
  files: SkillSnapshotFile[];
  hash: string;
}

// ─── 常量 ───

const DOWNLOAD_BASE_URL = process.env.SKILLS_DOWNLOAD_URL || 'https://skills.sh';
const FETCH_TIMEOUT = 10_000;

/**
 * Blob 快路径白名单 owner（小写）。命中才尝试 blob，其余直接走 clone。
 * 可通过 SKILL_MASTER_BLOB_OWNERS 环境变量追加（逗号分隔）。
 */
const DEFAULT_BLOB_OWNERS = ['vercel', 'vercel-labs', 'heygen-com'];

function getBlobOwnerAllowlist(): Set<string> {
  const extra = (process.env.SKILL_MASTER_BLOB_OWNERS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_BLOB_OWNERS, ...extra]);
}

/** 是否允许对指定 owner/repo 使用 blob 快路径。可用 SKILL_MASTER_BLOB=0 全局关闭。 */
export function isBlobAllowed(ownerRepo: string): boolean {
  if (process.env.SKILL_MASTER_BLOB === '0') return false;
  const owner = ownerRepo.split('/')[0]?.toLowerCase() ?? '';
  return getBlobOwnerAllowlist().has(owner);
}

// ─── slug 计算（须与服务端一致）───

export function toSkillSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── GitHub Trees API（懒授权）───

/** 进程内标记：一旦遇到限流，后续调用跳过匿名尝试直接带 token。 */
let rateLimitedThisSession = false;

/** 仅用于测试。 */
export function resetRepoTreeAuthState(): void {
  rateLimitedThisSession = false;
}

interface BranchFetchResult {
  tree: RepoTree | null;
  rateLimited: boolean;
  authRetryable: boolean;
}

async function fetchTreeBranch(ownerRepo: string, branch: string, token: string | null): Promise<BranchFetchResult> {
  try {
    const url = `https://api.github.com/repos/${ownerRepo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'skill-master',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (response.ok) {
      const data = (await response.json()) as { sha: string; tree: TreeEntry[] };
      return { tree: { sha: data.sha, branch, tree: data.tree }, rateLimited: false, authRetryable: false };
    }

    const rateLimited = response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
    const authRetryable = response.status === 401 || response.status === 404;
    return { tree: null, rateLimited, authRetryable };
  } catch {
    return { tree: null, rateLimited: false, authRetryable: false };
  }
}

async function fetchTreeWithToken(ownerRepo: string, branches: string[], getToken: () => string | null): Promise<RepoTree | null> {
  const token = getToken();
  if (!token) return null;
  for (const branch of branches) {
    const result = await fetchTreeBranch(ownerRepo, branch, token);
    if (result.tree) return result.tree;
  }
  return null;
}

/**
 * 拉取仓库递归树。分支回退顺序：ref → HEAD → main → master。
 * 匿名优先；限流（403 + remaining:0）或私库（401/404）才用 token 重试。
 */
export async function fetchRepoTree(
  ownerRepo: string,
  ref?: string,
  getToken?: () => string | null,
): Promise<RepoTree | null> {
  const branches = ref ? [ref] : ['HEAD', 'main', 'master'];

  if (rateLimitedThisSession && getToken) {
    return fetchTreeWithToken(ownerRepo, branches, getToken);
  }

  let rateLimited = false;
  let authRetryable = false;
  for (const branch of branches) {
    const result = await fetchTreeBranch(ownerRepo, branch, null);
    if (result.tree) return result.tree;
    if (result.rateLimited) { rateLimited = true; break; }
    if (result.authRetryable) { authRetryable = true; break; }
  }

  if (!getToken || !(rateLimited || authRetryable)) return null;
  if (rateLimited) rateLimitedThisSession = true;
  return fetchTreeWithToken(ownerRepo, branches, getToken);
}

// ─── SKILL.md 路径发现 ───

const PRIORITY_PREFIXES = [
  '',
  'skills/',
  '.agents/skills/',
  '.claude/skills/',
  '.codex/skills/',
  '.cursor/skills/',
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__']);

/** 在 repo 树中定位 SKILL.md 路径，套用与磁盘发现一致的优先级目录逻辑。 */
export function findSkillMdPaths(tree: RepoTree, subpath?: string): string[] {
  const allSkillMds = tree.tree
    .filter(e => e.type === 'blob' && e.path.toLowerCase().endsWith('skill.md'))
    .map(e => e.path);

  const prefix = subpath ? (subpath.endsWith('/') ? subpath : subpath + '/') : '';
  const filtered = prefix
    ? allSkillMds.filter(p => p.startsWith(prefix) || p === prefix + 'SKILL.md')
    : allSkillMds;
  if (filtered.length === 0) return [];

  const priorityResults: string[] = [];
  const seen = new Set<string>();
  const lowerSet = new Set(filtered.map(p => p.toLowerCase()));

  for (const priorityPrefix of PRIORITY_PREFIXES) {
    const fullPrefix = prefix + priorityPrefix;
    const isContainer = priorityPrefix !== '';
    for (const skillMd of filtered) {
      if (!skillMd.startsWith(fullPrefix)) continue;
      const rest = skillMd.slice(fullPrefix.length);
      if (rest.toLowerCase() === 'skill.md') {
        if (!seen.has(skillMd)) { priorityResults.push(skillMd); seen.add(skillMd); }
        continue;
      }
      const parts = rest.split('/');
      if (parts.length === 2 && parts[1]!.toLowerCase() === 'skill.md') {
        if (!seen.has(skillMd)) { priorityResults.push(skillMd); seen.add(skillMd); }
        continue;
      }
      if (
        isContainer && parts.length === 3 && parts[2]!.toLowerCase() === 'skill.md' &&
        !SKIP_DIRS.has(parts[0]!) && !SKIP_DIRS.has(parts[1]!)
      ) {
        const parent = `${fullPrefix}${parts[0]}/SKILL.md`.toLowerCase();
        if (!lowerSet.has(parent) && !seen.has(skillMd)) {
          priorityResults.push(skillMd); seen.add(skillMd);
        }
      }
    }
  }

  if (priorityResults.length > 0) return priorityResults;
  return filtered.filter(p => p.split('/').length <= 6);
}

// ─── 内容拉取 ───

async function fetchSkillMdContent(ownerRepo: string, branch: string, skillMdPath: string): Promise<string | null> {
  try {
    const url = `https://raw.githubusercontent.com/${ownerRepo}/${branch}/${skillMdPath}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchSkillDownload(ownerRepo: string, slug: string): Promise<SkillDownloadResponse | null> {
  try {
    const [owner, repo] = ownerRepo.toLowerCase().split('/');
    const url = `${DOWNLOAD_BASE_URL}/api/download/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/${encodeURIComponent(slug)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!response.ok) return null;
    return (await response.json()) as SkillDownloadResponse;
  } catch {
    return null;
  }
}

/** 从 SKILL.md 原文提取 frontmatter name（不依赖完整解析器，blob 场景足够）。 */
function extractSkillName(content: string): string | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const nameMatch = m[1]!.match(/^name:\s*(.+)$/m);
  return nameMatch ? nameMatch[1]!.trim().replace(/^['"]|['"]$/g, '') : null;
}

// ─── 主入口：物化到临时目录 ───

/**
 * 在 base 内安全拼接相对路径。
 * 拒绝绝对路径、反斜杠、. / .. 段，并确认规范化结果仍在 base 内；非法返回 null。
 */
function safeJoinWithin(base: string, relPath: string): string | null {
  if (!relPath || relPath.includes('\0')) return null;
  if (relPath.startsWith('/') || relPath.startsWith('\\')) return null;
  if (/^[A-Za-z]:/.test(relPath)) return null;
  if (relPath.includes('\\')) return null;
  const parts = relPath.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some(p => p === '.' || p === '..')) return null;
  const resolvedBase = resolve(base);
  const dest = resolve(resolvedBase, parts.join('/'));
  if (dest !== resolvedBase && !dest.startsWith(resolvedBase + sep)) return null;
  return dest;
}

export interface BlobMaterializeOptions {
  subpath?: string;
  skillFilter?: string;
  ref?: string;
  getToken?: () => string | null;
}

/**
 * 尝试 blob 快路径：成功则把 skill 文件物化到临时目录并返回路径，
 * 失败返回 null（调用方回退 git clone）。任一文件下载失败即整体回退。
 */
export async function tryBlobMaterialize(
  ownerRepo: string,
  options: BlobMaterializeOptions = {},
): Promise<{ tempDir: string } | null> {
  if (!isBlobAllowed(ownerRepo)) return null;

  const tree = await fetchRepoTree(ownerRepo, options.ref, options.getToken);
  if (!tree) return null;

  let skillMdPaths = findSkillMdPaths(tree, options.subpath);
  if (skillMdPaths.length === 0) return null;

  // skillFilter 先按目录名缩小范围
  if (options.skillFilter) {
    const filterSlug = toSkillSlug(options.skillFilter);
    const byFolder = skillMdPaths.filter(p => {
      const parts = p.split('/');
      return parts.length >= 2 && toSkillSlug(parts[parts.length - 2]!) === filterSlug;
    });
    if (byFolder.length > 0) skillMdPaths = byFolder;
  }

  // 拉取各 SKILL.md 原文以获取 name（slug 需与服务端一致）
  const mdFetches = await Promise.all(
    skillMdPaths.map(async mdPath => ({ mdPath, content: await fetchSkillMdContent(ownerRepo, tree.branch, mdPath) })),
  );

  const named = mdFetches
    .map(({ mdPath, content }) => ({ mdPath, content, name: content ? extractSkillName(content) : null }))
    .filter((x): x is { mdPath: string; content: string; name: string } => Boolean(x.content && x.name));
  if (named.length === 0) return null;

  // skillFilter 再按 frontmatter name 精确匹配
  let targets = named;
  if (options.skillFilter) {
    const filterSlug = toSkillSlug(options.skillFilter);
    const byName = named.filter(s => toSkillSlug(s.name) === filterSlug);
    if (byName.length > 0) targets = byName;
    else if (skillMdPaths.length === named.length) return null; // 无匹配则回退 clone 做模糊匹配
  }

  // 当用户指定了显式 ref 时，blob 下载无法保证对应版本，回退 clone
  if (options.ref) return null;

  // 并行拉取完整快照，任一失败整体回退
  const downloads = await Promise.all(
    targets.map(async s => ({ skill: s, download: await fetchSkillDownload(ownerRepo, toSkillSlug(s.name)) })),
  );
  if (downloads.some(d => d.download === null)) return null;

  // 物化到临时目录；root skill 只保留 SKILL.md，避免污染 canonical path
  const tempDir = createTempDir();
  try {
    for (const { skill, download } of downloads) {
      const mdLower = skill.mdPath.toLowerCase();
      const folderPath = mdLower.endsWith('/skill.md')
        ? skill.mdPath.slice(0, -9)
        : mdLower === 'skill.md'
          ? ''
          : skill.mdPath.slice(0, -(1 + 'SKILL.md'.length));
      const isRoot = folderPath === '';

      const files = isRoot
        ? download!.files.filter(f => f.path.toLowerCase() === 'skill.md')
        : download!.files;

      // 统一放到 tempDir/<file.path>/ 下，保持与 clone 后磁盘布局一致。
      // file.path 来自网络响应，必须校验防路径穿越（../ 逃逸 tempDir）。
      for (const file of files) {
        const dest = safeJoinWithin(tempDir, file.path);
        if (!dest) {
          logger.warn(`blob snapshot 包含非法路径，跳过: ${file.path}`);
          continue;
        }
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, file.contents, 'utf-8');
      }
    }
  } catch (err) {
    logger.debug(`blob materialize failed: ${(err as Error).message}`);
    return null;
  }

  logger.debug(`blob fast-path materialized ${downloads.length} skill(s) to ${tempDir}`);
  return { tempDir };
}
