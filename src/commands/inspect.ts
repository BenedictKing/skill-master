import { discoverCandidates, discoverFromSource, discoverInstalledSkills } from '../discovery/search.js';
import { buildTaskRequirement } from '../evaluate/matcher.js';
import { evaluateCandidate } from '../evaluate/scorer.js';
import * as logger from '../utils/logger.js';
import type { SkillCandidate } from '../types/index.js';

function formatList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '-';
}

export async function inspect(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const target = args.filter((arg) => !arg.startsWith('-')).join(' ').trim();

  if (!target) {
    console.log('Usage: skill-master inspect <source|skill> [--json]');
    console.log('');
    console.log('Inspect a skill source or installed skill with static analysis.');
    process.exit(0);
  }

  let candidates = await discoverCandidates(target, process.cwd());
  if (candidates.length === 0) {
    candidates = await discoverFromSource(target).catch(async () => {
      const installed = await discoverInstalledSkills();
      return installed.filter((candidate: SkillCandidate) => candidate.name === target);
    });
  }

  if (candidates.length === 0) {
    logger.error(`No candidate found for ${target}`);
    process.exit(1);
  }

  const task = buildTaskRequirement(target);
  const inspected = candidates.slice(0, 5).map((candidate) => ({
    candidate,
    evaluation: evaluateCandidate(task, candidate),
  }));

  if (json) {
    console.log(JSON.stringify({
      target,
      task,
      results: inspected,
    }, null, 2));
    return;
  }

  logger.blank();
  logger.info(`Inspection target: ${target}`);
  logger.kv('Task Keywords', formatList(task.keywords));
  logger.kv('Task Capabilities', formatList(task.capabilities));

  for (const item of inspected) {
    const { candidate, evaluation: report } = item;
    logger.blank();
    logger.info(`Inspecting ${candidate.name}`);
    logger.kv('Provider', candidate.provider);
    logger.kv('Source', candidate.source);
    logger.kv('Install Hint', candidate.installHint);
    logger.kv('Description', candidate.description ?? '-');
    logger.kv('Version', candidate.version ?? '-');
    logger.kv('Author', candidate.author ?? '-');
    logger.kv('Capabilities', formatList(candidate.capabilities));
    logger.kv('Allowed Tools', formatList(candidate.allowedTools));
    logger.kv('Env Keys', formatList(candidate.envKeys));
    logger.kv('Warnings', formatList(candidate.warnings));
    logger.kv('Risk Level', report.riskLevel);
    logger.kv('Overall Score', String(report.overallScore));
    logger.kv('Match Score', String(report.matchScore));
    logger.kv('Quality Score', String(report.qualityScore));
    logger.kv('Safety Score', String(report.safetyScore));
    logger.kv('Maintainability', String(report.maintenanceScore));
    logger.kv('Matched Capabilities', formatList(report.matchedCapabilities));
    logger.kv('Missing Capabilities', formatList(report.missingCapabilities));
    logger.kv('Strengths', formatList(report.strengths));
    logger.kv('Risks', formatList(report.risks));
    logger.kv('Notes', formatList(report.notes));
  }

  logger.blank();
}
