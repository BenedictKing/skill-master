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
}

/** SKILL.md frontmatter fields */
export interface SkillFrontmatter {
  name: string;
  version: string;
  author: string;
  description: string;
  'allowed-tools': string[];
  'user-invocable': boolean;
  context?: 'fork';
  capabilities?: Capability[];
}

/** Parsed SKILL.md: frontmatter + markdown body */
export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  /** Raw frontmatter string for re-serialization */
  rawFrontmatter: string;
}

/** Options for the install command */
export interface InstallOptions {
  source: SkillSource;
  agent?: AgentPlatform;
  cwd: string;
  copy?: boolean;
  force?: boolean;
  yes?: boolean;
}

/** A single entry in the registry */
export interface RegistryEntry {
  source: string;
  version: string;
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
  version: 1;
  skills: Record<string, RegistryEntry>;
}

/** .env configuration status */
export type EnvStatus = 'configured' | 'missing' | 'partial';
