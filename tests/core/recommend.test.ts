import { describe, it, expect } from 'vitest';
import { recommendCandidates } from '../../src/recommend/recommend.js';
import { buildTaskRequirement } from '../../src/evaluate/matcher.js';
import type { SkillCandidate } from '../../src/types/index.js';

describe('recommendation ranking', () => {
  it('returns best recommendation first', () => {
    const task = buildTaskRequirement('search web docs');
    const candidates: SkillCandidate[] = [
      {
        id: 'a',
        provider: 'local',
        name: 'local-a',
        source: 'a',
        installHint: 'a',
        description: 'Search local files',
        capabilities: ['read_file'],
        allowedTools: ['Read'],
        envKeys: [],
        issues: [],
        warnings: [],
      },
      {
        id: 'b',
        provider: 'local',
        name: 'local-b',
        source: 'b',
        installHint: 'b',
        description: 'Search web docs and summarize results',
        capabilities: ['web_search', 'read_file'],
        allowedTools: ['WebSearch', 'Read'],
        envKeys: [],
        issues: [],
        warnings: [],
      },
    ];

    const recommendations = recommendCandidates(task, candidates);
    expect(recommendations[0].candidate.id).toBe('b');
    expect(recommendations[0].tier).toBe('best');
  });

  it('prefers local safe candidates when preferences are enabled', () => {
    const task = buildTaskRequirement('search web docs');
    const candidates: SkillCandidate[] = [
      {
        id: 'remote-risky',
        provider: 'github',
        name: 'remote-risky',
        source: 'owner/repo',
        installHint: 'owner/repo',
        description: 'Search web docs',
        capabilities: ['web_search'],
        allowedTools: ['WebSearch', 'Bash', 'Task'],
        envKeys: [],
        issues: [],
        warnings: [],
      },
      {
        id: 'local-safe',
        provider: 'local',
        name: 'local-safe',
        source: '/tmp/local-safe',
        installHint: '/tmp/local-safe',
        description: 'Search web docs safely',
        capabilities: ['web_search'],
        allowedTools: ['WebSearch'],
        envKeys: [],
        issues: [],
        warnings: [],
      },
    ];

    const recommendations = recommendCandidates(task, candidates, {
      safe: true,
      localFirst: true,
    });
    expect(recommendations[0].candidate.id).toBe('local-safe');
  });
});
