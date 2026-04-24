import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findAllSkillDirectoriesWithPlugins } from '../../src/core/skill-parser.js';

describe('skill parser discovery', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-skill-discovery-${Date.now()}`);
    mkdirSync(join(testDir, '.hidden-group', 'nested-skill'), { recursive: true });
    writeFileSync(
      join(testDir, '.hidden-group', 'nested-skill', 'SKILL.md'),
      `---\nname: hidden-skill\ndescription: hidden skill\nallowed-tools:\n  - Read\n---\n# hidden\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('discovers skills under hidden directories when hidden traversal is enabled', async () => {
    const results = await findAllSkillDirectoriesWithPlugins(testDir, false, true);
    expect(results.some((item) => item.path.endsWith(join('nested-skill')))).toBe(true);
  });
});
