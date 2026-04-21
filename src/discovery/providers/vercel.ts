import { parseSkillMd } from '../../core/skill-parser.js';
import { inferCapabilities } from '../../core/skill-parser.js';
import type { SkillCandidate } from '../../types/index.js';

const VERCEL_REPO = 'vercel-labs/agent-skills';
const CONTENTS_URL = `https://api.github.com/repos/${VERCEL_REPO}/contents/skills`;
const RAW_BASE_URL = `https://raw.githubusercontent.com/${VERCEL_REPO}/main/skills`;
const QUERY_HINTS = ['vercel', 'react', 'native', 'design', 'transition', 'deploy', 'composition', 'token'];

interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

function shouldSearchVercel(query: string): boolean {
  const normalized = query.toLowerCase();
  return QUERY_HINTS.some((hint) => normalized.includes(hint));
}

function matchesDirectory(query: string, dirName: string): boolean {
  const normalizedQuery = query.toLowerCase();
  const normalizedDir = dirName.toLowerCase();
  if (normalizedQuery.includes('vercel')) return true;
  return normalizedQuery.split(/[^a-z0-9]+/i).filter(Boolean).some((token) => normalizedDir.includes(token));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'skill-master',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }
  return await response.json() as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain',
      'User-Agent': 'skill-master',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Raw fetch returned ${response.status}: ${response.statusText}`);
  }
  return await response.text();
}

async function fetchSkillDirectories(): Promise<GitHubContentItem[]> {
  const items = await fetchJson<GitHubContentItem[]>(CONTENTS_URL);
  return items.filter((item) => item.type === 'dir');
}

async function loadCandidate(dirName: string): Promise<SkillCandidate | null> {
  try {
    const content = await fetchText(`${RAW_BASE_URL}/${dirName}/SKILL.md`);
    const parsed = parseSkillMd(content, dirName);
    const skillName = parsed.frontmatter.name ?? dirName;
    return {
      id: `vercel:${VERCEL_REPO}:${skillName}`,
      provider: 'vercel',
      name: skillName,
      source: `${VERCEL_REPO}/${dirName}`,
      installHint: `${VERCEL_REPO}@${skillName}`,
      description: parsed.frontmatter.description,
      version: parsed.frontmatter.version,
      author: parsed.frontmatter.author,
      frontmatter: parsed.frontmatter,
      capabilities: parsed.frontmatter.capabilities ?? inferCapabilities(parsed.frontmatter['allowed-tools'] ?? []),
      allowedTools: parsed.frontmatter['allowed-tools'] ?? [],
      envKeys: [],
      issues: [],
      warnings: ['Metadata fetched from Vercel official public repository'],
      providerMeta: {
        repo: VERCEL_REPO,
        directory: dirName,
        rawSkillUrl: `${RAW_BASE_URL}/${dirName}/SKILL.md`,
      },
    };
  } catch {
    return null;
  }
}

export async function searchVercelSkills(query: string): Promise<SkillCandidate[]> {
  if (!shouldSearchVercel(query)) {
    return [];
  }

  try {
    const directories = await fetchSkillDirectories();
    const matched = directories.filter((item) => matchesDirectory(query, item.name));
    const candidates = await Promise.all(matched.map((item) => loadCandidate(item.name)));
    return candidates.filter((candidate): candidate is SkillCandidate => candidate !== null);
  } catch {
    return [];
  }
}
