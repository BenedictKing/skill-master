import type { Recommendation, RecommendationPreferences, SkillCandidate, TaskRequirement } from '../types/index.js';
import { evaluateCandidate } from '../evaluate/scorer.js';

function rationaleFor(candidate: SkillCandidate, score: ReturnType<typeof evaluateCandidate>, preferences?: RecommendationPreferences): string[] {
  const lines: string[] = [];
  lines.push(`Overall score ${score.overallScore}`);
  if (score.matchedCapabilities.length > 0) {
    lines.push(`Matches capabilities: ${score.matchedCapabilities.join(', ')}`);
  }
  if (score.missingCapabilities.length > 0) {
    lines.push(`Missing capabilities: ${score.missingCapabilities.join(', ')}`);
  }
  if (candidate.envKeys.length > 0) {
    lines.push(`Requires env keys: ${candidate.envKeys.join(', ')}`);
  }
  if (score.risks.length > 0) {
    lines.push(`Risks: ${score.risks.join('; ')}`);
  }
  if (preferences?.safe) {
    lines.push('Preference: safe mode enabled');
  }
  if (preferences?.localFirst) {
    lines.push('Preference: local-first');
  }
  if (preferences?.noRemote) {
    lines.push('Preference: remote candidates filtered out');
  }
  if (preferences?.preferInstalled) {
    lines.push('Preference: installed skills boosted');
  }
  return lines;
}

function applyPreferences(
  candidate: SkillCandidate,
  evaluation: ReturnType<typeof evaluateCandidate>,
  preferences?: RecommendationPreferences,
): number {
  let score = evaluation.overallScore;

  if (!preferences) return score;

  if (preferences.safe) {
    if (evaluation.riskLevel === 'high') score -= 30;
    if (evaluation.riskLevel === 'medium') score -= 10;
  }

  if (preferences.localFirst) {
    if (candidate.provider === 'local' || candidate.provider === 'plugin-manifest' || candidate.provider === 'node_modules') {
      score += 20;
    } else if (candidate.provider === 'github' || candidate.provider === 'skills.sh' || candidate.provider === 'gh-skill' || candidate.provider === 'vercel' || candidate.provider === 'well-known') {
      score -= 10;
    }
  }

  if (preferences.preferInstalled && candidate.installed) {
    score += 20;
  }

  return score;
}

export function recommendCandidates(
  task: TaskRequirement,
  candidates: SkillCandidate[],
  preferences?: RecommendationPreferences,
): Recommendation[] {
  const filtered = preferences?.noRemote
    ? candidates.filter((candidate) => !['github', 'skills.sh', 'gh-skill', 'vercel', 'well-known'].includes(candidate.provider))
    : candidates;

  const scored = filtered.map((candidate) => {
    const evaluation = evaluateCandidate(task, candidate);
    const preferredScore = applyPreferences(candidate, evaluation, preferences);
    return {
      candidate,
      evaluation: {
        ...evaluation,
        overallScore: preferredScore,
      },
    };
  }).sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);

  if (scored.length === 0) return [];

  const recommendations: Recommendation[] = [];

  const best = scored[0];
  recommendations.push({
    tier: 'best',
    candidate: best.candidate,
    evaluation: best.evaluation,
    rationale: rationaleFor(best.candidate, best.evaluation, preferences),
  });

  const conservative = scored
    .filter((item) => item.evaluation.riskLevel !== 'high')
    .sort((a, b) => {
      if (a.evaluation.riskLevel !== b.evaluation.riskLevel) {
        return a.evaluation.riskLevel === 'low' ? -1 : 1;
      }
      return b.evaluation.overallScore - a.evaluation.overallScore;
    })[0];

  if (conservative && conservative.candidate.id !== best.candidate.id) {
    recommendations.push({
      tier: 'conservative',
      candidate: conservative.candidate,
      evaluation: conservative.evaluation,
      rationale: rationaleFor(conservative.candidate, conservative.evaluation, preferences),
    });
  }

  const aggressive = scored
    .filter((item) => item.evaluation.matchScore >= best.evaluation.matchScore)
    .sort((a, b) => b.evaluation.matchScore - a.evaluation.overallScore || b.evaluation.overallScore - a.evaluation.overallScore)[0];

  if (aggressive && !recommendations.some((item) => item.candidate.id === aggressive.candidate.id)) {
    recommendations.push({
      tier: 'aggressive',
      candidate: aggressive.candidate,
      evaluation: aggressive.evaluation,
      rationale: rationaleFor(aggressive.candidate, aggressive.evaluation, preferences),
    });
  }

  return recommendations;
}
