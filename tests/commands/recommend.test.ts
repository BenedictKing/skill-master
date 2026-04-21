import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('recommend command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-recommend-test-${Date.now()}`);
    mkdirSync(join(testDir, '.claude', 'skills', 'doc-helper'), { recursive: true });
    writeFileSync(
      join(testDir, '.claude', 'skills', 'doc-helper', 'SKILL.md'),
      `---\nname: doc-helper\ndescription: search web docs and summarize latest information\nallowed-tools:\n  - WebSearch\n  - Read\n---\n# doc-helper\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('shows usage when task is missing', () => {
    const result = runCli(['recommend']);
    expect(result.stdout).toContain('Usage: skill-master recommend');
    expect(result.exitCode).toBe(0);
  }, 15000);

  it('returns task-aware recommendations from local candidates', () => {
    const result = runCli(['recommend', 'search web docs'], testDir);
    const output = result.stdout + result.stderr;
    expect(result.exitCode).toBe(0);
    expect(output).toContain('Task:');
    expect(output).toContain('doc-helper');
    expect(output).toContain('Matched Capabilities');
  }, 30000);

  it('shows enabled preferences in output', () => {
    const result = runCli(['recommend', 'search web docs', '--safe', '--local-first', '--prefer-installed'], testDir);
    const output = result.stdout + result.stderr;
    expect(result.exitCode).toBe(0);
    expect(output).toContain('Preferences');
    expect(output).toContain('safe');
    expect(output).toContain('local-first');
    expect(output).toContain('prefer-installed');
  }, 30000);

  it('outputs JSON when requested', () => {
    const result = runCli(['recommend', 'search web docs', '--json'], testDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.task.normalized).toBe('search web docs');
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    expect(parsed.recommendations[0].candidate.name).toBe('doc-helper');
  }, 30000);

  it('can install the best recommendation from local candidates', () => {
    const result = runCli(['recommend', 'search web docs', '--install'], testDir);
    const output = result.stdout + result.stderr;
    expect(result.exitCode).toBe(0);
    expect(output).toContain('Installed recommended skill');
    expect(existsSync(join(testDir, 'skills-lock.json'))).toBe(true);
  }, 30000);
});
