import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';

const CLI_PATH = join(import.meta.dirname, '..', 'src', 'cli.ts');
const TSX_PATH = join(import.meta.dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');

/**
 * Agent / CI 检测环境变量。测试子进程默认剥离这些变量，
 * 使测试在「干净终端」语义下运行、结果可预期；
 * 需要模拟 agent/CI 环境的测试可通过 env 显式注入。
 */
const AGENT_DETECTION_ENV_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CODEX_HOME',
  'CODEX_CI',
  'GEMINI_CLI',
  'OPENCODE',
  'CURSOR_AGENT',
  'CURSOR_EXTENSION_HOST_ROLE',
  'CURSOR_TRACE_ID',
  'AIDER_DETERMINISTIC',
  'REPL_ID',
  'CI',
  'GITHUB_ACTIONS',
  'CONTINUOUS_INTEGRATION',
];

/** 构造剥离了 agent/CI 信号的基础环境。 */
function baseEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  for (const key of AGENT_DETECTION_ENV_VARS) {
    delete env[key];
  }
  return env;
}

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
    const output = execFileSync(
      process.execPath,
      [TSX_PATH, CLI_PATH, ...args],
      {
        encoding: 'utf-8',
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...baseEnv(), ...env },
        timeout: timeout ?? 60000,
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

/** Run CLI and parse JSON stdout. */
export function runCliJson<T = unknown>(args: string[], cwd?: string): { parsed: T; stdout: string; stderr: string; exitCode: number } {
  const result = runCli(args, cwd);
  return {
    ...result,
    parsed: JSON.parse(result.stdout) as T,
  };
}

/** Validate a value against a JSON schema file. */
export function assertMatchesSchema(schemaPath: string, value: unknown): void {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(value);
  if (!valid) {
    throw new Error(`Schema validation failed: ${ajv.errorsText(validate.errors, { separator: '\n' })}`);
  }
}

/** Resolve a schema path from the repository root. */
export function getSchemaPath(fileName: string): string {
  return join(import.meta.dirname, '..', 'schemas', fileName);
}
