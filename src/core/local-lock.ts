import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { atomicWriteJson, readJsonSafe } from '../utils/fs-helpers.js';
import type { LocalLock, LocalLockEntry } from '../types/index.js';

const LOCK_FILENAME = 'skills-lock.json';

/** Excluded entries when computing skill folder hash */
const HASH_EXCLUDES = new Set(['.env', '.git', 'node_modules']);

/** Get the lock file path for a project */
export function getLocalLockPath(cwd: string): string {
  return join(cwd, LOCK_FILENAME);
}

/** Create an empty lock structure */
function createEmptyLock(): LocalLock {
  return { version: 1, skills: {} };
}

/** Read the local lock file; returns empty structure if missing or corrupt */
export async function readLocalLock(cwd: string): Promise<LocalLock> {
  const lockPath = getLocalLockPath(cwd);
  const data = await readJsonSafe<LocalLock>(lockPath);
  if (
    !data || typeof data !== 'object' ||
    data.version !== 1 ||
    data.skills === null || Array.isArray(data.skills) ||
    typeof data.skills !== 'object'
  ) {
    return createEmptyLock();
  }
  return data;
}

/** Write the local lock file with skills sorted alphabetically */
export async function writeLocalLock(lock: LocalLock, cwd: string): Promise<void> {
  const lockPath = getLocalLockPath(cwd);
  const sorted: Record<string, LocalLockEntry> = {};
  for (const key of Object.keys(lock.skills).sort()) {
    sorted[key] = lock.skills[key];
  }
  await atomicWriteJson(lockPath, { version: lock.version, skills: sorted });
}

/** Recursively compute SHA-256 hash of a skill directory */
export async function computeSkillFolderHash(dirPath: string): Promise<string> {
  const hash = createHash('sha256');
  await hashDir(dirPath, '', hash);
  return hash.digest('hex');
}

/** Recursively hash directory contents in sorted order */
async function hashDir(basePath: string, relativePath: string, hash: ReturnType<typeof createHash>): Promise<void> {
  const fullPath = relativePath ? join(basePath, relativePath) : basePath;
  const entries = await readdir(fullPath, { withFileTypes: true });
  const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    if (HASH_EXCLUDES.has(entry.name)) continue;

    const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await hashDir(basePath, entryRelative, hash);
    } else if (entry.isFile()) {
      // Use null byte separator to prevent path/content boundary ambiguity
      hash.update(entryRelative);
      hash.update('\0');
      const content = await readFile(join(basePath, entryRelative));
      hash.update(content);
      hash.update('\0');
    }
  }
}

/** Add or update a skill entry in the local lock */
export async function addSkillToLocalLock(skillName: string, entry: LocalLockEntry, cwd: string): Promise<void> {
  const lock = await readLocalLock(cwd);
  lock.skills[skillName] = entry;
  await writeLocalLock(lock, cwd);
}

/** Remove a skill entry from the local lock */
export async function removeSkillFromLocalLock(skillName: string, cwd: string): Promise<void> {
  const lock = await readLocalLock(cwd);
  if (!(skillName in lock.skills)) return;
  delete lock.skills[skillName];
  await writeLocalLock(lock, cwd);
}
