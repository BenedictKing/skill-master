import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

function writeSkill(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n`);
}

describe('sync command', () => {
  it('shows help and usage', () => {
    const result = runCli(['sync', '--help']);

    expect(result.stdout).toContain('Usage: skill-master sync [options]');
    expect(result.stdout).toContain('Sync skills from node_modules and the package.json "skills" field');
    expect(result.exitCode).toBe(0);
  }, 15000);

  it('syncs node_modules skills at the git root from nested directories', () => {
    const testDir = join(tmpdir(), `skill-master-sync-test-${Date.now()}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');
    const nestedDir = join(projectDir, 'packages', 'app');
    const skillDir = join(projectDir, 'node_modules', 'sync-skill');

    mkdirSync(join(projectDir, '.git'), { recursive: true });
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(nestedDir, { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: sync-skill\ndescription: sync target\nallowed-tools:\n  - Read\n---\n# sync-skill\n`,
      'utf-8',
    );

    try {
      const result = runCli(['sync', '--yes'], nestedDir, { HOME: testHome });

      expect(result.exitCode).toBe(0);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'sync-skill'))).toBe(true);
      expect(existsSync(join(nestedDir, '.claude', 'skills', 'sync-skill'))).toBe(false);
      expect(existsSync(join(projectDir, 'skills-lock.json'))).toBe(true);
      expect(existsSync(join(nestedDir, 'skills-lock.json'))).toBe(false);

      const lock = JSON.parse(readFileSync(join(projectDir, 'skills-lock.json'), 'utf-8'));
      expect(lock.skills['sync-skill'].source).toBe('./node_modules/sync-skill');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 30000);

  it('installs skills declared in the package.json skills field and prunes them when the package disappears', () => {
    const testDir = join(tmpdir(), `skill-master-sync-field-${Date.now()}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');
    const pkgDir = join(projectDir, 'node_modules', 'field-pkg');

    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeSkill(pkgDir, 'field-skill');
    writeFileSync(
      join(projectDir, 'package.json'),
      JSON.stringify({ name: 'proj', skills: { 'field-skill': 'npm:field-pkg' } }),
    );

    try {
      const first = runCli(['sync', '--yes'], projectDir, { HOME: testHome });
      expect(first.exitCode).toBe(0);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'field-skill'))).toBe(true);

      let lock = JSON.parse(readFileSync(join(projectDir, 'skills-lock.json'), 'utf-8'));
      expect(lock.skills['field-skill'].source).toBe('npm:field-pkg');
      expect(lock.skills['field-skill'].sourceType).toBe('node_modules');
      expect(lock.skills['field-skill'].skillsField).toBe(true);

      // Second run: nothing to do
      const second = runCli(['sync', '--yes'], projectDir, { HOME: testHome });
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toContain('up to date');

      // Remove the package → skill is pruned on the next sync
      rmSync(pkgDir, { recursive: true, force: true });
      const third = runCli(['sync', '--yes'], projectDir, { HOME: testHome });
      expect(third.exitCode).toBe(0);
      expect(third.stdout).toContain('removed');
      expect(existsSync(join(projectDir, '.claude', 'skills', 'field-skill'))).toBe(false);

      lock = JSON.parse(readFileSync(join(projectDir, 'skills-lock.json'), 'utf-8'));
      expect(lock.skills['field-skill']).toBeUndefined();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 45000);

  it('discovers multi-skill packages under skills/ and dist/skills/', () => {
    const testDir = join(tmpdir(), `skill-master-sync-multi-${Date.now()}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');

    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeSkill(join(projectDir, 'node_modules', 'multi-pkg', 'skills', 'alpha'), 'alpha');
    writeSkill(join(projectDir, 'node_modules', 'multi-pkg', 'dist', 'skills', 'beta'), 'beta');

    try {
      const result = runCli(['sync', '--yes'], projectDir, { HOME: testHome });
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'alpha'))).toBe(true);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'beta'))).toBe(true);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 30000);

  it('honors --include and --exclude filters', () => {
    const testDir = join(tmpdir(), `skill-master-sync-filter-${Date.now()}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');

    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeSkill(join(projectDir, 'node_modules', 'pkg-a'), 'skill-a');
    writeSkill(join(projectDir, 'node_modules', 'pkg-b'), 'skill-b');

    try {
      const result = runCli(['sync', '--yes', '--include', 'skill-a'], projectDir, { HOME: testHome });
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'skill-a'))).toBe(true);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'skill-b'))).toBe(false);

      const excluded = runCli(['sync', '--yes', '--exclude', 'skill-a', '--force'], projectDir, { HOME: testHome });
      expect(excluded.exitCode).toBe(0);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'skill-b'))).toBe(true);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 45000);

  it('warns about skills field entries whose package is not installed', () => {
    const testDir = join(tmpdir(), `skill-master-sync-missing-${Date.now()}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');

    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeFileSync(
      join(projectDir, 'package.json'),
      JSON.stringify({ name: 'proj', skills: { ghost: 'npm:not-installed' } }),
    );

    try {
      const result = runCli(['sync', '--yes'], projectDir, { HOME: testHome });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/not installed/);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 30000);
});
