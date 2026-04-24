import { existsSync } from 'node:fs';
import { parseSource } from '../core/git-source.js';
import type { AgentPlatform, SkillCandidate } from '../types/index.js';
import { searchSkillsSh } from './providers/skills-sh.js';
import { discoverFromSource, discoverFromLocalPath } from './providers/github.js';
import { discoverFromPluginManifest } from './providers/local.js';
import { discoverFromNodeModules } from './providers/node-modules.js';
import { discoverInstalledSkills } from './providers/registry.js';
import { searchGhSkill } from './providers/gh-skill.js';
import { searchVercelSkills } from './providers/vercel.js';

export { searchSkillsSh } from './providers/skills-sh.js';
export { discoverFromSource, discoverFromLocalPath } from './providers/github.js';
export { discoverFromPluginManifest } from './providers/local.js';
export { discoverFromNodeModules } from './providers/node-modules.js';
export { discoverInstalledSkills } from './providers/registry.js';
export { searchGhSkill } from './providers/gh-skill.js';
export { searchVercelSkills } from './providers/vercel.js';

export async function discoverCandidates(query: string, cwd: string, preferredAgent?: AgentPlatform): Promise<SkillCandidate[]> {
  const results: SkillCandidate[] = [];

  if (query.trim()) {
    try {
      results.push(...await searchSkillsSh(query));
    } catch {
      // ignore and continue with other sources
    }

    try {
      results.push(...await searchGhSkill(query, preferredAgent));
    } catch {
      // ignore optional provider failures
    }

    try {
      results.push(...await searchVercelSkills(query));
    } catch {
      // ignore optional provider failures
    }
  }

  try {
    results.push(...await discoverFromLocalPath(cwd, false, cwd, { type: 'local', path: cwd }));
  } catch {
    // ignore local project scan failures
  }

  if (existsSync(query)) {
    try {
      results.push(...await discoverFromLocalPath(query, false, query, parseSource(query)));
    } catch {
      // ignore malformed local sources
    }
  } else {
    try {
      const parsed = parseSource(query);
      if (parsed.type === 'local') {
        results.push(...await discoverFromLocalPath(parsed.path!, false, query, parsed));
      } else {
        results.push(...await discoverFromSource(query));
      }
    } catch {
      // query is not a source, continue
    }
  }

  try {
    results.push(...await discoverFromNodeModules(cwd));
  } catch {
    // ignore
  }

  try {
    results.push(...await discoverFromPluginManifest(cwd));
  } catch {
    // ignore
  }

  try {
    const installed = await discoverInstalledSkills();
    const needle = query.toLowerCase();
    results.push(...installed.filter((item) => item.name.toLowerCase().includes(needle) || item.source.toLowerCase().includes(needle)));
  } catch {
    // ignore
  }

  const deduped = new Map<string, SkillCandidate>();
  for (const candidate of results) {
    const key = `${candidate.provider}:${candidate.name}:${candidate.source}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()];
}
