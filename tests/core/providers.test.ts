import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverCandidates } from '../../src/discovery/search.js';

describe('provider-based discovery', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-provider-test-${Date.now()}`);
    mkdirSync(join(testDir, '.claude', 'skills', 'helper-skill'), { recursive: true });
    writeFileSync(
      join(testDir, '.claude', 'skills', 'helper-skill', 'SKILL.md'),
      `---\nname: helper-skill\ndescription: helper\nallowed-tools:\n  - Read\n---\n# helper\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('discovers project-local skills through provider search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const candidates = await discoverCandidates('helper', testDir);
    expect(candidates.some((candidate) => candidate.name === 'helper-skill')).toBe(true);
  }, 10000);
});
