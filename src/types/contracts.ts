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
  owner?: string;
  results: SkillCandidate[];
}

export interface AddJsonAgentV1 {
  agent: string;
  agentPath: string;
  installMode: 'symlink' | 'copy';
}

export interface AddJsonSkillV1 {
  name: string;
  version?: string;
  canonicalPath: string;
  agents: AddJsonAgentV1[];
}

export interface AddJsonV1 {
  source: string;
  sourceType: 'github' | 'well-known' | 'local';
  global: boolean;
  installed: number;
  skills: AddJsonSkillV1[];
  error?: string;
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
