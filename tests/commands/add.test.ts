import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseAddFlags } from '../../src/commands/add.js';
import { runCli } from '../test-utils.js';

describe('add command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-master-add-test-${Date.now()}`);
    mkdirSync(join(testDir, 'skill-src'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(
      join(testDir, 'skill-src', 'SKILL.md'),
      `---\nname: add-me\ndescription: add target\nallowed-tools: Bash Read Glob Write Edit\n---\n# add-me\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('finds hidden nested skills in full-depth mode only when --allow-hidden-dirs is set', () => {
    mkdirSync(join(testDir, '.deep-hidden', 'group', '.private', 'full-depth-skill'), { recursive: true });
    writeFileSync(
      join(testDir, '.deep-hidden', 'group', '.private', 'full-depth-skill', 'SKILL.md'),
      `---\nname: full-depth-hidden-skill\ndescription: hidden full-depth target\nallowed-tools:\n  - Read\n---\n# full-depth-hidden-skill\n`,
      'utf-8',
    );

    const withoutHidden = runCli(['add', './.deep-hidden', '--list', '--full-depth'], testDir);
    expect(withoutHidden.exitCode).toBe(1);
    expect(withoutHidden.stdout + withoutHidden.stderr).toContain('No SKILL.md found');

    const withHidden = runCli(['add', './.deep-hidden', '--list', '--full-depth', '--allow-hidden-dirs'], testDir);
    expect(withHidden.exitCode).toBe(0);
    expect(withHidden.stdout).toContain('full-depth-hidden-skill');
  }, 30000);

  it('separates multi-skill install blocks after the success message', () => {
    const testHome = join(testDir, 'home');
    mkdirSync(join(testDir, 'multi-src', 'alpha-skill'), { recursive: true });
    mkdirSync(join(testDir, 'multi-src', 'beta-skill'), { recursive: true });
    mkdirSync(testHome, { recursive: true });

    writeFileSync(
      join(testDir, 'multi-src', 'alpha-skill', 'SKILL.md'),
      `---\nname: alpha-skill\ndescription: alpha target\nallowed-tools:\n  - Read\n---\n# alpha-skill\n`,
      'utf-8',
    );
    writeFileSync(
      join(testDir, 'multi-src', 'beta-skill', 'SKILL.md'),
      `---\nname: beta-skill\ndescription: beta target\nallowed-tools:\n  - Read\n---\n# beta-skill\n`,
      'utf-8',
    );

    const result = runCli(['add', './multi-src', '--yes'], testDir, { HOME: testHome });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'skill-master [9/9] Updating claude-code registry...\n' +
      'skill-master ✔ Skill "alpha-skill" installed successfully!\n\n' +
      'skill-master [1/9] Fetching skill source...',
    );
    expect(result.stdout).not.toContain(
      'skill-master [9/9] Updating claude-code registry...\n\n' +
      'skill-master ✔ Skill "alpha-skill" installed successfully!',
    );
  }, 30000);

  it('installs project-local links and lock file at the git root', () => {
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'project');
    const nestedDir = join(projectDir, 'packages', 'app');

    mkdirSync(join(projectDir, '.git'), { recursive: true });
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(join(projectDir, 'skill-src'), { recursive: true });
    mkdirSync(nestedDir, { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeFileSync(
      join(projectDir, 'skill-src', 'SKILL.md'),
      `---\nname: git-root-skill\ndescription: git root target\nallowed-tools:\n  - Read\n---\n# git-root-skill\n`,
      'utf-8',
    );

    const result = runCli(['add', '../../skill-src'], nestedDir, { HOME: testHome });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'git-root-skill'))).toBe(true);
    expect(existsSync(join(nestedDir, '.claude', 'skills', 'git-root-skill'))).toBe(false);
    expect(existsSync(join(projectDir, 'skills-lock.json'))).toBe(true);
    expect(existsSync(join(nestedDir, 'skills-lock.json'))).toBe(false);

    const lock = JSON.parse(readFileSync(join(projectDir, 'skills-lock.json'), 'utf-8'));
    expect(lock.skills['git-root-skill'].source).toBe('./skill-src');
  }, 30000);

  it('uses an AGENTS.md root without git when --yes is provided', () => {
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'agent-project');
    const nestedDir = join(projectDir, 'nested');

    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(join(projectDir, 'skill-src'), { recursive: true });
    mkdirSync(nestedDir, { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeFileSync(join(projectDir, 'AGENTS.md'), '# Agent project\n', 'utf-8');
    writeFileSync(
      join(projectDir, 'skill-src', 'SKILL.md'),
      `---\nname: agents-root-skill\ndescription: agents root target\nallowed-tools:\n  - Read\n---\n# agents-root-skill\n`,
      'utf-8',
    );

    const result = runCli(['add', '../skill-src', '--yes'], nestedDir, { HOME: testHome });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'agents-root-skill'))).toBe(true);
    expect(existsSync(join(nestedDir, '.claude', 'skills', 'agents-root-skill'))).toBe(false);
  }, 30000);

  it('shows the guessed project root and expected layout before confirmation', () => {
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'agent-project');
    const nestedDir = join(projectDir, 'nested');

    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(join(projectDir, 'skill-src'), { recursive: true });
    mkdirSync(nestedDir, { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeFileSync(join(projectDir, 'AGENTS.md'), '# Agent project\n', 'utf-8');
    writeFileSync(
      join(projectDir, 'skill-src', 'SKILL.md'),
      `---\nname: preview-root-skill\ndescription: preview target\nallowed-tools:\n  - Read\n---\n# preview-root-skill\n`,
      'utf-8',
    );

    const result = runCli(['add', '../skill-src'], nestedDir, { HOME: testHome });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('No default project root found.');
    expect(result.stdout).toContain('Guessed project root from AGENTS.md:');
    expect(result.stdout).toContain('/agent-project');
    expect(result.stdout).toContain('skills-lock:');
    expect(result.stdout).toContain('/agent-project/skills-lock.json');
    expect(result.stdout).toContain('skills-dir (claude-code):');
    expect(result.stdout).toContain('/agent-project/.claude/skills');
    expect(result.stdout + result.stderr).toContain('Re-run with --yes to install under');
  }, 30000);

  it('lists skills without requiring AGENTS.md root confirmation', () => {
    const testHome = join(testDir, 'home');
    const projectDir = join(testDir, 'list-project');
    const nestedDir = join(projectDir, 'nested');

    mkdirSync(join(projectDir, 'skill-src'), { recursive: true });
    mkdirSync(nestedDir, { recursive: true });
    mkdirSync(testHome, { recursive: true });
    writeFileSync(join(projectDir, 'AGENTS.md'), '# Agent project\n', 'utf-8');
    writeFileSync(
      join(projectDir, 'skill-src', 'SKILL.md'),
      `---\nname: list-root-skill\ndescription: list target\nallowed-tools:\n  - Read\n---\n# list-root-skill\n`,
      'utf-8',
    );

    const result = runCli(['add', '../skill-src', '--list'], nestedDir, { HOME: testHome });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('list-root-skill');
    expect(result.stdout).not.toContain('No git repository found');
  }, 30000);

  it('installs global links to detected global agent configs by default', () => {
    const testHome = join(testDir, 'home');
    const configHome = join(testHome, '.config');
    const env = {
      HOME: testHome,
      XDG_CONFIG_HOME: configHome,
      CODEX_HOME: join(testHome, '.codex'),
      CLAUDE_CONFIG_DIR: join(testHome, '.claude'),
    };

    mkdirSync(join(configHome, 'opencode'), { recursive: true });
    mkdirSync(env.CODEX_HOME, { recursive: true });
    mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });

    const result = runCli(['add', './skill-src', '--global'], testDir, env);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(configHome, 'opencode', 'skills', 'add-me'))).toBe(true);
    expect(existsSync(join(env.CODEX_HOME, 'skills', 'add-me'))).toBe(true);
    expect(existsSync(join(env.CLAUDE_CONFIG_DIR, 'skills', 'add-me'))).toBe(true);
    expect((result.stdout.match(/\[1\/9\] Fetching skill source\.\.\./g) ?? []).length).toBe(1);
    expect((result.stdout.match(/Installed to /g) ?? []).length).toBe(1);
    expect((result.stdout.match(/\[8\/9\] Linking to /g) ?? []).length).toBe(3);
    expect((result.stdout.match(/\[9\/9\] Updating .+ registry\.\.\./g) ?? []).length).toBe(3);
    expect(result.stdout).toContain('[9/9] Updating claude-code registry...');
    expect(result.stdout).toContain('[9/9] Updating codex registry...');
    expect(result.stdout).toContain('[9/9] Updating opencode registry...');

    const registry = JSON.parse(readFileSync(join(testHome, '.agents', 'registry.json'), 'utf-8'));
    expect(registry.skills['add-me'].agents.map((agent: { agent: string }) => agent.agent).sort()).toEqual([
      'claude-code',
      'codex',
      'opencode',
    ]);
  }, 30000);

  it('preserves lower-priority non-empty env values during global reinstall', () => {
    const testHome = join(testDir, 'home');
    const configHome = join(testHome, '.config');
    const env = {
      HOME: testHome,
      XDG_CONFIG_HOME: configHome,
      CODEX_HOME: join(testHome, '.codex'),
      CLAUDE_CONFIG_DIR: join(testHome, '.claude'),
    };

    mkdirSync(join(configHome, 'opencode'), { recursive: true });
    mkdirSync(env.CODEX_HOME, { recursive: true });
    mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
    mkdirSync(join(testHome, '.agents', 'config', 'add-me'), { recursive: true });
    mkdirSync(join(testHome, '.agents', 'skills', 'add-me'), { recursive: true });

    writeFileSync(
      join(testDir, 'skill-src', '.env.example'),
      [
        'OPENAI_API_KEY=',
        'OPENAI_IMAGE_QUALITY=',
        'OPENAI_IMAGE_N=',
        '',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(
      join(testHome, '.agents', 'config', 'add-me', '.env'),
      [
        'OPENAI_API_KEY=key',
        'OPENAI_IMAGE_QUALITY=',
        '',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(
      join(testHome, '.agents', 'skills', 'add-me', '.env'),
      [
        'OPENAI_API_KEY=key',
        'OPENAI_IMAGE_QUALITY=high',
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = runCli(['add', './skill-src', '--global'], testDir, env);

    expect(result.exitCode).toBe(0);

    const canonicalEnv = readFileSync(join(testHome, '.agents', 'skills', 'add-me', '.env'), 'utf-8');
    const persistentEnv = readFileSync(join(testHome, '.agents', 'config', 'add-me', '.env'), 'utf-8');

    expect(canonicalEnv).toContain('OPENAI_IMAGE_QUALITY=high');
    expect(persistentEnv).toContain('OPENAI_IMAGE_QUALITY=high');
    expect(canonicalEnv).toContain('OPENAI_IMAGE_N=');
  }, 30000);

  it('prefers the most recently edited non-empty env value when sources conflict', () => {
    const testHome = join(testDir, 'home');
    const configHome = join(testHome, '.config');
    const env = {
      HOME: testHome,
      XDG_CONFIG_HOME: configHome,
      CODEX_HOME: join(testHome, '.codex'),
      CLAUDE_CONFIG_DIR: join(testHome, '.claude'),
    };

    mkdirSync(join(configHome, 'opencode'), { recursive: true });
    mkdirSync(env.CODEX_HOME, { recursive: true });
    mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
    mkdirSync(join(testHome, '.agents', 'config', 'add-me'), { recursive: true });
    mkdirSync(join(testHome, '.agents', 'skills', 'add-me'), { recursive: true });

    writeFileSync(
      join(testDir, 'skill-src', '.env.example'),
      [
        'OPENAI_API_KEY=',
        'OPENAI_IMAGE_SIZE=1024x1024',
        '',
      ].join('\n'),
      'utf-8',
    );

    const persistentEnvPath = join(testHome, '.agents', 'config', 'add-me', '.env');
    const canonicalEnvPath = join(testHome, '.agents', 'skills', 'add-me', '.env');

    writeFileSync(
      persistentEnvPath,
      [
        'OPENAI_API_KEY=key',
        'OPENAI_IMAGE_SIZE=1024x1024',
        '',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(
      canonicalEnvPath,
      [
        'OPENAI_API_KEY=key',
        'OPENAI_IMAGE_SIZE=2048x2048',
        '',
      ].join('\n'),
      'utf-8',
    );

    utimesSync(persistentEnvPath, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'));
    utimesSync(canonicalEnvPath, new Date('2024-01-02T00:00:00Z'), new Date('2024-01-02T00:00:00Z'));

    const result = runCli(['add', './skill-src', '--global'], testDir, env);

    expect(result.exitCode).toBe(0);

    const canonicalEnv = readFileSync(canonicalEnvPath, 'utf-8');
    const persistentEnv = readFileSync(persistentEnvPath, 'utf-8');

    expect(canonicalEnv).toContain('OPENAI_IMAGE_SIZE=2048x2048');
    expect(persistentEnv).toContain('OPENAI_IMAGE_SIZE=2048x2048');
  }, 30000);

  it('rejects unsupported agent names before installation', () => {
    const result = runCli(['add', './skill-src', '--agent', 'toString', '--yes'], testDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('Unsupported agent platform: toString');
  }, 30000);

  describe('parseAddFlags', () => {
    it('should parse source argument', () => {
      const result = parseAddFlags(['owner/repo']);
      expect(result.source).toBe('owner/repo');
      expect(result.flags.global).toBe(false);
    });

    it('should parse -g flag', () => {
      const result = parseAddFlags(['source', '-g']);
      expect(result.source).toBe('source');
      expect(result.flags.global).toBe(true);
    });

    it('should parse --global flag', () => {
      const result = parseAddFlags(['source', '--global']);
      expect(result.flags.global).toBe(true);
    });

    it('should parse -a flag with single agent', () => {
      const result = parseAddFlags(['source', '-a', 'claude-code']);
      expect(result.flags.agent).toEqual(['claude-code']);
    });

    it('should parse --agent flag with multiple agents', () => {
      const result = parseAddFlags(['source', '--agent', 'claude-code', 'cursor']);
      expect(result.flags.agent).toEqual(['claude-code', 'cursor']);
    });

    it('should parse --agent=value syntax (backward compat)', () => {
      const result = parseAddFlags(['source', '--agent=cursor']);
      expect(result.flags.agent).toEqual(['cursor']);
    });

    it('should parse -s flag with skill names', () => {
      const result = parseAddFlags(['source', '-s', 'skill1', 'skill2']);
      expect(result.flags.skill).toEqual(['skill1', 'skill2']);
    });

    it('should parse --skill flag', () => {
      const result = parseAddFlags(['source', '--skill', 'my-skill']);
      expect(result.flags.skill).toEqual(['my-skill']);
    });

    it('should parse -y flag', () => {
      const result = parseAddFlags(['source', '-y']);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse --yes flag', () => {
      const result = parseAddFlags(['source', '--yes']);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse -l flag', () => {
      const result = parseAddFlags(['source', '-l']);
      expect(result.flags.list).toBe(true);
    });

    it('should parse --list flag', () => {
      const result = parseAddFlags(['source', '--list']);
      expect(result.flags.list).toBe(true);
    });

    it('should parse --all flag', () => {
      const result = parseAddFlags(['source', '--all']);
      expect(result.flags.all).toBe(true);
    });

    it('should parse --full-depth flag', () => {
      const result = parseAddFlags(['source', '--full-depth']);
      expect(result.flags.fullDepth).toBe(true);
    });

    it('should parse --allow-hidden-dirs flag', () => {
      const result = parseAddFlags(['source', '--allow-hidden-dirs']);
      expect(result.flags.allowHiddenDirs).toBe(true);
    });

    it('should parse --upstream flag', () => {
      const result = parseAddFlags(['source', '--upstream']);
      expect(result.flags.upstream).toBe(true);
    });

    it('should parse --force flag', () => {
      const result = parseAddFlags(['source', '--force']);
      expect(result.flags.force).toBe(true);
    });

    it('should parse combined flags', () => {
      const result = parseAddFlags(['source', '-g', '-y', '--copy']);
      expect(result.flags.global).toBe(true);
      expect(result.flags.yes).toBe(true);
      expect(result.flags.copy).toBe(true);
    });

    it('should parse --all and expand to wildcards', () => {
      const result = parseAddFlags(['source', '--all']);
      expect(result.flags.all).toBe(true);
      expect(result.flags.skill).toEqual(['*']);
      expect(result.flags.agent).toEqual(['*']);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse --all with explicit skill', () => {
      const result = parseAddFlags(['source', '--all', '--skill', 'my-skill']);
      expect(result.flags.skill).toEqual(['my-skill']);
      expect(result.flags.agent).toEqual(['*']);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse --all with explicit agent', () => {
      const result = parseAddFlags(['source', '--all', '--agent', 'cursor']);
      expect(result.flags.skill).toEqual(['*']);
      expect(result.flags.agent).toEqual(['cursor']);
      expect(result.flags.yes).toBe(true);
    });

    it('should stop collecting agents at next flag', () => {
      const result = parseAddFlags(['source', '-a', 'claude-code', '-g']);
      expect(result.flags.agent).toEqual(['claude-code']);
      expect(result.flags.global).toBe(true);
    });

    it('should stop collecting skills at next flag', () => {
      const result = parseAddFlags(['source', '-s', 'skill1', '-y']);
      expect(result.flags.skill).toEqual(['skill1']);
      expect(result.flags.yes).toBe(true);
    });

    it('should handle no source provided', () => {
      const result = parseAddFlags(['-g', '-y']);
      expect(result.source).toBeNull();
      expect(result.flags.global).toBe(true);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse complex combination', () => {
      const result = parseAddFlags([
        'owner/repo',
        '-g',
        '-a',
        'claude-code',
        'cursor',
        '-s',
        'skill1',
        'skill2',
        '-y',
        '--copy',
        '--force',
      ]);
      expect(result.source).toBe('owner/repo');
      expect(result.flags.global).toBe(true);
      expect(result.flags.agent).toEqual(['claude-code', 'cursor']);
      expect(result.flags.skill).toEqual(['skill1', 'skill2']);
      expect(result.flags.yes).toBe(true);
      expect(result.flags.copy).toBe(true);
      expect(result.flags.force).toBe(true);
    });

    // gh skill style positional args
    it('should parse source and skill as positional args', () => {
      const result = parseAddFlags(['owner/repo', 'skill-name']);
      expect(result.source).toBe('owner/repo');
      expect(result.flags.skill).toEqual(['skill-name']);
    });

    it('should merge positional skill with --skill flag', () => {
      const result = parseAddFlags(['owner/repo', 'skill-a', '-s', 'skill-b']);
      expect(result.source).toBe('owner/repo');
      // Positional skill is appended after flag skills
      expect(result.flags.skill).toContain('skill-a');
      expect(result.flags.skill).toContain('skill-b');
      expect(result.flags.skill.length).toBe(2);
    });

    it('should handle source@skill with positional skill', () => {
      const result = parseAddFlags(['owner/repo@skill-a', 'skill-b']);
      expect(result.source).toBe('owner/repo@skill-a');
      // parseAddFlags only extracts positional skill, @skill is merged in add()
      expect(result.flags.skill).toEqual(['skill-b']);
    });

    it('should parse positional skill with flags', () => {
      const result = parseAddFlags(['owner/repo', 'skill-name', '-g', '-y']);
      expect(result.source).toBe('owner/repo');
      expect(result.flags.skill).toEqual(['skill-name']);
      expect(result.flags.global).toBe(true);
      expect(result.flags.yes).toBe(true);
    });
  });
});
