import { relative } from 'node:path';
import { installSkill } from '../core/installer.js';
import { parseSource } from '../core/git-source.js';
import { addSkillToLocalLock, computeSkillFolderHash } from '../core/local-lock.js';
import { runRecommendation } from '../recommend/ranking.js';
import * as logger from '../utils/logger.js';
import type { AgentPlatform, RecommendationPreferences, SkillSource } from '../types/index.js';

interface RecommendFlags extends RecommendationPreferences {
  install: boolean;
  json: boolean;
  agent?: AgentPlatform;
}

function parseFlags(args: string[]): { task: string; flags: RecommendFlags } {
  const flags: RecommendFlags = {
    install: false,
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

function formatTier(tier: string): string {
  return tier.toUpperCase();
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '-';
}

function formatPreferences(flags: RecommendFlags): string[] {
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
): Promise<void> {
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
      warnings: ['Installed via recommend --install; run verify for a full validation pass.'],
      smokePassed: false,
    },
    composedFrom: [
      { kind: 'task', value: task },
      { kind: 'source', value: candidate.source },
      { kind: 'skill', value: candidate.name },
    ],
  }, cwd);

  logger.success(`Installed recommended skill ${result.skillName}`);
  logger.kv('Canonical Path', result.canonicalPath);
  logger.kv('Agent Path', result.agentPath);
}

export async function recommend(args: string[]): Promise<void> {
  const { task, flags } = parseFlags(args);
  if (!task) {
    console.log('Usage: skill-master recommend <task> [--install] [-a <agent>] [--safe] [--local-first] [--no-remote] [--prefer-installed] [--json]');
    console.log('');
    console.log('Recommend skills for a user task, optionally installing the best match.');
    process.exit(0);
  }

  const preferences = {
    safe: flags.safe,
    localFirst: flags.localFirst,
    noRemote: flags.noRemote,
    preferInstalled: flags.preferInstalled,
  };
  const run = await runRecommendation(task, process.cwd(), preferences);
  if (run.recommendations.length === 0) {
    logger.warn('No recommendations found.');
    return;
  }

  if (flags.json) {
    console.log(JSON.stringify({
      task: run.task,
      preferences,
      recommendations: run.recommendations,
    }, null, 2));
    if (!flags.install) return;
  }

  if (!flags.json) {
    logger.blank();
    logger.info(`Task: ${run.task.normalized}`);
    logger.kv('Keywords', formatList(run.task.keywords));
    logger.kv('Capabilities', formatList(run.task.capabilities));
    logger.kv('Risk Tolerance', run.task.riskTolerance);
    logger.kv('Preferences', formatList(formatPreferences(flags)));

    for (const recommendation of run.recommendations) {
      logger.blank();
      logger.info(`${formatTier(recommendation.tier)}: ${recommendation.candidate.name}`);
      logger.kv('Source', recommendation.candidate.source);
      logger.kv('Provider', recommendation.candidate.provider);
      logger.kv('Install Hint', recommendation.candidate.installHint);
      logger.kv('Description', recommendation.candidate.description ?? '-');
      logger.kv('Overall Score', String(recommendation.evaluation.overallScore));
      logger.kv('Match Score', String(recommendation.evaluation.matchScore));
      logger.kv('Quality Score', String(recommendation.evaluation.qualityScore));
      logger.kv('Safety Score', String(recommendation.evaluation.safetyScore));
      logger.kv('Maintainability', String(recommendation.evaluation.maintenanceScore));
      logger.kv('Risk', recommendation.evaluation.riskLevel);
      logger.kv('Install Complexity', recommendation.evaluation.installComplexity);
      logger.kv('Matched Capabilities', formatList(recommendation.evaluation.matchedCapabilities));
      logger.kv('Missing Capabilities', formatList(recommendation.evaluation.missingCapabilities));
      logger.kv('Strengths', formatList(recommendation.evaluation.strengths));
      logger.kv('Risks', formatList(recommendation.evaluation.risks));
      logger.kv('Notes', formatList(recommendation.evaluation.notes));
      logger.kv('Rationale', recommendation.rationale.join(' | '));
    }

    if (!flags.install) {
      logger.blank();
      return;
    }
  }

  const best = run.recommendations[0];
  if (!flags.json) {
    logger.blank();
    logger.info(`Installing best recommendation: ${best.candidate.name}`);
  }
  await installRecommendedCandidate(task, best, flags.agent, process.cwd());
  if (!flags.json) {
    logger.kv('Next', `Run "skill-master verify ${best.candidate.name}" for post-install validation`);
  }
}
