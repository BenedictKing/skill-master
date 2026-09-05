import { existsSync } from 'node:fs';
import { REGISTRY_PATH } from '../utils/paths.js';
import { atomicWriteJson, readJsonSafe } from '../utils/fs-helpers.js';
import { RegistryCorruptError } from '../utils/errors.js';
import type { Registry, RegistryEntry, RegistryEntryV1, AgentPlatform } from '../types/index.js';

/** Create an empty v2 registry */
function createEmptyRegistry(): Registry {
  return { version: 2, skills: {} };
}

/** Migrate a v1 entry to v2 format */
function migrateEntryV1(v1: RegistryEntryV1): RegistryEntry {
  return {
    source: v1.source,
    version: v1.version,
    installed_at: v1.installed_at,
    updated_at: v1.updated_at,
    agents: [{
      agent: v1.agent,
      agent_path: v1.agent_path,
      global: v1.agent_path.includes('/.agents/') || v1.agent_path.includes('\\.agents\\'),
    }],
    env_keys: v1.env_keys,
    capabilities: v1.capabilities,
    canonical_path: v1.canonical_path,
  };
}

/** Validate and auto-migrate registry */
function validateAndMigrate(data: unknown): Registry | null {
  if (!data || typeof data !== 'object') return null;
  const reg = data as Record<string, unknown>;
  if (typeof reg.skills !== 'object' || reg.skills === null) return null;

  // Already v2
  if (reg.version === 2) return data as Registry;

  // V1 → V2 migration
  if (reg.version === 1) {
    const v1Skills = reg.skills as Record<string, RegistryEntryV1>;
    const v2Skills: Record<string, RegistryEntry> = {};
    for (const [name, entry] of Object.entries(v1Skills)) {
      v2Skills[name] = migrateEntryV1(entry);
    }
    return { version: 2, skills: v2Skills };
  }

  return null;
}

/** Read the registry, auto-migrating v1 → v2 if needed */
export async function readRegistry(): Promise<Registry> {
  if (!existsSync(REGISTRY_PATH)) {
    return createEmptyRegistry();
  }

  const data = await readJsonSafe<unknown>(REGISTRY_PATH);
  if (!data) {
    throw new RegistryCorruptError('Failed to parse registry.json');
  }

  const registry = validateAndMigrate(data);
  if (!registry) {
    throw new RegistryCorruptError('Invalid registry structure');
  }

  // Persist migration if version changed
  if ((data as Record<string, unknown>).version !== registry.version) {
    await atomicWriteJson(REGISTRY_PATH, registry);
  }

  return registry;
}

/**
 * Update or add a skill entry in the registry (atomic write).
 * Merges agents: same agent → replace, new agent → append.
 */
export async function updateRegistry(
  skillName: string,
  entry: RegistryEntry,
): Promise<void> {
  const registry = await readRegistry();
  const existing = registry.skills[skillName];

  if (existing) {
    // Merge agents: replace matching, append new
    for (const newAgent of entry.agents) {
      const idx = existing.agents.findIndex(a => a.agent === newAgent.agent);
      if (idx >= 0) {
        existing.agents[idx] = newAgent;
      } else {
        existing.agents.push(newAgent);
      }
    }
    // Update other fields
    existing.source = entry.source;
    existing.version = entry.version;
    existing.updated_at = entry.updated_at;
    existing.env_keys = entry.env_keys;
    existing.capabilities = entry.capabilities;
    existing.canonical_path = entry.canonical_path;
  } else {
    registry.skills[skillName] = entry;
  }

  await atomicWriteJson(REGISTRY_PATH, registry);
}

/** Remove a single agent record from a skill. Removes entire entry if last agent. */
export async function removeAgentFromRegistry(
  skillName: string,
  agent: AgentPlatform,
): Promise<void> {
  const registry = await readRegistry();
  const entry = registry.skills[skillName];
  if (!entry) return;

  entry.agents = entry.agents.filter(a => a.agent !== agent);
  if (entry.agents.length === 0) {
    delete registry.skills[skillName];
  }
  await atomicWriteJson(REGISTRY_PATH, registry);
}

/** Remove a skill entirely from the registry */
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

/** Find all skill names installed from a given source (case-insensitive, URL-form tolerant) */
export async function findSkillsBySource(source: string): Promise<string[]> {
  const registry = await readRegistry();
  const target = normalizeSourceKey(source);
  const names: string[] = [];
  for (const [name, entry] of Object.entries(registry.skills)) {
    if (entry.source && normalizeSourceKey(entry.source) === target) {
      names.push(name);
    }
  }
  return names;
}

/** Normalize a source string for comparison: lowercase, strip protocol/.git/trailing slash */
function normalizeSourceKey(source: string): string {
  return source
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^git@(github\.com):/, '$1/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
}

/** Get a single registry entry */
export async function getRegistryEntry(skillName: string): Promise<RegistryEntry | null> {
  const registry = await readRegistry();
  return registry.skills[skillName] ?? null;
}
