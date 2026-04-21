import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SolveJsonV1 } from '../../src/types/contracts.js';
import { assertMatchesSchema, getSchemaPath, runCli, runCliJson } from '../test-utils.js';

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
    const result = runCliJson<SolveJsonV1>(['solve', 'search web docs', '--json'], testDir);
    expect(result.exitCode).toBe(0);
    assertMatchesSchema(getSchemaPath('solve.v1.schema.json'), result.parsed);
    expect(result.parsed.task.normalized).toBe('search web docs');
    expect(result.parsed.steps.discovered).toBe(true);
    expect(result.parsed.steps.recommended).toBe(true);
    expect(result.parsed.summary.bestMatch).toBe('solver-skill');
  }, 30000);

  it('supports preference passthrough in JSON mode', () => {
    const result = runCliJson<SolveJsonV1>(['solve', 'search web docs', '--json', '--safe', '--local-first'], testDir);
    expect(result.exitCode).toBe(0);
    assertMatchesSchema(getSchemaPath('solve.v1.schema.json'), result.parsed);
    expect(result.parsed.preferences.safe).toBe(true);
    expect(result.parsed.preferences.localFirst).toBe(true);
  }, 30000);

  it('can install and verify in one solve run', () => {
    const result = runCliJson<SolveJsonV1>(['solve', 'search web docs', '--install', '--verify', '--json'], testDir);
    expect(result.exitCode).toBe(0);
    assertMatchesSchema(getSchemaPath('solve.v1.schema.json'), result.parsed);
    expect(result.parsed.steps.installed).toBe(true);
    expect(result.parsed.steps.verified).toBe(true);
    expect(result.parsed.installation?.skillName).toBe('solver-skill');
    expect(existsSync(join(testDir, 'skills-lock.json'))).toBe(true);
  }, 30000);
});
