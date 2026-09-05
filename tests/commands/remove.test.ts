import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRemoveFlags } from '../../src/commands/remove.js';
import { runCli } from '../test-utils.js';

describe('remove command', () => {
  it('removes the project lock entry from the git root when run in a nested cwd', () => {
    const testDir = join(tmpdir(), `skill-master-remove-root-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');
    const nestedDir = join(projectDir, 'packages', 'app');

    try {
      mkdirSync(join(projectDir, '.git'), { recursive: true });
      mkdirSync(join(projectDir, '.claude'), { recursive: true });
      mkdirSync(join(projectDir, 'skill-src'), { recursive: true });
      mkdirSync(nestedDir, { recursive: true });
      mkdirSync(testHome, { recursive: true });
      writeFileSync(
        join(projectDir, 'skill-src', 'SKILL.md'),
        `---\nname: remove-root-skill\ndescription: remove root target\nallowed-tools:\n  - Read\n---\n# remove-root-skill\n`,
        'utf-8',
      );

      const addResult = runCli(['add', '../../skill-src'], nestedDir, { HOME: testHome });
      expect(addResult.exitCode).toBe(0);

      const removeResult = runCli(['remove', 'remove-root-skill', '--yes'], nestedDir, { HOME: testHome });
      expect(removeResult.exitCode).toBe(0);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'remove-root-skill'))).toBe(false);

      const lock = JSON.parse(readFileSync(join(projectDir, 'skills-lock.json'), 'utf-8'));
      expect(lock.skills['remove-root-skill']).toBeUndefined();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 30000);

  describe('parseRemoveFlags', () => {
    it('should parse skill names as positional arguments', () => {
      const result = parseRemoveFlags(['skill1', 'skill2']);
      expect(result.names).toEqual(['skill1', 'skill2']);
      expect(result.flags.yes).toBe(false);
    });

    it('should parse -g flag', () => {
      const result = parseRemoveFlags(['skill1', '-g']);
      expect(result.names).toEqual(['skill1']);
      expect(result.flags.global).toBe(true);
    });

    it('should parse --global flag', () => {
      const result = parseRemoveFlags(['skill1', '--global']);
      expect(result.flags.global).toBe(true);
    });

    it('should parse -a flag with single agent', () => {
      const result = parseRemoveFlags(['skill1', '-a', 'claude-code']);
      expect(result.flags.agent).toEqual(['claude-code']);
    });

    it('should parse --agent flag with multiple agents', () => {
      const result = parseRemoveFlags(['skill1', '--agent', 'claude-code', 'cursor']);
      expect(result.flags.agent).toEqual(['claude-code', 'cursor']);
    });

    it('should parse --agent=value syntax (backward compat)', () => {
      const result = parseRemoveFlags(['skill1', '--agent=cursor']);
      expect(result.flags.agent).toEqual(['cursor']);
    });

    it('should parse -s flag with skill names', () => {
      const result = parseRemoveFlags(['-s', 'skill1', 'skill2']);
      expect(result.flags.skill).toEqual(['skill1', 'skill2']);
    });

    it('should parse --skill flag', () => {
      const result = parseRemoveFlags(['--skill', 'my-skill']);
      expect(result.flags.skill).toEqual(['my-skill']);
    });

    it('should parse -y flag', () => {
      const result = parseRemoveFlags(['skill1', '-y']);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse --yes flag', () => {
      const result = parseRemoveFlags(['skill1', '--yes']);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse --all flag', () => {
      const result = parseRemoveFlags(['--all']);
      expect(result.flags.all).toBe(true);
    });

    it('should parse --purge flag', () => {
      const result = parseRemoveFlags(['skill1', '--purge']);
      expect(result.flags.purge).toBe(true);
    });

    it('should parse combined flags', () => {
      const result = parseRemoveFlags(['skill1', '-g', '-y', '--purge']);
      expect(result.names).toEqual(['skill1']);
      expect(result.flags.global).toBe(true);
      expect(result.flags.yes).toBe(true);
      expect(result.flags.purge).toBe(true);
    });

    it('should parse multiple skill names with flags', () => {
      const result = parseRemoveFlags(['skill1', 'skill2', '-y', '--purge']);
      expect(result.names).toEqual(['skill1', 'skill2']);
      expect(result.flags.yes).toBe(true);
      expect(result.flags.purge).toBe(true);
    });

    it('should stop collecting agents at next flag', () => {
      const result = parseRemoveFlags(['-a', 'claude-code', '-g']);
      expect(result.flags.agent).toEqual(['claude-code']);
      expect(result.flags.global).toBe(true);
    });

    it('should stop collecting skills at next flag', () => {
      const result = parseRemoveFlags(['-s', 'skill1', '-y']);
      expect(result.flags.skill).toEqual(['skill1']);
      expect(result.flags.yes).toBe(true);
    });

    it('should handle no skill names provided', () => {
      const result = parseRemoveFlags(['-g', '-y']);
      expect(result.names).toEqual([]);
      expect(result.flags.global).toBe(true);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse complex combination', () => {
      const result = parseRemoveFlags([
        'skill1',
        'skill2',
        '-g',
        '-a',
        'claude-code',
        'cursor',
        '-y',
        '--purge',
      ]);
      expect(result.names).toEqual(['skill1', 'skill2']);
      expect(result.flags.global).toBe(true);
      expect(result.flags.agent).toEqual(['claude-code', 'cursor']);
      expect(result.flags.yes).toBe(true);
      expect(result.flags.purge).toBe(true);
    });

    it('should handle --all with -y', () => {
      const result = parseRemoveFlags(['--all', '-y']);
      expect(result.flags.all).toBe(true);
      expect(result.flags.yes).toBe(true);
    });

    it('should mix positional and --skill flag', () => {
      const result = parseRemoveFlags(['skill1', '--skill', 'skill2', 'skill3']);
      expect(result.names).toEqual(['skill1']);
      expect(result.flags.skill).toEqual(['skill2', 'skill3']);
    });
  });
});

  it('removes every skill installed from a source when given the source name', () => {
    const testDir = join(tmpdir(), `skill-master-remove-source-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');

    try {
      mkdirSync(join(projectDir, '.git'), { recursive: true });
      mkdirSync(join(projectDir, '.claude', 'skills'), { recursive: true });
      mkdirSync(join(testHome, '.agents', 'skills'), { recursive: true });
      mkdirSync(join(testHome, '.agents', 'skills', 'skill-a'), { recursive: true });
      mkdirSync(join(testHome, '.agents', 'skills', 'skill-b'), { recursive: true });
      mkdirSync(join(projectDir, '.claude', 'skills', 'skill-a'), { recursive: true });
      mkdirSync(join(projectDir, '.claude', 'skills', 'skill-b'), { recursive: true });

      const entry = (name: string, canonical: string, agentPath: string) => ({
        source: 'K-Dense-AI/scientific-agent-skills',
        installed_at: '2026-09-05T00:00:00.000Z',
        updated_at: '2026-09-05T00:00:00.000Z',
        agents: [{ agent: 'claude-code', agent_path: agentPath, global: true }],
        env_keys: [],
        capabilities: [],
        canonical_path: canonical,
      });

      writeFileSync(
        join(testHome, '.agents', 'registry.json'),
        JSON.stringify({
          version: 2,
          skills: {
            'skill-a': entry('skill-a', join(testHome, '.agents', 'skills', 'skill-a'), join(projectDir, '.claude', 'skills', 'skill-a')),
            'skill-b': entry('skill-b', join(testHome, '.agents', 'skills', 'skill-b'), join(projectDir, '.claude', 'skills', 'skill-b')),
          },
        }, null, 2),
        'utf-8',
      );
      writeFileSync(join(projectDir, '.claude', 'skills', 'skill-a', 'SKILL.md'), '# a\n', 'utf-8');
      writeFileSync(join(projectDir, '.claude', 'skills', 'skill-b', 'SKILL.md'), '# b\n', 'utf-8');

      const result = runCli(['remove', 'K-Dense-AI/scientific-agent-skills', '--yes'], projectDir, { HOME: testHome });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Removing 2 skills installed from source');

      const registry = JSON.parse(readFileSync(join(testHome, '.agents', 'registry.json'), 'utf-8'));
      expect(registry.skills['skill-a']).toBeUndefined();
      expect(registry.skills['skill-b']).toBeUndefined();
      expect(existsSync(join(projectDir, '.claude', 'skills', 'skill-a'))).toBe(false);
      expect(existsSync(join(projectDir, '.claude', 'skills', 'skill-b'))).toBe(false);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 30000);
