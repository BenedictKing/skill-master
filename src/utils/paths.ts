import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentPlatform } from '../types/index.js';

/** Root directory for all skill-manager data */
export const AGENTS_HOME = join(homedir(), '.agents');

/** Persistent user config (API keys etc.) */
export const CONFIG_DIR = join(AGENTS_HOME, 'config');

/** Canonical skill code storage */
export const SKILLS_DIR = join(AGENTS_HOME, 'skills');

/** Registry file path */
export const REGISTRY_PATH = join(AGENTS_HOME, 'registry.json');

/** Get canonical path for a skill's code */
export function getSkillCanonicalPath(name: string): string {
  return join(SKILLS_DIR, name);
}

/** Get persistent config path for a skill (holds .env) */
export function getSkillConfigPath(name: string): string {
  return join(CONFIG_DIR, name);
}

/** Platform-specific skill directory mappings */
const AGENT_SKILL_DIRS: Record<AgentPlatform, string> = {
  'claude-code': '.claude/skills',
  'opencode': '.opencode/skills',
  'cursor': '.cursor/skills',
  'cline': '.cline/skills',
  'windsurf': '.windsurf/skills',
};

/** Get the agent-specific skill installation path */
export function getAgentSkillPath(
  cwd: string,
  agent: AgentPlatform,
  name: string,
): string {
  return join(cwd, AGENT_SKILL_DIRS[agent], name);
}

/** Get the agent skills root directory */
export function getAgentSkillsRoot(cwd: string, agent: AgentPlatform): string {
  return join(cwd, AGENT_SKILL_DIRS[agent]);
}
