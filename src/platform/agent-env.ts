/**
 * 运行环境 agent 检测。
 *
 * 与 platform/agents.ts 的「目标平台检测」职责不同：
 * 这里判断的是「当前进程是否正运行在某个 AI agent / CI 环境内部」，
 * 用于让 CLI 在被 agent 调用时自动切换为非交互模式，避免 readline 卡死。
 *
 * 实现为自研轻量检测（读取环境变量信号表），零外部依赖。
 */
import type { AgentPlatform } from './agents.js';

export interface AgentEnvResult {
  isAgent: boolean;
  /** 原始检测名（claude/codex/cursor/gemini/ci...），未命中为 undefined */
  agentName?: string;
}

/** 判断环境变量是否为「真值」信号（排除 "false"/"0"/"no"/"" 等显式假值）。 */
function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== 'false' && v !== '0' && v !== 'no';
}

/**
 * 强信号环境变量 → 检测名。存在即判定为对应 agent。
 *
 * 注意：CODEX_HOME 不在此列 —— 用户会为了配置 Codex 在交互式 shell 手动设置它，
 * 仅凭它无法区分「agent 启动」与「用户手动配置」，会导致普通运行被误判为 agent
 * 而静默跳过确认。改用 CODEX_CI 等仅在 agent 运行时设置的信号。
 */
const STRONG_SIGNALS: ReadonlyArray<readonly [string, string]> = [
  ['CLAUDECODE', 'claude'],
  ['CLAUDE_CODE_ENTRYPOINT', 'claude'],
  ['CODEX_CI', 'codex'],
  ['GEMINI_CLI', 'gemini'],
  ['OPENCODE', 'opencode'],
  ['CURSOR_AGENT', 'cursor'],
  ['AIDER_DETERMINISTIC', 'aider'],
  ['REPL_ID', 'replit'],
];

/**
 * Cursor 弱信号（如 CURSOR_TRACE_ID）会在普通 Cursor 集成终端里出现，
 * 不能据此判定为 agent，否则会在真实用户会话中静默跳过交互确认。
 * 仅当存在 CURSOR_AGENT 或 CURSOR_EXTENSION_HOST_ROLE === 'agent-exec' 才算。
 */
function isCursorAgent(env: NodeJS.ProcessEnv): boolean {
  return isTruthyEnv(env.CURSOR_AGENT) || env.CURSOR_EXTENSION_HOST_ROLE === 'agent-exec';
}

/** 进程内缓存，避免重复检测。 */
let cached: AgentEnvResult | null = null;

/** 检测当前是否在 AI agent 进程内运行（结果进程内缓存）。 */
export function detectAgentEnv(env: NodeJS.ProcessEnv = process.env): AgentEnvResult {
  if (cached && env === process.env) {
    return cached;
  }

  // Cursor 需要强信号校验，优先处理
  if (isCursorAgent(env)) {
    const result: AgentEnvResult = { isAgent: true, agentName: 'cursor' };
    if (env === process.env) cached = result;
    return result;
  }

  for (const [varName, agentName] of STRONG_SIGNALS) {
    if (isTruthyEnv(env[varName])) {
      const result: AgentEnvResult = { isAgent: true, agentName };
      if (env === process.env) cached = result;
      return result;
    }
  }

  const result: AgentEnvResult = { isAgent: false };
  if (env === process.env) cached = result;
  return result;
}

/** 是否在 CI 环境（通用信号）。 */
function isCIEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnv(env.CI) || isTruthyEnv(env.GITHUB_ACTIONS) || isTruthyEnv(env.CONTINUOUS_INTEGRATION);
}

/**
 * 是否处于 agent 内部或 CI 环境（不含 TTY 判断）。
 * 此类环境下 CLI 是被程序调用的，无法也不应等待人工输入，
 * 交互确认应直接采用默认值（等价 --yes）。
 */
export function isAgentOrCIEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return detectAgentEnv(env).isAgent || isCIEnv(env);
}

/**
 * 是否完全无法交互（agent/CI，或 stdin 非 TTY）。
 * 用于判断「连问都问不了」的场景；与 isAgentOrCIEnv 的区别是包含 TTY 检测。
 */
export function isNonInteractiveEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isAgentOrCIEnv(env)) return true;
  return !process.stdin.isTTY;
}

/** 检测名 → AgentPlatform 映射表。 */
const NAME_TO_PLATFORM: Readonly<Record<string, AgentPlatform>> = {
  claude: 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  gemini: 'gemini-cli',
  opencode: 'opencode',
  replit: 'replit',
  aider: 'adal',
};

/**
 * 将检测名映射为 AgentPlatform，未映射返回 null。
 * 返回 null 不影响现有 detectPlatform 的目标平台检测（两者职责不同，勿混用）。
 */
export function mapDetectedToPlatform(name: string): AgentPlatform | null {
  return NAME_TO_PLATFORM[name] ?? null;
}

/** 仅用于测试：清空进程内缓存。 */
export function resetAgentEnvCache(): void {
  cached = null;
}
