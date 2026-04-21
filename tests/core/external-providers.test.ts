import { describe, it, expect } from 'vitest';
import { searchVercelSkills } from '../../src/discovery/providers/vercel.js';
import { searchGhSkill } from '../../src/discovery/providers/gh-skill.js';

describe('optional external providers', () => {
  it('gh skill provider degrades gracefully when unavailable', async () => {
    const results = await searchGhSkill('unlikely-query-for-test');
    expect(Array.isArray(results)).toBe(true);
  });

  it('vercel provider currently returns empty list safely', async () => {
    const results = await searchVercelSkills('anything');
    expect(results).toEqual([]);
  });
});
