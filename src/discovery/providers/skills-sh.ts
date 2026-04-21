import type { SkillCandidate } from '../../types/index.js';

interface SearchSkillsShResult {
  name?: string;
  source?: string;
  installs?: number;
}

interface SearchSkillsShResponse {
  skills?: SearchSkillsShResult[];
}

export async function searchSkillsSh(query: string): Promise<SkillCandidate[]> {
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Search API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as SearchSkillsShResponse;
  return (data.skills ?? []).map((item) => {
    const name = item.name ?? 'unknown';
    const source = item.source ?? name;
    return {
      id: `skills.sh:${source}:${name}`,
      provider: 'skills.sh',
      name,
      source,
      installHint: source,
      description: undefined,
      installs: item.installs ?? 0,
      capabilities: [],
      allowedTools: [],
      envKeys: [],
      issues: [],
      warnings: [],
    } satisfies SkillCandidate;
  });
}
