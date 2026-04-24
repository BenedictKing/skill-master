import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getAgentSkillsDir, getSupportedPlatforms, type AgentPlatform } from '../../platform/agents.js';
import type { SkillCandidate } from '../../types/index.js';

const execFileAsync = promisify(execFile);
const SUPPORTED_AGENT_SET = new Set(getSupportedPlatforms());

interface GhSkillSearchResult {
  description?: string;
  path: string;
  repo: string;
  skillName: string;
  stars?: number;
}

function normalizeInstallHint(repo: string, skillPath: string, skillName: string): string {
  const normalizedPath = skillPath.replace(/(^|\/)SKILL\.md$/i, '');
  if (!normalizedPath || normalizedPath === skillName) {
    return `${repo}@${skillName}`;
  }
  return `${repo}/${normalizedPath}`;
}

function parseAgentsFromPath(skillPath: string): AgentPlatform[] {
  const normalized = skillPath.replace(/\/SKILL\.md$/i, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return [];

  const directAlias = segments[0];
  if (SUPPORTED_AGENT_SET.has(directAlias as AgentPlatform)) {
    return [directAlias as AgentPlatform];
  }

  const matches = getSupportedPlatforms().filter((agent) => {
    const skillsDir = getAgentSkillsDir(agent).replace(/\\/g, '/');
    if (skillsDir === 'skills') return false;
    return normalized === skillsDir || normalized.startsWith(`${skillsDir}/`);
  });

  return [...new Set(matches)];
}

function isLikelyRepublishedSkill(repo: string, skillPath: string): boolean {
  const normalized = skillPath.replace(/\/SKILL\.md$/i, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  if (SUPPORTED_AGENT_SET.has(segments[0] as AgentPlatform)) return false;

  const matchesKnownSkillsDir = getSupportedPlatforms().some((agent) => {
    const skillsDir = getAgentSkillsDir(agent).replace(/\\/g, '/');
    if (skillsDir === 'skills') return false;
    return normalized === skillsDir || normalized.startsWith(`${skillsDir}/`);
  });
  if (matchesKnownSkillsDir) return false;

  return segments[0].includes('.') || segments[0].includes('_');
}

async function fetchRepoForkInfo(repo: string): Promise<{ isFork: boolean; upstream?: string }> {
  try {
    const { stdout } = await execFileAsync('gh', ['repo', 'view', repo, '--json', 'isFork,parent'], {
      timeout: 15_000,
      env: {
        ...process.env,
        GH_PAGER: 'cat',
        PAGER: 'cat',
        NO_COLOR: '1',
      },
    });
    const parsed = JSON.parse(stdout) as { isFork?: boolean; parent?: { nameWithOwner?: string } | null };
    return {
      isFork: Boolean(parsed.isFork),
      upstream: parsed.parent?.nameWithOwner,
    };
  } catch {
    return { isFork: false };
  }
}

function buildWarnings(item: GhSkillSearchResult, agents: AgentPlatform[], upstream?: string, isFork?: boolean): string[] {
  const warnings: string[] = [];
  if (agents.length > 0) {
    warnings.push(`Declared agent hosts: ${agents.join(', ')}`);
  }
  if (upstream && isFork) {
    warnings.push(`Repository is a fork; upstream source available: ${upstream}`);
  } else if (isLikelyRepublishedSkill(item.repo, item.path)) {
    warnings.push('Skill path suggests this may be re-published from another source.');
  }
  return warnings;
}

export function parseGhSkillOutput(stdout: string): SkillCandidate[] {
  let items: GhSkillSearchResult[] = [];
  try {
    items = JSON.parse(stdout) as GhSkillSearchResult[];
  } catch {
    return [];
  }

  return items.map((item) => {
    const agents = parseAgentsFromPath(item.path);
    return {
      id: `gh-skill:${item.repo}:${item.skillName}`,
      provider: 'gh-skill',
      name: item.skillName,
      source: item.repo,
      installHint: normalizeInstallHint(item.repo, item.path, item.skillName),
      description: item.description,
      capabilities: [],
      allowedTools: [],
      envKeys: [],
      issues: [],
      warnings: buildWarnings(item, agents),
      installs: item.stars,
      providerMeta: {
        repo: item.repo,
        path: item.path,
        republished: isLikelyRepublishedSkill(item.repo, item.path),
      },
    };
  });
}

export async function searchGhSkill(query: string, preferredAgent?: AgentPlatform): Promise<SkillCandidate[]> {
  try {
    const { stdout } = await execFileAsync('gh', [
      'skill',
      'search',
      query,
      '--json',
      'repo,path,skillName,description,stars',
      '--limit',
      '25',
    ], {
      timeout: 30_000,
      env: {
        ...process.env,
        GH_PAGER: 'cat',
        PAGER: 'cat',
        NO_COLOR: '1',
      },
    });

    const base = parseGhSkillOutput(stdout);
    const filtered = !preferredAgent
      ? base
      : base.filter((candidate) => {
          const agents = parseAgentsFromPath(String(candidate.providerMeta?.path ?? ''));
          return agents.length === 0 || agents.includes(preferredAgent);
        });

    const enriched = await Promise.all(filtered.map(async (candidate) => {
      const forkInfo = await fetchRepoForkInfo(candidate.source);
      const warnings = [...candidate.warnings];
      if (forkInfo.isFork && forkInfo.upstream) {
        warnings.push(`Repository is a fork; upstream source available: ${forkInfo.upstream}`);
      }
      return {
        ...candidate,
        warnings,
        providerMeta: {
          ...candidate.providerMeta,
          isFork: forkInfo.isFork,
          upstreamRepo: forkInfo.upstream ?? null,
        },
      } satisfies SkillCandidate;
    }));

    return enriched;
  } catch {
    return [];
  }
}
