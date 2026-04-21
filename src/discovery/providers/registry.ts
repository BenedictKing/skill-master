import { listRegistry } from '../../core/registry.js';
import type { SkillCandidate } from '../../types/index.js';

export async function discoverInstalledSkills(): Promise<SkillCandidate[]> {
  const registry = await listRegistry();
  return Object.entries(registry).map(([name, entry]) => ({
    id: `registry:${entry.source}:${name}`,
    provider: 'registry',
    name,
    source: entry.source,
    installHint: entry.source,
    description: `Installed on ${entry.agents.map((agent) => agent.agent).join(', ')}`,
    version: entry.version,
    capabilities: entry.capabilities,
    allowedTools: [],
    envKeys: entry.env_keys,
    issues: [],
    warnings: [],
    installed: true,
    providerMeta: {
      installedAt: entry.installed_at,
      updatedAt: entry.updated_at,
      canonicalPath: entry.canonical_path,
    },
  }));
}
