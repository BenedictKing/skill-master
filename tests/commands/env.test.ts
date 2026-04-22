import { describe, it, expect } from 'vitest';
import { runCli } from '../test-utils.js';

describe('env command', () => {
  it('shows usage for an invalid subcommand', () => {
    const result = runCli(['env', 'nope']);
    const output = result.stdout + result.stderr;

    expect(output).toContain('Usage: skill-master env <list|set|edit>');
    expect(result.exitCode).toBe(1);
  }, 15000);

  it('shows set usage when key value is missing', () => {
    const result = runCli(['env', 'set', 'demo-skill']);
    const output = result.stdout + result.stderr;

    expect(output).toContain('Usage: skill-master env set <skill> KEY=VALUE');
    expect(result.exitCode).toBe(1);
  }, 15000);

  it('shows edit usage when skill is missing', () => {
    const result = runCli(['env', 'edit']);
    const output = result.stdout + result.stderr;

    expect(output).toContain('Usage: skill-master env edit <skill>');
    expect(result.exitCode).toBe(1);
  }, 15000);
});
