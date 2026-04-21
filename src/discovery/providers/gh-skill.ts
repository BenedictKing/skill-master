import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SkillCandidate } from '../../types/index.js';

const execFileAsync = promisify(execFile);

export async function searchGhSkill(query: string): Promise<SkillCandidate[]> {
  try {
    const { stdout } = await execFileAsync('gh', ['skill', 'search', query], { timeout: 15_000 });
    const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const candidates: SkillCandidate[] = [];

    for (const line of lines) {
      const match = line.match(/^([\w.-]+(?:\/[\w.-]+)+)\s+(?:★\s*(\d+))?/);
      if (!match) continue;
      const source = match[1];
      const name = source.split('/').at(-1) ?? source;
      candidates.push({
        id: `gh-skill:${source}:${name}`,
        provider: 'gh-skill',
        name,
        source,
        installHint: source,
        capabilities: [],
        allowedTools: [],
        envKeys: [],
        issues: [],
        warnings: ['Parsed from gh skill CLI output; metadata may be incomplete.'],
        installs: match[2] ? Number(match[2]) : undefined,
      });
    }

    return candidates;
  } catch {
    return [];
  }
}
