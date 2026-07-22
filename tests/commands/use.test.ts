import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseUseFlags } from '../../src/commands/use.js';
import { buildUsePrompt, getLaunchableAgents } from '../../src/core/use-engine.js';
import { runCli } from '../test-utils.js';

function makeSkill(dir: string, name: string, withSupport = false): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} desc\n---\n# ${name}\nDo it.\n`,
    'utf-8',
  );
  if (withSupport) {
    writeFileSync(join(dir, 'helper.txt'), 'supporting data', 'utf-8');
  }
}

describe('parseUseFlags', () => {
  it('parses positional source', () => {
    const { source, flags } = parseUseFlags(['owner/repo']);
    expect(source).toBe('owner/repo');
    expect(flags.fullDepth).toBe(false);
  });

  it('parses --skill and --agent', () => {
    const { flags } = parseUseFlags(['src', '--skill', 'a', '--agent', 'claude-code']);
    expect(flags.skill).toBe('a');
    expect(flags.agent).toBe('claude-code');
  });

  it('parses --skill=value syntax', () => {
    const { flags } = parseUseFlags(['src', '--skill=b']);
    expect(flags.skill).toBe('b');
  });

  it('parses short flags', () => {
    const { flags } = parseUseFlags(['src', '-s', 'x', '-a', 'codex']);
    expect(flags.skill).toBe('x');
    expect(flags.agent).toBe('codex');
  });

  it('parses --full-depth and --help', () => {
    expect(parseUseFlags(['src', '--full-depth']).flags.fullDepth).toBe(true);
    expect(parseUseFlags(['--help']).flags.help).toBe(true);
  });

  it('throws on unknown option', () => {
    expect(() => parseUseFlags(['src', '--nope'])).toThrow('Unknown option');
  });

  it('throws on extra positional arg', () => {
    expect(() => parseUseFlags(['a', 'b'])).toThrow('Unexpected argument');
  });
});

describe('buildUsePrompt', () => {
  it('wraps skill md in <skill> tags', () => {
    const prompt = buildUsePrompt({ skillMd: '# Hello', hasSupportingFiles: false });
    expect(prompt).toContain('<skill>');
    expect(prompt).toContain('# Hello');
    expect(prompt).toContain('</skill>');
    expect(prompt).not.toContain('supporting files');
  });

  it('appends support dir instructions when supporting files exist', () => {
    const prompt = buildUsePrompt({ skillMd: '# Hi', supportDir: '/tmp/x', hasSupportingFiles: true });
    expect(prompt).toContain('/tmp/x');
    expect(prompt).toContain('relative paths');
  });
});

describe('getLaunchableAgents', () => {
  it('includes claude-code and codex only', () => {
    const agents = getLaunchableAgents();
    expect(agents).toContain('claude-code');
    expect(agents).toContain('codex');
    expect(agents).toHaveLength(2);
  });
});

describe('use command (CLI)', () => {
  let testDir: string;
  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-use-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('shows help with -h', () => {
    const result = runCli(['use', '-h'], testDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: skill-master use');
  });

  it('shows help and exits 1 when no source given', () => {
    const result = runCli(['use'], testDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Usage: skill-master use');
  });

  it('prints skill prompt for a local skill', () => {
    makeSkill(join(testDir, 'myskill'), 'local-skill', true);
    const result = runCli(['use', './myskill'], testDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('<skill>');
    expect(result.stdout).toContain('local-skill');
    expect(result.stdout).toContain('supporting files');
  });

  it('omits support instructions when no supporting files', () => {
    makeSkill(join(testDir, 'plain'), 'plain-skill', false);
    const result = runCli(['use', './plain'], testDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('supporting files');
  });

  it('errors when local skill path does not exist', () => {
    const result = runCli(['use', './nonexistent'], testDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('not found');
  });

  it('rejects an unsupported launch agent', () => {
    makeSkill(join(testDir, 's'), 's');
    const result = runCli(['use', './s', '--agent', 'cursor'], testDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('cannot be launched');
  });

  it('rejects an unknown agent platform', () => {
    makeSkill(join(testDir, 's2'), 's2');
    const result = runCli(['use', './s2', '--agent', 'not-an-agent'], testDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('Unsupported agent platform');
  });

  it('errors when multi-skill source has no --skill selection', () => {
    makeSkill(join(testDir, 'multi', 'skill-a'), 'skill-a');
    makeSkill(join(testDir, 'multi', 'skill-b'), 'skill-b');
    const result = runCli(['use', './multi', '--full-depth'], testDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('--skill');
  });

  it('selects a skill from a multi-skill source with --skill', () => {
    makeSkill(join(testDir, 'multi2', 'skill-a'), 'skill-a');
    makeSkill(join(testDir, 'multi2', 'skill-b'), 'skill-b');
    const result = runCli(['use', './multi2', '--skill', 'skill-b', '--full-depth'], testDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('skill-b');
    expect(result.stdout).not.toContain('skill-a\n');
  });

  it('does not write registry or lock files', () => {
    makeSkill(join(testDir, 'noclobber'), 'noclobber');
    runCli(['use', './noclobber'], testDir);
    expect(existsSync(join(testDir, 'skills-lock.json'))).toBe(false);
  });
});
