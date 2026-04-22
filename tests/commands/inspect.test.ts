import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('inspect command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-inspect-test-${Date.now()}`);
    mkdirSync(join(testDir, 'my-skill'), { recursive: true });
    writeFileSync(join(testDir, 'my-skill', 'SKILL.md'), `---\nname: my-skill\ndescription: inspectable skill\nversion: 1.0.0\nauthor: tester\nallowed-tools:\n  - Read\n---\n# my-skill\n`, 'utf-8');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('inspects local skill source with detailed scores', () => {
    const result = runCli(['inspect', testDir]);
    const output = result.stdout + result.stderr;
    expect(result.exitCode).toBe(0);
    expect(output).toContain('Inspecting');
    expect(output).toContain('my-skill');
    expect(output).toContain('Match Score');
    expect(output).toContain('Quality Score');
    expect(output).toContain('Safety Score');
  }, 15000);

  it('outputs JSON when requested', () => {
    const result = runCli(['inspect', testDir, '--json']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.target).toBe(testDir);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.some((item: { candidate: { name: string } }) => item.candidate.name === 'my-skill')).toBe(true);
  }, 15000);
});
