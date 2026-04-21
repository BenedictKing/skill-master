import { discoverCandidates } from '../discovery/search.js';
import { runRecommendation } from '../recommend/ranking.js';
import { verifyInstalledSkill } from '../verify/runtime-check.js';
import { runSmokeChecks } from '../verify/smoke.js';
import { detectSkillConflicts } from '../verify/conflict-check.js';
import * as logger from '../utils/logger.js';
import type { AgentPlatform, RecommendationPreferences } from '../types/index.js';
import { formatList, formatPreferences, installRecommendedCandidate } from './shared/recommend-helpers.js';

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
      ? await runSilenced(() => installRecommendedCandidate(
          task,
          best,
          flags.agent,
          process.cwd(),
          'Installed via solve --install; run or request verify for a full validation pass.',
        ))
      : await installRecommendedCandidate(
          task,
          best,
          flags.agent,
          process.cwd(),
          'Installed via solve --install; run or request verify for a full validation pass.',
        );
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
