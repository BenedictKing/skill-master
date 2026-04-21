import { describe, it, expect } from 'vitest';
import { runSmokeChecks } from '../../src/verify/smoke.js';

describe('verification smoke', () => {
  it('fails smoke when env is missing', () => {
    const report = runSmokeChecks({
      skillName: 'demo',
      envStatus: 'missing',
      envMissingKeys: ['API_KEY'],
      dependencyWarnings: [],
      conflicts: [],
      messages: [],
      structureHealthy: true,
      smokePassed: false,
    });

    expect(report.smokePassed).toBe(false);
    expect(report.messages.at(-1)?.message).toContain('Smoke checks');
  });
});
