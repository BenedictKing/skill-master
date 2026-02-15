import { homedir } from 'node:os';
import { join } from 'node:path';

/** Root directory for all skill-master data */
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

// Re-export from agents.ts — eliminates duplicate AGENT_SKILL_DIRS mapping
export { getAgentSkillPath, getAgentGlobalSkillPath, getAgentSkillsRoot } from '../platform/agents.js';
