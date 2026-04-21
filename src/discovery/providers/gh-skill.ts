import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SkillCandidate } from '../../types/index.js';

const execFileAsync = promisify(execFile);

function parseInstalls(installsRaw?: string): number | undefined {
  if (!installsRaw) return undefined;
  const normalized = installsRaw.toLowerCase().replace(/,/g, '');
  let installs: number;
  if (normalized.endsWith('k')) {
    installs = Math.round(parseFloat(normalized) * 1000);
  } else if (normalized.endsWith('m')) {
    installs = Math.round(parseFloat(normalized) * 1_000_000);
  } else {
    installs = parseInt(normalized, 10);
  }
  return Number.isNaN(installs) ? undefined : installs;
}

export function parseGhSkillOutput(stdout: string): SkillCandidate[] {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  const candidates: SkillCandidate[] = [];

  for (const line of lines) {
    // gh skill search 输出格式：repo\tskill-path\tdescription\tinstalls
    const parts = line.split('\t').map((p) => p.trim());
    if (parts.length < 2) continue;

    const repo = parts[0];
    const skillPath = parts[1];
    const description = parts[2] || undefined;
    const installsRaw = parts[3];
    const name = skillPath.split('/').at(-1) || repo.split('/').at(-1) || repo;
    const installHint = skillPath && skillPath !== name ? `${repo}@${name}` : repo;

    candidates.push({
      id: `gh-skill:${repo}:${name}`,
      provider: 'gh-skill',
      name,
      source: repo,
      installHint,
      description,
      capabilities: [],
      allowedTools: [],
      envKeys: [],
      issues: [],
      warnings: ['Parsed from gh skill CLI output; metadata may be incomplete.'],
      installs: parseInstalls(installsRaw),
    });
  }

  return candidates;
}

export async function searchGhSkill(query: string): Promise<SkillCandidate[]> {
  try {
    const { stdout } = await execFileAsync('gh', ['skill', 'search', query], {
      timeout: 30_000,
      env: {
        ...process.env,
        GH_PAGER: 'cat',
        PAGER: 'cat',
        NO_COLOR: '1',
      },
    });
    return parseGhSkillOutput(stdout);
  } catch {
    return [];
  }
}
