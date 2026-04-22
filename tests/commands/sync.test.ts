import { describe, it, expect } from 'vitest';
import { runCli } from '../test-utils.js';

describe('sync command', () => {
  it('shows help and usage', () => {
    const result = runCli(['sync', '--help']);

    expect(result.stdout).toContain('Usage: skill-master sync [options]');
    expect(result.stdout).toContain('Discover and sync skills from node_modules.');
    expect(result.exitCode).toBe(0);
  }, 15000);
});
