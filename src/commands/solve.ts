import { relative } from 'node:path';
import { discoverCandidates } from '../discovery/search.js';
import { runRecommendation } from '../recommend/ranking.js';
import { verifyInstalledSkill } from '../verify/runtime-check.js';
import { runSmokeChecks } from '../verify/smoke.js';
import { detectSkillConflicts } from '../verify/conflict-check.js';
import { installSkill } from '../core/installer.js';
import { parseSource } from '../core/git-source.js';
import { addSkillToLocalLock, computeSkillFolderHash } from '../core/local-lock.js';
import * as logger from '../utils/logger.js';
import type { AgentPlatform, RecommendationPreferences, SkillSource } from '../types/index.js';

interface SolveFlags extends RecommendationPreferences {
  install: boolean;
  verify: boolean;
  json: boolean;
  agent?: AgentPlatform;
}

function parseSolveArgs(args: string[]): { task: string; flags: SolveFlags } {
  const flags: SolveFlags = {
    install: false,
    verify: false,
    json: false,
    safe: false,
    localFirst: false,
    noRemote: false,
    preferInstalled: false,
  };
  const words: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--install') {
      flags.install = true;
      continue;
    }
    if (arg === '--verify') {
      flags.verify = true;
      continue;
    }
    if (arg === '--json') {
      flags.json = true;
      continue;
    }
    if (arg === '--safe') {
      flags.safe = true;
      continue;
    }
    if (arg === '--local-first') {
      flags.localFirst = true;
      continue;
    }
    if (arg === '--no-remote') {
      flags.noRemote = true;
      continue;
    }
    if (arg === '--prefer-installed') {
      flags.preferInstalled = true;
      continue;
    }
    if ((arg === '-a' || arg === '--agent') && args[i + 1]) {
      flags.agent = args[i + 1] as AgentPlatform;
      i++;
      continue;
    }
    if (!arg.startsWith('-')) {
      words.push(arg);
    }
  }

  return {
    task: words.join(' ').trim(),
    flags,
  };
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '-';
}

function formatPreferences(flags: SolveFlags): string[] {
  const preferences: string[] = [];
  if (flags.safe) preferences.push('safe');
  if (flags.localFirst) preferences.push('local-first');
  if (flags.noRemote) preferences.push('no-remote');
  if (flags.preferInstalled) preferences.push('prefer-installed');
  return preferences;
}

async function installRecommendedCandidate(
  task: string,
  recommendation: Awaited<ReturnType<typeof runRecommendation>>['recommendations'][number],
  agent: AgentPlatform | undefined,
  cwd: string,
): Promise<{ skillName: string; agentPath: string; canonicalPath: string }> {
  const candidate = recommendation.candidate;
  let installSource: SkillSource;
  let skillDir: string | undefined;

  if (candidate.path) {
    skillDir = candidate.path;
  }

  if (candidate.provider === 'github') {
    const parsed = candidate.parsedSource ?? parseSource(candidate.source);
    installSource = skillDir
      ? { type: 'git', url: parsed.url!, branch: parsed.ref, localPath: skillDir }
      : { type: 'git', url: parsed.url!, branch: parsed.ref };
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
    sourceType: candidate.provider === 'github' || candidate.provider === 'skills.sh' ? 'github' : 'local',
    computedHash: await computeSkillFolderHash(result.canonicalPath),
    ...(skillDir ? { skillDir: relative(cwd, skillDir).startsWith('..') ? skillDir : relative(cwd, skillDir) } : {}),
    verification: {
      checked_at: new Date().toISOString(),
      envStatus: 'missing',
      warnings: ['Installed via solve --install; run or request verify for a full validation pass.'],
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

async function verifySkill(skillName: string, cwd: string) {
  const baseReport = await verifyInstalledSkill(skillName, cwd);
  const conflicts = await detectSkillConflicts(skillName);
  return runSmokeChecks({
    ...baseReport,
    conflicts: [...baseReport.conflicts, ...conflicts],
  });
}

async function runSilenced<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

export async function solve(args: string[]): Promise<void> {
  const { task, flags } = parseSolveArgs(args);
  if (!task) {
    console.log('Usage: skill-master solve <task> [--install] [--verify] [--json] [--safe] [--local-first] [--no-remote] [--prefer-installed]');
    console.log('');
    console.log('Run discovery and recommendation as a single workflow, with optional install/verify steps.');
    process.exit(0);
  }

  const preferences: RecommendationPreferences = {
    safe: flags.safe,
    localFirst: flags.localFirst,
    noRemote: flags.noRemote,
    preferInstalled: flags.preferInstalled,
  };

  const candidates = await discoverCandidates(task, process.cwd());
  const recommendationRun = await runRecommendation(task, process.cwd(), preferences);
  const best = recommendationRun.recommendations[0];

  const payload: Record<string, unknown> = {
    task: recommendationRun.task,
    preferences,
    candidateCount: candidates.length,
    recommendations: recommendationRun.recommendations,
    steps: {
      discovered: true,
      recommended: recommendationRun.recommendations.length > 0,
      installed: false,
      verified: false,
    },
    summary: {
      bestMatch: best?.candidate.name ?? null,
      preferenceLabels: formatPreferences(flags),
    },
  };

  if (flags.install && best) {
    const installResult = flags.json
      ? await runSilenced(() => installRecommendedCandidate(task, best, flags.agent, process.cwd()))
      : await installRecommendedCandidate(task, best, flags.agent, process.cwd());
    payload['installation'] = installResult;
    (payload.steps as Record<string, boolean>).installed = true;
  }

  const verifyTarget = best?.candidate.installed
    ? best.candidate.name
    : (payload['installation'] as { skillName?: string } | undefined)?.skillName;

  if (flags.verify && verifyTarget) {
    payload['verification'] = await verifySkill(verifyTarget, process.cwd());
    (payload.steps as Record<string, boolean>).verified = true;
  }

  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  logger.blank();
  logger.info(`Solve task: ${task}`);
  logger.kv('Candidates', String(candidates.length));
  logger.kv('Recommendations', String(recommendationRun.recommendations.length));
  logger.kv('Best Match', best?.candidate.name ?? '-');
  logger.kv('Preferences', formatList(formatPreferences(flags)));
  logger.kv('Install Requested', String(flags.install));
  logger.kv('Verify Requested', String(flags.verify));

  if (payload['installation']) {
    const installation = payload['installation'] as { skillName: string; agentPath: string; canonicalPath: string };
    logger.kv('Installed Skill', installation.skillName);
    logger.kv('Agent Path', installation.agentPath);
  }

  if (payload['verification']) {
    const verification = payload['verification'] as { smokePassed: boolean; envStatus: string };
    logger.kv('Verification', `smoke=${verification.smokePassed}, env=${verification.envStatus}`);
  }

  logger.blank();
}
