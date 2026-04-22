import { describe, it, expect } from 'vitest';
import { runCli } from '../test-utils.js';

describe('info command', () => {
  it('shows usage when skill name is missing', () => {
    const result = runCli(['info']);
    const output = result.stdout + result.stderr;

    expect(output).toContain('Usage: skill-master info <skill-name>');
    expect(result.exitCode).toBe(1);
  }, 15000);
});
