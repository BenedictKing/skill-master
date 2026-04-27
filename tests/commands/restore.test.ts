import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('restore command', () => {
  it('shows help and usage', () => {
    const result = runCli(['restore', '--help']);

    expect(result.stdout).toContain('Usage: skill-master restore [options]');
    expect(result.stdout).toContain('Restore skills from skills-lock.json.');
    expect(result.exitCode).toBe(0);
  }, 15000);

  it('restores from the git root lock file when run in a nested cwd', () => {
    const testDir = join(tmpdir(), `skill-master-restore-root-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');
    const nestedDir = join(projectDir, 'packages', 'app');

    try {
      mkdirSync(join(projectDir, '.git'), { recursive: true });
      mkdirSync(join(projectDir, '.claude'), { recursive: true });
      mkdirSync(join(projectDir, 'skill-src'), { recursive: true });
      mkdirSync(nestedDir, { recursive: true });
      mkdirSync(testHome, { recursive: true });
      writeFileSync(
        join(projectDir, 'skill-src', 'SKILL.md'),
        `---\nname: restore-root-skill\ndescription: restore root target\nallowed-tools:\n  - Read\n---\n# restore-root-skill\n`,
        'utf-8',
      );
      writeFileSync(
        join(projectDir, 'skills-lock.json'),
        JSON.stringify({
          version: 1,
          skills: {
            'restore-root-skill': {
              source: 'skill-src',
              sourceType: 'local',
              computedHash: 'test-hash',
            },
          },
        }, null, 2),
        'utf-8',
      );

      const restoreResult = runCli(['restore'], nestedDir, { HOME: testHome });
      expect(restoreResult.exitCode).toBe(0);
      expect(restoreResult.stdout).toContain('Restoring 1 skill(s) from skills-lock.json');
      expect(existsSync(join(projectDir, '.claude', 'skills', 'restore-root-skill'))).toBe(true);
      expect(existsSync(join(nestedDir, '.claude', 'skills', 'restore-root-skill'))).toBe(false);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 30000);
});
