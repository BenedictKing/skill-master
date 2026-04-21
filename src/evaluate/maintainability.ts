import type { SkillCandidate } from '../types/index.js';

export function evaluateMaintainability(candidate: SkillCandidate): { score: number; notes: string[] } {
  let score = 40;
  const notes: string[] = [];

  if (candidate.version) {
    score += 15;
    notes.push('Version metadata present');
  }

  if (candidate.installs && candidate.installs > 0) {
    score += Math.min(20, Math.floor(Math.log10(candidate.installs + 1) * 10));
    notes.push(`Install count signal: ${candidate.installs}`);
  }

  if (candidate.updatedAt) {
    score += 10;
    notes.push('Has updated timestamp');
  }

  if (candidate.provider === 'registry') {
    score += 10;
    notes.push('Already installed and tracked locally');
  }

  if (candidate.provider === 'github') {
    notes.push('Git source maintainability requires deeper remote inspection');
  }

  return {
    score: Math.max(0, Math.min(score, 100)),
    notes,
  };
}
