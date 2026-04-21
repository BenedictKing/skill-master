import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('find command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-find-test-${Date.now()}`);
    mkdirSync(join(testDir, '.claude', 'skills', 'find-me'), { recursive: true });
    writeFileSync(
      join(testDir, '.claude', 'skills', 'find-me', 'SKILL.md'),
      `---\nname: find-me\ndescription: local searchable skill\nallowed-tools:\n  - Read\n---\n# find-me\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('outputs JSON when requested', () => {
    const result = runCli(['find', 'find-me', '--json'], testDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.query).toBe('find-me');
    expect(Array.isArray(parsed.results)).toBe(true);
  }, 30000);
});
