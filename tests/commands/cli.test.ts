import { describe, it, expect } from 'vitest';
import { runCli, runCliOutput } from '../test-utils.js';

describe('skill-master CLI', () => {
  describe('--help', () => {
    it('should display help message with usage', () => {
      const result = runCli(['--help']);
      expect(result.stdout).toContain('skill-master v');
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('skill-master add <source>');
      expect(result.stdout).toContain('skill-master remove');
      expect(result.stdout).toContain('skill-master list');
      expect(result.stdout).toContain('skill-master find');
      expect(result.stdout).toContain('skill-master solve <task>');
      expect(result.stdout).toContain('skill-master update');
      expect(result.stdout).toContain('skill-master init');
      expect(result.stdout).toContain('skill-master check');
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should show same output for -h alias', () => {
      const helpOutput = runCliOutput(['--help']);
      const hOutput = runCliOutput(['-h']);
      expect(hOutput).toBe(helpOutput);
    }, 30000);

    it('should include add options in help', () => {
      const result = runCli(['--help']);
      expect(result.stdout).toContain('Add Options:');
      expect(result.stdout).toContain('-g, --global');
      expect(result.stdout).toContain('-a, --agent');
      expect(result.stdout).toContain('-s, --skill');
      expect(result.stdout).toContain('-y, --yes');
      expect(result.stdout).toContain('-l, --list');
      expect(result.stdout).toContain('--all');
      expect(result.stdout).toContain('--full-depth');
      expect(result.stdout).toContain('--copy');
      expect(result.stdout).toContain('--force');
    }, 10000);

    it('should include command aliases in help', () => {
      const result = runCli(['--help']);
      expect(result.stdout).toContain('install');
      expect(result.stdout).toContain('rm');
      expect(result.stdout).toContain('ls');
      expect(result.stdout).toContain('search');
      expect(result.stdout).toContain('upgrade');
    }, 10000);
  });

  describe('--version', () => {
    it('should display version number', () => {
      const result = runCli(['--version']);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should show same output for -v alias', () => {
      const versionOutput = runCliOutput(['--version']);
      const vOutput = runCliOutput(['-v']);
      expect(vOutput).toBe(versionOutput);
    }, 15000);
  });

  describe('no arguments', () => {
    it('should display help when no args provided', () => {
      const result = runCli([]);
      expect(result.stdout).toContain('skill-master v');
      expect(result.stdout).toContain('Usage:');
      expect(result.exitCode).toBe(0);
    }, 10000);
  });

  describe('unknown command', () => {
    it('should show error for unknown command', () => {
      const result = runCli(['unknown-command']);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Unknown command');
      expect(result.exitCode).toBe(1);
    }, 10000);

    it('should suggest help after unknown command', () => {
      const result = runCli(['foobar']);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Unknown command');
      expect(output).toContain('Usage:');
    }, 10000);
  });

  describe('command aliases', () => {
    it('should route "a" to add command', () => {
      // Without source, add command shows error
      const result = runCli(['a']);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Usage: skill-master add');
      expect(result.exitCode).toBe(1);
    }, 10000);

    it('should route "i" to add command', () => {
      const result = runCli(['i']);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Usage: skill-master add');
      expect(result.exitCode).toBe(1);
    }, 10000);

    it('should route "install" to add command', () => {
      const result = runCli(['install']);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Usage: skill-master add');
      expect(result.exitCode).toBe(1);
    }, 10000);

    it('should route "rm" to remove command', () => {
      const result = runCli(['rm']);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Usage: skill-master remove');
      expect(result.exitCode).toBe(1);
    }, 10000);

    it('should route "r" to remove command', () => {
      const result = runCli(['r']);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Usage: skill-master remove');
      expect(result.exitCode).toBe(1);
    }, 10000);

    it('should route "ls" to list command', () => {
      const result = runCli(['ls']);
      // list command runs and shows either skills or "No skills installed"
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should route "search" to find command', () => {
      const result = runCli(['search']);
      expect(result.stdout).toContain('Usage: skill-master find');
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should route "f" to find command', () => {
      const result = runCli(['f']);
      expect(result.stdout).toContain('Usage: skill-master find');
    }, 10000);

    it('should route "s" to find command', () => {
      const result = runCli(['s']);
      expect(result.stdout).toContain('Usage: skill-master find');
    }, 10000);

    it('should route "upgrade" to update command', () => {
      const result = runCli(['upgrade']);
      const output = result.stdout + result.stderr;
      // update command needs skill name
      expect(output).toContain('Usage: skill-master update');
      expect(result.exitCode).toBe(1);
    }, 10000);
  });
});
