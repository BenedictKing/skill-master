import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveSkillDirForUpdate, resolveUpdateSource } from '../../src/commands/update.js';
import type { RegistryEntry } from '../../src/types/index.js';

describe('update command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('uses locked skillDir when provided', async () => {
    const repoDir = join(testDir, 'repo');
    const skillDir = join(repoDir, 'skills', 'nested-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: nested-skill\ndescription: nested test skill\nallowed-tools:\n  - Read\n---\n# nested-skill\n`,
      'utf-8',
    );

    const result = await resolveSkillDirForUpdate('nested-skill', repoDir, 'skills/nested-skill');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(skillDir);
    }
  });

  it('matches sanitized skill names in locked skill directories', async () => {
    const repoDir = join(testDir, 'repo');
    const skillDir = join(repoDir, 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: my skill\ndescription: spaced name\nallowed-tools:\n  - Read\n---\n# my skill\n`,
      'utf-8',
    );

    const result = await resolveSkillDirForUpdate('myskill', repoDir, 'skills/my-skill');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(skillDir);
    }
  });

  it('rejects locked skillDir that escapes the source directory', async () => {
    const repoDir = join(testDir, 'repo');
    const outsideDir = join(testDir, 'outside-skill');
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(
      join(outsideDir, 'SKILL.md'),
      `---\nname: escaped-skill\ndescription: escaped\nallowed-tools:\n  - Read\n---\n# escaped\n`,
      'utf-8',
    );

    const result = await resolveSkillDirForUpdate('escaped-skill', repoDir, '../outside-skill');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('越界');
    }
  });

  it('falls back to name-based discovery when locked skillDir is absolute', async () => {
    const repoDir = join(testDir, 'repo');
    const skillDir = join(repoDir, 'skills', 'fallback-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: fallback-skill\ndescription: fallback\nallowed-tools:\n  - Read\n---\n# fallback\n`,
      'utf-8',
    );

    const result = await resolveSkillDirForUpdate('fallback-skill', repoDir, '/tmp/legacy-absolute-path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(skillDir);
    }
  });

  it('matches a unique skill by SKILL.md name when no lock metadata exists', async () => {
    const repoDir = join(testDir, 'repo');
    const alphaDir = join(repoDir, 'alpha');
    const betaDir = join(repoDir, 'beta');
    mkdirSync(alphaDir, { recursive: true });
    mkdirSync(betaDir, { recursive: true });

    writeFileSync(
      join(alphaDir, 'SKILL.md'),
      `---\nname: alpha-skill\ndescription: alpha\nallowed-tools:\n  - Read\n---\n# alpha\n`,
      'utf-8',
    );
    writeFileSync(
      join(betaDir, 'SKILL.md'),
      `---\nname: beta-skill\ndescription: beta\nallowed-tools:\n  - Read\n---\n# beta\n`,
      'utf-8',
    );

    const result = await resolveSkillDirForUpdate('beta-skill', repoDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(betaDir);
    }
  });

  it('skips invalid SKILL.md entries while still matching a valid target skill', async () => {
    const repoDir = join(testDir, 'repo');
    const brokenDir = join(repoDir, 'broken');
    const validDir = join(repoDir, 'valid');
    mkdirSync(brokenDir, { recursive: true });
    mkdirSync(validDir, { recursive: true });

    writeFileSync(join(brokenDir, 'SKILL.md'), '---\nname: [broken\n---\n', 'utf-8');
    writeFileSync(
      join(validDir, 'SKILL.md'),
      `---\nname: valid-skill\ndescription: valid\nallowed-tools:\n  - Read\n---\n# valid\n`,
      'utf-8',
    );

    const result = await resolveSkillDirForUpdate('valid-skill', repoDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(validDir);
    }
  });

  it('finds skills under hidden priority directories without lock metadata', async () => {
    const repoDir = join(testDir, 'repo');
    const hiddenSkillDir = join(repoDir, '.claude', 'skills', 'hidden-skill');
    mkdirSync(hiddenSkillDir, { recursive: true });
    writeFileSync(
      join(hiddenSkillDir, 'SKILL.md'),
      `---\nname: hidden-skill\ndescription: hidden\nallowed-tools:\n  - Read\n---\n# hidden\n`,
      'utf-8',
    );

    const result = await resolveSkillDirForUpdate('hidden-skill', repoDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(hiddenSkillDir);
    }
  });


  it('refuses ambiguous fallback when names do not match', async () => {
    const repoDir = join(testDir, 'repo');
    const alphaDir = join(repoDir, 'alpha');
    const betaDir = join(repoDir, 'beta');
    mkdirSync(alphaDir, { recursive: true });
    mkdirSync(betaDir, { recursive: true });

    writeFileSync(
      join(alphaDir, 'SKILL.md'),
      `---\nname: alpha-skill\ndescription: alpha\nallowed-tools:\n  - Read\n---\n# alpha\n`,
      'utf-8',
    );
    writeFileSync(
      join(betaDir, 'SKILL.md'),
      `---\nname: beta-skill\ndescription: beta\nallowed-tools:\n  - Read\n---\n# beta\n`,
      'utf-8',
    );

    const result = await resolveSkillDirForUpdate('missing-skill', repoDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('没有唯一匹配');
    }
  });


  it('prefers project lock source and skillDir for local project installs', async () => {
    const sourceRoot = join(testDir, 'sources', 'repo');
    const nestedSkillDir = join(sourceRoot, 'packages', 'locked-skill');
    mkdirSync(nestedSkillDir, { recursive: true });
    writeFileSync(
      join(nestedSkillDir, 'SKILL.md'),
      `---\nname: locked-skill\ndescription: locked\nallowed-tools:\n  - Read\n---\n# locked\n`,
      'utf-8',
    );

    writeFileSync(
      join(testDir, 'skills-lock.json'),
      JSON.stringify({
        version: 1,
        skills: {
          'locked-skill': {
            source: './sources/repo',
            sourceType: 'local',
            computedHash: 'abc123',
            skillDir: 'packages/locked-skill',
          },
        },
      }, null, 2),
      'utf-8',
    );

    const entry: RegistryEntry = {
      source: nestedSkillDir,
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      agents: [{ agent: 'claude-code', agent_path: '/tmp/agent-skill', global: false }],
      env_keys: [],
      capabilities: [],
      canonical_path: '/tmp/canonical-skill',
    };

    const result = await resolveUpdateSource('locked-skill', entry, testDir, { preferProjectLock: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usedLock).toBe(true);
      expect(result.sourceLabel).toBe('./sources/repo');
      expect(result.source.type).toBe('local');
      if (result.source.type === 'local') {
        expect(result.source.path).toBe(nestedSkillDir);
      }
    }
  });

  it('falls back to registry source for git-like updates without using stale project lock data', async () => {
    writeFileSync(
      join(testDir, 'skills-lock.json'),
      JSON.stringify({
        version: 1,
        skills: {
          'escaped-subpath': {
            source: './stale-local-source',
            sourceType: 'local',
            computedHash: 'abc123',
          },
        },
      }, null, 2),
      'utf-8',
    );

    const entry: RegistryEntry = {
      source: 'owner/repo/../outside-skill',
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      agents: [{ agent: 'claude-code', agent_path: '/tmp/agent-skill', global: false }],
      env_keys: [],
      capabilities: [],
      canonical_path: '/tmp/canonical-skill',
    };

    const result = await resolveUpdateSource('escaped-subpath', entry, testDir, { preferProjectLock: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('无法获取远程来源');
      expect(result.hint).toContain('owner/repo/../outside-skill');
    }
  }, 15000);

  it('falls back to registry source when project lock source conflicts', async () => {
    writeFileSync(
      join(testDir, 'skills-lock.json'),
      JSON.stringify({
        version: 1,
        skills: {
          'locked-skill': {
            source: './stale-local-source',
            sourceType: 'local',
            computedHash: 'abc123',
            skillDir: 'packages/locked-skill',
          },
        },
      }, null, 2),
      'utf-8',
    );

    const entry: RegistryEntry = {
      source: 'https://github.com/example/other.git',
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      agents: [{ agent: 'claude-code', agent_path: '/tmp/agent-skill', global: false }],
      env_keys: [],
      capabilities: [],
      canonical_path: '/tmp/canonical-skill',
    };

    const result = await resolveUpdateSource('locked-skill', entry, testDir, { preferProjectLock: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('无法获取远程来源');
    }
  });

  it('skips project update when locked local source no longer exists', async () => {
    writeFileSync(
      join(testDir, 'skills-lock.json'),
      JSON.stringify({
        version: 1,
        skills: {
          'missing-skill': {
            source: './does-not-exist',
            sourceType: 'local',
            computedHash: 'abc123',
          },
        },
      }, null, 2),
      'utf-8',
    );

    const entry: RegistryEntry = {
      source: './another-missing-path',
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      agents: [{ agent: 'claude-code', agent_path: '/tmp/agent-skill', global: false }],
      env_keys: [],
      capabilities: [],
      canonical_path: '/tmp/canonical-skill',
    };

    const result = await resolveUpdateSource('missing-skill', entry, testDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('本地来源不存在');
      expect(result.hint).toContain('skill-master add');
      expect(result.hint).toContain('./another-missing-path');
    }
  });
});
