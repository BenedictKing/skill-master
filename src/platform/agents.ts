import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const home = homedir();
const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(home, '.config');
const codexHome = process.env.CODEX_HOME?.trim() || join(home, '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');

export interface AgentConfig {
  name: string;
  displayName: string;
  skillsDir: string;
  globalSkillsDir: string;
  detectMarker?: string;
  showInUniversalList?: boolean;
}

export const AGENTS = {
  amp: {
    name: 'amp',
    displayName: 'Amp',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'agents/skills'),
  },
  antigravity: {
    name: 'antigravity',
    displayName: 'Antigravity',
    skillsDir: '.agent/skills',
    globalSkillsDir: join(home, '.gemini/antigravity/skills'),
    detectMarker: '.agent',
  },
  augment: {
    name: 'augment',
    displayName: 'Augment',
    skillsDir: '.augment/skills',
    globalSkillsDir: join(home, '.augment/skills'),
    detectMarker: '.augment',
  },
  'claude-code': {
    name: 'claude-code',
    displayName: 'Claude Code',
    skillsDir: '.claude/skills',
    globalSkillsDir: join(claudeHome, 'skills'),
    detectMarker: '.claude',
  },
  openclaw: {
    name: 'openclaw',
    displayName: 'OpenClaw',
    skillsDir: 'skills',
    globalSkillsDir: join(home, '.openclaw/skills'),
  },
  cline: {
    name: 'cline',
    displayName: 'Cline',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents', 'skills'),
    detectMarker: '.cline',
  },
  codebuddy: {
    name: 'codebuddy',
    displayName: 'CodeBuddy',
    skillsDir: '.codebuddy/skills',
    globalSkillsDir: join(home, '.codebuddy/skills'),
    detectMarker: '.codebuddy',
  },
  codex: {
    name: 'codex',
    displayName: 'Codex',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(codexHome, 'skills'),
  },
  'command-code': {
    name: 'command-code',
    displayName: 'Command Code',
    skillsDir: '.commandcode/skills',
    globalSkillsDir: join(home, '.commandcode/skills'),
    detectMarker: '.commandcode',
  },
  cortex: {
    name: 'cortex',
    displayName: 'Cortex',
    skillsDir: '.cortex/skills',
    globalSkillsDir: join(home, '.snowflake/cortex/skills'),
  },
  continue: {
    name: 'continue',
    displayName: 'Continue',
    skillsDir: '.continue/skills',
    globalSkillsDir: join(home, '.continue/skills'),
    detectMarker: '.continue',
  },
  crush: {
    name: 'crush',
    displayName: 'Crush',
    skillsDir: '.crush/skills',
    globalSkillsDir: join(home, '.config/crush/skills'),
  },
  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.cursor/skills'),
    detectMarker: '.cursor',
  },
  droid: {
    name: 'droid',
    displayName: 'Droid',
    skillsDir: '.factory/skills',
    globalSkillsDir: join(home, '.factory/skills'),
    detectMarker: '.factory',
  },
  'gemini-cli': {
    name: 'gemini-cli',
    displayName: 'Gemini CLI',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.gemini/skills'),
  },
  'github-copilot': {
    name: 'github-copilot',
    displayName: 'GitHub Copilot',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.copilot/skills'),
  },
  goose: {
    name: 'goose',
    displayName: 'Goose',
    skillsDir: '.goose/skills',
    globalSkillsDir: join(configHome, 'goose/skills'),
    detectMarker: '.goose',
  },
  junie: {
    name: 'junie',
    displayName: 'Junie',
    skillsDir: '.junie/skills',
    globalSkillsDir: join(home, '.junie/skills'),
    detectMarker: '.junie',
  },
  'iflow-cli': {
    name: 'iflow-cli',
    displayName: 'iFlow CLI',
    skillsDir: '.iflow/skills',
    globalSkillsDir: join(home, '.iflow/skills'),
    detectMarker: '.iflow',
  },
  kilo: {
    name: 'kilo',
    displayName: 'Kilo Code',
    skillsDir: '.kilocode/skills',
    globalSkillsDir: join(home, '.kilocode/skills'),
    detectMarker: '.kilocode',
  },
  'kimi-cli': {
    name: 'kimi-cli',
    displayName: 'Kimi Code CLI',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.config/agents/skills'),
  },
  'kiro-cli': {
    name: 'kiro-cli',
    displayName: 'Kiro CLI',
    skillsDir: '.kiro/skills',
    globalSkillsDir: join(home, '.kiro/skills'),
    detectMarker: '.kiro',
  },
  kode: {
    name: 'kode',
    displayName: 'Kode',
    skillsDir: '.kode/skills',
    globalSkillsDir: join(home, '.kode/skills'),
    detectMarker: '.kode',
  },
  mcpjam: {
    name: 'mcpjam',
    displayName: 'MCPJam',
    skillsDir: '.mcpjam/skills',
    globalSkillsDir: join(home, '.mcpjam/skills'),
    detectMarker: '.mcpjam',
  },
  'mistral-vibe': {
    name: 'mistral-vibe',
    displayName: 'Mistral Vibe',
    skillsDir: '.vibe/skills',
    globalSkillsDir: join(home, '.vibe/skills'),
    detectMarker: '.vibe',
  },
  mux: {
    name: 'mux',
    displayName: 'Mux',
    skillsDir: '.mux/skills',
    globalSkillsDir: join(home, '.mux/skills'),
    detectMarker: '.mux',
  },
  opencode: {
    name: 'opencode',
    displayName: 'OpenCode',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'opencode/skills'),
  },
  openhands: {
    name: 'openhands',
    displayName: 'OpenHands',
    skillsDir: '.openhands/skills',
    globalSkillsDir: join(home, '.openhands/skills'),
    detectMarker: '.openhands',
  },
  pi: {
    name: 'pi',
    displayName: 'Pi',
    skillsDir: '.pi/skills',
    globalSkillsDir: join(home, '.pi/agent/skills'),
    detectMarker: '.pi',
  },
  qoder: {
    name: 'qoder',
    displayName: 'Qoder',
    skillsDir: '.qoder/skills',
    globalSkillsDir: join(home, '.qoder/skills'),
    detectMarker: '.qoder',
  },
  'qwen-code': {
    name: 'qwen-code',
    displayName: 'Qwen Code',
    skillsDir: '.qwen/skills',
    globalSkillsDir: join(home, '.qwen/skills'),
    detectMarker: '.qwen',
  },
  replit: {
    name: 'replit',
    displayName: 'Replit',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'agents/skills'),
    showInUniversalList: false,
  },
  roo: {
    name: 'roo',
    displayName: 'Roo Code',
    skillsDir: '.roo/skills',
    globalSkillsDir: join(home, '.roo/skills'),
    detectMarker: '.roo',
  },
  trae: {
    name: 'trae',
    displayName: 'Trae',
    skillsDir: '.trae/skills',
    globalSkillsDir: join(home, '.trae/skills'),
    detectMarker: '.trae',
  },
  'trae-cn': {
    name: 'trae-cn',
    displayName: 'Trae CN',
    skillsDir: '.trae/skills',
    globalSkillsDir: join(home, '.trae-cn/skills'),
  },
  windsurf: {
    name: 'windsurf',
    displayName: 'Windsurf',
    skillsDir: '.windsurf/skills',
    globalSkillsDir: join(home, '.codeium/windsurf/skills'),
    detectMarker: '.windsurf',
  },
  zencoder: {
    name: 'zencoder',
    displayName: 'Zencoder',
    skillsDir: '.zencoder/skills',
    globalSkillsDir: join(home, '.zencoder/skills'),
    detectMarker: '.zencoder',
  },
  neovate: {
    name: 'neovate',
    displayName: 'Neovate',
    skillsDir: '.neovate/skills',
    globalSkillsDir: join(home, '.neovate/skills'),
    detectMarker: '.neovate',
  },
  pochi: {
    name: 'pochi',
    displayName: 'Pochi',
    skillsDir: '.pochi/skills',
    globalSkillsDir: join(home, '.pochi/skills'),
    detectMarker: '.pochi',
  },
  adal: {
    name: 'adal',
    displayName: 'AdaL',
    skillsDir: '.adal/skills',
    globalSkillsDir: join(home, '.adal/skills'),
    detectMarker: '.adal',
  },
  universal: {
    name: 'universal',
    displayName: 'Universal',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'agents/skills'),
    showInUniversalList: false,
  },
} as const satisfies Record<string, AgentConfig>;

export type AgentPlatform = keyof typeof AGENTS;

/** Get config for a specific agent */
export function getAgentConfig(type: AgentPlatform): AgentConfig {
  return AGENTS[type];
}

/** List all supported platform keys */
export function getSupportedPlatforms(): AgentPlatform[] {
  return Object.keys(AGENTS) as AgentPlatform[];
}

/** Detect current platform by checking cwd for directory markers */
export function detectPlatform(cwd: string): AgentPlatform {
  for (const [key, config] of Object.entries(AGENTS) as Array<[AgentPlatform, AgentConfig]>) {
    if (config.detectMarker && existsSync(join(cwd, config.detectMarker))) {
      return key;
    }
  }

  // Fallback: check opencode via global config
  if (existsSync(join(configHome, 'opencode'))) {
    return 'opencode';
  }

  return 'claude-code';
}

/** Get the project-level skills directory name for an agent */
export function getAgentSkillsDir(platform: AgentPlatform): string {
  return AGENTS[platform].skillsDir;
}

/** Get full skill installation path: cwd + skillsDir + skillName */
export function getAgentSkillPath(cwd: string, agent: AgentPlatform, name: string): string {
  return join(cwd, AGENTS[agent].skillsDir, name);
}

/** Get the global skill path: globalSkillsDir + skillName */
export function getAgentGlobalSkillPath(agent: AgentPlatform, name: string): string {
  return join(AGENTS[agent].globalSkillsDir, name);
}

/** Get the agent skills root directory: cwd + skillsDir */
export function getAgentSkillsRoot(cwd: string, agent: AgentPlatform): string {
  return join(cwd, AGENTS[agent].skillsDir);
}

/** Get all agents that use the universal `.agents/skills` directory and are visible in universal list */
export function getUniversalAgents(): AgentPlatform[] {
  return (Object.entries(AGENTS) as Array<[AgentPlatform, AgentConfig]>)
    .filter(([, config]) => config.skillsDir === '.agents/skills' && config.showInUniversalList !== false)
    .map(([key]) => key);
}

/** Get all agents that do NOT use the universal `.agents/skills` directory */
export function getNonUniversalAgents(): AgentPlatform[] {
  return (Object.entries(AGENTS) as Array<[AgentPlatform, AgentConfig]>)
    .filter(([, config]) => config.skillsDir !== '.agents/skills')
    .map(([key]) => key);
}

/** Check if an agent uses the universal `.agents/skills` directory */
export function isUniversalAgent(type: AgentPlatform): boolean {
  return AGENTS[type].skillsDir === '.agents/skills';
}
