import type { AgentPlatform } from '../platform/agents.js';

/** Platform identifiers for supported AI coding agents */
export type { AgentPlatform };

/** Abstract capability identifiers (platform-agnostic) */
export type Capability =
  | 'shell'
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'find_file'
  | 'search_content'
  | 'sub_task'
  | 'web_fetch'
  | 'web_search';

export type CandidateProvider =
  | 'skills.sh'
  | 'github'
  | 'local'
  | 'node_modules'
  | 'plugin-manifest'
  | 'registry'
  | 'gh-skill'
  | 'vercel';

export type CandidateRiskLevel = 'low' | 'medium' | 'high';
export type InstallComplexity = 'low' | 'medium' | 'high';
export type RecommendationTier = 'best' | 'conservative' | 'aggressive';
export type VerificationSeverity = 'info' | 'warning' | 'error';

/** Source of a skill: git URL, well-known discovery URL, or local filesystem path */
export interface SkillSource {
  type: 'git' | 'local' | 'well-known';
  url?: string;
  path?: string;
  branch?: string;
  /** Local path to use for installation (when type='git', this is the cloned temp dir) */
  localPath?: string;
  /**
   * 原始来源标签，用于 registry 记录与更新匹配。
   * SSH 安装时保留 git@/ssh:// 原始 URL，避免归一化后破坏私钥认证。
   */
  displaySource?: string;
}

/** SKILL.md frontmatter fields */
export interface SkillFrontmatter {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  'allowed-tools'?: string[];
  'user-invocable'?: boolean;
  context?: 'fork';
  capabilities?: Capability[];
  /** Claude Code native optional fields */
  'disable-model-invocation'?: boolean;
  'argument-hint'?: string;
  model?: string;
  agent?: string;
  hooks?: Record<string, unknown>;
}

/** Parsed SKILL.md: frontmatter + markdown body */
export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  /** Raw frontmatter string for re-serialization */
  rawFrontmatter: string;
}

/** Parsed source string — result of parseSource() */
export interface ParsedSource {
  type: 'git' | 'local' | 'well-known';
  url?: string;
  path?: string;
  ref?: string;
  subpath?: string;
  skillFilter?: string;
}

export interface TaskRequirement {
  raw: string;
  normalized: string;
  keywords: string[];
  capabilities: Capability[];
  preferredAgent?: AgentPlatform;
  riskTolerance: CandidateRiskLevel;
  installPreference: 'existing-only' | 'adapt' | 'compose';
}

export interface RecommendationPreferences {
  safe?: boolean;
  localFirst?: boolean;
  noRemote?: boolean;
  preferInstalled?: boolean;
}

export interface SkillCandidate {
  id: string;
  provider: CandidateProvider;
  name: string;
  source: string;
  installHint: string;
  description?: string;
  version?: string;
  author?: string;
  path?: string;
  providerMeta?: Record<string, string | number | boolean | null>;
  pluginName?: string;
  parsedSource?: ParsedSource;
  frontmatter?: SkillFrontmatter;
  capabilities: Capability[];
  allowedTools: string[];
  envKeys: string[];
  issues: string[];
  warnings: string[];
  updatedAt?: string;
  installs?: number;
  installed?: boolean;
}

export interface EvaluationReport {
  candidateId: string;
  matchScore: number;
  qualityScore: number;
  maintenanceScore: number;
  safetyScore: number;
  overallScore: number;
  installComplexity: InstallComplexity;
  riskLevel: CandidateRiskLevel;
  strengths: string[];
  risks: string[];
  missingCapabilities: Capability[];
  matchedCapabilities: Capability[];
  notes: string[];
}

export interface Recommendation {
  tier: RecommendationTier;
  candidate: SkillCandidate;
  evaluation: EvaluationReport;
  rationale: string[];
}

export interface VerificationMessage {
  severity: VerificationSeverity;
  message: string;
}

export interface VerificationReport {
  skillName: string;
  envStatus: EnvStatus;
  envMissingKeys: string[];
  dependencyWarnings: string[];
  conflicts: string[];
  messages: VerificationMessage[];
  structureHealthy: boolean;
  smokePassed: boolean;
}

export interface CompositionRequest {
  mode: 'adapt' | 'merge' | 'generate';
  task?: string;
  outputDir: string;
  skillNames?: string[];
  sources?: string[];
  sourceLabels?: string[];
  env?: CompositionEnvVar[];
}

export interface CompositionResult {
  outputDir: string;
  files: string[];
  summary: string[];
  sources: string[];
}

export interface CompositionEnvVar {
  key: string;
  value?: string;
}

/** Options for the install command */
export interface InstallOptions {
  source: SkillSource;
  agent?: AgentPlatform;
  cwd: string;
  global?: boolean;
  copy?: boolean;
  force?: boolean;
  yes?: boolean;
}

/** A single agent installation record (v2) */
export interface AgentInstall {
  agent: AgentPlatform;
  agent_path: string;
  global: boolean;
}

/** A single entry in the registry (v2) */
export interface RegistryEntry {
  source: string;
  version?: string;
  installed_at: string;
  updated_at: string;
  agents: AgentInstall[];
  env_keys: string[];
  capabilities: Capability[];
  canonical_path: string;
}

/** V1 registry entry for migration */
export interface RegistryEntryV1 {
  source: string;
  version?: string;
  installed_at: string;
  updated_at: string;
  agent: AgentPlatform;
  env_keys: string[];
  capabilities: Capability[];
  canonical_path: string;
  agent_path: string;
}

/** The complete registry structure */
export interface Registry {
  version: 1 | 2;
  skills: Record<string, RegistryEntry>;
}

/** .env configuration status */
export type EnvStatus = 'configured' | 'missing' | 'partial';

/** Installation mode: symlink or copy */
export type InstallMode = 'symlink' | 'copy';

export interface LockVerificationSnapshot {
  checked_at: string;
  envStatus: EnvStatus;
  conflicts?: string[];
  warnings?: string[];
  smokePassed?: boolean;
}

export interface LockCompositionSource {
  kind: 'task' | 'skill' | 'source';
  value: string;
}

/** Local lock file entry for a skill */
export interface LocalLockEntry {
  source: string;
  sourceType: 'github' | 'node_modules' | 'local' | 'well-known';
  computedHash: string;
  /** Relative path to the skill directory within the source (for multi-skill repos) */
  skillDir?: string;
  /** Name of the plugin this skill belongs to (from .claude-plugin manifest) */
  pluginName?: string;
  verification?: LockVerificationSnapshot;
  composedFrom?: LockCompositionSource[];
}

/** Project-level lock file structure */
export interface LocalLock {
  version: 1;
  skills: Record<string, LocalLockEntry>;
}

/** Result of skill installation */
export interface InstallResult {
  skillName: string;
  version?: string;
  canonicalPath: string;
  agentPath: string;
  installMode: InstallMode;
}
