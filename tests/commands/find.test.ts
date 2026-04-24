import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';
import { parseFindArgs, sortCandidates } from '../../src/commands/find.js';
import type { SkillCandidate } from '../../src/types/index.js';

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

  it('shows provider-first dynamic-width output with full install hint column', () => {
    const result = runCli(['find', 'exa search'], testDir);
    expect(result.exitCode).toBe(0);

    const lines = result.stdout.split('\n');
    const headerIndex = lines.findIndex((line) => line.includes('Provider') && line.includes('Name') && line.includes('Install Hint'));
    expect(headerIndex).toBeGreaterThanOrEqual(0);

    const headerLine = lines[headerIndex];
    const separatorLine = lines[headerIndex + 1];
    expect(headerLine.startsWith('Provider')).toBe(true);
    expect(separatorLine).toContain('-|-');

    const providerWidth = headerLine.indexOf(' | Name');
    const nameWidth = headerLine.indexOf(' | Install Hint') - (headerLine.indexOf(' | Name') + ' | '.length);
    const installHintWidth = separatorLine.split('-|-')[2]?.length ?? 0;

    expect(providerWidth).toBeGreaterThanOrEqual(12);
    expect(nameWidth).toBeGreaterThanOrEqual(50);
    expect(installHintWidth).toBeGreaterThanOrEqual(80);

    const tableLines = lines.slice(headerIndex);
    expect(tableLines.join('\n')).not.toContain('...');
  }, 60000);

  it('parses agent flag and query words', () => {
    const parsed = parseFindArgs(['exa', 'search', '--provider', 'gh-skill', '--agent', 'claude-code', '--json']);
    expect(parsed.query).toBe('exa search');
    expect(parsed.flags.provider).toBe('gh-skill');
    expect(parsed.flags.agent).toBe('claude-code');
    expect(parsed.flags.json).toBe(true);
  });

  it('parses inline provider flag', () => {
    const parsed = parseFindArgs(['exa', 'search', '--provider=skills.sh']);
    expect(parsed.query).toBe('exa search');
    expect(parsed.flags.provider).toBe('skills.sh');
    expect(parsed.flags.json).toBe(false);
  });

  it('sorts results by install hint then name then provider', () => {
    const candidates: SkillCandidate[] = [
      {
        id: '3',
        provider: 'skills.sh',
        name: 'zzz',
        source: 'repo-b',
        installHint: 'repo-b',
        capabilities: [],
        allowedTools: [],
        envKeys: [],
        issues: [],
        warnings: [],
      },
      {
        id: '2',
        provider: 'gh-skill',
        name: 'aaa',
        source: 'repo-a',
        installHint: 'repo-a',
        capabilities: [],
        allowedTools: [],
        envKeys: [],
        issues: [],
        warnings: [],
      },
      {
        id: '1',
        provider: 'skills.sh',
        name: 'bbb',
        source: 'repo-a',
        installHint: 'repo-a',
        capabilities: [],
        allowedTools: [],
        envKeys: [],
        issues: [],
        warnings: [],
      },
      {
        id: '4',
        provider: 'gh-skill',
        name: 'bbb',
        source: 'repo-a',
        installHint: 'repo-a',
        capabilities: [],
        allowedTools: [],
        envKeys: [],
        issues: [],
        warnings: [],
      },
    ];

    const sorted = sortCandidates(candidates);
    expect(sorted.map((item) => `${item.installHint}:${item.name}:${item.provider}`)).toEqual([
      'repo-a:aaa:gh-skill',
      'repo-a:bbb:gh-skill',
      'repo-a:bbb:skills.sh',
      'repo-b:zzz:skills.sh',
    ]);
  });
});

