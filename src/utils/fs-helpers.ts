import { mkdir, cp, readFile, writeFile, rename, symlink, lstat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

/** Ensure a directory exists (recursive) */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Recursively copy a directory */
export async function copyDir(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  await cp(src, dest, { recursive: true, force: true });
}

/** Remove a directory or file recursively */
export async function removePath(target: string): Promise<void> {
  if (existsSync(target)) {
    await rm(target, { recursive: true, force: true });
  }
}

/** Atomic JSON write: write to .tmp then rename */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  await rename(tmpPath, filePath);
}

/** Safely read and parse a JSON file, return null on failure */
export async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** Read a text file, return null if not found */
export async function readTextSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** Write text to a file, ensuring parent directory exists */
export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, 'utf-8');
}

/** Create a symlink, or copy if symlink fails (Windows fallback) */
export async function symlinkOrCopy(target: string, linkPath: string, forceCopy = false): Promise<'symlink' | 'copy'> {
  await ensureDir(dirname(linkPath));

  // Remove existing link/dir
  await removePath(linkPath);

  if (forceCopy) {
    await copyDir(target, linkPath);
    return 'copy';
  }

  try {
    await symlink(target, linkPath, 'dir');
    return 'symlink';
  } catch {
    // Fallback to copy on platforms that don't support symlinks
    await copyDir(target, linkPath);
    return 'copy';
  }
}

/** Check if a path is a symlink */
export async function isSymlink(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Create a temporary directory with a unique name */
export function createTempDir(): string {
  const id = randomBytes(8).toString('hex');
  return join(tmpdir(), `skill-manager-${id}`);
}
