import { discoverCandidates } from '../discovery/search.js';
import { buildTaskRequirement } from '../evaluate/matcher.js';
import { recommendCandidates } from './recommend.js';
import type { AgentPlatform, Recommendation, RecommendationPreferences, TaskRequirement } from '../types/index.js';

export interface RecommendationRun {
  task: TaskRequirement;
  recommendations: Recommendation[];
}

export async function runRecommendation(
  taskInput: string,
  cwd: string,
  preferences?: RecommendationPreferences,
  preferredAgent?: AgentPlatform,
): Promise<RecommendationRun> {
  const task = buildTaskRequirement(taskInput);
  const candidates = await discoverCandidates(taskInput, cwd, preferredAgent);
  return {
    task,
    recommendations: recommendCandidates(task, candidates, preferences),
  };
}
