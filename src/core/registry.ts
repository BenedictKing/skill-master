import { existsSync } from 'node:fs';
import { REGISTRY_PATH } from '../utils/paths.js';
import { atomicWriteJson, readJsonSafe } from '../utils/fs-helpers.js';
import { RegistryCorruptError } from '../utils/errors.js';
import type { Registry, RegistryEntry } from '../types/index.js';

/** Create an empty registry */
function createEmptyRegistry(): Registry {
  return { version: 1, skills: {} };
}

/** Validate registry structure */
function validateRegistry(data: unknown): data is Registry {
  if (!data || typeof data !== 'object') return false;
  const reg = data as Record<string, unknown>;
  return reg.version === 1 && typeof reg.skills === 'object' && reg.skills !== null;
}

/** Read the registry, creating a new one if it doesn't exist */
export async function readRegistry(): Promise<Registry> {
  if (!existsSync(REGISTRY_PATH)) {
    return createEmptyRegistry();
  }

  const data = await readJsonSafe<Registry>(REGISTRY_PATH);
  if (!data) {
    throw new RegistryCorruptError('Failed to parse registry.json');
  }

  if (!validateRegistry(data)) {
    throw new RegistryCorruptError('Invalid registry structure');
  }

  return data;
}

/** Update or add a skill entry in the registry (atomic write) */
export async function updateRegistry(
  skillName: string,
  entry: RegistryEntry,
): Promise<void> {
  const registry = await readRegistry();
  registry.skills[skillName] = entry;
  await atomicWriteJson(REGISTRY_PATH, registry);
}

/** Remove a skill from the registry */
export async function removeFromRegistry(skillName: string): Promise<void> {
  const registry = await readRegistry();
  delete registry.skills[skillName];
  await atomicWriteJson(REGISTRY_PATH, registry);
}

/** List all registered skills */
export async function listRegistry(): Promise<Record<string, RegistryEntry>> {
  const registry = await readRegistry();
  return registry.skills;
}

/** Get a single registry entry */
export async function getRegistryEntry(skillName: string): Promise<RegistryEntry | null> {
  const registry = await readRegistry();
  return registry.skills[skillName] ?? null;
}