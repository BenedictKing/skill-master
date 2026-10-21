import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = join(tmpdir(), `skill-master-agents-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('agent path conventions (aligned with upstream)', () => {
  it('codex uses the shared ~/.agents/skills store globally and .agents/skills in projects', async () => {
    const { AGENTS } = await import('../../src/platform/agents.js');
    expect(AGENTS.codex.skillsDir).toBe('.agents/skills');
    expect(AGENTS.codex.globalSkillsDir.endsWith(join('.agents', 'skills'))).toBe(true);
  });

  it('kilo uses .agents/skills in projects and ~/.kilo/skills globally', async () => {
    const { AGENTS } = await import('../../src/platform/agents.js');
    expect(AGENTS.kilo.skillsDir).toBe('.agents/skills');
    expect(AGENTS.kilo.globalSkillsDir.endsWith(join('.kilo', 'skills'))).toBe(true);
  });
});

describe('detectGlobalPlatforms for shared-store agents', () => {
  it('detects codex via CODEX_HOME even though its global dir is the shared store', async () => {
    const codexHome = makeTempDir();
    vi.stubEnv('CODEX_HOME', codexHome);
    const { detectGlobalPlatforms } = await import('../../src/platform/agents.js');
    expect(detectGlobalPlatforms()).toContain('codex');
  });

  it('does not detect codex when CODEX_HOME points to a missing directory', async () => {
    vi.stubEnv('CODEX_HOME', join(tmpdir(), `skill-master-no-codex-${randomBytes(4).toString('hex')}`));
    const { detectGlobalPlatforms } = await import('../../src/platform/agents.js');
    expect(detectGlobalPlatforms()).not.toContain('codex');
  });
});
