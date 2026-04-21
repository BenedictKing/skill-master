import type {
  CompositionResult,
  EvaluationReport,
  Recommendation,
  RecommendationPreferences,
  TaskRequirement,
  VerificationReport,
  SkillCandidate,
} from './index.js';

export interface FindJsonV1 {
  query: string;
  results: SkillCandidate[];
}

export interface InspectJsonV1 {
  target: string;
  task: TaskRequirement;
  results: Array<{
    candidate: SkillCandidate;
    evaluation: EvaluationReport;
  }>;
}

export interface RecommendJsonV1 {
  task: TaskRequirement;
  preferences: RecommendationPreferences;
  recommendations: Recommendation[];
}

export type VerifyJsonV1 = VerificationReport;

export interface ComposeJsonV1 {
  inputSources: string[];
  resolvedSources: string[];
  result: CompositionResult;
}

export interface SolveJsonV1 {
  task: TaskRequirement;
  preferences: RecommendationPreferences;
  candidateCount: number;
  recommendations: Recommendation[];
  steps: {
    discovered: boolean;
    recommended: boolean;
    installed: boolean;
    verified: boolean;
  };
  summary: {
    bestMatch: string | null;
    preferenceLabels: string[];
  };
  installation?: {
    skillName: string;
    agentPath: string;
    canonicalPath: string;
  };
  verification?: VerificationReport;
}
