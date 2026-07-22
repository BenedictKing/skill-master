import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('compose command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-compose-cli-test-${Date.now()}`);
    mkdirSync(join(testDir, 'skill-src'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(
      join(testDir, 'skill-src', 'SKILL.md'),
      `---\nname: compose-me\ndescription: compose target\nallowed-tools:\n  - Read\n---\n# compose-me\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('shows usage when no sources or task are provided', () => {
    const result = runCli(['compose']);
    expect(result.stdout).toContain('Usage: skill-master compose');
    expect(result.exitCode).toBe(0);
  }, 15000);

  it('accepts installed skill name as compose source', () => {
    const installResult = runCli(['add', './skill-src', '--yes'], testDir);
    expect(installResult.exitCode).toBe(0);

    const outputDir = join(testDir, 'generated');
    const composeResult = runCli(['compose', 'compose-me', '-o', outputDir], testDir);
    expect(composeResult.exitCode).toBe(0);
    expect(existsSync(join(outputDir, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'README.md'))).toBe(true);
  }, 30000);

  it('outputs JSON when requested', () => {
    const outputDir = join(testDir, 'generated-json');
    const result = runCli(['compose', './skill-src', '-o', outputDir, '--json'], testDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Array.isArray(parsed.inputSources)).toBe(true);
    expect(parsed.result.outputDir).toBe(outputDir);
    expect(parsed.result.files).toContain(join(outputDir, 'SKILL.md'));
  }, 30000);

  it('generates an OpenAI image API skill from the task', () => {
    const outputDir = join(testDir, 'generated-image-api');
    const result = runCli([
      'compose',
      '--task',
      'Generate images with gpt-image-2 through a third-party OpenAI-compatible API at http://localhost:3688/v1',
      '-o',
      outputDir,
      '--json',
    ], testDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.result.files).toContain(join(outputDir, '.env.example'));
    expect(parsed.result.files).toContain(join(outputDir, 'scripts', 'gpt-image-2-api.mjs'));
    expect(existsSync(join(outputDir, '.env.example'))).toBe(true);
  }, 30000);
});
