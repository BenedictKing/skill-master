import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('solve command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-solve-test-${Date.now()}`);
    mkdirSync(join(testDir, '.claude', 'skills', 'solver-skill'), { recursive: true });
    writeFileSync(
      join(testDir, '.claude', 'skills', 'solver-skill', 'SKILL.md'),
      `---\nname: solver-skill\ndescription: search web docs and summarize latest information\nallowed-tools:\n  - WebSearch\n  - Read\n---\n# solver-skill\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('shows usage when task is missing', () => {
    const result = runCli(['solve']);
    expect(result.stdout).toContain('Usage: skill-master solve');
    expect(result.exitCode).toBe(0);
  }, 15000);

  it('outputs JSON orchestrator state when requested', () => {
    const result = runCli(['solve', 'search web docs', '--json'], testDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.task.normalized).toBe('search web docs');
    expect(parsed.steps.discovered).toBe(true);
    expect(parsed.steps.recommended).toBe(true);
    expect(parsed.summary.bestMatch).toBe('solver-skill');
  }, 30000);

  it('supports preference passthrough in JSON mode', () => {
    const result = runCli(['solve', 'search web docs', '--json', '--safe', '--local-first'], testDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.preferences.safe).toBe(true);
    expect(parsed.preferences.localFirst).toBe(true);
  }, 30000);

  it('can install and verify in one solve run', () => {
    const result = runCli(['solve', 'search web docs', '--install', '--verify', '--json'], testDir);
    expect(result.exitCode).toBe(0);
    const jsonStart = result.stdout.indexOf('{');
    const parsed = JSON.parse(result.stdout.slice(jsonStart));
    expect(parsed.steps.installed).toBe(true);
    expect(parsed.steps.verified).toBe(true);
    expect(parsed.installation.skillName).toBe('solver-skill');
    expect(existsSync(join(testDir, 'skills-lock.json'))).toBe(true);
  }, 30000);
});
