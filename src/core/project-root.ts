import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import * as logger from '../utils/logger.js';
import { confirm } from '../utils/prompt.js';
import { isAgentOrCIEnv } from '../platform/agent-env.js';

const PROJECT_MARKERS = ['CLAUDE.md', 'AGENTS.md', 'claude.md', 'agents.md'];

function findAncestor(startDir: string, predicate: (dir: string) => string | null): string | null {
  let current = resolve(startDir);

  for (;;) {
    const found = predicate(current);
    if (found) return found;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function findGitRoot(cwd: string): string | null {
  return findAncestor(cwd, (dir) => {
    const gitDir = join(dir, '.git');
    return existsSync(gitDir) ? dir : null;
  });
}

function findInstructionRoot(cwd: string): { root: string; marker: string } | null {
  let current = resolve(cwd);

  for (;;) {
    for (const marker of PROJECT_MARKERS) {
      if (existsSync(join(current, marker))) {
        return { root: current, marker };
      }
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveProjectRoot(cwd: string): { root: string; source: 'git' | 'instruction' | 'cwd'; marker?: string } {
  const gitRoot = findGitRoot(cwd);
  if (gitRoot) {
    return { root: gitRoot, source: 'git' };
  }

  const instructionRoot = findInstructionRoot(cwd);
  if (instructionRoot) {
    return { root: instructionRoot.root, source: 'instruction', marker: instructionRoot.marker };
  }

  return { root: resolve(cwd), source: 'cwd' };
}

export function resolveProjectCwd(cwd: string): string {
  return resolveProjectRoot(cwd).root;
}

function isRelativeInside(baseDir: string, targetPath: string): boolean {
  const rel = relative(resolve(baseDir), resolve(targetPath));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function formatProjectRelativeSource(projectRoot: string, sourceDir: string): string {
  if (!isRelativeInside(projectRoot, sourceDir)) {
    return sourceDir;
  }

  const rel = relative(projectRoot, sourceDir);
  if (rel === '') {
    return '.';
  }

  const normalizedRel = rel.split(sep).join('/');
  return normalizedRel.startsWith('.') ? normalizedRel : `./${normalizedRel}`;
}

interface ProjectRootPreview {
  details?: Array<{ label: string; value: string }>;
}

export async function confirmProjectRoot(
  root: { root: string; source: 'git' | 'instruction' | 'cwd'; marker?: string },
  yes: boolean,
  preview: ProjectRootPreview = {},
): Promise<string> {
  if (root.source === 'git' || yes) {
    return root.root;
  }

  logger.warn('No default project root found.');
  if (root.source === 'instruction') {
    logger.info(`Guessed project root from ${root.marker ?? 'project marker'}: ${root.root}`);
  } else {
    logger.info(`Guessed project root: ${root.root}`);
  }

  if (preview.details && preview.details.length > 0) {
    logger.info('Expected project-local install layout:');
    for (const detail of preview.details) {
      logger.kv(detail.label, detail.value);
    }
  }

  // agent / CI 环境由程序调用，无法等待人工输入，等价 --yes：直接采用猜测的 project root。
  // 仅非 TTY（如管道重定向）不属于此类 —— 用户可能是在手动操作，仍需显式 --yes 确认。
  if (isAgentOrCIEnv()) {
    logger.info('Agent/CI environment detected, proceeding with guessed project root.');
    return root.root;
  }

  if (!process.stdin.isTTY) {
    throw new Error(`No default project root found. Re-run with --yes to install under ${root.root}.`);
  }

  const confirmed = await confirm(`Install project-local skills under ${root.root}? [y/N] `);
  if (!confirmed) {
    throw new Error('Aborted.');
  }

  return root.root;
}
