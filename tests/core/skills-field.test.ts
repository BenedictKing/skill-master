import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const {
  parseSkillsFieldField,
  findSkillDirInPackage,
  listWorkspaceDirs,
  resolveSkillsField,
} = await import('../../src/core/skills-field.js');

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = join(tmpdir(), `skill-master-skills-field-${randomBytes(6).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeSkill(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n# ${name}\n`);
}

function writePkgJson(dir: string, content: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content));
}

describe('parseSkillsFieldField', () => {
  it('returns empty map for undefined/null', () => {
    expect(parseSkillsFieldField(undefined).size).toBe(0);
    expect(parseSkillsFieldField(null).size).toBe(0);
  });

  it('parses name → spec pairs', () => {
    const map = parseSkillsFieldField({ a: 'npm:pkg-a', b: 'owner/repo' });
    expect(map.get('a')).toBe('npm:pkg-a');
    expect(map.get('b')).toBe('owner/repo');
  });

  it('rejects non-object and non-string values', () => {
    expect(() => parseSkillsFieldField(['npm:x'])).toThrow(/must be an object/);
    expect(() => parseSkillsFieldField({ a: 42 })).toThrow(/must be a non-empty string/);
  });
});

describe('findSkillDirInPackage', () => {
  it('finds the root SKILL.md', () => {
    const pkg = makeTempDir();
    writeSkill(pkg, 'root-skill');
    expect(findSkillDirInPackage(pkg)).toBe(pkg);
  });

  it('finds skills under skills/ and dist/skills/', () => {
    const pkg = makeTempDir();
    writeSkill(join(pkg, 'skills', 'alpha'), 'alpha');
    writeSkill(join(pkg, 'dist', 'skills', 'beta'), 'beta');

    expect(findSkillDirInPackage(pkg, 'alpha')).toBe(join(pkg, 'skills', 'alpha'));
    expect(findSkillDirInPackage(pkg, 'beta')).toBe(join(pkg, 'dist', 'skills', 'beta'));
  });

  it('returns the single candidate when no name given', () => {
    const pkg = makeTempDir();
    writeSkill(join(pkg, 'skills', 'only'), 'only');
    expect(findSkillDirInPackage(pkg)).toBe(join(pkg, 'skills', 'only'));
  });

  it('returns null for ambiguous multi-skill packages without a name', () => {
    const pkg = makeTempDir();
    writeSkill(join(pkg, 'skills', 'one'), 'one');
    writeSkill(join(pkg, 'skills', 'two'), 'two');
    expect(findSkillDirInPackage(pkg)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(findSkillDirInPackage(makeTempDir())).toBeNull();
  });
});

describe('resolveSkillsField', () => {
  it('resolves npm: entries against node_modules', () => {
    const root = makeTempDir();
    writeSkill(join(root, 'node_modules', 'my-pkg'), 'my-skill');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ skills: { 'my-skill': 'npm:my-pkg' } }));

    const result = resolveSkillsField(root, false);
    expect(result.errors).toHaveLength(0);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].localDir).toBe(join(root, 'node_modules', 'my-pkg'));
    expect(result.entries[0].lockSource).toBe('npm:my-pkg');
  });

  it('selects a sub-skill by declared name for multi-skill packages', () => {
    const root = makeTempDir();
    writeSkill(join(root, 'node_modules', 'multi', 'skills', 'one'), 'one');
    writeSkill(join(root, 'node_modules', 'multi', 'skills', 'two'), 'two');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ skills: { two: 'npm:multi' } }));

    const result = resolveSkillsField(root, false);
    expect(result.errors).toHaveLength(0);
    expect(result.entries[0].localDir).toBe(join(root, 'node_modules', 'multi', 'skills', 'two'));
  });

  it('reports an error for uninstalled packages', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ skills: { x: 'npm:not-installed' } }));

    const result = resolveSkillsField(root, false);
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/not installed/);
  });

  it('parses git entries with and without #ref pins', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      skills: { a: 'owner/repo', b: 'owner/repo#v1.2.0' },
    }));

    const result = resolveSkillsField(root, false);
    expect(result.errors).toHaveLength(0);
    const byName = new Map(result.entries.map((e) => [e.declaredName, e]));
    expect(byName.get('a')?.source).toEqual({ type: 'git', url: 'https://github.com/owner/repo.git', branch: undefined });
    expect(byName.get('b')?.source).toEqual({ type: 'git', url: 'https://github.com/owner/repo.git', branch: 'v1.2.0' });
    expect(byName.get('b')?.lockSource).toBe('owner/repo#v1.2.0');
  });

  it('reports invalid sources as errors', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ skills: { bad: 'not a source at all!' } }));

    const result = resolveSkillsField(root, false);
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/cannot parse git source/);
  });
});

describe('listWorkspaceDirs', () => {
  it('resolves workspace globs to package directories', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
    writeSkill(join(root, 'packages', 'one'), 'ws-one');
    writePkgJson(join(root, 'packages', 'one'), {});
    mkdirSync(join(root, 'packages', 'not-a-package'), { recursive: true }); // no package.json → excluded
    mkdirSync(join(root, 'packages', 'one', 'nested'), { recursive: true }); // deeper than the glob

    const dirs = listWorkspaceDirs(root);
    expect(dirs).toEqual([join(root, 'packages', 'one')]);
  });

  it('supports ** globs', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/**'] }));
    writePkgJson(join(root, 'packages', 'a'), {});
    writePkgJson(join(root, 'packages', 'b'), {});
    writePkgJson(join(root, 'packages', 'b', 'sub'), {});

    const dirs = listWorkspaceDirs(root).sort();
    expect(dirs).toEqual([
      join(root, 'packages', 'a'),
      join(root, 'packages', 'b'),
      join(root, 'packages', 'b', 'sub'),
    ]);
  });

  it('reads workspaces.packages form', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: { packages: ['apps/*'] } }));
    writePkgJson(join(root, 'apps', 'x'), {});

    expect(listWorkspaceDirs(root)).toEqual([join(root, 'apps', 'x')]);
  });
});

describe('resolveSkillsField recursive', () => {
  it('unions the root and workspace skills fields', () => {
    const root = makeTempDir();
    writeSkill(join(root, 'node_modules', 'pkg-root'), 'root-skill');
    writeSkill(join(root, 'node_modules', 'pkg-ws'), 'ws-skill');
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
      skills: { 'root-skill': 'npm:pkg-root' },
    }));
    writePkgJson(join(root, 'packages', 'app'), {
      skills: { 'ws-skill': 'npm:pkg-ws' },
    });

    const result = resolveSkillsField(root, true);
    expect(result.errors).toHaveLength(0);
    const names = result.entries.map((e) => e.declaredName).sort();
    expect(names).toEqual(['root-skill', 'ws-skill']);
  });
});
