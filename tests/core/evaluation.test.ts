import { describe, it, expect } from 'vitest';
import { buildTaskRequirement } from '../../src/evaluate/matcher.js';
import { evaluateCandidate } from '../../src/evaluate/scorer.js';
import type { SkillCandidate } from '../../src/types/index.js';

describe('evaluation pipeline', () => {
  it('builds task requirements from text', () => {
    const task = buildTaskRequirement('search web docs and summarize latest library info');
    expect(task.keywords.length).toBeGreaterThan(0);
    expect(task.capabilities).toContain('web_search');
  });

  it('scores candidate against task', () => {
    const task = buildTaskRequirement('search web docs and summarize latest library info');
    const candidate: SkillCandidate = {
      id: 'test:candidate',
      provider: 'local',
      name: 'docs-search',
      source: '/tmp/docs-search',
      installHint: '/tmp/docs-search',
      description: 'Search web documentation and summarize latest information',
      capabilities: ['web_search', 'read_file'],
      allowedTools: ['WebSearch', 'Read'],
      envKeys: [],
      issues: [],
      warnings: [],
    };

    const report = evaluateCandidate(task, candidate);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.matchedCapabilities).toContain('web_search');
  });
});
