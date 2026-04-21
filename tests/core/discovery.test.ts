import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverFromLocalPath } from '../../src/discovery/search.js';

describe('discovery', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-discovery-test-${Date.now()}`);
    mkdirSync(join(testDir, 'my-skill'), { recursive: true });
    writeFileSync(join(testDir, 'my-skill', 'SKILL.md'), `---\nname: my-skill\ndescription: test skill\nallowed-tools:\n  - Read\n---\n# my-skill\n`, 'utf-8');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('discovers local skills with metadata', async () => {
    const candidates = await discoverFromLocalPath(testDir);
    expect(candidates.length).toBe(1);
    expect(candidates[0].name).toBe('my-skill');
    expect(candidates[0].capabilities).toContain('read_file');
  });
});
