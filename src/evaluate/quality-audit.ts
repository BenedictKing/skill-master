import type { SkillCandidate } from '../types/index.js';

export function evaluateQuality(candidate: SkillCandidate): { score: number; strengths: string[]; risks: string[] } {
  let score = 20;
  const strengths: string[] = [];
  const risks: string[] = [];

  if (candidate.frontmatter) {
    score += 15;
    strengths.push('SKILL.md frontmatter can be parsed');
  } else {
    risks.push('No parsed SKILL.md metadata available');
  }

  if (candidate.description) {
    score += 10;
    strengths.push('Has description');
  } else {
    risks.push('Missing description');
  }

  if (candidate.version) {
    score += 5;
    strengths.push('Has version metadata');
  }

  if (candidate.author) {
    score += 5;
    strengths.push('Has author metadata');
  }

  if (candidate.allowedTools.length > 0) {
    score += 10;
    strengths.push('Declares allowed tools');
  } else {
    risks.push('No explicit allowed-tools declaration');
  }

  if (candidate.envKeys.length > 0) {
    score += 5;
    strengths.push('Provides env contract');
  }

  if (candidate.path) {
    score += 10;
    strengths.push('Local structure is inspectable');
  }

  if (candidate.provider === 'skills.sh' || candidate.provider === 'github') {
    score += 5;
  }

  return {
    score: Math.max(0, Math.min(score, 100)),
    strengths,
    risks,
  };
}
