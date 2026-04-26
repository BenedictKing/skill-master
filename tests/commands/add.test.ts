import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

    const result = runCli(['add', './multi-src'], testDir, { HOME: testHome });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'skill-master [9/9] Updating registry...\n' +
      'skill-master ✔ Skill "alpha-skill" installed successfully!\n\n' +
      'skill-master [1/9] Fetching skill source...',
    );
    expect(result.stdout).not.toContain(
      'skill-master [9/9] Updating registry...\n\n' +
      'skill-master ✔ Skill "alpha-skill" installed successfully!',
    );
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
