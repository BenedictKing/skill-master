import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../test-utils.js';

type CoverageRow = {
  command: string;
  testFile: string;
};

const COMMAND_COVERAGE: CoverageRow[] = [
  { command: 'add', testFile: 'add.test.ts' },
  { command: 'update', testFile: 'update.test.ts' },
  { command: 'remove', testFile: 'remove.test.ts' },
  { command: 'env', testFile: 'env.test.ts' },
  { command: 'list', testFile: 'list.test.ts' },
  { command: 'info', testFile: 'info.test.ts' },
  { command: 'doctor', testFile: 'doctor.test.ts' },
  { command: 'find', testFile: 'find.test.ts' },
  { command: 'inspect', testFile: 'inspect.test.ts' },
  { command: 'recommend', testFile: 'recommend.test.ts' },
  { command: 'verify', testFile: 'verify.test.ts' },
  { command: 'compose', testFile: 'compose.test.ts' },
  { command: 'solve', testFile: 'solve.test.ts' },
  { command: 'init', testFile: 'init.test.ts' },
  { command: 'check', testFile: 'check.test.ts' },
  { command: 'sync', testFile: 'sync.test.ts' },
  { command: 'restore', testFile: 'restore.test.ts' },
  { command: 'use', testFile: 'use.test.ts' },
];

function listCliCommands(): string[] {
  const cliPath = join(import.meta.dirname, '..', '..', 'src', 'cli.ts');
  const cliSource = readFileSync(cliPath, 'utf-8');

  return Array.from(cliSource.matchAll(/import \{[^}]+\} from '\.\/commands\/([a-z-]+)\.js';/g))
    .map(match => match[1])
    .sort();
}

describe('command coverage map', () => {
  it('keeps the coverage rows in sync with top-level CLI commands', () => {
    const coveredCommands = COMMAND_COVERAGE.map(row => row.command).sort();

    expect(coveredCommands).toEqual(listCliCommands());
  });

  it('has a dedicated command test file for each top-level command', () => {
    for (const row of COMMAND_COVERAGE) {
      const testPath = join(import.meta.dirname, row.testFile);
      expect(existsSync(testPath), `${row.command} -> ${row.testFile}`).toBe(true);
    }
  });

  it('shows every top-level command in CLI help output', () => {
    const result = runCli(['--help']);

    expect(result.exitCode).toBe(0);
    for (const row of COMMAND_COVERAGE) {
      expect(result.stdout).toContain(`skill-master ${row.command}`);
    }
  }, 15000);
});
