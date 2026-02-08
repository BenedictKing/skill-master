import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentPlatform } from '../types/index.js';

/** Platform detection markers in order of priority */
const PLATFORM_MARKERS: Array<{ dir: string; platform: AgentPlatform }> = [
  { dir: '.claude', platform: 'claude-code' },
  { dir: '.cursor', platform: 'cursor' },
  { dir: '.windsurf', platform: 'windsurf' },
  { dir: '.cline', platform: 'cline' },
];

/**
 * Detect the agent platform based on directory markers in cwd.
 * Falls back to checking ~/.config/opencode, then defaults to claude-code.
 */
export function detectPlatform(cwd: string): AgentPlatform {
  for (const { dir, platform } of PLATFORM_MARKERS) {
    if (existsSync(join(cwd, dir))) {
      return platform;
    }
  }

  // Check for opencode
  if (existsSync(join(homedir(), '.config', 'opencode'))) {
    return 'opencode';
  }

  // Default
  return 'claude-code';
}

/** Agent-specific skills directory names */
const AGENT_SKILLS_DIRS: Record<AgentPlatform, string> = {
  'claude-code': '.claude/skills',
  'opencode': '.opencode/skills',
  'cursor': '.cursor/skills',
  'cline': '.cline/skills',
  'windsurf': '.windsurf/skills',
};

/** Get the skills directory for a given platform */
export function getAgentSkillsDir(platform: AgentPlatform): string {
  return AGENT_SKILLS_DIRS[platform];
}

/** List all supported platforms */
export function getSupportedPlatforms(): AgentPlatform[] {
  return ['claude-code', 'opencode', 'cursor', 'cline', 'windsurf'];
}
