import { relative } from 'node:path';
import { installSkill } from '../../core/installer.js';
import { parseSource } from '../../core/git-source.js';
import { addSkillToLocalLock, computeSkillFolderHash } from '../../core/local-lock.js';
import type { AgentPlatform, RecommendationPreferences, SkillSource } from '../../types/index.js';

export interface PreferenceFlags extends RecommendationPreferences {
  json?: boolean;
  install?: boolean;
  verify?: boolean;
  agent?: AgentPlatform;
}

export function formatList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '-';
}

export function formatPreferences(flags: PreferenceFlags): string[] {
  const preferences: string[] = [];
  if (flags.safe) preferences.push('safe');
  if (flags.localFirst) preferences.push('local-first');
  if (flags.noRemote) preferences.push('no-remote');
  if (flags.preferInstalled) preferences.push('prefer-installed');
  return preferences;
}

export async function installRecommendedCandidate(
  task: string,
  recommendation: { candidate: { provider: string; parsedSource?: { url?: string; ref?: string } ; source: string; installHint: string; path?: string; name: string } },
  agent: AgentPlatform | undefined,
  cwd: string,
  warningMessage: string,
): Promise<{ skillName: string; agentPath: string; canonicalPath: string }> {
  const candidate = recommendation.candidate;
  let installSource: SkillSource;
  let skillDir: string | undefined;

  if (candidate.path) {
    skillDir = candidate.path;
  }

  if (candidate.provider === 'github' || candidate.provider === 'well-known') {
    const parsed = candidate.parsedSource ?? parseSource(candidate.source);
    installSource = skillDir
      ? { type: candidate.provider === 'well-known' ? 'well-known' as const : 'git' as const, url: parsed.url!, localPath: skillDir, displaySource: parsed.url! }
      : { type: candidate.provider === 'well-known' ? 'well-known' as const : 'git' as const, url: parsed.url!, branch: parsed.ref };
  } else if (skillDir) {
    installSource = { type: 'local', path: skillDir };
  } else {
    const parsed = parseSource(candidate.installHint);
    installSource = parsed.type === 'git'
      ? { type: 'git', url: parsed.url!, branch: parsed.ref }
      : { type: 'local', path: parsed.path! };
    skillDir = parsed.subpath;
  }

  const result = await installSkill({
    source: installSource,
    agent,
    cwd,
  });

  await addSkillToLocalLock(result.skillName, {
    source: candidate.source,
    sourceType: ['github', 'skills.sh', 'gh-skill', 'vercel', 'well-known'].includes(candidate.provider) ? 'github' : 'local',
    computedHash: await computeSkillFolderHash(result.canonicalPath),
    ...(skillDir ? { skillDir: relative(cwd, skillDir).startsWith('..') ? skillDir : relative(cwd, skillDir) } : {}),
    verification: {
      checked_at: new Date().toISOString(),
      envStatus: 'missing',
      warnings: [warningMessage],
      smokePassed: false,
    },
    composedFrom: [
      { kind: 'task', value: task },
      { kind: 'source', value: candidate.source },
      { kind: 'skill', value: candidate.name },
    ],
  }, cwd);

  return {
    skillName: result.skillName,
    agentPath: result.agentPath,
    canonicalPath: result.canonicalPath,
  };
}
