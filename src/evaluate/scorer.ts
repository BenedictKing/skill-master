import type { Capability, EvaluationReport, SkillCandidate, TaskRequirement } from '../types/index.js';
import { evaluateMaintainability } from './maintainability.js';
import { evaluateQuality } from './quality-audit.js';
import { evaluateSecurity } from './security-audit.js';

function scoreCapabilities(taskCaps: Capability[], candidateCaps: Capability[]): {
  matchScore: number;
  matched: Capability[];
  missing: Capability[];
} {
  if (taskCaps.length === 0) {
    return { matchScore: 60, matched: [], missing: [] };
  }

  const matched = taskCaps.filter((cap) => candidateCaps.includes(cap));
  const missing = taskCaps.filter((cap) => !candidateCaps.includes(cap));
  const matchScore = Math.round((matched.length / taskCaps.length) * 100);
  return { matchScore, matched, missing };
}

function scoreKeywordOverlap(task: TaskRequirement, candidate: SkillCandidate): number {
  if (task.keywords.length === 0) return 0;
  const haystack = `${candidate.name} ${candidate.description ?? ''} ${candidate.source}`.toLowerCase();
  const hits = task.keywords.filter((keyword) => haystack.includes(keyword));
  return Math.min(100, Math.round((hits.length / task.keywords.length) * 100));
}

export function evaluateCandidate(task: TaskRequirement, candidate: SkillCandidate): EvaluationReport {
  const capabilityScore = scoreCapabilities(task.capabilities, candidate.capabilities);
  const keywordScore = scoreKeywordOverlap(task, candidate);
  const matchScore = Math.round(capabilityScore.matchScore * 0.7 + keywordScore * 0.3);
  const quality = evaluateQuality(candidate);
  const security = evaluateSecurity(candidate);
  const maintainability = evaluateMaintainability(candidate);

  const overallScore = Math.round(
    matchScore * 0.4 +
    quality.score * 0.2 +
    security.score * 0.25 +
    maintainability.score * 0.15
  );

  const complexity = candidate.envKeys.length > 0 || candidate.allowedTools.includes('Bash')
    ? candidate.envKeys.length > 1 || candidate.allowedTools.includes('Task')
      ? 'high'
      : 'medium'
    : 'low';

  return {
    candidateId: candidate.id,
    matchScore,
    qualityScore: quality.score,
    maintenanceScore: maintainability.score,
    safetyScore: security.score,
    overallScore,
    installComplexity: complexity,
    riskLevel: security.riskLevel,
    strengths: [...quality.strengths],
    risks: [...quality.risks, ...security.risks],
    missingCapabilities: capabilityScore.missing,
    matchedCapabilities: capabilityScore.matched,
    notes: [...security.notes, ...maintainability.notes],
  };
}
