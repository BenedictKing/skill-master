import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('doctor command', () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(tmpdir(), `skill-master-doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testHome, { recursive: true });
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it('runs diagnostics against an empty home', () => {
    const result = runCli(['doctor'], testHome, { HOME: testHome });
    const output = result.stdout + result.stderr;

    expect(output).toContain('Running diagnostics...');
    expect(output).toContain('Checking directory structure...');
    expect(output).toContain('Found 3 issue(s)');
    expect(result.exitCode).toBe(0);
  }, 15000);

  it('reports orphaned dangling links and removes them with --fix', () => {
    mkdirSync(join(testHome, '.claude', 'skills'), { recursive: true });
    const danglingLink = join(testHome, '.claude', 'skills', 'gone-skill');
    symlinkSync(join(testHome, '.agents', 'skills', 'gone-skill'), danglingLink);

    const report = runCli(['doctor'], testHome, { HOME: testHome });
    const output = report.stdout + report.stderr;
    expect(report.exitCode).toBe(0);
    expect(output).toContain('Checking for orphaned skill links...');
    expect(output).toContain('gone-skill');
    expect(output).toContain('dangling');

    const fix = runCli(['doctor', '--fix', '--yes'], testHome, { HOME: testHome });
    expect(fix.exitCode).toBe(0);
    expect(existsSync(danglingLink)).toBe(false);
  }, 15000);
});
