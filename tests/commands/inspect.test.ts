import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SkillCandidate } from '../../src/types/index.js';

vi.mock('../../src/discovery/search.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/discovery/search.js')>('../../src/discovery/search.js');
  return {
    ...actual,
    discoverCandidates: vi.fn(),
    discoverFromSource: vi.fn(),
    discoverInstalledSkills: vi.fn(),
  };
});

const { inspect } = await import('../../src/commands/inspect.js');
const search = await import('../../src/discovery/search.js');
const discoverCandidatesMock = vi.mocked(search.discoverCandidates);
const discoverFromSourceMock = vi.mocked(search.discoverFromSource);
const discoverInstalledSkillsMock = vi.mocked(search.discoverInstalledSkills);

import { runCli } from '../test-utils.js';

describe('inspect command', () => {
  let testDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
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

  it('supports preview alias', () => {
    const result = runCli(['preview', testDir]);
    const output = result.stdout + result.stderr;
    expect(result.exitCode).toBe(0);
    expect(output).toContain('Inspecting');
    expect(output).toContain('my-skill');
  }, 15000);

  it('uses exact source discovery for explicit source and skill', async () => {
    const candidate: SkillCandidate = {
      id: 'github:exa-search:source',
      provider: 'github',
      name: 'exa-search',
      source: 'BenedictKing/benedictking-skills@exa-search',
      installHint: 'BenedictKing/benedictking-skills@exa-search',
      description: 'exa search',
      capabilities: ['read_file'],
      allowedTools: ['Read'],
      envKeys: ['EXA_API_KEY'],
      issues: [],
      warnings: [],
    };

    discoverCandidatesMock.mockResolvedValue([
      {
        ...candidate,
        id: 'local:version-bump:source',
        provider: 'local',
        name: 'version-bump',
        source: testDir,
        installHint: 'version-bump',
      },
    ]);
    discoverFromSourceMock.mockResolvedValue([candidate]);
    discoverInstalledSkillsMock.mockResolvedValue([]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await inspect(['BenedictKing/benedictking-skills', 'exa-search']);

    expect(discoverFromSourceMock).toHaveBeenCalledWith('BenedictKing/benedictking-skills@exa-search');
    expect(discoverCandidatesMock).not.toHaveBeenCalled();
    expect(discoverInstalledSkillsMock).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
