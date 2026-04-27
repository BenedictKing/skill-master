import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('sync command', () => {
  it('shows help and usage', () => {
    const result = runCli(['sync', '--help']);

    expect(result.stdout).toContain('Usage: skill-master sync [options]');
    expect(result.stdout).toContain('Discover and sync skills from node_modules.');
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
});
