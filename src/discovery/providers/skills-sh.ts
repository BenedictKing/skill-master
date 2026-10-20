import type { SkillCandidate } from '../../types/index.js';

interface SearchSkillsShResult {
  name?: string;
  source?: string;
  installs?: number;
}

interface SearchSkillsShResponse {
  skills?: SearchSkillsShResult[];
}

export interface SearchSkillsShOptions {
  /** 限定来源 owner（跨组织搜索时按服务端 owner= 过滤） */
  owner?: string;
}

export function searchSkillsSh(query: string, options: SearchSkillsShOptions = {}): Promise<SkillCandidate[]> {
  const base = (process.env.SKILL_MASTER_SKILLS_API_URL?.trim() || 'https://skills.sh').replace(/\/+$/, '');
  const params = new URLSearchParams({ q: query });
  if (options.owner) params.set('owner', options.owner);
  const url = `${base}/api/search?${params.toString()}`;

  return requestSkillsSh(url);
}

async function requestSkillsSh(url: string): Promise<SkillCandidate[]> {
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
