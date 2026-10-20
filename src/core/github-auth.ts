import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/**
 * GitHub API 认证阶梯（对标 vercel-labs/skills PR #1857）：
 * 匿名 → 显式环境变量 token（GITHUB_TOKEN/GH_TOKEN）→ `gh api` 子进程。
 *
 * Node 进程只接触用户显式导出的环境变量 token；gh CLI 存储的凭证永远
 * 留在 gh 子进程内部（execFile、无 shell），不会进入 Node 内存。
 * 可用 SKILL_MASTER_GH_API=0 关闭 gh 子进程档（测试/受限环境）。
 */

/** 用户显式导出的 token —— 唯一允许进入 Node 内存的凭证 */
export function getExplicitGhToken(): string | null {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return token && token.trim() ? token.trim() : null;
}

/** 进程内记忆：匿名请求遇到 401/404/限流后，本次进程内直接跳过匿名档 */
let anonymousBlocked = false;

/** 仅用于测试。 */
export function resetGithubAuthState(): void {
  anonymousBlocked = false;
}

function isGhRungEnabled(): boolean {
  return process.env.SKILL_MASTER_GH_API !== '0';
}

export interface GhApiResult<T> {
  status: number;
  data: T | null;
}

/** `gh api` 子进程档：execFile 无 shell，凭证由 gh 自行注入；SKILL_MASTER_GH_API=0 时完全禁用 */
export async function ghApiJson<T>(endpoint: string, timeoutMs = 15_000): Promise<GhApiResult<T> | null> {
  if (!isGhRungEnabled()) return null;
  try {
    const { stdout } = await execFileAsync('gh', ['api', endpoint], {
      timeout: timeoutMs,
      env: { ...process.env, GH_PAGER: 'cat', NO_COLOR: '1' },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { status: 200, data: JSON.parse(stdout) as T };
  } catch (err) {
    const e = err as { code?: string | number };
    if (e.code === 'ENOENT') {
      logger.debug('gh CLI not found; skipping gh api auth rung');
      return null;
    }
    // gh 退出码即 HTTP 状态（gh api 对 HTTP 错误返回对应 exit code）
    const status = typeof e.code === 'number' ? e.code : 0;
    return { status, data: null };
  }
}

/**
 * GET 一个 api.github.com JSON 端点，套用完整认证阶梯。
 * 返回 null 表示所有档位均不可用（调用方回退，例如认证 git clone）。
 */
export async function githubApiGet<T>(
  url: string,
  timeoutMs = 15_000,
): Promise<GhApiResult<T> | null> {
  // 档位 1：匿名
  if (!anonymousBlocked) {
    const res = await apiFetch<T>(url, null, timeoutMs);
    if (res) {
      if (res.status === 200) return res;
      if (res.status === 401 || res.status === 404 || res.status === 403) {
        anonymousBlocked = true;
      }
    }
  }

  // 档位 2：显式环境变量 token
  const token = getExplicitGhToken();
  if (token) {
    const res = await apiFetch<T>(url, token, timeoutMs);
    if (res && res.status === 200) return res;
  }

  // 档位 3：gh api 子进程（仅对 api.github.com URL）
  const endpoint = url.replace(/^https:\/\/api\.github\.com\//, '');
  if (endpoint !== url) {
    return ghApiJson<T>(endpoint, timeoutMs);
  }

  return null;
}

/** 进程内是否已拉黑匿名档（仅测试断言用） */
export function isAnonymousBlocked(): boolean {
  return anonymousBlocked;
}

async function apiFetch<T>(url: string, token: string | null, timeoutMs: number): Promise<GhApiResult<T> | null> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'skill-master',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (response.ok) {
      return { status: response.status, data: (await response.json()) as T };
    }
    return { status: response.status, data: null };
  } catch (err) {
    logger.debug(`GitHub API fetch failed: ${(err as Error).message}`);
    return null;
  }
}
