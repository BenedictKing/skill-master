import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  toSkillSlug,
  findSkillMdPaths,
  fetchRepoTree,
  tryBlobMaterialize,
  isBlobAllowed,
  resetRepoTreeAuthState,
  type RepoTree,
} from '../../src/core/blob-source.js';

function makeTree(paths: Array<{ path: string; type?: 'blob' | 'tree' }>): RepoTree {
  return {
    sha: 'rootsha',
    branch: 'main',
    tree: paths.map(p => ({ path: p.path, type: p.type ?? 'blob', sha: 'sha-' + p.path })),
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('toSkillSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(toSkillSlug('React Best Practices')).toBe('react-best-practices');
    expect(toSkillSlug('web_search')).toBe('web-search');
    expect(toSkillSlug('My--Skill!!')).toBe('my-skill');
  });
});

describe('isBlobAllowed', () => {
  const original = process.env.SKILL_MASTER_BLOB;
  afterEach(() => {
    if (original === undefined) delete process.env.SKILL_MASTER_BLOB;
    else process.env.SKILL_MASTER_BLOB = original;
  });

  it('allows whitelisted owners', () => {
    expect(isBlobAllowed('vercel-labs/agent-skills')).toBe(true);
    expect(isBlobAllowed('vercel/foo')).toBe(true);
  });

  it('rejects non-whitelisted owners', () => {
    expect(isBlobAllowed('someuser/repo')).toBe(false);
  });

  it('respects SKILL_MASTER_BLOB=0 global off switch', () => {
    process.env.SKILL_MASTER_BLOB = '0';
    expect(isBlobAllowed('vercel-labs/agent-skills')).toBe(false);
  });
});

describe('findSkillMdPaths', () => {
  it('finds SKILL.md in priority skills/ dir', () => {
    const tree = makeTree([
      { path: 'skills/react/SKILL.md' },
      { path: 'skills/vue/SKILL.md' },
    ]);
    expect(findSkillMdPaths(tree)).toEqual(['skills/react/SKILL.md', 'skills/vue/SKILL.md']);
  });

  it('finds root-level SKILL.md', () => {
    const tree = makeTree([{ path: 'SKILL.md' }]);
    expect(findSkillMdPaths(tree)).toEqual(['SKILL.md']);
  });

  it('prefers priority dirs over deep fallback', () => {
    const tree = makeTree([
      { path: 'skills/a/SKILL.md' },
      { path: 'deep/nested/dir/x/SKILL.md' },
    ]);
    const result = findSkillMdPaths(tree);
    expect(result).toContain('skills/a/SKILL.md');
  });

  it('filters by subpath', () => {
    const tree = makeTree([
      { path: 'skills/a/SKILL.md' },
      { path: 'other/b/SKILL.md' },
    ]);
    expect(findSkillMdPaths(tree, 'skills')).toEqual(['skills/a/SKILL.md']);
  });

  it('matches case-insensitively', () => {
    const tree = makeTree([{ path: 'skills/a/skill.md' }]);
    expect(findSkillMdPaths(tree)).toEqual(['skills/a/skill.md']);
  });
});

describe('fetchRepoTree', () => {
  beforeEach(() => resetRepoTreeAuthState());

  it('returns tree on anonymous success without calling getToken', async () => {
    const getToken = vi.fn(() => 'tok');
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ sha: 's', tree: [{ path: 'SKILL.md', type: 'blob', sha: 'x' }] })));
    const tree = await fetchRepoTree('o/r', undefined, getToken);
    expect(tree?.tree[0]?.path).toBe('SKILL.md');
    expect(getToken).not.toHaveBeenCalled();
  });

  it('retries with token on rate-limit 403', async () => {
    const getToken = vi.fn(() => 'tok');
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++;
      if (call <= 3) {
        return jsonResponse({}, 403, { 'x-ratelimit-remaining': '0' });
      }
      return jsonResponse({ sha: 's', tree: [{ path: 'a/SKILL.md', type: 'blob', sha: 'x' }] });
    }));
    const tree = await fetchRepoTree('o/r', undefined, getToken);
    expect(getToken).toHaveBeenCalled();
    expect(tree?.tree[0]?.path).toBe('a/SKILL.md');
  });

  it('returns null when no token available after rate-limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 403, { 'x-ratelimit-remaining': '0' })));
    const tree = await fetchRepoTree('o/r', undefined, () => null);
    expect(tree).toBeNull();
  });

  it('tries the given ref first when specified', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return jsonResponse({ sha: 's', tree: [] });
    }));
    await fetchRepoTree('o/r', 'mybranch');
    expect(urls[0]).toContain('mybranch');
  });
});

describe('tryBlobMaterialize', () => {
  let tempDir: string | undefined;
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
    vi.unstubAllGlobals();
  });

  it('returns null for non-whitelisted owner without fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await tryBlobMaterialize('random/repo');
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('materializes snapshot files to a temp dir', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) {
        return jsonResponse({ sha: 's', tree: [
          { path: 'skills/demo/SKILL.md', type: 'blob', sha: '812b23721dccfa653cbac2e5300bb63723b5b32f' },
          { path: 'skills/demo/helper.ts', type: 'blob', sha: '693da49fc40be722cea3b9f736d6b4ee4f879027' },
        ] });
      }
      if (url.includes('raw.githubusercontent.com')) {
        return new Response('---\nname: demo\ndescription: d\n---\n# demo', { status: 200 });
      }
      if (url.includes('/api/download/')) {
        return jsonResponse({
          files: [
            { path: 'skills/demo/SKILL.md', contents: '---\nname: demo\ndescription: d\n---\n# demo' },
            { path: 'skills/demo/helper.ts', contents: 'export {}' },
          ],
          hash: 'h',
        });
      }
      return jsonResponse({}, 404);
    }));

    const result = await tryBlobMaterialize('vercel-labs/agent-skills');
    expect(result).not.toBeNull();
    tempDir = result!.tempDir;
    expect(readFileSync(join(tempDir, 'skills/demo/SKILL.md'), 'utf-8')).toContain('name: demo');
    expect(existsSync(join(tempDir, 'skills/demo/helper.ts'))).toBe(true);
  });

  it('falls back to clone for root-level skills', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) {
        return jsonResponse({ sha: 's', tree: [{ path: 'SKILL.md', type: 'blob', sha: '47dcfb605b17781a8882a79ba576c54b94dc2521' }] });
      }
      if (url.includes('raw.githubusercontent.com')) {
        return new Response('---\nname: root\ndescription: d\n---\n# root', { status: 200 });
      }
      if (url.includes('/api/download/')) {
        return jsonResponse({
          files: [
            { path: 'SKILL.md', contents: '---\nname: root\ndescription: d\n---\n# root' },
            { path: 'README.md', contents: 'noise' },
            { path: 'src/index.ts', contents: 'noise' },
          ],
          hash: 'h',
        });
      }
      return jsonResponse({}, 404);
    }));

    const result = await tryBlobMaterialize('vercel-labs/agent-skills');
    // 根级技能回退 clone，无法区分支撑文件与仓库噪声
    expect(result).toBeNull();
  });

  it('returns null when any snapshot download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) {
        return jsonResponse({ sha: 's', tree: [{ path: 'skills/demo/SKILL.md', type: 'blob', sha: 'x' }] });
      }
      if (url.includes('raw.githubusercontent.com')) {
        return new Response('---\nname: demo\ndescription: d\n---\n# demo', { status: 200 });
      }
      return jsonResponse({}, 500); // download 失败
    }));
    const result = await tryBlobMaterialize('vercel-labs/agent-skills');
    expect(result).toBeNull();
  });

  it('rejects snapshot with files not in GitHub tree', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) {
        return jsonResponse({ sha: 's', tree: [{ path: 'skills/demo/SKILL.md', type: 'blob', sha: 'x' }] });
      }
      if (url.includes('raw.githubusercontent.com')) {
        return new Response('---\nname: demo\ndescription: d\n---\n# demo', { status: 200 });
      }
      if (url.includes('/api/download/')) {
        return jsonResponse({
          files: [
            { path: 'skills/demo/SKILL.md', contents: '---\nname: demo\ndescription: d\n---\n# demo' },
            { path: '../evil.txt', contents: 'pwned' },           // 路径穿越
            { path: 'skills/demo/../../escape.txt', contents: 'x' }, // 嵌套穿越
            { path: 'skills/demo/ok.ts', contents: 'export {}' },
          ],
          hash: 'h',
        });
      }
      return jsonResponse({}, 404);
    }));

    // 下载包含不在 GitHub tree 中的文件，整体拒绝
    const result = await tryBlobMaterialize('vercel-labs/agent-skills');
    expect(result).toBeNull();
  });
});
