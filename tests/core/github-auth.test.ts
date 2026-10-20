import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const {
  getExplicitGhToken,
  githubApiGet,
  ghApiJson,
  resetGithubAuthState,
  isAnonymousBlocked,
} = await import('../../src/core/github-auth.js');

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('getExplicitGhToken', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads GITHUB_TOKEN then GH_TOKEN', () => {
    vi.stubEnv('GITHUB_TOKEN', ' tok-a ');
    expect(getExplicitGhToken()).toBe('tok-a');
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GH_TOKEN', 'tok-b');
    expect(getExplicitGhToken()).toBe('tok-b');
  });

  it('returns null when unset or blank', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GH_TOKEN', '  ');
    expect(getExplicitGhToken()).toBeNull();
  });
});

describe('githubApiGet auth ladder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetGithubAuthState();
  });

  it('returns anonymous JSON on success without auth headers', async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await githubApiGet<{ ok: boolean }>('https://api.github.com/some/endpoint');
    expect(res?.status).toBe(200);
    expect(res?.data).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('escalates to the explicit env token after 401', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'tok-1');
    const seenAuth: Array<string | undefined> = [];
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      call++;
      seenAuth.push((init?.headers as Record<string, string>)?.Authorization);
      return call === 1 ? jsonResponse({}, 401) : jsonResponse({ ok: true });
    }));

    const res = await githubApiGet<{ ok: boolean }>('https://api.github.com/some/endpoint');
    expect(res?.data).toEqual({ ok: true });
    expect(seenAuth).toEqual([undefined, 'Bearer tok-1']);
  });

  it('remembers anonymous 401/404 within the process and skips the anonymous rung afterwards', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'tok-1');
    const auths: Array<string | undefined> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      auths.push((init?.headers as Record<string, string>)?.Authorization);
      if (auths.length === 1) return jsonResponse({}, 404); // anonymous: private-or-missing
      return jsonResponse({ ok: true }); // token rung succeeds
    }));

    const first = await githubApiGet<{ ok: boolean }>('https://api.github.com/a');
    expect(first?.data).toEqual({ ok: true });
    expect(auths).toEqual([undefined, 'Bearer tok-1']);
    expect(isAnonymousBlocked()).toBe(true);

    const authsSecondRound: Array<string | undefined> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      authsSecondRound.push((init?.headers as Record<string, string>)?.Authorization);
      return jsonResponse({ ok: true });
    }));
    await githubApiGet('https://api.github.com/a');
    expect(authsSecondRound).toEqual(['Bearer tok-1']);
  });

  it('returns null when every rung is exhausted', async () => {
    vi.stubEnv('SKILL_MASTER_GH_API', '0');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 404)));
    const res = await githubApiGet('https://api.github.com/missing');
    expect(res).toBeNull();
  });

  it('does not run the gh rung for non-api.github.com URLs', async () => {
    vi.stubEnv('SKILL_MASTER_GH_API', '1');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)));
    const res = await githubApiGet('https://example.com/data');
    expect(res).toBeNull();
  });
});

describe('ghApiJson subprocess rung', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    if (savedPath) {
      process.env.PATH = savedPath;
      savedPath = undefined;
    }
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  let savedPath: string | undefined;
  const tempDirs: string[] = [];

  it.skipIf(process.platform === 'win32')(
    'invokes gh api via execFile (no shell) and parses JSON stdout',
    async () => {
      const fakeBin = join(tmpdir(), `skill-master-ghauth-${randomBytes(4).toString('hex')}`);
      mkdirSync(fakeBin, { recursive: true });
      tempDirs.push(fakeBin);
      const logPath = join(fakeBin, 'gh-args.json');
      writeFileSync(
        join(fakeBin, 'gh'),
        [
          '#!/usr/bin/env node',
          'const fs = require("node:fs");',
          `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)));`,
          'process.stdout.write(JSON.stringify({ data: 42 }));',
        ].join('\n'),
        { mode: 0o755 },
      );
      savedPath = process.env.PATH;
      process.env.PATH = `${fakeBin}:${savedPath}`;

      const res = await ghApiJson<{ data: number }>('repos/o/r/git/trees/HEAD?recursive=1');
      expect(res?.data).toEqual({ data: 42 });
      const args: string[] = JSON.parse(readFileSync(logPath, 'utf-8'));
      expect(args).toEqual(['api', 'repos/o/r/git/trees/HEAD?recursive=1']);
    },
  );

  it('returns null when gh is disabled via SKILL_MASTER_GH_API=0', async () => {
    vi.stubEnv('SKILL_MASTER_GH_API', '0');
    // PATH still contains real gh; the flag must prevent the subprocess entirely
    expect(await ghApiJson('repos/o/r')).toBeNull();
  });
});
