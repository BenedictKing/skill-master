import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('check command', () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(tmpdir(), `skill-master-check-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testHome, { recursive: true });
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it('reports no installed skills for an empty home', () => {
    const result = runCli(['check'], testHome, { HOME: testHome });
    const output = result.stdout + result.stderr;

    expect(output).toContain('No skills installed');
    expect(result.exitCode).toBe(0);
  }, 15000);
});
