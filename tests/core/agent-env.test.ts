import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectAgentEnv,
  isAgentOrCIEnv,
  isNonInteractiveEnv,
  mapDetectedToPlatform,
  resetAgentEnvCache,
} from '../../src/platform/agent-env.js';

/** 构造干净的环境对象（不含任何 agent/CI 信号）。 */
function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { PATH: '/usr/bin', ...extra } as NodeJS.ProcessEnv;
}

describe('detectAgentEnv', () => {
  beforeEach(() => resetAgentEnvCache());

  it('detects claude-code via CLAUDECODE', () => {
    const r = detectAgentEnv(cleanEnv({ CLAUDECODE: '1' }));
    expect(r.isAgent).toBe(true);
    expect(r.agentName).toBe('claude');
  });

  it('detects claude-code via CLAUDE_CODE_ENTRYPOINT', () => {
    expect(detectAgentEnv(cleanEnv({ CLAUDE_CODE_ENTRYPOINT: 'cli' })).agentName).toBe('claude');
  });

  it('detects codex via CODEX_CI', () => {
    expect(detectAgentEnv(cleanEnv({ CODEX_CI: '1' })).agentName).toBe('codex');
  });

  it('does NOT detect codex from CODEX_HOME alone (user manual config)', () => {
    // 用户会为配置 Codex 在交互 shell 手动设 CODEX_HOME，不能据此误判 agent
    expect(detectAgentEnv(cleanEnv({ CODEX_HOME: '/home/u/.codex' })).isAgent).toBe(false);
  });

  it('detects gemini via GEMINI_CLI', () => {
    expect(detectAgentEnv(cleanEnv({ GEMINI_CLI: '1' })).agentName).toBe('gemini');
  });

  it('detects cursor via CURSOR_AGENT strong signal', () => {
    const r = detectAgentEnv(cleanEnv({ CURSOR_AGENT: '1' }));
    expect(r.isAgent).toBe(true);
    expect(r.agentName).toBe('cursor');
  });

  it('detects cursor via CURSOR_EXTENSION_HOST_ROLE=agent-exec', () => {
    const r = detectAgentEnv(cleanEnv({ CURSOR_EXTENSION_HOST_ROLE: 'agent-exec' }));
    expect(r.isAgent).toBe(true);
    expect(r.agentName).toBe('cursor');
  });

  it('does NOT detect cursor from weak signal CURSOR_TRACE_ID alone', () => {
    // Cursor 集成终端会设 CURSOR_TRACE_ID，但此时是真实用户会话，不能误判
    const r = detectAgentEnv(cleanEnv({ CURSOR_TRACE_ID: 'abc' }));
    expect(r.isAgent).toBe(false);
  });

  it('does NOT detect cursor from non-agent-exec host role', () => {
    const r = detectAgentEnv(cleanEnv({ CURSOR_EXTENSION_HOST_ROLE: 'extension-host' }));
    expect(r.isAgent).toBe(false);
  });

  it('returns isAgent=false in a clean env', () => {
    expect(detectAgentEnv(cleanEnv()).isAgent).toBe(false);
  });
});

describe('isAgentOrCIEnv', () => {
  beforeEach(() => resetAgentEnvCache());

  it('is true inside an agent', () => {
    expect(isAgentOrCIEnv(cleanEnv({ CLAUDECODE: '1' }))).toBe(true);
  });

  it('is true in CI', () => {
    expect(isAgentOrCIEnv(cleanEnv({ CI: 'true' }))).toBe(true);
    expect(isAgentOrCIEnv(cleanEnv({ GITHUB_ACTIONS: 'true' }))).toBe(true);
  });

  it('is false in a clean env regardless of TTY', () => {
    // 与 isNonInteractiveEnv 的区别：不看 TTY，干净环境一律 false
    expect(isAgentOrCIEnv(cleanEnv())).toBe(false);
  });
});

describe('isNonInteractiveEnv', () => {
  beforeEach(() => resetAgentEnvCache());

  it('is true inside an agent', () => {
    expect(isNonInteractiveEnv(cleanEnv({ CLAUDECODE: '1' }))).toBe(true);
  });

  it('is true in CI', () => {
    expect(isNonInteractiveEnv(cleanEnv({ CI: 'true' }))).toBe(true);
    expect(isNonInteractiveEnv(cleanEnv({ GITHUB_ACTIONS: 'true' }))).toBe(true);
  });

  it('falls back to stdin TTY detection in a clean env', () => {
    // 测试进程 stdin 非 TTY，因此为 true；这里仅验证不抛错且返回 boolean
    expect(typeof isNonInteractiveEnv(cleanEnv())).toBe('boolean');
  });
});

describe('mapDetectedToPlatform', () => {
  it('maps known names to platforms', () => {
    expect(mapDetectedToPlatform('claude')).toBe('claude-code');
    expect(mapDetectedToPlatform('codex')).toBe('codex');
    expect(mapDetectedToPlatform('cursor')).toBe('cursor');
    expect(mapDetectedToPlatform('gemini')).toBe('gemini-cli');
    expect(mapDetectedToPlatform('opencode')).toBe('opencode');
    expect(mapDetectedToPlatform('replit')).toBe('replit');
  });

  it('returns null for unmapped names', () => {
    expect(mapDetectedToPlatform('unknown-agent')).toBeNull();
    expect(mapDetectedToPlatform('ci')).toBeNull();
  });
});
