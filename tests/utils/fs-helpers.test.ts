import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, symlinkSync, writeFileSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const { symlinkOrCopy } = await import('../../src/utils/fs-helpers.js');

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = join(tmpdir(), `skill-master-fs-test-${randomBytes(6).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('symlinkOrCopy', () => {
  it('creates a symlink to the target', async () => {
    const base = makeTempDir();
    const target = join(base, 'store', 'skill');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'SKILL.md'), '---\nname: demo\n---\n');

    const linkParent = join(base, 'agent', 'skills');
    await symlinkOrCopy(target, join(linkParent, 'skill'));
    expect(lstatSync(join(linkParent, 'skill')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(linkParent, 'skill', 'SKILL.md'), 'utf-8')).toContain('name: demo');
  });

  it.skipIf(process.platform === 'win32')(
    'does not destroy content or self-link when linkPath resolves to the same physical dir as target',
    async () => {
      // ~/.agents/skills → ~/.mirasim/skills on some machines; linking the mirasim
      // agent path must not remove the canonical content it points at.
      const base = makeTempDir();
      const realStore = join(base, 'real-store', 'skills');
      const sharedLink = join(base, 'shared', 'skills');
      mkdirSync(realStore, { recursive: true });
      mkdirSync(join(base, 'shared'), { recursive: true });
      symlinkSync(realStore, sharedLink, 'dir');

      const canonical = join(sharedLink, 'anatomy');
      mkdirSync(canonical, { recursive: true });
      writeFileSync(join(canonical, 'SKILL.md'), '---\nname: anatomy\n---\n');

      const result = await symlinkOrCopy(canonical, join(realStore, 'anatomy'));

      expect(result).toBe('symlink');
      expect(lstatSync(join(realStore, 'anatomy')).isSymbolicLink()).toBe(false);
      expect(readFileSync(join(realStore, 'anatomy', 'SKILL.md'), 'utf-8')).toContain('name: anatomy');
    },
  );
});
