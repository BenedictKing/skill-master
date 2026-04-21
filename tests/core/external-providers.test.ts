import { describe, it, expect, afterEach, vi } from 'vitest';
import { searchVercelSkills } from '../../src/discovery/providers/vercel.js';
import { searchGhSkill } from '../../src/discovery/providers/gh-skill.js';

describe('optional external providers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gh skill provider degrades gracefully when unavailable', async () => {
    const results = await searchGhSkill('unlikely-query-for-test');
    expect(Array.isArray(results)).toBe(true);
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
