import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

describe('init command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-init-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create SKILL.md in current directory when no name provided', () => {
    const result = runCli(['init'], testDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created');
    expect(result.stdout).toContain('SKILL.md');
    expect(existsSync(join(testDir, 'SKILL.md'))).toBe(true);
  }, 10000); // Increased timeout for npx tsx

  it('should create subdirectory with SKILL.md when name provided', () => {
    const result = runCli(['init', 'my-skill'], testDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created');
    expect(existsSync(join(testDir, 'my-skill', 'SKILL.md'))).toBe(true);
  }, 10000);

  it('should show error if SKILL.md already exists', () => {
    // Create first skill
    runCli(['init', 'existing-skill'], testDir);

    // Try to create again
    const result = runCli(['init', 'existing-skill'], testDir);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('SKILL.md already exists');
  }, 15000);

  it('should allow multiple skills in same directory', () => {
    runCli(['init', 'skill-one'], testDir);
    runCli(['init', 'skill-two'], testDir);

    expect(existsSync(join(testDir, 'skill-one', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(testDir, 'skill-two', 'SKILL.md'))).toBe(true);
  }, 15000);

  it('should create SKILL.md with correct template structure', () => {
    runCli(['init', 'test-skill'], testDir);

    const fs = require('node:fs');
    const content = fs.readFileSync(join(testDir, 'test-skill', 'SKILL.md'), 'utf-8');

    // Check frontmatter
    expect(content).toContain('---');
    expect(content).toContain('name: test-skill');
    expect(content).toContain('version: 0.1.0');
    expect(content).toContain('author:');
    expect(content).toContain('description:');
    expect(content).toContain('allowed-tools:');
    expect(content).toContain('user-invocable: true');

    // Check body
    expect(content).toContain('# test-skill');
  }, 10000);

  it('should use directory basename when no name provided', () => {
    const namedDir = join(testDir, 'my-project');
    mkdirSync(namedDir, { recursive: true });

    runCli(['init'], namedDir);

    const fs = require('node:fs');
    const content = fs.readFileSync(join(namedDir, 'SKILL.md'), 'utf-8');
    expect(content).toContain('name: my-project');
  }, 10000);
});
