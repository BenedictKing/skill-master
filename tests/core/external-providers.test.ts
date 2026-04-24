import { describe, it, expect, afterEach, vi } from 'vitest';
import { searchVercelSkills } from '../../src/discovery/providers/vercel.js';
import { parseGhSkillOutput, searchGhSkill } from '../../src/discovery/providers/gh-skill.js';

describe('optional external providers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gh skill provider degrades gracefully when unavailable', async () => {
    const results = await searchGhSkill('unlikely-query-for-test');
    expect(Array.isArray(results)).toBe(true);
  });

  it('gh skill provider parses JSON output correctly', () => {
    const mockOutput = JSON.stringify([
      {
        repo: 'mxyhi/ok-skills',
        path: 'claude-code/exa-search/SKILL.md',
        skillName: 'exa-search',
        description: 'Use Exa for web/code research',
        stars: 283,
      },
      {
        repo: 'openclaw/skills',
        path: 'xinhai-ai/exa-search/SKILL.md',
        skillName: 'exa-search',
        description: 'Use Exa Search API',
        stars: 24,
      },
    ]);

    const results = parseGhSkillOutput(mockOutput);

    expect(results.length).toBe(2);

    const first = results[0];
    expect(first.provider).toBe('gh-skill');
    expect(first.name).toBe('exa-search');
    expect(first.source).toBe('mxyhi/ok-skills');
    expect(first.description).toContain('web/code research');
    expect(first.installs).toBe(283);
    expect(first.installHint).toBe('mxyhi/ok-skills/claude-code/exa-search');
    expect(first.providerMeta?.republished).toBe(false);
    expect(first.warnings).toContain('Declared agent hosts: claude-code');
  });

  it('does not mark real hidden skillsDir layouts as republished', () => {
    const mockOutput = JSON.stringify([
      {
        repo: 'owner/claude-skill',
        path: '.claude/skills/foo/SKILL.md',
        skillName: 'foo',
        description: 'Claude-specific skill',
        stars: 5,
      },
      {
        repo: 'owner/bob-skill',
        path: '.bob/skills/bar/SKILL.md',
        skillName: 'bar',
        description: 'Bob-specific skill',
        stars: 7,
      },
    ]);

    const results = parseGhSkillOutput(mockOutput);
    expect(results[0].providerMeta?.republished).toBe(false);
    expect(results[1].providerMeta?.republished).toBe(false);
  });

  it('vercel provider returns official repo skills for matching queries', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/contents/skills')) {
        return {
          ok: true,
          json: async () => ([
            { name: 'react-best-practices', path: 'skills/react-best-practices', type: 'dir' },
            { name: 'web-design-guidelines', path: 'skills/web-design-guidelines', type: 'dir' },
          ]),
        };
      }
      if (url.includes('/react-best-practices/SKILL.md')) {
        return {
          ok: true,
          text: async () => `---\nname: vercel-react-best-practices\ndescription: Official React best practices from Vercel\nallowed-tools:\n  - Read\n  - WebSearch\n---\n# React best practices\n`,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch);

    const results = await searchVercelSkills('vercel react');
    expect(results.length).toBe(1);
    expect(results[0].provider).toBe('vercel');
    expect(results[0].name).toBe('vercel-react-best-practices');
    expect(results[0].installHint).toBe('vercel-labs/agent-skills@vercel-react-best-practices');
  });
});
