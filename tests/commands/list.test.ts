import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseListFlags } from '../../src/commands/list.js';
import { runCli } from '../test-utils.js';

describe('list command', () => {
  describe('parseListFlags', () => {
    it('should parse empty args', () => {
      const result = parseListFlags([]);
      expect(result.global).toBe(false);
      expect(result.agent).toEqual([]);
    });

    it('should parse -g flag', () => {
      const result = parseListFlags(['-g']);
      expect(result.global).toBe(true);
    });

    it('should parse --global flag', () => {
      const result = parseListFlags(['--global']);
      expect(result.global).toBe(true);
    });

    it('should parse -a flag with single agent', () => {
      const result = parseListFlags(['-a', 'claude-code']);
      expect(result.agent).toEqual(['claude-code']);
    });

    it('should parse --agent flag with single agent', () => {
      const result = parseListFlags(['--agent', 'cursor']);
      expect(result.agent).toEqual(['cursor']);
    });

    it('should parse -a flag with multiple agents', () => {
      const result = parseListFlags(['-a', 'claude-code', 'cursor', 'cline']);
      expect(result.agent).toEqual(['claude-code', 'cursor', 'cline']);
    });

    it('should parse --agent=value syntax (backward compat)', () => {
      const result = parseListFlags(['--agent=cursor']);
      expect(result.agent).toEqual(['cursor']);
    });

    it('should parse combined flags', () => {
      const result = parseListFlags(['-g', '-a', 'claude-code', 'cursor']);
      expect(result.global).toBe(true);
      expect(result.agent).toEqual(['claude-code', 'cursor']);
    });

    it('should stop collecting agents at next flag', () => {
      const result = parseListFlags(['-a', 'claude-code', '-g']);
      expect(result.agent).toEqual(['claude-code']);
      expect(result.global).toBe(true);
    });

    it('should handle multiple --agent flags', () => {
      const result = parseListFlags(['-a', 'claude-code', '-a', 'cursor']);
      expect(result.agent).toEqual(['claude-code', 'cursor']);
    });

    it('should ignore unknown flags gracefully', () => {
      const result = parseListFlags(['-g', '--unknown', '-a', 'cursor']);
      expect(result.global).toBe(true);
      expect(result.agent).toEqual(['cursor']);
    });
  });

  it('uses the git root lock file for plugin grouping from nested directories', () => {
    const testDir = join(tmpdir(), `skill-master-list-test-${Date.now()}`);
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');
    const nestedDir = join(projectDir, 'packages', 'app');

    mkdirSync(join(projectDir, '.git'), { recursive: true });
    mkdirSync(nestedDir, { recursive: true });
    mkdirSync(join(testHome, '.agents'), { recursive: true });
    writeFileSync(
      join(testHome, '.agents', 'registry.json'),
      JSON.stringify({
        version: 2,
        skills: {
          'grouped-skill': {
            source: 'skills/grouped-skill',
            installed_at: '2026-04-27T00:00:00.000Z',
            updated_at: '2026-04-27T00:00:00.000Z',
            agents: [{ agent: 'claude-code', agent_path: join(projectDir, '.claude', 'skills', 'grouped-skill'), global: false }],
            env_keys: [],
            capabilities: [],
            canonical_path: join(testHome, '.agents', 'skills', 'grouped-skill'),
          },
        },
      }, null, 2),
      'utf-8',
    );
    writeFileSync(
      join(projectDir, 'skills-lock.json'),
      JSON.stringify({
        version: 1,
        skills: {
          'grouped-skill': {
            source: 'skills/grouped-skill',
            sourceType: 'local',
            computedHash: 'hash',
            pluginName: 'plugin-alpha',
          },
        },
      }, null, 2),
      'utf-8',
    );

    try {
      const result = runCli(['list'], nestedDir, { HOME: testHome });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Plugin Alpha');
      expect(result.stdout).toContain('grouped-skill');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 30000);
});
