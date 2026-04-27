import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('env command', () => {
  it('shows usage for an invalid subcommand', () => {
    const result = runCli(['env', 'nope']);
    const output = result.stdout + result.stderr;

    expect(output).toContain('Usage: skill-master env <list|set|edit>');
    expect(result.exitCode).toBe(1);
  }, 15000);

  it('shows set usage when key value is missing', () => {
    const result = runCli(['env', 'set', 'demo-skill']);
    const output = result.stdout + result.stderr;

    expect(output).toContain('Usage: skill-master env set <skill> KEY=VALUE');
    expect(result.exitCode).toBe(1);
  }, 15000);

  it('shows edit usage when skill is missing', () => {
    const result = runCli(['env', 'edit']);
    const output = result.stdout + result.stderr;

    expect(output).toContain('Usage: skill-master env edit <skill>');
    expect(result.exitCode).toBe(1);
  }, 15000);

  it('renders env set output from the skill template', () => {
    const testDir = join(tmpdir(), `skill-master-env-test-${Date.now()}`);
    const testHome = join(testDir, 'home');
    const canonicalDir = join(testHome, '.agents', 'skills', 'demo-skill');
    const configDir = join(testHome, '.agents', 'config', 'demo-skill');

    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(canonicalDir, '.env.example'),
      [
        '# Demo config',
        'OPENAI_API_KEY=',
        'OPENAI_IMAGE_SIZE=1024x1024',
        '',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(
      join(configDir, '.env'),
      [
        'OPENAI_API_KEY=key',
        '',
      ].join('\n'),
      'utf-8',
    );

    try {
      const result = runCli(['env', 'set', 'demo-skill', 'OPENAI_IMAGE_SIZE=2048x2048'], testDir, {
        HOME: testHome,
      });

      expect(result.exitCode).toBe(0);

      const configEnv = readFileSync(join(configDir, '.env'), 'utf-8');
      const canonicalEnv = readFileSync(join(canonicalDir, '.env'), 'utf-8');

      expect(configEnv).toContain('# Demo config');
      expect(configEnv).toContain('OPENAI_API_KEY=key');
      expect(configEnv).toContain('OPENAI_IMAGE_SIZE=2048x2048');
      expect(canonicalEnv).toBe(configEnv);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 15000);
});
