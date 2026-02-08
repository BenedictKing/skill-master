import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CLI_PATH = join(import.meta.dirname, '..', 'src', 'cli.ts');

/** Strip ANSI escape codes from a string */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Run the skill-master CLI with given args.
 * Uses tsx to execute TypeScript directly.
 */
export function runCli(
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
  timeout?: number,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const output = execSync(
      `npx tsx "${CLI_PATH}" ${args.map((a) => `"${a}"`).join(' ')}`,
      {
        encoding: 'utf-8',
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env ? { ...process.env, ...env } : undefined,
        timeout: timeout ?? 60000, // Increased to 60s for npx tsx initialization
      },
    );
    return { stdout: stripAnsi(output), stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: stripAnsi(error.stdout || ''),
      stderr: stripAnsi(error.stderr || ''),
      exitCode: error.status || 1,
    };
  }
}

/** Convenience: run CLI and return combined stdout+stderr */
export function runCliOutput(args: string[], cwd?: string): string {
  const result = runCli(args, cwd);
  return (result.stdout + result.stderr).trim();
}
