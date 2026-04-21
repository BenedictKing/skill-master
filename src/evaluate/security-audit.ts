import type { CandidateRiskLevel, SkillCandidate } from '../types/index.js';

const HIGH_RISK_TOOLS = new Set(['Bash', 'Write', 'Edit', 'Task']);
const MEDIUM_RISK_TOOLS = new Set(['WebFetch', 'WebSearch', 'Glob', 'Grep']);

export function evaluateSecurity(candidate: SkillCandidate): {
  score: number;
  riskLevel: CandidateRiskLevel;
  risks: string[];
  notes: string[];
} {
  let score = 100;
  const risks: string[] = [];
  const notes: string[] = [];

  for (const tool of candidate.allowedTools) {
    if (HIGH_RISK_TOOLS.has(tool)) {
      score -= 15;
      risks.push(`Uses high-impact tool: ${tool}`);
    } else if (MEDIUM_RISK_TOOLS.has(tool)) {
      score -= 8;
      notes.push(`Uses medium-impact tool: ${tool}`);
    }
  }

  if (candidate.envKeys.length > 0) {
    score -= 5;
    notes.push('Requires environment configuration');
  }

  if (candidate.provider === 'github') {
    score -= 5;
    notes.push('Remote-only candidate has partial metadata');
  }

  if (candidate.provider === 'local' || candidate.provider === 'plugin-manifest' || candidate.provider === 'node_modules') {
    notes.push('Local candidate can be inspected more thoroughly');
  }

  const clamped = Math.max(0, Math.min(score, 100));
  const riskLevel: CandidateRiskLevel = clamped >= 75 ? 'low' : clamped >= 45 ? 'medium' : 'high';

  return {
    score: clamped,
    riskLevel,
    risks,
    notes,
  };
}
