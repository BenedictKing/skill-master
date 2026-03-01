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

/** Source of a skill: either a git URL or a local filesystem path */
export interface SkillSource {
  type: 'git' | 'local';
  url?: string;
  path?: string;
  branch?: string;
  /** Local path to use for installation (when type='git', this is the cloned temp dir) */
  localPath?: string;
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
  type: 'git' | 'local';
  url?: string;
  path?: string;
  ref?: string;
  subpath?: string;
  skillFilter?: string;
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

/** Local lock file entry for a skill */
export interface LocalLockEntry {
  source: string;
  sourceType: 'github' | 'node_modules' | 'local';
  computedHash: string;
  /** Relative path to the skill directory within the source (for multi-skill repos) */
  skillDir?: string;
  /** Name of the plugin this skill belongs to (from .claude-plugin manifest) */
  pluginName?: string;
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
