import { describe, it, expect } from 'vitest';
import { runCli } from '../test-utils.js';

describe('restore command', () => {
  it('shows help and usage', () => {
    const result = runCli(['restore', '--help']);

    expect(result.stdout).toContain('Usage: skill-master restore [options]');
    expect(result.stdout).toContain('Restore skills from skills-lock.json.');
    expect(result.exitCode).toBe(0);
  }, 15000);
});
