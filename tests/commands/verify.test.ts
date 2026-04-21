import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { VerifyJsonV1 } from '../../src/types/contracts.js';
import { assertMatchesSchema, getSchemaPath, runCli, runCliJson } from '../test-utils.js';

describe('verify command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-verify-test-${Date.now()}`);
    mkdirSync(join(testDir, '.claude'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('shows usage when skill name is missing', () => {
    const result = runCli(['verify']);
    expect(result.stdout).toContain('Usage: skill-master verify');
    expect(result.exitCode).toBe(0);
  }, 15000);

  it('writes verification snapshot after install and verify', () => {
    mkdirSync(join(testDir, 'skill-src'), { recursive: true });
    writeFileSync(
      join(testDir, 'skill-src', 'SKILL.md'),
      `---\nname: verify-me\ndescription: verify target\nallowed-tools:\n  - Read\n---\n# verify-me\n`,
      'utf-8',
    );

    const installResult = runCli(['add', './skill-src'], testDir);
    expect(installResult.exitCode).toBe(0);

    const verifyResult = runCli(['verify', 'verify-me'], testDir);
    const output = verifyResult.stdout + verifyResult.stderr;
    expect(verifyResult.exitCode).toBe(0);
    expect(output).toContain('Verification report');
    expect(existsSync(join(testDir, 'skills-lock.json'))).toBe(true);

    const lock = readFileSync(join(testDir, 'skills-lock.json'), 'utf-8');
    expect(lock).toContain('verification');
  }, 30000);

  it('outputs JSON when requested', () => {
    mkdirSync(join(testDir, 'skill-src'), { recursive: true });
    writeFileSync(
      join(testDir, 'skill-src', 'SKILL.md'),
      `---\nname: verify-json\ndescription: verify target\nallowed-tools:\n  - Read\n---\n# verify-json\n`,
      'utf-8',
    );
    expect(runCli(['add', './skill-src'], testDir).exitCode).toBe(0);

    const result = runCliJson<VerifyJsonV1>(['verify', 'verify-json', '--json'], testDir);
    expect(result.exitCode).toBe(0);
    assertMatchesSchema(getSchemaPath('verify.v1.schema.json'), result.parsed);
    expect(result.parsed.skillName).toBe('verify-json');
    expect(typeof result.parsed.smokePassed).toBe('boolean');
  }, 30000);
});
