import { describe, it, expect, vi, afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const tempDirs: string[] = [];
let savedPath: string | undefined;

vi.mock('../../src/utils/fs-helpers.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/fs-helpers.js')>(
    '../../src/utils/fs-helpers.js',
  );
  return {
    ...actual,
    createTempDir() {
      const dir = join(tmpdir(), `skill-master-test-${randomBytes(8).toString('hex')}`);
      mkdirSync(dir, { recursive: true });
      tempDirs.push(dir);
      return dir;
    },
  };
});

const {
  parseSource,
  parseGitIdentity,
  isSameGitRepo,
  getLockSource,
  cloneRepo,
} = await import('../../src/core/git-source.js');

function buildTar(entries: Array<{ path: string; content: string }>): Uint8Array {
  const blocks: Buffer[] = [];
  for (const { path, content } of entries) {
    const data = Buffer.from(content, 'utf-8');
    const header = Buffer.alloc(512, 0);
    header.write(path, 0, Math.min(path.length, 100), 'utf-8');
    header.write('0000644\0', 100, 8);
    header.write('0000000\0', 108, 8);
    header.write('0000000\0', 116, 8);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12);
    header.write('00000000000\0', 136, 12);
    header.write('        ', 148, 8);
    header.writeUInt8(0x30, 156);
    let sum = 0;
    for (const b of header) sum += b;
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    blocks.push(header, data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return new Uint8Array(Buffer.concat(blocks));
}

describe('parseSource', () => {
  it('parses SCP-style SSH URL as git', () => {
    expect(parseSource('git@github.com:owner/repo.git')).toEqual({
      type: 'git',
      url: 'git@github.com:owner/repo.git',
      skillFilter: undefined,
    });
  });

  it('parses ssh:// URL as git without mangling', () => {
    const parsed = parseSource('ssh://git@github.com/owner/repo.git');
    expect(parsed.type).toBe('git');
    expect(parsed.url).toBe('ssh://git@github.com/owner/repo.git');
  });

  it('parses git:// URL as git', () => {
    expect(parseSource('git://github.com/owner/repo.git').url).toBe('git://github.com/owner/repo.git');
  });

  it('parses owner/repo shorthand to https', () => {
    expect(parseSource('owner/repo').url).toBe('https://github.com/owner/repo.git');
  });
});

describe('parseGitIdentity', () => {
  it('normalizes SCP-style SSH', () => {
    expect(parseGitIdentity('git@github.com:owner/repo.git')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('normalizes ssh:// URL', () => {
    expect(parseGitIdentity('ssh://git@github.com/owner/repo.git')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('normalizes https URL', () => {
    expect(parseGitIdentity('https://github.com/owner/repo.git')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('normalizes shorthand to github.com host', () => {
    expect(parseGitIdentity('owner/repo')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('handles gitlab host', () => {
    expect(parseGitIdentity('https://gitlab.com/group/proj')).toEqual({
      host: 'gitlab.com',
      ownerRepo: 'group/proj',
    });
  });

  it('is case-insensitive for host and path', () => {
    expect(parseGitIdentity('https://GitHub.com/Owner/Repo')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('returns null for non-git strings', () => {
    expect(parseGitIdentity('not-a-repo')).toBeNull();
    expect(parseGitIdentity('')).toBeNull();
  });
});

describe('isSameGitRepo', () => {
  it('treats SSH and HTTPS as the same repo', () => {
    expect(isSameGitRepo('git@github.com:owner/repo.git', 'https://github.com/owner/repo.git')).toBe(true);
    expect(isSameGitRepo('ssh://git@github.com/owner/repo.git', 'https://github.com/owner/repo.git')).toBe(true);
  });

  it('treats shorthand and https as the same repo', () => {
    expect(isSameGitRepo('owner/repo', 'https://github.com/owner/repo.git')).toBe(true);
  });

  it('treats .git suffix as irrelevant', () => {
    expect(isSameGitRepo('https://github.com/owner/repo', 'https://github.com/owner/repo.git')).toBe(true);
  });

  it('returns false for different repos', () => {
    expect(isSameGitRepo('owner/repo', 'owner/other')).toBe(false);
    expect(isSameGitRepo('owner/repo', 'other/repo')).toBe(false);
  });

  it('returns false for different hosts', () => {
    expect(isSameGitRepo('https://github.com/o/r', 'https://gitlab.com/o/r')).toBe(false);
  });

  it('returns false when either side is unparseable', () => {
    expect(isSameGitRepo('garbage', 'https://github.com/o/r')).toBe(false);
  });
});

describe('getLockSource', () => {
  it('preserves SCP-style SSH URL', () => {
    expect(getLockSource('git@github.com:o/r.git', 'git@github.com:o/r.git')).toBe('git@github.com:o/r.git');
  });

  it('preserves ssh:// URL', () => {
    expect(getLockSource('ssh://git@github.com/o/r.git', 'ssh://git@github.com/o/r.git'))
      .toBe('ssh://git@github.com/o/r.git');
  });

  it('uses normalized shorthand for GitHub HTTPS', () => {
    expect(getLockSource('https://github.com/o/r.git', 'o/r')).toBe('o/r');
  });

  it('preserves non-GitHub HTTPS URL', () => {
    expect(getLockSource('https://gitlab.com/o/r.git', 'https://gitlab.com/o/r.git'))
      .toBe('https://gitlab.com/o/r.git');
    expect(getLockSource('https://git.example.com/o/r.git', 'https://git.example.com/o/r.git'))
      .toBe('https://git.example.com/o/r.git');
  });
});

describe('cloneRepo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (savedPath) {
      process.env.PATH = savedPath;
      savedPath = undefined;
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeFakeBin(): string {
    const dir = join(tmpdir(), `skill-master-fakebin-${randomBytes(4).toString('hex')}`);
    mkdirSync(dir, { recursive: true });
    tempDirs.push(dir);
    savedPath = process.env.PATH;
    process.env.PATH = `${dir}:${process.env.PATH}`;
    return dir;
  }

  it('materializes a GitHub tarball instead of git clone', async () => {
    const tgz = gzipSync(Buffer.from(buildTar([
      { path: 'repo-main/SKILL.md', content: '---\nname: demo\n---\n# demo\n' },
      { path: 'repo-main/scripts/run.sh', content: 'echo hi\n' },
    ])));

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe('https://codeload.github.com/owner/repo/tar.gz/HEAD');
      return new Response(tgz, { status: 200, headers: { 'content-type': 'application/gzip' } });
    }));

    const dir = await cloneRepo('https://github.com/owner/repo.git');
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toContain('name: demo');
    expect(existsSync(join(dir, 'scripts/run.sh'))).toBe(true);
    expect(existsSync(join(dir, '.skill-master-archive.tgz'))).toBe(false);
  });

  it('falls back to git clone when the GitHub archive times out, hinting the budget if git also times out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    }));
    vi.stubEnv('SKILL_MASTER_CLONE_TIMEOUT_MS', '1500');

    const fakeBin = makeFakeBin();
    writeFileSync(join(fakeBin, 'git'), '#!/bin/sh\nexec sleep 30\n', { mode: 0o755 });

    await expect(cloneRepo('owner/repo')).rejects.toThrow(
      /timed out after \d+s\..*SKILL_MASTER_CLONE_TIMEOUT_MS=\d+/s,
    );
  }, 20_000);

  it.skipIf(process.platform === 'win32')(
    'downloads the GitHub archive via curl when proxy env is set, so HTTP(S)_PROXY is honored',
    async () => {
      const tgz = gzipSync(Buffer.from(buildTar([
        { path: 'repo-main/SKILL.md', content: '---\nname: proxied\n---\n# proxied\n' },
      ])));

      const fakeBin = makeFakeBin();
      const logPath = join(fakeBin, 'curl-args.json');
      writeFileSync(
        join(fakeBin, 'curl'),
        [
          '#!/usr/bin/env node',
          'const fs = require("node:fs");',
          'const args = process.argv.slice(2);',
          `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(args));`,
          'const out = args[args.indexOf("-o") + 1];',
          'fs.writeFileSync(out, Buffer.from(process.env.FAKE_CURL_TGZ, "base64"));',
        ].join('\n'),
        { mode: 0o755 },
      );

      vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:7890');
      vi.stubEnv('FAKE_CURL_TGZ', tgz.toString('base64'));
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('built-in fetch must not be used when curl download succeeds');
      }));

      const dir = await cloneRepo('https://github.com/owner/repo.git');
      expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toContain('name: proxied');
      expect(existsSync(join(dir, '.skill-master-archive.tgz'))).toBe(false);

      const curlArgs: string[] = JSON.parse(readFileSync(logPath, 'utf-8'));
      expect(curlArgs[curlArgs.length - 1]).toBe('https://codeload.github.com/owner/repo/tar.gz/HEAD');
      expect(curlArgs).toContain('-o');
    },
  );
});
